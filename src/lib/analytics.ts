/**
 * Analytics de produto: PostHog + GA4 (+ Meta Pixel opcional).
 *
 * Garantias:
 *  - Nada é carregado nem enviado sem consentimento de estatísticas
 *    ('all'/'granted'/'analytics', ver consent.ts). O Meta Pixel exige
 *    consentimento de marketing — só o valor 'all' — e VITE_META_PIXEL_ID
 *    definido; sem o ID, é no-op.
 *  - Nada é enviado fora de produção: build de dev, localhost, *.vercel.app,
 *    navegador automatizado (Playwright) ou VITE_APP_ENV ≠ production fora do
 *    domínio oficial (ver runtime-env.ts). Em dev/E2E os eventos vão para
 *    `window.__DI_ANALYTICS_DEBUG__` para inspeção.
 *  - posthog-js e gtag.js são baixados só depois do consentimento (fora do
 *    chunk de entrada).
 *  - Nenhum token/ID sensível da URL chega aos provedores: pageview manual com
 *    URL sanitizada, before_send no PostHog e page_location limpo no GA.
 *  - Nomes de evento tipados (src/lib/analytics-events.ts).
 */
import type { PostHog, PostHogConfig } from 'posthog-js'
import {
  GA4_EVENT_NAME,
  META_PIXEL_EVENT,
  type AnalyticsEventName,
  type AnalyticsPrimitive,
  type AnalyticsProps,
  type AnalyticsPropsArg,
} from './analytics-events'
import {
  choiceAllows,
  getConsent,
  getConsentChoice,
  hasConsent,
  onConsentChange,
  setConsent as writeConsent,
  type ConsentChoice,
} from './consent'
import { trackBackgroundImport } from './chunk-reload'
import { getRuntimeEnv, isAnalyticsEnvironment } from './runtime-env'
import { isUrlClean, sanitizeUrl, scrubDeep, scrubText } from './url-sanitize'

export type { AnalyticsEventName } from './analytics-events'
export type { ConsentChoice, ConsentState } from './consent'
export { getConsent, getConsentChoice, hasConsent }

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
const META_PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim() || undefined

type Gtag = (...args: unknown[]) => void
interface FbqStub {
  (...args: unknown[]): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: FbqStub
  loaded: boolean
  version: string
  /** true = o fbevents.js não registra PageView sozinho em pushState/popstate */
  disablePushState?: boolean
}
interface DebugEntry {
  name: string
  props: AnalyticsProps
  at: number
}

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: Gtag
    fbq?: FbqStub
    _fbq?: FbqStub
    __DI_ANALYTICS_DEBUG__?: DebugEntry[]
  }
}

// ── Estado ─────────────────────────────────────────────────────────────────
let started = false
let envAllowedCache: boolean | null = null
let analyticsEnabled = false
let marketingEnabled = false

let posthog: PostHog | null = null
/** posthog-js baixado, esperando a URL ficar limpa para o init. */
let posthogPending: PostHog | null = null
let posthogLoading: Promise<void> | null = null
const posthogQueue: Array<(ph: PostHog) => void> = []
const MAX_QUEUE = 50

let gaLoaded = false
let pixelLoaded = false
const pixelPending: Array<() => void> = []

let lastPageviewKey: string | null = null
let lastPageLocation: string | null = null
let pageviewTimer: number | undefined
interface Identity {
  userId: string
  traits?: Record<string, unknown>
}
let lastIdentity: Identity | null = null
/** identify() chamado sem consentimento: reaplicado quando as estatísticas forem ligadas. */
let pendingIdentity: Identity | null = null

function envAllowed(): boolean {
  if (envAllowedCache === null) envAllowedCache = isAnalyticsEnvironment(getRuntimeEnv())
  return envAllowedCache
}

/** Utilitário para o pixel e informações na página /cookies. */
export function isMetaPixelConfigured(): boolean {
  return !!META_PIXEL_ID
}

// ── Sanitização de propriedades ────────────────────────────────────────────
const BLOCKED_PROP_KEYS =
  /^(e[-_]?mail|phone|telefone|tel|whatsapp|name|nome|full_name|first_name|last_name|session_id|token|token_hash|access_token|refresh_token|code|password|senha|answers|respostas)$/i
const MAX_STRING = 200

function sanitizeValue(value: AnalyticsPrimitive): AnalyticsPrimitive {
  if (typeof value === 'string') return scrubText(value).slice(0, MAX_STRING)
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return value
}

function sanitizeProps(props: AnalyticsProps | undefined): AnalyticsProps {
  const out: AnalyticsProps = {}
  if (!props) return out
  for (const [key, value] of Object.entries(props)) {
    if (BLOCKED_PROP_KEYS.test(key) || value === undefined) continue
    out[key] = Array.isArray(value) ? value.slice(0, 50).map(sanitizeValue) : sanitizeValue(value)
  }
  return out
}

/** GA4 não aceita arrays como parâmetro: vira texto separado por vírgula. */
function toGaParams(props: AnalyticsProps): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue
    out[key] = Array.isArray(value) ? value.filter((v) => v !== undefined && v !== null).join(',') : value
  }
  return out
}

function currentCleanUrl(): string {
  return sanitizeUrl(window.location.href)
}

function debugRecord(name: string, props: AnalyticsProps): void {
  const env = getRuntimeEnv()
  if (!env.isDevBuild && !env.isAutomation) return
  const log = (window.__DI_ANALYTICS_DEBUG__ ??= [])
  if (log.length < 500) log.push({ name, props, at: Date.now() })
  if (env.isDevBuild) console.debug('[analytics]', name, props)
}

// ── Cookies de terceiros (limpeza ao retirar consentimento) ────────────────
function deleteCookies(match: (name: string) => boolean): void {
  try {
    const names = document.cookie
      .split(';')
      .map((part) => part.split('=')[0]?.trim())
      .filter((name): name is string => !!name && match(name))
    if (names.length === 0) return
    const labels = window.location.hostname.split('.')
    const domains = ['']
    for (let i = 0; i < labels.length - 1; i++) domains.push(`.${labels.slice(i).join('.')}`)
    for (const name of names) {
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`
      }
    }
  } catch {
    // ignora
  }
}

/** Apaga chaves `ph_*` (persistência do PostHog) do localStorage e do sessionStorage. */
function deleteStorageKeys(prefix: string): void {
  for (const getStorage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const storage = getStorage()
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key && key.startsWith(prefix)) keys.push(key)
      }
      for (const key of keys) storage.removeItem(key)
    } catch {
      // storage bloqueado
    }
  }
}

// ── PostHog ────────────────────────────────────────────────────────────────
function withPosthog(call: (ph: PostHog) => void): void {
  if (!POSTHOG_KEY) return
  if (posthog) {
    try {
      call(posthog)
    } catch {
      // nunca derrubar a UI por causa de analytics
    }
    return
  }
  if (posthogQueue.length < MAX_QUEUE) posthogQueue.push(call)
}

function sanitizeCapture<T extends { properties?: unknown; $set?: unknown; $set_once?: unknown } | null>(
  capture: T,
): T {
  if (!capture) return capture
  if (capture.properties) scrubDeep(capture.properties)
  if (capture.$set) scrubDeep(capture.$set)
  if (capture.$set_once) scrubDeep(capture.$set_once)
  return capture
}

function initPosthog(ph: PostHog): void {
  if (!POSTHOG_KEY) return
  const config: Partial<PostHogConfig> = {
    api_host: POSTHOG_HOST,
    // pageview manual (URL sanitizada) — ver trackPageview()
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: 'identified_only',
    // gravação de sessão desligada: a política de privacidade não a prevê
    disable_session_recording: true,
    // ao retirar o consentimento (opt-out), o PostHog apaga e desliga a
    // própria persistência (cookie e localStorage ph_*)
    opt_out_persistence_by_default: true,
    before_send: (capture) => sanitizeCapture(capture),
  }
  ph.init(POSTHOG_KEY, config)
  // Só chegamos aqui com consentimento de estatísticas. Um opt-out gravado
  // numa visita anterior (pessoa recusou e depois voltou a aceitar) é desfeito.
  try {
    if (ph.has_opted_out_capturing()) ph.opt_in_capturing({ captureEventName: false })
  } catch {
    // ignora
  }
  posthog = ph
  posthogPending = null
  const pending = posthogQueue.splice(0, posthogQueue.length)
  for (const call of pending) {
    try {
      call(ph)
    } catch {
      // ignora
    }
  }
}

/**
 * O PostHog guarda a URL de entrada ($initial_current_url) e a envia em
 * requisições que não passam pelo before_send (/flags). Por isso só
 * inicializamos quando a URL atual está limpa (sem token/session_id/?r=).
 */
function maybeInitPosthog(): void {
  if (!posthogPending || posthog || !analyticsEnabled) return
  if (!isUrlClean(window.location.href)) return
  initPosthog(posthogPending)
}

function loadPosthog(): void {
  if (!POSTHOG_KEY) return
  if (posthog) {
    posthog.opt_in_capturing({ captureEventName: false })
    return
  }
  if (posthogPending) {
    maybeInitPosthog()
    return
  }
  if (posthogLoading) return
  posthogLoading = trackBackgroundImport(import('posthog-js'))
    .then(({ default: ph }) => {
      posthogPending = ph
      maybeInitPosthog()
    })
    .catch(() => {
      posthogLoading = null
      posthogQueue.length = 0
    })
}

// ── Google Analytics 4 ─────────────────────────────────────────────────────
function gaDisableFlag(disabled: boolean): void {
  if (!GA_ID) return
  ;(window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = disabled
}

function loadGa(): void {
  if (!GA_ID) return
  gaDisableFlag(false)
  if (gaLoaded) return
  gaLoaded = true

  window.dataLayer = window.dataLayer || []
  // O gtag.js só processa comandos empilhados como objeto `arguments`.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments)
  }
  const gtag = window.gtag
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  })
  gtag('js', new Date())
  gtag('config', GA_ID, {
    send_page_view: false,
    page_location: currentCleanUrl(),
    page_referrer: sanitizeUrl(document.referrer || ''),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.appendChild(script)
}

function gaSend(eventName: string, params: Record<string, unknown>): void {
  if (!gaLoaded || !window.gtag) return
  try {
    window.gtag('event', eventName, params)
  } catch {
    // ignora
  }
}

// ── Meta Pixel (opcional, consentimento de marketing) ──────────────────────
function loadPixel(): void {
  if (!META_PIXEL_ID) return
  if (pixelLoaded) {
    window.fbq?.('consent', 'grant')
    return
  }
  pixelLoaded = true

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue.push(args)
  } as FbqStub
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  // Em SPA o fbevents.js dispara PageView a cada mudança de history, com a URL
  // crua (pode ter ?r= ou session_id) e duplicando o PageView manual.
  fbq.disablePushState = true
  if (!window._fbq) window._fbq = fbq
  window.fbq = fbq

  // Sem coleta automática de cliques/metadados da página.
  fbq('set', 'autoConfig', false, META_PIXEL_ID)
  fbq('init', META_PIXEL_ID)

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)
}

/**
 * O Pixel lê `location.href` sozinho. Só disparamos quando a URL está limpa
 * (sem token/session_id); senão o evento espera a próxima navegação limpa.
 */
function whenUrlClean(task: () => void): void {
  if (isUrlClean(window.location.href)) {
    task()
    return
  }
  if (pixelPending.length < 20) pixelPending.push(task)
}

function flushPixelPending(): void {
  if (pixelPending.length === 0 || !isUrlClean(window.location.href)) return
  const tasks = pixelPending.splice(0, pixelPending.length)
  for (const task of tasks) task()
}

function pixelSend(kind: 'track', eventName: string, params?: Record<string, unknown>): void {
  if (!marketingEnabled || !pixelLoaded || !window.fbq) return
  whenUrlClean(() => {
    if (!marketingEnabled || !window.fbq) return
    if (params) window.fbq(kind, eventName, params)
    else window.fbq(kind, eventName)
  })
}

// ── Consentimento ──────────────────────────────────────────────────────────
function applyConsent(choice: ConsentChoice | null): void {
  const wantsAnalytics = choiceAllows(choice, 'analytics')
  // 'granted' (banner/aceitações antigas) NÃO inclui marketing: só 'all'
  const wantsMarketing = choiceAllows(choice, 'marketing')
  const allowed = envAllowed()
  const analyticsWasEnabled = analyticsEnabled

  if (wantsAnalytics && !analyticsEnabled) {
    analyticsEnabled = true
    if (allowed) {
      loadPosthog()
      loadGa()
    }
    // pageview da página em que a pessoa aceitou
    trackPageview()
    // login feito antes do consentimento: associa agora
    const identity = pendingIdentity
    pendingIdentity = null
    if (identity) identify(identity.userId, identity.traits)
  } else if (!wantsAnalytics && analyticsEnabled) {
    analyticsEnabled = false
    posthogQueue.length = 0
    try {
      // reset() desassocia o usuário e limpa a persistência antes do opt-out
      posthog?.reset()
      posthog?.opt_out_capturing()
    } catch {
      // ignora
    }
    gaDisableFlag(true)
    deleteCookies(
      (name) => name === '_ga' || name.startsWith('_ga_') || name === '_gid' || name.startsWith('ph_'),
    )
    deleteStorageKeys('ph_')
    lastPageviewKey = null
    // se a pessoa voltar a aceitar na mesma página, associa de novo
    if (lastIdentity) pendingIdentity = lastIdentity
    lastIdentity = null
  }

  if (wantsMarketing && !marketingEnabled) {
    marketingEnabled = true
    if (allowed) {
      loadPixel()
      // estatísticas já estavam ativas: o pageview desta página não passará
      // de novo por sendPageview, então o Pixel registra o PageView aqui
      if (analyticsWasEnabled) pixelSend('track', 'PageView')
    }
  } else if (!wantsMarketing && marketingEnabled) {
    marketingEnabled = false
    pixelPending.length = 0
    window.fbq?.('consent', 'revoke')
    deleteCookies((name) => name === '_fbp' || name === '_fbc')
  }
}

/** Chamado uma vez no main.tsx. */
export function initAnalytics(): void {
  if (started) return
  started = true
  applyConsent(getConsentChoice())
  onConsentChange(applyConsent)
  // navegação só de fragmento (ex.: #precos) também pode deixar a URL limpa
  window.addEventListener('hashchange', () => {
    maybeInitPosthog()
    flushPixelPending()
  })
}

/**
 * Grava a escolha de cookies. 'all' = estatísticas + marketing;
 * 'granted' (banner) e 'analytics' = só estatísticas; 'denied' = só o
 * essencial. Ver o contrato em consent.ts.
 */
export function setConsent(choice: ConsentChoice): void {
  writeConsent(choice)
  // garante o efeito mesmo se initAnalytics ainda não tiver rodado
  if (!started) applyConsent(choice)
}

// ── Eventos ────────────────────────────────────────────────────────────────
function dispatch(event: AnalyticsEventName, rawProps: AnalyticsProps | undefined): boolean {
  if (!hasConsent('analytics')) return false
  const props = sanitizeProps(rawProps)

  if (!envAllowed()) {
    debugRecord(event, props)
    return true
  }

  withPosthog((ph) => {
    ph.capture(event, props)
  })
  gaSend(GA4_EVENT_NAME[event] ?? event, { ...toGaParams(props), page_location: currentCleanUrl() })

  const metaEvent = META_PIXEL_EVENT[event]
  if (metaEvent && hasConsent('marketing')) {
    const params: Record<string, unknown> = {}
    if (typeof props.value === 'number') params.value = props.value
    if (typeof props.currency === 'string') params.currency = props.currency
    pixelSend('track', metaEvent, Object.keys(params).length ? params : undefined)
  }
  return true
}

/**
 * Envia um evento da taxonomia. Sem consentimento ou fora de produção, não
 * envia nada a terceiros.
 */
export function track<E extends AnalyticsEventName>(event: E, ...args: AnalyticsPropsArg<E>): void {
  dispatch(event, args[0] as AnalyticsProps | undefined)
}

// ── trackOnce (dedupe persistente) ─────────────────────────────────────────
const ONCE_STORAGE_KEY = 'di_analytics_once_v1'
const ONCE_MAX_ENTRIES = 300
const ONCE_TTL_MS = 180 * 24 * 60 * 60 * 1000
const onceMemory = new Set<string>()

function readOnce(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(ONCE_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

function writeOnce(map: Record<string, number>): void {
  try {
    const now = Date.now()
    const entries = Object.entries(map)
      .filter(([, at]) => typeof at === 'number' && now - at < ONCE_TTL_MS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, ONCE_MAX_ENTRIES)
    window.localStorage.setItem(ONCE_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // sem storage: fica só a memória da página
  }
}

/**
 * Envia o evento uma única vez por `onceKey` (ex.: assessmentId, id da
 * compra), mesmo após recarregar a página. Devolve `true` se enviou agora.
 * Só marca como enviado quando houve envio de fato (com consentimento).
 */
export function trackOnce<E extends AnalyticsEventName>(
  event: E,
  onceKey: string,
  ...args: AnalyticsPropsArg<E>
): boolean {
  const key = `${event}:${onceKey}`
  if (onceMemory.has(key)) return false
  const stored = readOnce()
  if (stored[key]) {
    onceMemory.add(key)
    return false
  }
  const sent = dispatch(event, args[0] as AnalyticsProps | undefined)
  if (sent) {
    onceMemory.add(key)
    stored[key] = Date.now()
    writeOnce(stored)
  }
  return sent
}

// ── Pageviews ──────────────────────────────────────────────────────────────
function sendPageview(): void {
  if (!hasConsent('analytics')) return
  maybeInitPosthog()
  const href = window.location.href
  const clean = sanitizeUrl(href)
  let key = clean
  try {
    const url = new URL(clean)
    key = `${url.pathname}${url.search}`
  } catch {
    // usa a URL inteira como chave
  }
  if (key === lastPageviewKey) {
    flushPixelPending()
    return
  }
  lastPageviewKey = key
  const referrer = lastPageLocation ?? sanitizeUrl(document.referrer || '')
  lastPageLocation = clean

  if (!envAllowed()) {
    debugRecord('$pageview', { url: clean })
    return
  }

  withPosthog((ph) => {
    ph.capture('$pageview', { $current_url: clean })
  })
  if (gaLoaded && window.gtag) {
    let pagePath = '/'
    try {
      const url = new URL(clean)
      pagePath = `${url.pathname}${url.search}`
    } catch {
      // ignora
    }
    gaSend('page_view', {
      page_location: clean,
      page_path: pagePath,
      page_title: document.title,
      page_referrer: referrer,
    })
  }
  if (marketingEnabled) {
    flushPixelPending()
    pixelSend('track', 'PageView')
  }
}

/**
 * Agenda o pageview da URL atual. Pequeno atraso para: (1) o título da página
 * (useSEO) já estar aplicado; (2) redirecionamentos imediatos (ex.: rota
 * protegida → /login) contarem uma vez só.
 */
export function trackPageview(): void {
  if (typeof window === 'undefined') return
  window.clearTimeout(pageviewTimer)
  pageviewTimer = window.setTimeout(sendPageview, 300)
}

interface RouterLike {
  state: { location: { pathname: string; search: string } }
  subscribe: (listener: (state: { location: { pathname: string; search: string } }) => void) => () => void
}

/** Liga o pageview manual às navegações do React Router. */
export function startPageviewTracking(router: RouterLike): () => void {
  let previous = `${router.state.location.pathname}${router.state.location.search}`
  trackPageview()
  return router.subscribe((state) => {
    const next = `${state.location.pathname}${state.location.search}`
    if (next === previous) return
    previous = next
    trackPageview()
  })
}

// ── Identidade ─────────────────────────────────────────────────────────────
/**
 * Associa os eventos ao usuário logado (só o id interno, nunca e-mail/nome).
 * Chamado pelo AuthContext ao entrar.
 */
export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!userId) return
  if (!hasConsent('analytics')) {
    // reaplicado em applyConsent se a pessoa aceitar depois
    pendingIdentity = { userId, traits }
    return
  }
  if (userId === lastIdentity?.userId) return
  lastIdentity = { userId, traits }
  const primitiveTraits: AnalyticsProps = {}
  for (const [key, value] of Object.entries(traits ?? {})) {
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
      primitiveTraits[key] = value as AnalyticsPrimitive
    }
  }
  const safeTraits = sanitizeProps(primitiveTraits)

  if (!envAllowed()) {
    debugRecord('$identify', safeTraits)
    return
  }
  withPosthog((ph) => {
    ph.identify(userId, safeTraits)
  })
  if (gaLoaded && window.gtag && GA_ID) {
    window.gtag('config', GA_ID, { user_id: userId, send_page_view: false, page_location: currentCleanUrl() })
  }
}

/** Ao sair da conta: desassocia o dispositivo do usuário. */
export function resetAnalytics(): void {
  lastIdentity = null
  pendingIdentity = null
  if (!envAllowed()) return
  try {
    posthog?.reset()
  } catch {
    // ignora
  }
  if (gaLoaded && window.gtag && GA_ID) {
    window.gtag('config', GA_ID, { user_id: null, send_page_view: false, page_location: currentCleanUrl() })
  }
}
