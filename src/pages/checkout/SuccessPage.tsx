// SuccessPage.tsx — retorno do Stripe depois do pagamento (DI-026).
//
// À prova de falha: nunca afirma "pagamento confirmado" sem confirmação do
// servidor e nunca manda para /login por tempo. Fluxo (regras em success-flow.ts):
//   verifying (claim-session) → signing_in (verifyOtp) → confirming (polling de
//   refreshUser a cada 2 s, até 30 s) → ready (vai para o painel)
// com os ramos email_sent, processing (claim 403), delayed, fallback (e-mail
// mascarado + reenvio + contato) e missing.
// O session_id sai da URL ao montar (fica só na sessionStorage desta aba) e não
// aparece na tela. `purchase` é enviado uma vez por compra (trackOnce).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  MailCheck,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { trackOnce } from '@/lib/analytics'
import { Sentry } from '@/lib/sentry'
import { OFFER } from '@/lib/offer'
import { TimeoutError, toUserError } from '@/lib/errors'
import { HAS_WHATSAPP, SUPPORT_EMAIL, WHATSAPP_URL, mailtoHref } from '@/config/contact'
import { readStoredQuizIdentity } from '@/lib/stored-quiz-result'
import { cn } from '@/lib/utils'
import { Button, Card, Container } from '@/components/ui'
import {
  CHECKOUT_SESSION_STORAGE_KEY,
  CLAIM_TIMEOUT_MS,
  CONFIRM_POLL_MS,
  CONFIRM_TIMEOUT_MS,
  PROCESSING_MAX_RETRIES,
  PROCESSING_RETRY_MS,
  RESEND_COOLDOWN_S,
  classifyClaim,
  maskEmail,
  purchaseOnceKey,
  takeCheckoutSessionId,
  type SuccessState,
} from './success-flow'

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Estados em que ainda estamos trabalhando (mostra os passos). */
const WORKING_STATES: ReadonlySet<SuccessState> = new Set(['init', 'verifying', 'signing_in', 'confirming'])

export function SuccessPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { authUser, loading, hasAccess, refreshUser } = useAuth()
  const [sessionId] = useState(() => takeCheckoutSessionId(searchParams, sessionStore()))
  const [state, setState] = useState<SuccessState>('init')
  const [paymentConfirmed, setPaymentConfirmed] = useState(false)
  const [claimBusy, setClaimBusy] = useState(false)
  const [resent, setResent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const paid = hasAccess('dashboard')
  const quizEmail = useMemo(() => readStoredQuizIdentity()?.email ?? null, [])
  const maskedEmail = maskEmail(authUser?.user.email ?? quizEmail)

  const mountedRef = useRef(true)
  const startedRef = useRef(false)
  const claimInFlightRef = useRef(false)
  const processingRetriesRef = useRef(0)
  const processingTimerRef = useRef<number | undefined>(undefined)
  const confirmDeadlineRef = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  /** Referência estável para as novas consultas agendadas (pagamento em processamento). */
  const runClaimRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(async () => undefined)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      window.clearTimeout(processingTimerRef.current)
    }
  }, [])

  // O session_id não fica na URL (histórico, prints, analytics): sai ao montar.
  useEffect(() => {
    if (!searchParams.has('session_id')) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('session_id')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  const markPaymentConfirmed = useCallback(() => {
    setPaymentConfirmed(true)
    if (sessionId) {
      trackOnce('purchase', purchaseOnceKey(sessionId), {
        value: OFFER.price,
        currency: OFFER.currency,
        plan: 'one_time',
      })
    }
  }, [sessionId])

  const runClaim = useCallback(
    async (options: { resend?: boolean; silent?: boolean } = {}) => {
      if (!sessionId || claimInFlightRef.current) return
      claimInFlightRef.current = true
      window.clearTimeout(processingTimerRef.current)
      setClaimBusy(true)
      // Reenvio e novas consultas automáticas mantêm a tela atual (sem piscar).
      if (!options.resend && !options.silent) setState('verifying')

      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(new TimeoutError()), CLAIM_TIMEOUT_MS)
      try {
        const { data, error } = await supabase.functions.invoke('claim-session', {
          body: { session_id: sessionId },
          signal: controller.signal,
        })
        const described = error ? await toUserError(error) : null
        const outcome = classifyClaim(data, described)
        if (!mountedRef.current) return

        if (outcome.kind === 'token') {
          markPaymentConfirmed()
          setState('signing_in')
          const { error: verifyError } = await supabase.auth.verifyOtp({
            type: 'magiclink',
            token_hash: outcome.tokenHash,
          })
          if (verifyError) {
            Sentry.captureMessage('checkout-success: verifyOtp falhou', {
              level: 'warning',
              tags: { area: 'checkout_success' },
            })
            if (mountedRef.current) setState('fallback')
          }
          // Sucesso: o AuthContext carrega a conta e o efeito abaixo segue para 'confirming'.
          return
        }

        if (outcome.kind === 'email_sent') {
          markPaymentConfirmed()
          setResent(Boolean(options.resend))
          setState('email_sent')
          return
        }

        if (outcome.kind === 'processing') {
          setState('processing')
          if (processingRetriesRef.current < PROCESSING_MAX_RETRIES) {
            processingRetriesRef.current += 1
            processingTimerRef.current = window.setTimeout(
              () => void runClaimRef.current({ silent: true }),
              PROCESSING_RETRY_MS,
            )
          }
          return
        }

        if (described && (described.kind === 'unknown' || (described.status ?? 0) >= 500)) {
          Sentry.captureException(error, { tags: { area: 'checkout_success', reason: outcome.reason } })
        } else {
          Sentry.captureMessage('checkout-success: claim-session sem login', {
            level: 'warning',
            tags: { area: 'checkout_success', reason: outcome.reason },
          })
        }
        setState('fallback')
      } catch (cause) {
        // Falha inesperada (ex.: verifyOtp lançou): nunca fica preso no spinner.
        Sentry.captureException(cause, { tags: { area: 'checkout_success', reason: 'unexpected' } })
        if (mountedRef.current) setState('fallback')
      } finally {
        window.clearTimeout(timer)
        claimInFlightRef.current = false
        if (mountedRef.current) setClaimBusy(false)
      }
    },
    [sessionId, markPaymentConfirmed],
  )

  useEffect(() => {
    runClaimRef.current = runClaim
  }, [runClaim])

  // Ponto de partida, quando já sabemos se há sessão.
  useEffect(() => {
    if (startedRef.current || loading) return
    startedRef.current = true
    if (paid) setState('ready')
    else if (authUser) setState('confirming')
    else if (sessionId) void runClaim()
    else setState('missing')
  }, [loading, paid, authUser, sessionId, runClaim])

  // Login concluído (aqui ou em outra aba) e acesso liberado.
  useEffect(() => {
    if (state === 'init' || state === 'ready') return
    if (paid) {
      setState('ready')
      return
    }
    if (authUser && (state === 'signing_in' || state === 'email_sent' || state === 'fallback' || state === 'missing')) {
      setState('confirming')
    }
  }, [state, paid, authUser])

  // verifyOtp concluído mas a conta não carregou: não fica preso no spinner.
  useEffect(() => {
    if (state !== 'signing_in') return
    const timer = window.setTimeout(() => {
      if (mountedRef.current) setState((s) => (s === 'signing_in' ? 'fallback' : s))
    }, CLAIM_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [state])

  // confirming: o webhook do Stripe pode chegar alguns segundos depois do login.
  useEffect(() => {
    if (state !== 'confirming') return
    if (!confirmDeadlineRef.current) confirmDeadlineRef.current = Date.now() + CONFIRM_TIMEOUT_MS
    const interval = window.setInterval(() => {
      if (Date.now() >= confirmDeadlineRef.current) {
        setState((s) => (s === 'confirming' ? 'delayed' : s))
        return
      }
      void refreshUser()
    }, CONFIRM_POLL_MS)
    return () => window.clearInterval(interval)
  }, [state, refreshUser])

  // ready: conta a compra (uma vez), esquece o session_id e abre o painel.
  useEffect(() => {
    if (state !== 'ready') return
    markPaymentConfirmed()
    try {
      sessionStore()?.removeItem(CHECKOUT_SESSION_STORAGE_KEY)
    } catch {
      // ignora
    }
    const timer = window.setTimeout(() => navigate('/dashboard', { replace: true }), 1500)
    return () => window.clearTimeout(timer)
  }, [state, markPaymentConfirmed, navigate])

  // Leva o foco ao título quando o estado muda de verdade (leitores de tela).
  useEffect(() => {
    if (WORKING_STATES.has(state)) return
    headingRef.current?.focus()
  }, [state])

  // Espera entre reenvios do link.
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const goToLogin = () =>
    navigate('/login', {
      state: { returnTo: '/dashboard', postPurchase: true, ...(quizEmail ? { email: quizEmail } : {}) },
    })

  const resendLink = () => {
    if (!sessionId) {
      goToLogin()
      return
    }
    setCooldown(RESEND_COOLDOWN_S)
    void runClaim({ resend: true })
  }

  const recheckAccess = () => {
    confirmDeadlineRef.current = 0
    setState('confirming')
    void refreshUser()
  }

  const retryClaim = () => {
    processingRetriesRef.current = 0
    void runClaim()
  }

  const view = describeState(state, { hasSession: Boolean(sessionId), maskedEmail, resent })

  return (
    <Container size="sm" className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center py-10 sm:py-16">
      <div className="w-full max-w-md text-center">
        <StateIcon icon={view.icon} tone={view.tone} spinning={view.spinning} />

        <div aria-live="polite">
          <h1
            ref={headingRef}
            tabIndex={-1}
            data-testid="checkout-success"
            data-state={state}
            className="text-2xl font-bold leading-tight text-foreground outline-none [text-wrap:balance] sm:text-3xl"
          >
            {view.title}
          </h1>
          <p className="mt-2 text-base text-muted-foreground [text-wrap:pretty]">{view.description}</p>
        </div>

        {WORKING_STATES.has(state) && (
          <ProgressSteps
            paymentConfirmed={paymentConfirmed || paid}
            signedIn={Boolean(authUser)}
            accessReady={paid}
          />
        )}

        <div className="mt-6 flex flex-col gap-3">
          {state === 'ready' && (
            <Button asChild size="lg" className="w-full">
              <Link to="/dashboard" replace>
                Abrir meu painel
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}

          {state === 'email_sent' && (
            <div data-testid="checkout-success-email-sent" className="flex flex-col gap-3">
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={resendLink}
                loading={claimBusy}
                disabled={cooldown > 0}
              >
                {cooldown > 0 ? `Reenviar link (${cooldown}s)` : 'Reenviar link'}
              </Button>
              <p className="text-sm text-muted-foreground">Não chegou? Confira também a caixa de spam.</p>
            </div>
          )}

          {state === 'processing' && (
            <Button variant="secondary" size="md" className="w-full" onClick={retryClaim} loading={claimBusy}>
              <RotateCcw aria-hidden="true" />
              Verificar agora
            </Button>
          )}

          {state === 'delayed' && (
            <Button size="md" className="w-full" onClick={recheckAccess}>
              <RotateCcw aria-hidden="true" />
              Verificar de novo
            </Button>
          )}

          {state === 'fallback' && (
            <>
              {sessionId && (
                <Button size="md" className="w-full" onClick={retryClaim} loading={claimBusy}>
                  <RotateCcw aria-hidden="true" />
                  Tentar de novo
                </Button>
              )}
              <Button
                data-testid="checkout-success-resend"
                variant={sessionId ? 'secondary' : 'primary'}
                size="md"
                className="w-full"
                onClick={goToLogin}
              >
                Receber link de acesso
              </Button>
            </>
          )}

          {state === 'missing' && (
            <Button size="md" className="w-full" onClick={goToLogin}>
              Entrar com o e-mail da compra
            </Button>
          )}
        </div>

        {view.showSupport && <SupportLine />}
      </div>
    </Container>
  )
}

// ─── Apresentação de cada estado ────────────────────────────────────────────

type Tone = 'primary' | 'success' | 'warning'

interface StateView {
  title: string
  description: string
  icon: LucideIcon
  tone: Tone
  spinning?: boolean
  showSupport?: boolean
}

function describeState(
  state: SuccessState,
  ctx: { hasSession: boolean; maskedEmail: string | null; resent: boolean },
): StateView {
  const toEmail = ctx.maskedEmail ? `para ${ctx.maskedEmail}` : 'para o e-mail usado na compra'
  switch (state) {
    case 'ready':
      return {
        title: ctx.hasSession ? 'Pagamento confirmado' : 'Seu acesso está liberado',
        description: 'Sua análise completa já está disponível. Abrindo seu painel…',
        icon: CheckCircle2,
        tone: 'success',
      }
    case 'email_sent':
      return {
        title: 'Pagamento confirmado',
        description: ctx.resent
          ? `Enviamos um novo link de acesso ${toEmail}. Abra o e-mail neste aparelho para entrar no painel.`
          : `Enviamos um link de acesso ${toEmail}. Abra o e-mail neste aparelho para entrar no painel.`,
        icon: MailCheck,
        tone: 'success',
        showSupport: true,
      }
    case 'processing':
      return {
        title: 'Pagamento em processamento',
        description:
          'O pagamento ainda está sendo confirmado. Esta página verifica de novo sozinha; você também pode verificar agora.',
        icon: Clock,
        tone: 'warning',
        showSupport: true,
      }
    case 'delayed':
      return {
        title: 'Liberando seu acesso',
        description:
          'Ainda não recebemos a confirmação do pagamento para liberar seu painel. Isso pode levar alguns minutos.',
        icon: Clock,
        tone: 'warning',
        showSupport: true,
      }
    case 'fallback':
      return {
        title: 'Não conseguimos abrir sua conta automaticamente',
        description: `Se você concluiu o pagamento, seu acesso fica no e-mail usado na compra${
          ctx.maskedEmail ? ` (${ctx.maskedEmail})` : ''
        }. Peça um link de acesso para entrar.`,
        icon: AlertCircle,
        tone: 'warning',
        showSupport: true,
      }
    case 'missing':
      return {
        title: 'Não encontramos os dados da compra nesta página',
        description: 'Se você já pagou, entre com o e-mail usado na compra para abrir sua análise.',
        icon: Info,
        tone: 'primary',
        showSupport: true,
      }
    default:
      return {
        title: ctx.hasSession ? 'Confirmando seu pagamento' : 'Abrindo seu acesso',
        description: 'Isso leva só alguns segundos. Não feche esta página.',
        icon: Loader2,
        tone: 'primary',
        spinning: true,
      }
  }
}

const TONE_CLASSES: Record<Tone, string> = {
  primary: 'bg-primary/[.08] text-primary',
  success: 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]',
  warning: 'bg-[hsl(var(--warning)/0.1)] text-[hsl(var(--warning))]',
}

function StateIcon({ icon: Icon, tone, spinning }: { icon: LucideIcon; tone: Tone; spinning?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn('mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full', TONE_CLASSES[tone])}
    >
      <Icon className={cn('h-8 w-8', spinning && 'animate-spin')} strokeWidth={1.75} />
    </div>
  )
}

/** Passos reais (no lugar da antiga barra de progresso fictícia). */
function ProgressSteps({
  paymentConfirmed,
  signedIn,
  accessReady,
}: {
  paymentConfirmed: boolean
  signedIn: boolean
  accessReady: boolean
}) {
  const steps = [
    { label: 'Pagamento recebido', done: paymentConfirmed },
    { label: 'Entrando na sua conta', done: signedIn },
    { label: 'Liberando seu acesso', done: accessReady },
  ]
  const current = steps.findIndex((s) => !s.done)

  return (
    <Card className="mt-6 text-left" aria-label="Andamento">
      <ol className="space-y-3">
        {steps.map((step, i) => {
          const active = i === current
          return (
            <li key={step.label} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  step.done ? 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]' : 'bg-muted text-muted-foreground',
                )}
              >
                {step.done ? (
                  <Check className="h-4 w-4" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className={cn('text-base', step.done || active ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
                <span className="sr-only">{step.done ? ' (concluído)' : active ? ' (em andamento)' : ' (pendente)'}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function SupportLine() {
  return (
    <p className="mt-6 text-sm text-muted-foreground [text-wrap:pretty]">
      Precisa de ajuda? Escreva para{' '}
      <a
        href={mailtoHref(SUPPORT_EMAIL, 'Acesso depois do pagamento')}
        className="font-medium text-primary underline underline-offset-4"
      >
        {SUPPORT_EMAIL}
      </a>
      {HAS_WHATSAPP && (
        <>
          {' '}ou{' '}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4"
          >
            fale pelo WhatsApp
          </a>
        </>
      )}
      .
    </p>
  )
}
