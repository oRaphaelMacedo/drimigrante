// ResultsPage.tsx — pré-resultado do quiz + oferta da análise completa.
//
// DI-011: o botão de compra usa useStartCheckout (1 clique, sem login; salva
//   o diagnóstico de novo se faltar o assessmentId). Volta do Stripe com
//   ?checkout=cancelled mostra um aviso neutro ("Nada foi cobrado").
// DI-010: textos da oferta vêm de OFFER (nada de promessa que o produto não cumpre).
// DI-032: erro do pagamento em português, logo abaixo do botão, com
//   "Tentar novamente".
// DI-033: results_viewed/quiz_completed uma vez por diagnóstico, paywall_viewed
//   quando a oferta aparece na tela, checkout_cancelled ao voltar do Stripe.
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Check,
  CircleDot,
  Compass,
  Info,
  Lock,
  RotateCcw,
  Sparkles,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuizResult } from '@/hooks/useQuiz'
import type { VisaSuggestion } from '@/data/quiz-questions'
import { track, trackOnce } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { useAuth } from '@/hooks/useAuth'
import { readStoredCheckoutData, useStartCheckout } from '@/hooks/useStartCheckout'
import { QUIZ_RESULT_STORAGE_KEY } from '@/lib/stored-quiz-result'
import { Badge, Button, Card, Container } from '@/components/ui'
import { CheckoutFeedback } from '@/components/checkout/CheckoutFeedback'

type ScoreCategory = QuizResult['score']['category']

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasAccess } = useAuth()
  // Derivado na renderização (sem piscar o estado vazio antes de ler o aparelho).
  const loaded = useMemo(() => loadResult(location.state), [location.state])
  const result = loaded?.result ?? null
  const resultKey = loaded?.key ?? null
  const [showCancelled, setShowCancelled] = useState(() => searchParams.get('checkout') === 'cancelled')
  const cancelHandledRef = useRef(false)

  // Volta do Stripe sem pagar: aviso neutro, evento único e URL limpa
  // (recarregar a página não repete o aviso nem o evento).
  useEffect(() => {
    if (searchParams.get('checkout') !== 'cancelled' || cancelHandledRef.current) return
    cancelHandledRef.current = true
    setShowCancelled(true)
    track('checkout_cancelled', { plan: 'one_time' })
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('checkout')
        return next
      },
      { replace: true, state: location.state },
    )
  }, [searchParams, setSearchParams, location.state])

  const paid = hasAccess('dashboard')

  // Um evento por diagnóstico (recarregar /results não conta de novo).
  useEffect(() => {
    if (!result) return
    const key = resultKey ?? `${result.score.category}:${result.score.percentage}`
    trackOnce('quiz_completed', key, {
      score: result.score.percentage,
      category: result.score.category,
      top_visa: result.visas?.[0]?.code,
    })
    trackOnce('results_viewed', key, { category: result.score.category, has_access: paid })
  }, [result, resultKey, paid])

  const cancelledNotice = showCancelled ? <CancelledNotice onClose={() => setShowCancelled(false)} /> : null

  if (!result) {
    return (
      <Container size="sm" className="flex min-h-[60dvh] flex-col justify-center gap-6 py-10">
        {cancelledNotice}
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-base text-muted-foreground [text-wrap:pretty]">
            Não encontramos nenhum resultado do quiz neste aparelho.
          </p>
          <div className="flex w-full max-w-sm flex-col gap-3">
            <Button asChild size="md" className="w-full">
              <Link to="/quiz">
                Fazer o quiz grátis
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="md" className="w-full">
              <Link to="/login" state={{ returnTo: '/dashboard' }}>
                Já paguei, entrar
              </Link>
            </Button>
          </div>
        </div>
      </Container>
    )
  }

  const { score, visas, leadInfo } = result
  const onceKey = resultKey ?? `${score.category}:${score.percentage}`

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      <Container size="sm" className="space-y-5 py-6 sm:space-y-6 sm:py-10">
        {cancelledNotice}

        {/* ── Pontuação ── */}
        <ScoreCard score={score} leadInfo={leadInfo} />

        {/* ── Caminhos (teaser) ── */}
        <VisaTeaserCard visas={visas} />

        {/* ── Oferta ── */}
        <PaywallCard
          firstName={leadInfo?.fullName?.split(' ')[0]}
          paid={paid}
          onceKey={onceKey}
        />

        {/* ── Refazer ── */}
        <div className="flex justify-center">
          <Button
            id="results-restart-btn"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/quiz')}
            className="text-muted-foreground hover:text-foreground"
          >
            <RotateCcw aria-hidden="true" />
            Refazer o quiz
          </Button>
        </div>
      </Container>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function CancelledNotice({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="status"
      data-testid="checkout-cancelled-notice"
      className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4"
    >
      <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-foreground">Pagamento não concluído. Nada foi cobrado.</p>
        <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
          Sua análise continua disponível para desbloquear quando você quiser.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="Fechar aviso"
        className="-mr-2 -mt-2 shrink-0 text-muted-foreground"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

const CATEGORY_TONE: Record<ScoreCategory, { icon: LucideIcon; text: string; tint: string; bar: string }> = {
  alta: {
    icon: Sparkles,
    text: 'text-[hsl(var(--success))]',
    tint: 'bg-[hsl(var(--success)/0.08)]',
    bar: 'bg-[hsl(var(--success))]',
  },
  media: {
    icon: TrendingUp,
    text: 'text-[hsl(var(--warning))]',
    tint: 'bg-[hsl(var(--warning)/0.08)]',
    bar: 'bg-[hsl(var(--warning))]',
  },
  baixa: {
    icon: Compass,
    text: 'text-primary',
    tint: 'bg-primary/[.08]',
    bar: 'bg-primary',
  },
}

function toneFor(category: string) {
  return CATEGORY_TONE[category as ScoreCategory] ?? CATEGORY_TONE.baixa
}

function ScoreCard({ score, leadInfo }: { score: QuizResult['score']; leadInfo: QuizResult['leadInfo'] }) {
  const firstName = leadInfo?.fullName?.split(' ')[0]
  const tone = toneFor(score.category)
  const presentation = categoryPresentation(score.category)
  const Icon = tone.icon
  const percentage = Math.max(0, Math.min(100, Math.round(score.percentage)))

  return (
    <Card data-testid="results-score" className={cn('text-center', tone.tint)}>
      <div
        aria-hidden="true"
        className={cn('mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-card', tone.text)}
      >
        <Icon className="h-6 w-6" />
      </div>
      {firstName && <p className="mb-1 text-sm font-medium text-muted-foreground">{firstName}, seu resultado é:</p>}
      <h1 className={cn('mb-2 text-2xl font-bold leading-tight [text-wrap:balance] sm:text-3xl', tone.text)}>
        {presentation.label}
      </h1>
      <p className="mx-auto mb-5 max-w-md text-base text-muted-foreground [text-wrap:pretty]">
        {presentation.sublabel}
      </p>

      {/* Medidor */}
      <div className="mx-auto max-w-xs">
        <div className="mb-2 flex items-baseline justify-between text-sm text-muted-foreground">
          <span>Pontuação</span>
          <span className={cn('text-lg font-bold', tone.text)}>{percentage}%</span>
        </div>
        <div
          role="meter"
          aria-label="Pontuação de elegibilidade"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          className="h-3 w-full overflow-hidden rounded-full bg-card shadow-inner"
        >
          <div
            className={cn('h-full rounded-full transition-[width] [transition-duration:400ms]', tone.bar)}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div aria-hidden="true" className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          <span>Baixa</span>
          <span>Média</span>
          <span>Alta</span>
        </div>
      </div>
    </Card>
  )
}

const MATCH_LABEL: Record<VisaSuggestion['match'], string> = {
  strong: 'Alta compatibilidade',
  possible: 'Compatibilidade possível',
  weak: 'A explorar',
}

const MATCH_BADGE: Record<VisaSuggestion['match'], 'success' | 'warning' | 'neutral'> = {
  strong: 'success',
  possible: 'warning',
  weak: 'neutral',
}

function VisaTeaserCard({ visas }: { visas: VisaSuggestion[] }) {
  const topVisas = visas.slice(0, 3)
  if (topVisas.length === 0) return null

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" />
        <h2 className="text-lg font-semibold text-foreground [text-wrap:balance]">
          Caminhos identificados para o seu perfil
        </h2>
      </div>

      <ul className="space-y-3">
        {topVisas.map((visa, i) => (
          <li
            key={visa.code}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-4',
              i === 0 ? 'border-primary/20 bg-primary/[.05]' : 'border-border bg-muted',
            )}
          >
            <CircleDot aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-foreground">{visa.name}</span>
                <Badge size="sm" variant={MATCH_BADGE[visa.match] ?? 'neutral'}>
                  {MATCH_LABEL[visa.match] ?? MATCH_LABEL.weak}
                </Badge>
              </div>
              {/* Teaser com desfoque: o detalhe é da análise paga. */}
              <p aria-hidden="true" className="line-clamp-1 select-none text-sm text-muted-foreground blur-[3px]">
                {visa.reason}
              </p>
              <span className="sr-only">Detalhes disponíveis na análise completa.</span>
            </div>
            {i > 0 && <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          </li>
        ))}
      </ul>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted p-3 text-sm text-muted-foreground">
        <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        Na análise completa você vê os detalhes de cada caminho, os requisitos e os documentos.
      </p>
    </Card>
  )
}

/** Motivo de azulejo (tile 48px, 1 cor, ~7% de opacidade) só no card da oferta. */
const AZULEJO_TILE = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#1f41c7" stroke-width="1.5"><path d="M24 4 44 24 24 44 4 24Z"/><circle cx="24" cy="24" r="6"/><path d="M0 0h48v48H0z"/></svg>',
)}")`

function PaywallCard({
  firstName,
  paid,
  onceKey,
}: {
  firstName?: string
  paid: boolean
  onceKey: string
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const { phase, isPending, error, email, start } = useStartCheckout()

  // paywall_viewed: quando metade da oferta aparece na tela (uma vez por diagnóstico).
  useEffect(() => {
    const el = cardRef.current
    if (!el || paid) return
    if (typeof IntersectionObserver === 'undefined') {
      trackOnce('paywall_viewed', onceKey, { position: 'results' })
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        trackOnce('paywall_viewed', onceKey, { position: 'results' })
        observer.disconnect()
      },
      { threshold: 0.5 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onceKey, paid])

  const handleUnlock = () => {
    void start({ position: 'results_paywall' })
  }

  if (paid) {
    return (
      <Card variant="elevated" data-testid="results-paid">
        <h2 className="mb-2 text-xl font-bold text-foreground [text-wrap:balance]">
          Você já tem acesso à análise completa
        </h2>
        <p className="mb-5 text-base text-muted-foreground [text-wrap:pretty]">
          Abra seu painel para ver os detalhes de cada caminho, os requisitos e os próximos passos.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link to="/dashboard/analysis">
            Abrir minha análise
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </Card>
    )
  }

  return (
    <Card
      ref={cardRef}
      variant="elevated"
      padding="none"
      role="region"
      aria-labelledby="results-offer-title"
      className="relative overflow-hidden border-primary/25"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[.07]"
        style={{ backgroundImage: AZULEJO_TILE, backgroundSize: '48px 48px' }}
      />
      <div className="relative p-5 sm:p-6">
        <Badge variant="primary" size="sm" className="mb-3">
          Análise completa
        </Badge>

        <h2
          id="results-offer-title"
          className="mb-2 text-2xl font-bold leading-tight text-foreground [text-wrap:balance]"
        >
          {firstName ? `${firstName}, desbloqueie` : 'Desbloqueie'} a análise completa do seu caminho
        </h2>
        <p className="mb-5 text-base text-muted-foreground [text-wrap:pretty]">
          Gerada a partir das suas respostas e da Lei da Nacionalidade. {OFFER.delivery}.
        </p>

        <ul className="mb-5 space-y-2.5">
          {OFFER.includes.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-base text-foreground">
              <Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" />
              {item}
            </li>
          ))}
        </ul>

        <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-4xl font-bold text-foreground">{OFFER.priceLabel}</span>
          <span className="text-sm text-muted-foreground">
            pagamento único · acesso por {OFFER.accessDays} dias
          </span>
        </div>

        <Button
          id="results-unlock-btn"
          data-testid="results-cta-paywall"
          variant="pay"
          size="lg"
          className="w-full"
          loading={isPending}
          onClick={handleUnlock}
        >
          {isPending ? (
            'Abrindo o pagamento…'
          ) : (
            <>
              Desbloquear por {OFFER.priceLabel}
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>

        <CheckoutFeedback phase={phase} error={error} onRetry={handleUnlock} email={email} />

        {email && phase !== 'email_sent' && (
          <p className="mt-3 break-words text-center text-sm text-muted-foreground">
            O acesso será liberado para <span className="font-medium text-foreground">{email}</span>
          </p>
        )}

        <p className="mt-4 text-center text-sm text-muted-foreground [text-wrap:balance]">
          <Lock aria-hidden="true" className="-mt-0.5 mr-1.5 inline h-4 w-4 align-middle" />
          Pagamento seguro pela Stripe{'\u00a0'}· sem renovação automática
        </p>
      </div>
    </Card>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resultado a mostrar: o do roteador (vindo direto do quiz) ou o salvo neste
 * aparelho. `key` identifica o envio do quiz (session_id), estável mesmo quando
 * o assessmentId só aparece depois, ao salvar de novo.
 */
function loadResult(state: unknown): { result: QuizResult; key: string | null } | null {
  const stored = readStoredCheckoutData()
  const routerState = (state ?? null) as { result?: QuizResult; assessmentId?: string | null } | null
  if (routerState?.result) {
    return { result: routerState.result, key: stored?.sessionId ?? routerState.assessmentId ?? stored?.assessmentId ?? null }
  }
  try {
    const raw = localStorage.getItem(QUIZ_RESULT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.score) return null
    const presentation = categoryPresentation(parsed.score.category)
    return {
      key: parsed.sessionId ?? parsed.assessmentId ?? parsed.completedAt ?? null,
      result: {
        score: {
          total: parsed.score.total,
          max: parsed.score.max,
          percentage: parsed.score.percentage,
          category: parsed.score.category,
          label: presentation.label,
          sublabel: presentation.sublabel,
          color: '',
          bgColor: '',
          emoji: '',
        },
        visas: Array.isArray(parsed.visas) ? parsed.visas : [],
        leadInfo: parsed.leadInfo || null,
      },
    }
  } catch {
    // JSON inválido ou sem storage: mostra o estado vazio
    return null
  }
}

function categoryPresentation(category: string): { label: string; sublabel: string } {
  if (category === 'alta')
    return {
      label: 'Perfil de alta elegibilidade',
      sublabel: 'Suas respostas indicam boas chances de elegibilidade para a nacionalidade portuguesa.',
    }
  if (category === 'media')
    return {
      label: 'Perfil de média elegibilidade',
      sublabel: 'Seu perfil tem chances, mas pode haver condições a cumprir antes do pedido.',
    }
  return {
    label: 'Perfil em desenvolvimento',
    sublabel: 'Existem opções a explorar. A análise completa mostra os caminhos disponíveis para você.',
  }
}
