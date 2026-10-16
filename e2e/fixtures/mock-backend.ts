// mock-backend.ts — Supabase, Stripe e terceiros 100% simulados no navegador (DI-086).
//
// Usado pelos specs do modelo P0 (07-upsell-and-expiry, 08-success-autologin).
// Nada sai da máquina:
//  - o roteador intercepta TODA requisição da página (page.route('**/*')): só o
//    próprio dev server (origem do baseURL) segue para a rede;
//  - REST, Auth, Storage e Edge Functions do Supabase são reconhecidos pelo
//    caminho (/rest/v1/, /auth/v1/, /functions/v1/…), em QUALQUER host — mesmo
//    que o app esteja apontando para outro projeto, a chamada é respondida aqui;
//  - leituras (GET) são servidas a partir do estado do cenário; escritas
//    (POST/PATCH/PUT/DELETE) só são respondidas quando têm um mock explícito
//    abaixo (claim-session, verify, create-checkout-session, chat-completion…).
//    Qualquer outra escrita é abortada e registrada em `blockedWrites`;
//  - o Checkout do Stripe é uma página estática local (STRIPE_CHECKOUT_MOCK_URL);
//  - qualquer outro host é abortado e registrado em `externalRequests`.
// Ao fim de cada teste o fixture exige `blockedWrites` e `externalRequests`
// vazios: um teste que tenta escrever sem mock, ou falar com outro host, falha.
//
// Os specs que usam este fixture levam a tag @mock-backend e rodam no modo
// `E2E_SUPABASE=mock` (npm run test:e2e:mock), sem nenhuma credencial.
import { Buffer } from 'node:buffer'
import { test as base, expect, type Page, type Route } from '@playwright/test'
import { getAccessState, hasActiveAccess } from '../../src/lib/access'
import {
  SEED_ANALYSIS_MARKDOWN,
  SEED_ANSWERS,
  SEED_RESULT,
  subscriptionFor,
  type AccessScenario,
  type SubscriptionSeed,
} from './seeded'

// ── Identidades do cenário ───────────────────────────────────────────────────

/** Conta de teste (domínio reservado .test; nunca existe em produção). */
export const MOCK_USER = {
  id: '0e2e0000-0000-4000-8000-000000000001',
  email: 'maria.e2e@drimigrante.test',
  fullName: 'Maria Teste',
} as const

export const MOCK_ASSESSMENT_ID = '0e2e0000-0000-4000-8000-0000000000a1'
/** session_id anônimo do quiz (formato aceito pelas RPCs). */
export const MOCK_QUIZ_SESSION_ID = 'e2e-mock-session-0001'
/** token_hash que o claim-session simulado devolve. */
export const MOCK_TOKEN_HASH = 'e2e0token0hash0valid0001'
/** URL do Checkout do Stripe devolvida pelo create-checkout-session simulado. */
export const STRIPE_CHECKOUT_MOCK_URL = 'https://checkout.stripe.com/c/pay/cs_test_e2eMockCheckout0001'
/** Resposta do chat-completion simulado. */
export const MOCK_CHAT_REPLY = 'Resposta simulada do assistente (E2E).'

/** Chave do resultado do quiz no localStorage (QUIZ_RESULT_STORAGE_KEY). */
const QUIZ_RESULT_KEY = 'dr_imigrante_quiz_result'
const CONSENT_KEY = 'di_cookie_consent'

/** Supabase que o dev server do teste usa (definido no playwright.config.ts). */
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://e2e-mock.supabase.co'

/** Mesma regra do supabase-js: `sb-${hostname.split('.')[0]}-auth-token`. */
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

// ── Tipos ────────────────────────────────────────────────────────────────────

export type ClaimMock =
  /** Conta criada/achada: devolve o token_hash para o verifyOtp. */
  | { kind: 'token' }
  /** Sem token: link enviado por e-mail. */
  | { kind: 'email_sent' }
  /** Erro HTTP do claim-session (ex.: 403 pagamento em processamento, 500). */
  | { kind: 'error'; status: number; body: Record<string, unknown> }

export interface MockBackendOptions {
  /** Linha de `subscriptions` servida para a conta (ver e2e/fixtures/seeded.ts). */
  scenario: AccessScenario
  /** Sessão já salva no navegador antes da primeira carga (pessoa logada). */
  signedIn: boolean
  /** Resultado do quiz salvo neste navegador (mesmo e-mail da conta). */
  storedQuiz: boolean
  /** Resposta do claim-session (página de sucesso). */
  claim: ClaimMock
  /** Escolha de cookies já gravada; `null` deixa o banner aparecer. */
  consent: 'denied' | 'granted' | null
}

export const DEFAULT_BACKEND_OPTIONS: MockBackendOptions = {
  scenario: 'one_time_active',
  signedIn: true,
  storedQuiz: false,
  claim: { kind: 'token' },
  consent: 'denied',
}

export interface MockCall {
  /** Ex.: `rest:subscriptions`, `rpc:get_full_analysis`, `fn:claim-session`, `auth:verify`. */
  name: string
  method: string
  /** Corpo JSON da requisição (escritas). */
  body: unknown
  /** A requisição veio com o token da sessão de teste. */
  authenticated: boolean
}

export interface MockMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  assessment_id: string
}

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null

// ── Sessão falsa (nunca validada por servidor: tudo é respondido aqui) ───────

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function buildUser() {
  return {
    id: MOCK_USER.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: MOCK_USER.email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: MOCK_USER.fullName },
    identities: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function buildSession() {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + 3600
  const accessToken = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: MOCK_USER.id, email: MOCK_USER.email, role: 'authenticated', aud: 'authenticated', iat, exp }),
    'e2e-assinatura-falsa',
  ].join('.')
  return {
    access_token: accessToken,
    refresh_token: 'e2e-refresh-token',
    token_type: 'bearer',
    expires_in: exp - iat,
    expires_at: exp,
    user: buildUser(),
  }
}

// ── Estado do backend ────────────────────────────────────────────────────────

export class MockBackend {
  readonly options: MockBackendOptions
  readonly user = buildUser()
  readonly session = buildSession()

  /** Linha de `subscriptions` servida (mutável no meio do teste). */
  subscription: SubscriptionSeed
  /**
   * Respostas para as próximas leituras autenticadas de `subscriptions`, antes
   * de `subscription` (ex.: webhook que chega alguns segundos depois do login).
   */
  readonly subscriptionQueue: SubscriptionSeed[] = []
  /** `expired` faz o /auth/v1/verify recusar o token (link vencido). */
  verifyStatus: 'ok' | 'expired' = 'ok'
  readonly messages: MockMessage[] = []
  readonly documents: Array<Record<string, unknown>> = []

  readonly calls: MockCall[] = []
  /** Escritas sem mock explícito (abortadas). Deve ficar vazio. */
  readonly blockedWrites: string[] = []
  /** Requisições a hosts fora da máquina (abortadas). Deve ficar vazio. */
  readonly externalRequests: string[] = []
  /** Leituras de tabelas que o mock não conhece (respondidas com []). Só diagnóstico. */
  readonly unknownReads: string[] = []

  constructor(options: MockBackendOptions) {
    this.options = options
    this.subscription = subscriptionFor(options.scenario, MOCK_USER.id)
  }

  /** Chamadas registradas com este nome (ex.: `fn:create-checkout-session`). */
  callsTo(name: string): MockCall[] {
    return this.calls.filter((call) => call.name === name)
  }

  /** Corpos JSON das chamadas com este nome. */
  bodiesOf(name: string): unknown[] {
    return this.callsTo(name).map((call) => call.body)
  }

  /** Linha de `subscriptions` servida agora (consome a fila). */
  nextSubscription(): SubscriptionSeed {
    return this.subscriptionQueue.shift() ?? this.subscription
  }

  /** Estado de acesso da linha atual (mesmas regras do app, src/lib/access.ts). */
  accessNow() {
    return getAccessState(this.subscription)
  }

  // Linhas "do banco" ─────────────────────────────────────────────────────────

  profileRow() {
    return {
      id: MOCK_USER.id,
      email: MOCK_USER.email,
      full_name: MOCK_USER.fullName,
      phone: null,
      avatar_url: null,
      language: 'pt-BR',
      timezone: 'Europe/Lisbon',
      tenant_id: '0e2e0000-0000-4000-8000-0000000000f0',
      is_active: true,
      last_login_at: null,
      notification_preferences: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
  }

  resultRow() {
    return {
      assessment_id: MOCK_ASSESSMENT_ID,
      ...SEED_RESULT,
      computed_at: this.completedAt(),
    }
  }

  assessmentRow() {
    return {
      id: MOCK_ASSESSMENT_ID,
      user_id: MOCK_USER.id,
      session_id: MOCK_QUIZ_SESSION_ID,
      full_name: MOCK_USER.fullName,
      email: MOCK_USER.email,
      status: 'completed',
      answers: SEED_ANSWERS,
      completed_at: this.completedAt(),
      created_at: this.completedAt(),
      assessment_results: this.resultRow(),
    }
  }

  /** Diagnóstico concluído um dia antes do pagamento (ou ontem, para quem não pagou). */
  completedAt(): string {
    const paidAt = this.subscription.one_time_paid_at
    const ref = paidAt ? new Date(paidAt).getTime() : Date.now()
    return new Date(ref - 24 * 60 * 60 * 1000).toISOString()
  }

  /** Resultado do quiz como o app grava no localStorage ao fim do quiz. */
  storedQuizResult() {
    return {
      sessionId: MOCK_QUIZ_SESSION_ID,
      assessmentId: MOCK_ASSESSMENT_ID,
      answers: SEED_ANSWERS,
      score: { total: SEED_RESULT.score_numeric, max: 100, percentage: SEED_RESULT.score_numeric, category: SEED_RESULT.score_category },
      visas: [],
      leadInfo: { fullName: MOCK_USER.fullName, email: MOCK_USER.email },
      completedAt: this.completedAt(),
    }
  }
}

// ── Respostas HTTP ───────────────────────────────────────────────────────────

function corsHeaders(route: Route): Record<string, string> {
  const headers = route.request().headers()
  return {
    'access-control-allow-origin': headers.origin || '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS',
    'access-control-allow-headers':
      headers['access-control-request-headers'] ||
      'authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, range, x-supabase-api-version',
    'access-control-expose-headers': 'content-range, x-supabase-api-version',
  }
}

function fulfillJson(route: Route, body: Json, status = 200, extra: Record<string, string> = {}) {
  return route.fulfill({
    status,
    headers: { ...corsHeaders(route), 'content-type': 'application/json; charset=utf-8', ...extra },
    body: JSON.stringify(body),
  })
}

function readJsonBody(route: Route): unknown {
  try {
    return route.request().postDataJSON()
  } catch {
    return route.request().postData()
  }
}

const READ_METHODS = new Set(['GET', 'HEAD'])

/** Filtro `col=eq.valor` do PostgREST (só o operador `eq`). */
function eqFilter(url: URL, column: string): string | null {
  const raw = url.searchParams.get(column)
  return raw && raw.startsWith('eq.') ? raw.slice(3) : null
}

const STRIPE_MOCK_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Stripe Checkout (simulado)</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><main data-testid="stripe-checkout-mock"><h1>Checkout do Stripe (simulado no teste)</h1>
<p>Nenhum pagamento é feito: esta página é servida pelo Playwright.</p></main></body></html>`

// ── Roteador ─────────────────────────────────────────────────────────────────

const SUPABASE_API = /^\/(rest|auth|functions|storage|realtime|graphql)\/v1\/?(.*)$/

/**
 * Instala o backend simulado na página. Precisa ser chamado antes do primeiro
 * `page.goto` (registra o roteador e o script que semeia o localStorage).
 */
export async function installMockBackend(
  page: Page,
  backend: MockBackend,
  appOrigin: string,
): Promise<void> {
  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()

    // O app em si (dev server do Playwright).
    if (url.origin === appOrigin) return route.continue()

    const api = url.pathname.match(SUPABASE_API)
    if (api) {
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders(route) })
      const bearer = request.headers().authorization ?? ''
      const authenticated = bearer === `Bearer ${backend.session.access_token}`
      return handleSupabase(route, backend, api[1], api[2], url, method, authenticated)
    }

    // Checkout do Stripe: página estática local (navegação depois do create-checkout-session).
    if (url.hostname === 'checkout.stripe.com' && READ_METHODS.has(method)) {
      backend.calls.push({ name: 'stripe:checkout', method, body: null, authenticated: false })
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: STRIPE_MOCK_HTML })
    }

    backend.externalRequests.push(`${method} ${url.origin}${url.pathname}`)
    if (!READ_METHODS.has(method)) backend.blockedWrites.push(`${method} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  const { options } = backend
  const seed: Array<[string, string]> = []
  if (options.consent) seed.push([CONSENT_KEY, options.consent])
  if (options.storedQuiz) seed.push([QUIZ_RESULT_KEY, JSON.stringify(backend.storedQuizResult())])
  if (options.signedIn) seed.push([AUTH_STORAGE_KEY, JSON.stringify(backend.session)])

  await page.addInitScript(
    ({ origin, entries }) => {
      if (location.origin !== origin) return
      try {
        // Só na primeira carga da aba: recarregar mantém o que o app gravou
        // (ex.: logout, marcadores do painel).
        if (sessionStorage.getItem('__e2e_mock_seeded')) return
        sessionStorage.setItem('__e2e_mock_seeded', '1')
        for (const [key, value] of entries) localStorage.setItem(key, value)
      } catch {
        /* storage bloqueado: segue sem semear */
      }
    },
    { origin: appOrigin, entries: seed },
  )
}

async function handleSupabase(
  route: Route,
  backend: MockBackend,
  service: string,
  path: string,
  url: URL,
  method: string,
  authenticated: boolean,
): Promise<void> {
  const isRead = READ_METHODS.has(method)
  const body = isRead ? null : readJsonBody(route)
  const record = (name: string) => backend.calls.push({ name, method, body, authenticated })
  const block = (name: string) => {
    record(name)
    backend.blockedWrites.push(`${method} ${service}/v1/${path}`)
    return route.abort('blockedbyclient')
  }

  // ── Auth ───────────────────────────────────────────────────────────────────
  if (service === 'auth') {
    const name = `auth:${path}`
    if (path === 'user' && isRead) {
      record(name)
      return authenticated
        ? fulfillJson(route, backend.user)
        : fulfillJson(route, { code: 401, error_code: 'no_authorization', msg: 'sem sessão' }, 401)
    }
    if (path === 'verify' && method === 'POST') {
      record(name)
      const { token_hash: tokenHash } = (body ?? {}) as { token_hash?: string }
      if (backend.verifyStatus !== 'ok' || tokenHash !== MOCK_TOKEN_HASH) {
        return fulfillJson(
          route,
          { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' },
          403,
        )
      }
      return fulfillJson(route, backend.session)
    }
    if (path === 'token' && method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
      record(name)
      return fulfillJson(route, backend.session)
    }
    if (path === 'logout' && method === 'POST') {
      record(name)
      return route.fulfill({ status: 204, headers: corsHeaders(route) })
    }
    if (isRead) {
      record(name)
      return fulfillJson(route, {})
    }
    return block(name)
  }

  // ── Edge Functions (todas por POST) ────────────────────────────────────────
  if (service === 'functions') {
    const fn = path.split('/')[0]
    const name = `fn:${fn}`

    if (fn === 'create-checkout-session' && method === 'POST') {
      record(name)
      const plan = (body as { plan?: string } | null)?.plan
      if (plan === 'recurring' && !authenticated) {
        return fulfillJson(route, { error: 'unauthorized' }, 401)
      }
      return fulfillJson(route, { url: STRIPE_CHECKOUT_MOCK_URL, sessionId: 'cs_test_e2eMockCheckout0001' })
    }

    if (fn === 'claim-session' && method === 'POST') {
      record(name)
      const claim = backend.options.claim
      if (claim.kind === 'token') return fulfillJson(route, { status: 'token', token_hash: MOCK_TOKEN_HASH })
      if (claim.kind === 'email_sent') return fulfillJson(route, { status: 'email_sent' })
      return fulfillJson(route, claim.body as Json, claim.status)
    }

    if (fn === 'chat-completion' && method === 'POST') {
      record(name)
      if (!authenticated) return fulfillJson(route, { error: 'unauthorized' }, 401)
      const { message, assessmentId } = (body ?? {}) as { message?: string; assessmentId?: string }
      const now = new Date().toISOString()
      // O servidor grava a pergunta e a resposta; o app relê `messages` no fim do stream.
      backend.messages.push(
        { id: `m-${backend.messages.length + 1}`, role: 'user', content: String(message ?? ''), created_at: now, assessment_id: String(assessmentId ?? '') },
        { id: `m-${backend.messages.length + 2}`, role: 'assistant', content: MOCK_CHAT_REPLY, created_at: now, assessment_id: String(assessmentId ?? '') },
      )
      const half = Math.ceil(MOCK_CHAT_REPLY.length / 2)
      const sse = [
        `data: ${JSON.stringify({ delta: MOCK_CHAT_REPLY.slice(0, half) })}\n\n`,
        `data: ${JSON.stringify({ delta: MOCK_CHAT_REPLY.slice(half) })}\n\n`,
        'data: [DONE]\n\n',
      ].join('')
      return route.fulfill({
        status: 200,
        headers: { ...corsHeaders(route), 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
        body: sse,
      })
    }

    // generate-explanation, compute-eligibility, send-email… nunca são chamadas nestes cenários.
    return block(name)
  }

  // ── PostgREST: RPCs (POST) ─────────────────────────────────────────────────
  if (service === 'rest' && path.startsWith('rpc/')) {
    const fn = path.slice('rpc/'.length)
    const name = `rpc:${fn}`

    if (fn === 'get_full_analysis') {
      record(name)
      // Mesma regra do servidor (migration 20261020000000): dono + acesso vigente.
      if (!authenticated) {
        return fulfillJson(route, { code: 'PT401', message: 'authentication required', details: null, hint: null }, 401)
      }
      if (!hasActiveAccess(backend.accessNow())) {
        return fulfillJson(route, { code: 'PT402', message: 'payment required', details: null, hint: null }, 402)
      }
      return fulfillJson(route, [
        { assessment_id: MOCK_ASSESSMENT_ID, computed_at: backend.completedAt(), ia_explanation_full: SEED_ANALYSIS_MARKDOWN },
      ])
    }

    if (fn === 'link_anon_assessment_to_user') {
      // Escrita no servidor real; aqui só responde (o diagnóstico já é da conta).
      record(name)
      if (!authenticated) return fulfillJson(route, { code: 'PT401', message: 'authentication required' }, 401)
      return fulfillJson(route, [backend.assessmentRow()])
    }

    return block(name)
  }

  // ── PostgREST: tabelas ─────────────────────────────────────────────────────
  if (service === 'rest') {
    const table = path.split('/')[0]
    const name = `rest:${table}`
    if (!isRead) return block(name)
    record(name)

    // Sem a sessão de teste, a RLS não devolve nada das tabelas da conta.
    let rows: unknown[]
    switch (table) {
      case 'profiles':
        rows = authenticated ? [backend.profileRow()] : []
        break
      case 'subscriptions':
        rows = authenticated ? [backend.nextSubscription()] : []
        break
      case 'user_roles':
        rows = []
        break
      case 'assessments': {
        const id = eqFilter(url, 'id')
        rows = authenticated && (!id || id === MOCK_ASSESSMENT_ID) ? [backend.assessmentRow()] : []
        break
      }
      case 'assessment_results':
        rows = authenticated ? [backend.resultRow()] : []
        break
      case 'messages':
        rows = authenticated
          ? backend.messages.map(({ id, role, content, created_at }) => ({ id, role, content, created_at }))
          : []
        break
      case 'user_documents':
        rows = authenticated ? backend.documents : []
        break
      default:
        // Leitura sem mock (ex.: tabela nova de outra tela): vazia, só para diagnóstico.
        backend.unknownReads.push(table)
        rows = []
    }

    const accept = route.request().headers().accept ?? ''
    if (accept.includes('application/vnd.pgrst.object+json')) {
      // .single(): exatamente uma linha, senão 406 como o PostgREST.
      if (rows.length === 1) return fulfillJson(route, rows[0] as Json)
      return fulfillJson(
        route,
        { code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' },
        406,
      )
    }
    return fulfillJson(route, rows as Json, 200, { 'content-range': rows.length ? `0-${rows.length - 1}/*` : '*/0' })
  }

  // ── Storage, Realtime, GraphQL ─────────────────────────────────────────────
  const name = `${service}:${path}`
  if (isRead) {
    record(name)
    return fulfillJson(route, [])
  }
  return block(name)
}

// ── Fixture ──────────────────────────────────────────────────────────────────

type MockBackendFixtures = {
  /** Opções do cenário: `test.use({ backendOptions: { ...DEFAULT_BACKEND_OPTIONS, scenario: 'recurring' } })`. */
  backendOptions: MockBackendOptions
  /** Backend instalado na `page` (estado, chamadas registradas). */
  backend: MockBackend
}

export const test = base.extend<MockBackendFixtures>({
  // Service worker responderia antes do page.route: bloqueado para nada escapar do mock.
  serviceWorkers: 'block',

  backendOptions: [DEFAULT_BACKEND_OPTIONS, { option: true }],

  // `auto`: instalado em todo teste deste fixture, mesmo nos que não leem `backend`
  // (sem ele a página falaria com o host do Supabase configurado).
  backend: [
    async ({ page, backendOptions, baseURL }, use) => {
      if (!baseURL) throw new Error('mock-backend: baseURL não definido no playwright.config.ts')
      const backend = new MockBackend(backendOptions)
      await installMockBackend(page, backend, new URL(baseURL).origin)

      await use(backend)

      // "Nenhuma escrita real" e nada fora da máquina — em todo teste.
      expect(backend.blockedWrites, 'escritas sem mock (abortadas)').toEqual([])
      expect(backend.externalRequests, 'requisições para fora da máquina (abortadas)').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

// ── Utilidades dos specs ─────────────────────────────────────────────────────

/** dd/mm como o app mostra (pt-BR, fuso do playwright.config.ts). */
export function dayMonth(date: Date, timeZone = 'Europe/Lisbon'): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone }).format(date)
}

/** Dias restantes como getAccessState calcula (arredondado para cima). */
export function daysLeftUntil(date: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
}

/** Sessão salva pelo supabase-js no localStorage (ou null). */
export async function storedSession(page: Page): Promise<{ access_token?: string } | null> {
  return page.evaluate((key) => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as { access_token?: string }) : null
    } catch {
      return null
    }
  }, AUTH_STORAGE_KEY)
}
