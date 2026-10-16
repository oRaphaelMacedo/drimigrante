/**
 * AuthCallbackPage — destino do magic link / OAuth.
 *
 * Histórico:
 *  B04-A02 — valida o destino antes de navegar (sem open redirect)
 *  B04-A06 — onAuthStateChange em vez de getSession(); feedback de link expirado
 *
 * DI-027:
 *  - Sucesso em SIGNED_IN *ou* INITIAL_SESSION com sessão. Como esta página é
 *    carregada sob demanda, quando o chunk chega o supabase-js pode já ter
 *    emitido o SIGNED_IN; a nova inscrição só recebe INITIAL_SESSION. Antes,
 *    isso deixava o spinner rodando para sempre.
 *  - Trata `error`/`error_code`/`error_description` vindos do Supabase.
 *  - Aceita links com `token_hash` (template de e-mail com {{ .TokenHash }}).
 *  - Timeout de 10 s → /login?error=link_expired.
 *  - Destino: `?next=` da URL (validado por safeInternalPath); reserva no
 *    localStorage (`auth_return_to`) para quem iniciou o login neste navegador.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { Sentry } from '@/lib/sentry'
import { DEFAULT_AFTER_LOGIN_PATH, safeInternalPath } from '@/lib/safe-path'

const CALLBACK_TIMEOUT_MS = 10_000

/** Chaves gravadas pelo LoginPage (sobrevivem a outra aba do mesmo navegador). */
const RETURN_TO_KEY = 'auth_return_to'
const RETURN_PLAN_KEY = 'auth_return_plan'
const RETURN_ASSESSMENT_KEY = 'auth_return_assessment_id'

const TOKEN_HASH_TYPES: ReadonlySet<string> = new Set(['magiclink', 'email', 'signup', 'invite'])

type CallbackError = 'link_expired' | 'auth_error'

interface CallbackParams {
  next: string | null
  error: string | null
  errorCode: string | null
  tokenHash: string | null
  otpType: EmailOtpType | null
}

function readCallbackParams(): CallbackParams {
  const search = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const pick = (key: string) => search.get(key) ?? hash.get(key)

  const type = search.get('type')
  return {
    next: search.get('next'),
    error: pick('error') ?? pick('error_description'),
    errorCode: pick('error_code'),
    tokenHash: search.get('token_hash'),
    otpType: type && TOKEN_HASH_TYPES.has(type) ? (type as EmailOtpType) : null,
  }
}

function classifyError(params: CallbackParams): CallbackError {
  const code = (params.errorCode ?? '').toLowerCase()
  const error = (params.error ?? '').toLowerCase()
  if (
    code === 'otp_expired' ||
    code === 'otp_disabled' ||
    error === 'access_denied' ||
    error.includes('expired') ||
    error.includes('invalid')
  ) {
    return 'link_expired'
  }
  return 'auth_error'
}

/** Lê e apaga a intenção de retorno guardada no localStorage. */
function consumeStoredReturn(): {
  to: string | null
  plan: string | null
  assessmentId: string | null
} {
  try {
    const stored = {
      to: localStorage.getItem(RETURN_TO_KEY),
      plan: localStorage.getItem(RETURN_PLAN_KEY),
      assessmentId: localStorage.getItem(RETURN_ASSESSMENT_KEY),
    }
    localStorage.removeItem(RETURN_TO_KEY)
    localStorage.removeItem(RETURN_PLAN_KEY)
    localStorage.removeItem(RETURN_ASSESSMENT_KEY)
    return stored
  } catch {
    return { to: null, plan: null, assessmentId: null }
  }
}

function resolveDestination(nextFromUrl: string | null): {
  path: string
  state: Record<string, string> | undefined
} {
  const stored = consumeStoredReturn()
  // `next` do link tem prioridade: é específico deste e-mail.
  const fromUrl = nextFromUrl ? safeInternalPath(nextFromUrl, '') : ''
  const path = fromUrl || safeInternalPath(stored.to, DEFAULT_AFTER_LOGIN_PATH)

  const state: Record<string, string> = {}
  if (stored.plan) state.plan = stored.plan
  if (stored.assessmentId) state.assessmentId = stored.assessmentId
  return { path, state: Object.keys(state).length > 0 ? state : undefined }
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const doneRef = useRef(false)
  const verifyRef = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    let cancelled = false
    const params = readCallbackParams()

    const finishSuccess = () => {
      if (cancelled || doneRef.current) return
      doneRef.current = true
      const { path, state } = resolveDestination(params.next)
      navigate(path, { replace: true, state })
    }

    const finishError = (reason: CallbackError) => {
      if (cancelled || doneRef.current) return
      doneRef.current = true
      if (reason === 'auth_error') {
        Sentry.captureMessage('auth callback error', {
          level: 'warning',
          tags: { ctx: 'auth.callback', error_code: params.errorCode ?? 'none' },
        })
      }
      const query = new URLSearchParams({ error: reason })
      const next = params.next ? safeInternalPath(params.next, '') : ''
      if (next) query.set('next', next)
      navigate(`/login?${query.toString()}`, { replace: true })
    }

    // Sem sessão: se já existe uma (ex.: link reutilizado com a pessoa logada), segue.
    const finishWithExistingSessionOr = async (reason: CallbackError) => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          finishSuccess()
          return
        }
      } catch {
        // cai no erro abaixo
      }
      finishError(reason)
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        finishSuccess()
        return
      }
      if (event === 'INITIAL_SESSION' && !session) {
        // Link com token_hash: o resultado vem do verifyOtp abaixo.
        if (params.tokenHash && params.otpType) return
        finishError(params.error || params.errorCode ? classifyError(params) : 'link_expired')
      }
    })

    if (params.tokenHash && params.otpType) {
      // O token só pode ser usado uma vez: a promessa fica no ref para que a
      // segunda execução do efeito (StrictMode) reaproveite o mesmo resultado.
      if (!verifyRef.current) {
        verifyRef.current = supabase.auth
          .verifyOtp({ token_hash: params.tokenHash, type: params.otpType })
          .then(({ data, error }) => !error && Boolean(data.session))
          .catch(() => false)
      }
      void verifyRef.current.then((ok) => {
        if (ok) finishSuccess()
        else void finishWithExistingSessionOr('link_expired')
      })
    }

    const timer = window.setTimeout(() => {
      void finishWithExistingSessionOr('link_expired')
    }, CALLBACK_TIMEOUT_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [navigate])

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60dvh] items-center justify-center px-4 py-10"
    >
      <div className="text-center">
        <Loader2 aria-hidden="true" className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
        <p className="text-base font-medium text-foreground">Verificando seu acesso…</p>
        <p className="mt-1 text-sm text-muted-foreground">Você será redirecionado em instantes.</p>
      </div>
    </div>
  )
}
