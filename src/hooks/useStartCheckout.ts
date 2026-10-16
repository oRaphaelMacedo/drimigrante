/**
 * useStartCheckout — compra do €30 em 1 clique (DI-011, DI-032).
 *
 * Fonte única do botão de compra: usado na ResultsPage e no /checkout.
 *
 * Modos:
 *  - 'authenticated': há sessão; a function usa o JWT (o corpo leva só o plano
 *    e o assessmentId deste aparelho, se houver).
 *  - 'anonymous': sem login, com o resultado do quiz neste aparelho
 *    (sessionId + e-mail). Vai direto para o Stripe, sem passar pelo /login.
 *  - 'empty': sem login e sem dados locais — não há o que comprar daqui.
 *
 * Robustez:
 *  - assessmentId ausente (o quiz não conseguiu salvar no banco) com respostas
 *    locais: salva de novo pelo RPC antes de abrir o pagamento, em vez de pedir
 *    para refazer o quiz. Idem quando o servidor responde assessment_not_found.
 *  - 15 s no máximo (AbortController); depois disso, erro com "Tentar novamente".
 *  - Erros em português (src/lib/errors.ts), nunca a mensagem técnica.
 *  - Voltar do Stripe pelo botão do navegador (bfcache, `pageshow` persisted)
 *    destrava o botão.
 *  - Falhas inesperadas vão para o Sentry (sem e-mail nem session_id).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { persistAssessment } from '@/hooks/useAssessment'
import { track } from '@/lib/analytics'
import { getAttribution } from '@/lib/attribution'
import { Sentry } from '@/lib/sentry'
import { OFFER } from '@/lib/offer'
import { TimeoutError, toUserError, type UserFacingError } from '@/lib/errors'
import { QUIZ_RESULT_STORAGE_KEY } from '@/lib/stored-quiz-result'

/** Tempo máximo entre o clique e o redirecionamento para o Stripe. */
export const CHECKOUT_TIMEOUT_MS = 15_000

// ── Dados locais do quiz ─────────────────────────────────────────────────────

export interface StoredCheckoutData {
  sessionId: string | null
  assessmentId: string | null
  /** E-mail como foi digitado no quiz (sem espaços nas pontas). */
  email: string | null
  fullName: string | null
  phone: string | null
  answers: Record<string, string> | null
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseAnswers(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/** Lê o JSON salvo pelo quiz (`dr_imigrante_quiz_result`). Nunca lança. */
export function parseStoredCheckoutData(raw: string | null | undefined): StoredCheckoutData | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as {
      sessionId?: unknown
      assessmentId?: unknown
      answers?: unknown
      leadInfo?: { email?: unknown; fullName?: unknown; phone?: unknown } | null
    }
    const email = nonEmpty(record.leadInfo?.email)
    return {
      sessionId: nonEmpty(record.sessionId),
      assessmentId: nonEmpty(record.assessmentId),
      email: email && email.includes('@') ? email : null,
      fullName: nonEmpty(record.leadInfo?.fullName),
      phone: nonEmpty(record.leadInfo?.phone),
      answers: parseAnswers(record.answers),
    }
  } catch {
    return null
  }
}

export function readStoredCheckoutData(): StoredCheckoutData | null {
  try {
    if (typeof window === 'undefined') return null
    return parseStoredCheckoutData(window.localStorage.getItem(QUIZ_RESULT_STORAGE_KEY))
  } catch {
    return null
  }
}

/** Grava o assessmentId recém-criado no resultado local (mantém o resto). */
function writeStoredAssessmentId(assessmentId: string): void {
  try {
    const raw = window.localStorage.getItem(QUIZ_RESULT_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return
    window.localStorage.setItem(
      QUIZ_RESULT_STORAGE_KEY,
      JSON.stringify({ ...(parsed as Record<string, unknown>), assessmentId }),
    )
  } catch {
    // sem storage: o assessmentId vale só para esta tentativa
  }
}

export type CheckoutMode = 'authenticated' | 'anonymous' | 'empty'

/** Limites do RPC upsert_anon_assessment para o session_id. */
function isUsableSessionId(sessionId: string | null): sessionId is string {
  return Boolean(sessionId && sessionId.length >= 8 && sessionId.length <= 64)
}

/** Dá para comprar sem login a partir destes dados locais? */
export function canCheckoutAnonymously(stored: StoredCheckoutData | null): boolean {
  if (!stored || !stored.email || !isUsableSessionId(stored.sessionId)) return false
  return Boolean(stored.assessmentId || stored.answers)
}

export function resolveCheckoutMode(hasUser: boolean, stored: StoredCheckoutData | null): CheckoutMode {
  if (hasUser) return 'authenticated'
  return canCheckoutAnonymously(stored) ? 'anonymous' : 'empty'
}

/** Só segue para URLs https (Stripe) ou para o próprio app (mocks dos testes). */
export function isSafeRedirectUrl(raw: string, origin: string): boolean {
  try {
    const url = new URL(raw, origin)
    return url.origin === origin || url.protocol === 'https:'
  } catch {
    return false
  }
}

/** Indireção para o redirecionamento (substituível nos testes; o jsdom não navega). */
export const checkoutNavigation = {
  assign(url: string): void {
    window.location.assign(url)
  },
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export type CheckoutPhase = 'idle' | 'preparing' | 'redirecting' | 'email_sent' | 'error'

/** O que oferecer junto do erro. */
export type CheckoutErrorAction = 'retry' | 'login' | 'dashboard' | 'quiz'

export interface CheckoutError {
  message: string
  action: CheckoutErrorAction
  /** Motivo curto (código do servidor ou tipo do erro), também enviado ao analytics. */
  reason: string
  status: number | null
}

export interface StartCheckoutOptions {
  /** Onde o CTA foi clicado (analytics), ex.: 'results_paywall', 'checkout'. */
  position?: string
}

export interface UseStartCheckoutResult {
  mode: CheckoutMode
  phase: CheckoutPhase
  /** true enquanto prepara ou redireciona (botão em loading). */
  isPending: boolean
  error: CheckoutError | null
  /** E-mail com que a compra será feita (da conta ou do quiz), para exibir. */
  email: string | null
  start: (options?: StartCheckoutOptions) => Promise<void>
  reset: () => void
}

interface CheckoutResponse {
  url?: unknown
  status?: unknown
}

const CHECKOUT_CODE_MESSAGES: Partial<Record<string, string>> = {
  assessment_not_found:
    'Não conseguimos confirmar seu diagnóstico. Se você já tem conta, entre com o e-mail usado no quiz.',
}

const EMPTY_ERROR: CheckoutError = {
  message: 'Não encontramos seu diagnóstico neste aparelho. Faça o quiz grátis para ver seu resultado.',
  action: 'quiz',
  reason: 'no_local_data',
  status: null,
}

const SAVE_FAILED_ERROR: CheckoutError = {
  message: 'Não conseguimos salvar seu diagnóstico agora. Verifique sua conexão e tente novamente.',
  action: 'retry',
  reason: 'assessment_save_failed',
  status: null,
}

const LINKED_ERROR: CheckoutError = {
  message: 'Este diagnóstico já está ligado a uma conta. Entre com o e-mail usado no quiz para continuar.',
  action: 'login',
  reason: 'assessment_linked',
  status: null,
}

const NO_URL_ERROR: CheckoutError = {
  message: 'Não conseguimos abrir a página de pagamento. Tente novamente em instantes.',
  action: 'retry',
  reason: 'no_checkout_url',
  status: null,
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new TimeoutError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new TimeoutError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

type RepersistResult = { ok: true; assessmentId: string } | { ok: false; error: CheckoutError }

/** O RPC recusa regravar um diagnóstico que já foi ligado a uma conta. */
function isAlreadyLinked(message: string | null): boolean {
  return Boolean(message && /already linked/i.test(message))
}

/**
 * Salva de novo o assessment anônimo (mesmo session_id) e devolve o id.
 * Falha com a próxima ação: entrar (diagnóstico já ligado a uma conta) ou
 * tentar de novo (rede, servidor).
 */
async function repersistAssessment(stored: StoredCheckoutData, signal: AbortSignal): Promise<RepersistResult> {
  if (!stored.answers || !stored.email || !isUsableSessionId(stored.sessionId)) {
    return { ok: false, error: SAVE_FAILED_ERROR }
  }
  const sessionId = stored.sessionId
  const answered = Object.keys(stored.answers).length
  let attribution: ReturnType<typeof getAttribution> = {}
  try {
    attribution = getAttribution()
  } catch {
    attribution = {}
  }
  const { assessment, error } = await abortable(
    persistAssessment({
      sessionId,
      answers: stored.answers,
      fullName: stored.fullName ?? '',
      email: stored.email,
      phone: stored.phone ?? undefined,
      questionsAnswered: answered,
      totalQuestions: answered,
      utmSource: attribution.utm_source ?? null,
      utmMedium: attribution.utm_medium ?? null,
      utmCampaign: attribution.utm_campaign ?? null,
    }),
    signal,
  )
  const assessmentId = assessment?.id ?? null
  if (!assessmentId) return { ok: false, error: isAlreadyLinked(error) ? LINKED_ERROR : SAVE_FAILED_ERROR }

  writeStoredAssessmentId(assessmentId)
  await computeEligibility(assessmentId, sessionId, signal)
  return { ok: true, assessmentId }
}

/** Tempo máximo esperando o cálculo do resultado antes de seguir para o pagamento. */
const ELIGIBILITY_WAIT_MS = 4_000

/**
 * Resultado determinístico (regras, sem IA) para o painel, como o quiz faz ao
 * salvar. Esperamos um pouco porque o redirecionamento para o Stripe cancelaria
 * a chamada; se demorar ou falhar, o pagamento segue mesmo assim.
 */
async function computeEligibility(assessmentId: string, sessionId: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return
  const controller = new AbortController()
  const stop = () => controller.abort()
  const timer = window.setTimeout(stop, ELIGIBILITY_WAIT_MS)
  signal.addEventListener('abort', stop, { once: true })
  try {
    await abortable(
      supabase.functions.invoke('compute-eligibility', {
        body: { assessment_id: assessmentId, session_id: sessionId },
        signal: controller.signal,
      }),
      controller.signal,
    )
  } catch {
    // não segura o pagamento
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', stop)
  }
}

type InvokeResult = { ok: true; data: CheckoutResponse } | { ok: false; error: UserFacingError; cause: unknown }

async function invokeCreateCheckout(body: Record<string, unknown>, signal: AbortSignal): Promise<InvokeResult> {
  try {
    const { data, error } = await abortable(
      supabase.functions.invoke<CheckoutResponse>('create-checkout-session', { body, signal }),
      signal,
    )
    if (error) throw error
    return { ok: true, data: data && typeof data === 'object' ? data : {} }
  } catch (cause) {
    return { ok: false, error: await toUserError(cause, { codeMessages: CHECKOUT_CODE_MESSAGES }), cause }
  }
}

function actionFor(error: UserFacingError, isAuthenticated: boolean): CheckoutErrorAction {
  if (error.code === 'already_active' || error.status === 409) return 'dashboard'
  if (error.code === 'unauthorized' || error.status === 401) return 'login'
  if (error.code === 'assessment_not_found' && !isAuthenticated) return 'login'
  return 'retry'
}

function reportUnexpected(error: UserFacingError, cause: unknown): void {
  const reason = error.code ?? error.kind
  if (error.kind === 'timeout') {
    Sentry.captureMessage('checkout: tempo esgotado ao iniciar o pagamento', {
      level: 'warning',
      tags: { area: 'checkout', reason },
    })
    return
  }
  const unexpected =
    error.kind === 'unknown' || error.kind === 'relay' || (error.kind === 'http' && (error.status ?? 0) >= 500)
  if (unexpected) {
    Sentry.captureException(cause, { tags: { area: 'checkout', reason, status: String(error.status ?? '') } })
  }
}

export function useStartCheckout(): UseStartCheckoutResult {
  const { authUser, refreshUser } = useAuth()
  const [stored, setStored] = useState<StoredCheckoutData | null>(readStoredCheckoutData)
  const [phase, setPhase] = useState<CheckoutPhase>('idle')
  const [error, setError] = useState<CheckoutError | null>(null)
  const inFlightRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const isAuthenticated = Boolean(authUser)
  const mode = resolveCheckoutMode(isAuthenticated, stored)
  const email = authUser?.user.email ?? (mode === 'anonymous' ? stored?.email ?? null : null)

  const reset = useCallback(() => {
    inFlightRef.current = false
    controllerRef.current?.abort()
    controllerRef.current = null
    setPhase('idle')
    setError(null)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // Voltou do Stripe pelo "voltar" do navegador: a página vem do bfcache com
    // o botão ainda em "processando". Destrava e relê os dados locais.
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      reset()
      setStored(readStoredCheckoutData())
    }
    window.addEventListener('pageshow', onPageShow)
    return () => {
      mountedRef.current = false
      window.removeEventListener('pageshow', onPageShow)
      controllerRef.current?.abort()
    }
  }, [reset])

  const start = useCallback(
    async (options: StartCheckoutOptions = {}) => {
      if (inFlightRef.current) return
      inFlightRef.current = true

      const controller = new AbortController()
      controllerRef.current = controller
      const timer = window.setTimeout(() => controller.abort(new TimeoutError()), CHECKOUT_TIMEOUT_MS)
      const { signal } = controller

      const fail = (next: CheckoutError) => {
        track('checkout_failed', {
          reason: next.reason,
          plan: 'one_time',
          ...(next.status !== null ? { status: next.status } : {}),
        })
        if (!mountedRef.current) return
        setError(next)
        setPhase('error')
      }

      setError(null)
      setPhase('preparing')

      const local = readStoredCheckoutData()
      setStored(local)

      if (options.position) track('paywall_cta_clicked', { position: options.position })
      track('checkout_started', {
        plan: 'one_time',
        value: OFFER.price,
        currency: OFFER.currency,
        assessment_id: local?.assessmentId ?? null,
      })

      let redirecting = false
      try {
        let body: Record<string, unknown>
        let assessmentId = local?.assessmentId ?? null
        let repersisted = false

        if (isAuthenticated) {
          body = { plan: 'one_time', assessmentId }
        } else {
          if (!local || !canCheckoutAnonymously(local)) {
            fail(EMPTY_ERROR)
            return
          }
          if (!assessmentId) {
            const saved = await repersistAssessment(local, signal)
            repersisted = true
            if (!saved.ok) {
              fail(saved.error)
              return
            }
            assessmentId = saved.assessmentId
          }
          body = { plan: 'one_time', assessmentId, sessionId: local.sessionId, email: local.email }
        }

        let result = await invokeCreateCheckout(body, signal)

        // Assessment expirado/apagado no servidor: salva de novo (uma vez) e repete.
        if (
          !result.ok &&
          !isAuthenticated &&
          !repersisted &&
          local &&
          result.error.code === 'assessment_not_found' &&
          local.answers
        ) {
          const saved = await repersistAssessment(local, signal)
          if (saved.ok && saved.assessmentId !== assessmentId) {
            result = await invokeCreateCheckout({ ...body, assessmentId: saved.assessmentId }, signal)
          }
        }

        if (!result.ok) {
          const action = actionFor(result.error, isAuthenticated)
          reportUnexpected(result.error, result.cause)
          if (action === 'dashboard' && isAuthenticated) void refreshUser()
          fail({
            message: result.error.message,
            action,
            reason: result.error.code ?? result.error.kind,
            status: result.error.status,
          })
          return
        }

        const { data } = result
        if (data.status === 'email_sent') {
          if (mountedRef.current) setPhase('email_sent')
          return
        }

        const url = typeof data.url === 'string' ? data.url : null
        if (!url || !isSafeRedirectUrl(url, window.location.origin)) {
          Sentry.captureMessage('checkout: resposta sem URL de pagamento válida', {
            level: 'error',
            tags: { area: 'checkout' },
          })
          fail(NO_URL_ERROR)
          return
        }

        redirecting = true
        if (mountedRef.current) setPhase('redirecting')
        checkoutNavigation.assign(url)
      } catch (cause) {
        // Falhas fora da function (ex.: tempo esgotado ao salvar o diagnóstico).
        const described = await toUserError(cause)
        reportUnexpected(described, cause)
        fail(
          described.kind === 'unknown'
            ? { ...SAVE_FAILED_ERROR, reason: 'unknown' }
            : { message: described.message, action: 'retry', reason: described.kind, status: described.status },
        )
      } finally {
        window.clearTimeout(timer)
        if (controllerRef.current === controller) controllerRef.current = null
        // Redirecionando: o botão segue travado até a página sair (ou voltar do bfcache).
        if (!redirecting) inFlightRef.current = false
      }
    },
    [isAuthenticated, refreshUser],
  )

  return {
    mode,
    phase,
    isPending: phase === 'preparing' || phase === 'redirecting',
    error,
    email,
    start,
    reset,
  }
}
