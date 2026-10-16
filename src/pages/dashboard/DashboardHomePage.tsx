/**
 * Início do dashboard — uma tela por estado de acesso (DI-046, DI-047, DI-048, DI-013).
 *
 * - 'none' (não pagou): resultado com o teaser borrado e a oferta de €30
 *   visível sem rolar (+ StickyCTA). Nunca o €4,90.
 * - 'active': chip "Acesso até dd/mm (N dias)"; ação principal = ler a análise.
 *   O €4,90 aparece discreto, no fim, só depois que a análise foi aberta.
 * - 'expiring' (≤7 dias): aviso âmbar com "Manter acesso por €4,90/mês".
 * - 'expired': "Seu acesso terminou em dd/mm", caminhos pelo nome, €4,90 como
 *   ação principal e €30 como secundária. Documentos continuam acessíveis.
 * - 'recurring': chip "Assinatura ativa", sem ofertas.
 *
 * Parâmetros lidos (e removidos da URL): ?upsell=chat (ProtectedRoute, DI-025),
 * ?acesso=expirado e ?subscribed=1 (volta do Stripe → confirmação com polling).
 */
import { forwardRef, useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Circle,
  ClipboardList,
  Clock,
  Compass,
  FileText,
  FolderUp,
  Gauge,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  X,
} from 'lucide-react'
import { AccessBanner } from '@/components/dashboard/AccessBanner'
import { SubscriptionUpsellCard } from '@/components/dashboard/SubscriptionUpsellCard'
import { UpsellSheet } from '@/components/dashboard/UpsellSheet'
import {
  ONE_TIME_CTA_LABEL,
  formatDayMonth,
  parseUpsellParam,
  upsellOfferFor,
  type UpsellReason,
} from '@/components/dashboard/dashboard-access'
import { hasOpenedAnalysis, hasSeenWelcome, markWelcomeSeen } from '@/components/dashboard/dashboard-storage'
import { Badge, Button, Card, StickyCTA } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult, type AssessmentResult } from '@/hooks/useAssessmentResult'
import { useSubscriptionConfirmation } from '@/hooks/useSubscribeCheckout'
import { canOfferRecurring, hasActiveAccess, type AccessFeature } from '@/lib/access'
import { track } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const HANDLED_PARAMS = ['upsell', 'acesso', 'subscribed'] as const

/** Nomes dos caminhos identificados (sem repetição). */
function pathwayNames(result: AssessmentResult | null): string[] {
  if (!result) return []
  const local = (result.localVisas ?? []).map((visa) => visa.name?.trim()).filter(Boolean) as string[]
  const fromDb = (result.suggestedVisaTypes ?? [])
    .filter((visa) => visa.eligible !== false)
    .map((visa) => visa.visa_type_name?.trim())
    .filter(Boolean) as string[]
  return Array.from(new Set(local.length > 0 ? local : fromDb))
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function DashboardHomePage() {
  const { authUser, access, hasAccess } = useAuth()
  const { result, isLoading: isLoadingResult } = useAssessmentResult()
  const [searchParams, setSearchParams] = useSearchParams()
  const confirmation = useSubscriptionConfirmation()
  const { start: startConfirmation } = confirmation

  const userId = authUser?.user.id ?? null
  const hasQuizResult = !!result
  const assessmentId = result?.assessmentId || null
  const pathways = useMemo(() => pathwayNames(result), [result])

  const paidAccess = hasActiveAccess(access)
  const canAnalysis = hasAccess('full_analysis')
  const canChat = hasAccess('chat')
  const canDocuments = hasAccess('documents_read')
  const offer = upsellOfferFor(access)
  // Voltando do Stripe: nenhuma oferta enquanto a assinatura é confirmada.
  const offersEnabled = confirmation.status === 'idle'

  const firstName =
    authUser?.profile?.full_name?.trim().split(/\s+/)[0] || result?.leadName?.trim().split(/\s+/)[0] || null

  // ── Sheet de oferta ────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetReason, setSheetReason] = useState<UpsellReason>('plan')
  const [pendingReason, setPendingReason] = useState<UpsellReason | null>(null)

  const featureFor: Record<UpsellReason, AccessFeature | null> = {
    chat: 'chat',
    analysis: 'full_analysis',
    documents: 'documents_read',
    plan: null,
  }
  const canOpenSheet = (reason: UpsellReason): boolean => {
    if (!offer) return false
    if (offer === 'recurring' && !offersEnabled) return false
    const feature = featureFor[reason]
    return feature ? !hasAccess(feature) : true
  }
  const openSheet = (reason: UpsellReason) => {
    if (!canOpenSheet(reason)) return
    setSheetReason(reason)
    setSheetOpen(true)
  }

  // ── Parâmetros da URL (lidos uma vez e removidos) ──────────────────────────
  const upsellParam = searchParams.get('upsell')
  const hasHandledParam = HANDLED_PARAMS.some((key) => searchParams.has(key))

  useEffect(() => {
    if (!hasHandledParam) return
    const reason = parseUpsellParam(searchParams.get('upsell'))
    if (reason) setPendingReason(reason)
    if (searchParams.get('subscribed') === '1') startConfirmation()
    const next = new URLSearchParams(searchParams)
    for (const key of HANDLED_PARAMS) next.delete(key)
    setSearchParams(next, { replace: true })
  }, [hasHandledParam, searchParams, setSearchParams, startConfirmation])

  // O sheet só abre com a URL já limpa: assim o "voltar" fecha o sheet e não
  // reabre a oferta (o BottomSheet empilha uma entrada no histórico).
  useEffect(() => {
    if (!pendingReason || upsellParam !== null) return
    setPendingReason(null)
    openSheet(pendingReason)
    // openSheet lê o estado atual; o gatilho é só a chegada do parâmetro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReason, upsellParam])

  // ── Boas-vindas (uma única vez, no primeiro acesso pago) ───────────────────
  const [welcomeSeen] = useState(() => (userId ? hasSeenWelcome(userId) : true))
  const [welcomeDismissed, setWelcomeDismissed] = useState(false)
  const showWelcome =
    !welcomeSeen && !welcomeDismissed && !access.isStaff && (access.state === 'active' || access.state === 'expiring')
  useEffect(() => {
    if (showWelcome && userId) markWelcomeSeen(userId)
  }, [showWelcome, userId])

  // ── Upsell discreto: só depois de abrir a análise ──────────────────────────
  const [analysisOpened] = useState(() => (userId ? hasOpenedAnalysis(userId) : false))
  const showUpsellCard =
    offersEnabled && access.state === 'active' && canOfferRecurring(access) && analysisOpened

  // ── Documentos enviados (linha do tempo) ───────────────────────────────────
  // Chave sob ['user-documents', userId]: o upload/remoção na DocumentsPage invalida esta contagem.
  const documentsQuery = useQuery({
    queryKey: ['user-documents', userId, 'count'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_documents').select('id').eq('user_id', userId!)
      if (error) throw error
      return data?.length ?? 0
    },
    enabled: !!userId && canDocuments,
    staleTime: 30_000,
  })

  useEffect(() => {
    track('dashboard_viewed', { plan_status: access.state, days_left: access.daysLeft })
  }, [access.state, access.daysLeft])

  // ── CTA de €30 (não pagante) ───────────────────────────────────────────────
  const resultBannerRef = useRef<HTMLDivElement>(null)
  const inlineCtaRef = useRef<HTMLDivElement>(null)
  const showOneTimeOffer = access.state === 'none' && !access.isStaff && hasQuizResult

  const subtitle = (() => {
    if (access.state === 'none' && !access.isStaff) {
      return hasQuizResult
        ? 'Seu diagnóstico gratuito está pronto.'
        : 'Comece pelo diagnóstico gratuito para ver os caminhos possíveis para você.'
    }
    if (access.state === 'expired') return null
    return canChat
      ? 'Sua análise, seus documentos e o chat IA ficam aqui.'
      : 'Sua análise e seus documentos ficam aqui.'
  })()

  const features: FeatureCardProps[] = [
    {
      icon: FileText,
      label: 'Minha análise',
      description: 'Os caminhos possíveis para o seu perfil, com requisitos e próximos passos.',
      href: '/dashboard/analysis',
      unlocked: canAnalysis,
      reason: 'analysis',
      testid: 'dashboard-card-analysis',
    },
    {
      icon: MessageSquare,
      label: 'Chat IA',
      description: 'Tire dúvidas sobre a sua análise com o assistente de IA.',
      href: '/dashboard/chat',
      unlocked: canChat,
      reason: 'chat',
      testid: 'dashboard-card-chat',
    },
    {
      icon: FolderUp,
      label: 'Documentos',
      description:
        access.state === 'expired'
          ? 'Baixe ou apague os arquivos que você enviou.'
          : 'Organize e envie os documentos do seu processo.',
      href: '/dashboard/documents',
      unlocked: canDocuments,
      reason: 'documents',
      testid: 'dashboard-card-documents',
    },
  ]

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-8">
      {/* ── Cabeçalho ── */}
      <header className="space-y-3">
        <div>
          <h1 className="text-[1.75rem] font-bold leading-tight text-foreground [text-wrap:balance] sm:text-3xl">
            {firstName ? `Olá, ${firstName}` : 'Seu painel'}
          </h1>
          {subtitle && <p className="mt-1 text-base text-muted-foreground [text-wrap:pretty]">{subtitle}</p>}
        </div>
        {(access.isStaff || access.state === 'active' || access.state === 'recurring') && (
          <AccessBanner access={access} />
        )}
      </header>

      <SubscriptionStatus status={confirmation.status} onRetry={confirmation.retry} />

      {(access.state === 'expiring' || access.state === 'expired') && !access.isStaff && (
        <AccessBanner
          access={access}
          pathways={pathways}
          assessmentId={assessmentId}
          showOffer={offersEnabled}
        />
      )}

      {showWelcome && (
        <WelcomeCard
          expiresAt={access.expiresAt}
          hasChat={canChat}
          onDismiss={() => setWelcomeDismissed(true)}
        />
      )}

      {/* ── Resultado do diagnóstico ── */}
      {isLoadingResult && !hasQuizResult ? (
        <div aria-hidden="true" className="h-36 animate-pulse rounded-lg bg-muted" />
      ) : hasQuizResult && access.state !== 'expired' ? (
        <QuizResultBanner
          ref={resultBannerRef}
          result={result!}
          pathways={pathways}
          unlocked={paidAccess && canAnalysis}
          primaryAnalysisCta={access.state !== 'expiring'}
          offerCta={
            showOneTimeOffer ? (
              <div ref={inlineCtaRef} className="space-y-2">
                <Button asChild variant="pay" size="lg" className="w-full sm:w-auto">
                  <Link
                    to="/checkout"
                    state={{ plan: 'one_time', assessmentId }}
                    data-primary-cta=""
                    data-testid="dashboard-unlock-btn"
                    onClick={() => track('paywall_cta_clicked', { placement: 'dashboard_result' })}
                  >
                    {ONE_TIME_CTA_LABEL}
                  </Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                  Pagamento único · acesso por {OFFER.accessDays} dias · {OFFER.delivery.toLocaleLowerCase('pt-BR')}
                </p>
              </div>
            ) : null
          }
        />
      ) : access.state === 'none' && !access.isStaff ? (
        <NoQuizBanner />
      ) : null}

      {/* ── Funcionalidades ── */}
      <section aria-labelledby="dashboard-features-title">
        <h2 id="dashboard-features-title" className="mb-3 text-lg font-semibold text-foreground">
          Seu espaço
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {features.map((feature) => (
            <li key={feature.href}>
              <FeatureCard {...feature} offer={offer} onLockedClick={openSheet} />
            </li>
          ))}
        </ul>
      </section>

      {/* ── Linha do tempo ── */}
      <ProgressTimeline
        hasQuizResult={hasQuizResult}
        completedAt={parseDate(result?.completedAt)}
        hasPaid={access.hasPaidOnce || paidAccess}
        paidAt={parseDate(authUser?.subscription?.one_time_paid_at)}
        // DI-016: o hook não lê mais ia_explanation_full (sempre null); quem diz se a
        // análise existe é analysisReady. O fallback só cobre objetos montados à mão.
        analysisReady={result?.analysisReady ?? !!result?.iaExplanationFull}
        canAnalysis={canAnalysis}
        accessEndedAt={access.state === 'expired' ? access.expiresAt : null}
        canDocuments={canDocuments}
        documentsCount={documentsQuery.data ?? null}
      />

      {showUpsellCard && (
        <SubscriptionUpsellCard placement="home_card" emphasis="quiet" assessmentId={assessmentId} />
      )}

      <UpsellSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        reason={sheetReason}
        access={access}
        assessmentId={assessmentId}
        hasQuizResult={hasQuizResult}
      />

      {showOneTimeOffer && (
        <StickyCTA
          anchorRef={resultBannerRef}
          inlineCtaRef={inlineCtaRef}
          label="Desbloquear a análise completa"
          className="!bottom-[calc(var(--cookie-banner-h,0px)+var(--bottom-nav-h,0px))] pb-3"
        >
          <Button asChild variant="pay" size="lg" className="w-full">
            <Link
              to="/checkout"
              state={{ plan: 'one_time', assessmentId }}
              onClick={() => track('paywall_cta_clicked', { placement: 'dashboard_sticky' })}
            >
              {ONE_TIME_CTA_LABEL}
            </Link>
          </Button>
        </StickyCTA>
      )}
    </div>
  )
}

// ── Confirmação da assinatura (volta do Stripe) ──────────────────────────────

function SubscriptionStatus({
  status,
  onRetry,
}: {
  status: ReturnType<typeof useSubscriptionConfirmation>['status']
  onRetry: () => Promise<void>
}) {
  const [retrying, setRetrying] = useState(false)
  if (status !== 'confirming' && status !== 'pending') return null

  return (
    <Card role="status" aria-live="polite" data-testid="subscription-status" className="flex items-start gap-3">
      {status === 'confirming' ? (
        <Loader2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
      ) : (
        <Clock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-foreground">
          {status === 'confirming' ? 'Confirmando sua assinatura…' : 'Ainda estamos confirmando sua assinatura'}
        </p>
        <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
          {status === 'confirming'
            ? 'Isso costuma levar alguns segundos.'
            : 'Se o pagamento foi concluído, a assinatura aparece aqui em alguns minutos.'}
        </p>
        {status === 'pending' && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            loading={retrying}
            onClick={async () => {
              setRetrying(true)
              try {
                await onRetry()
              } finally {
                setRetrying(false)
              }
            }}
          >
            <RefreshCw aria-hidden="true" />
            Verificar de novo
          </Button>
        )}
      </div>
    </Card>
  )
}

// ── Boas-vindas ──────────────────────────────────────────────────────────────

function WelcomeCard({
  expiresAt,
  hasChat,
  onDismiss,
}: {
  expiresAt: Date | null
  hasChat: boolean
  onDismiss: () => void
}) {
  const steps = [
    { icon: FileText, title: 'Leia sua análise', text: 'Os caminhos possíveis, os requisitos e os próximos passos.' },
    { icon: FolderUp, title: 'Organize seus documentos', text: 'Envie os arquivos e acompanhe o que já está com você.' },
    ...(hasChat
      ? [{ icon: MessageSquare, title: 'Tire dúvidas no chat IA', text: 'Pergunte sobre a sua análise durante o seu acesso.' }]
      : []),
  ]

  return (
    <Card variant="elevated" role="region" aria-labelledby="dashboard-welcome-title" data-testid="dashboard-welcome">
      <div className="flex items-start gap-3">
        <BadgeCheck aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[hsl(var(--success))]" />
        <div className="min-w-0 flex-1">
          <h2 id="dashboard-welcome-title" className="text-lg font-semibold leading-snug text-foreground">
            Boas-vindas ao seu painel
          </h2>
          <p className="mt-1 text-base text-muted-foreground [text-wrap:pretty]">
            {expiresAt
              ? `Seu acesso vai até ${formatDayMonth(expiresAt)}. Comece por aqui:`
              : 'Comece por aqui:'}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar boas-vindas" className="-mr-2 -mt-2" onClick={onDismiss}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <ol className="mt-4 space-y-3">
        {steps.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[.08] text-primary"
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// ── Resultado do diagnóstico ─────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { icon: ElementType; tone: string; bar: string }> = {
  alta: { icon: TrendingUp, tone: 'text-[hsl(var(--success))]', bar: 'bg-[hsl(var(--success))]' },
  media: { icon: Gauge, tone: 'text-[hsl(var(--warning))]', bar: 'bg-[hsl(var(--warning))]' },
  baixa: { icon: Compass, tone: 'text-primary', bar: 'bg-primary' },
}

interface QuizResultBannerProps {
  result: AssessmentResult
  pathways: string[]
  /** Pagou e pode ler a análise: mostra os caminhos pelo nome. */
  unlocked: boolean
  /** "Ver minha análise" como ação principal (secundária quando há aviso de prazo). */
  primaryAnalysisCta: boolean
  /** Oferta de €30 (só para quem não pagou). */
  offerCta: ReactNode
}

const QuizResultBanner = forwardRef<HTMLDivElement, QuizResultBannerProps>(function QuizResultBanner(
  { result, pathways, unlocked, primaryAnalysisCta, offerCta },
  ref,
) {
  const style = CATEGORY_STYLE[result.scoreCategory] ?? CATEGORY_STYLE.media
  const Icon = style.icon
  const percentage = Math.max(0, Math.min(100, Math.round(result.scorePercentage)))
  const count = pathways.length

  return (
    <Card ref={ref} variant="elevated" role="region" aria-labelledby="dashboard-result-title" data-testid="dashboard-result">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted"
        >
          <Icon className={cn('h-5 w-5', style.tone)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">Resultado do diagnóstico</p>
          <h2 id="dashboard-result-title" className={cn('text-lg font-semibold leading-snug', style.tone)}>
            {result.scoreLabel}
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <div aria-hidden="true" className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', style.bar)} style={{ width: `${percentage}%` }} />
            </div>
            <span className="text-sm font-medium text-foreground">
              {percentage}%<span className="sr-only"> de pontuação no diagnóstico</span>
            </span>
          </div>
        </div>
      </div>

      {count > 0 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            {count === 1 ? '1 caminho identificado' : `${count} caminhos identificados`}
          </p>
          {unlocked ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {pathways.slice(0, 4).map((name) => (
                <li key={name}>
                  <Badge variant="neutral" size="sm" className="whitespace-normal">
                    {name}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-2">
                {pathways.slice(0, 3).map((name, index) => (
                  <li
                    key={`${index}-${name.length}`}
                    className="select-none rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground blur-[3px]"
                  >
                    {'█'.repeat(Math.min(14, Math.max(8, name.length)))}
                  </li>
                ))}
              </ul>
              <p className="sr-only">Os nomes dos caminhos aparecem na análise completa.</p>
            </>
          )}
        </div>
      )}

      {offerCta && <div className="mt-5">{offerCta}</div>}

      {unlocked && (
        <div className="mt-5">
          <Button
            asChild
            variant={primaryAnalysisCta ? 'primary' : 'secondary'}
            className="w-full sm:w-auto"
          >
            <Link
              to="/dashboard/analysis"
              data-testid="dashboard-open-analysis"
              {...(primaryAnalysisCta ? { 'data-primary-cta': '' } : {})}
            >
              Ver minha análise
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </Card>
  )
})

function NoQuizBanner() {
  return (
    <Card variant="muted" className="text-center" data-testid="dashboard-no-quiz">
      <ClipboardList aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h2 className="text-lg font-semibold text-foreground">Você ainda não fez o diagnóstico</h2>
      <p className="mx-auto mt-1 max-w-sm text-base text-muted-foreground [text-wrap:pretty]">
        Responda o questionário gratuito para ver os caminhos possíveis para o seu perfil.
      </p>
      <Button asChild className="mt-4 w-full sm:w-auto">
        <Link to="/quiz" data-primary-cta="">
          Fazer o diagnóstico gratuito
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </Card>
  )
}

// ── Cards de funcionalidade ──────────────────────────────────────────────────

interface FeatureCardProps {
  icon: ElementType
  label: string
  description: string
  href: string
  unlocked: boolean
  reason: UpsellReason
  testid: string
}

function FeatureCard({
  icon: Icon,
  label,
  description,
  href,
  unlocked,
  reason,
  testid,
  offer,
  onLockedClick,
}: FeatureCardProps & {
  offer: ReturnType<typeof upsellOfferFor>
  onLockedClick: (reason: UpsellReason) => void
}) {
  const locked = !unlocked
  const className = cn(
    'group flex h-full min-h-[5.5rem] w-full items-start gap-3 rounded-lg border bg-card p-4 text-left shadow-[var(--shadow-sm)]',
    'transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  )
  const seal =
    locked && offer === 'one_time'
      ? `Incluso no ${OFFER.priceLabel}`
      : locked && offer === 'recurring'
        ? `Na assinatura ${OFFER.recurring.priceLabel}`
        : null

  const content = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          locked ? 'bg-muted text-muted-foreground' : 'bg-primary/[.08] text-primary',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold text-foreground">{label}</span>
          {locked && <Lock aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />}
          {locked && <span className="sr-only">(bloqueado)</span>}
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
        {seal ? (
          <Badge variant="neutral" size="sm" className="mt-2">
            {seal}
          </Badge>
        ) : (
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
            Abrir
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        )}
      </span>
    </>
  )

  if (locked && offer) {
    return (
      <button
        type="button"
        data-testid={testid}
        aria-haspopup="dialog"
        className={className}
        onClick={() => onLockedClick(reason)}
      >
        {content}
      </button>
    )
  }

  return (
    <Link to={href} data-testid={testid} className={className}>
      {content}
    </Link>
  )
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

type StepStatus = 'done' | 'current' | 'todo'

interface TimelineStep {
  id: string
  label: string
  detail: string
  status: StepStatus
}

function ProgressTimeline({
  hasQuizResult,
  completedAt,
  hasPaid,
  paidAt,
  analysisReady,
  canAnalysis,
  accessEndedAt,
  canDocuments,
  documentsCount,
}: {
  hasQuizResult: boolean
  completedAt: Date | null
  hasPaid: boolean
  paidAt: Date | null
  /** O texto da análise completa já existe (`ia_explanation_full`). */
  analysisReady: boolean
  /** Pode abrir a análise agora (falso depois que o prazo acaba). */
  canAnalysis: boolean
  /** Fim do acesso, quando já expirou. */
  accessEndedAt: Date | null
  canDocuments: boolean
  documentsCount: number | null
}) {
  const analysisDetail = (() => {
    if (!hasPaid) return OFFER.delivery
    if (!canAnalysis) {
      return accessEndedAt
        ? `Acesso encerrado em ${formatDayMonth(accessEndedAt)}`
        : 'Acesso encerrado'
    }
    return analysisReady ? 'Disponível em Minha análise' : 'Gerando…'
  })()

  const steps: TimelineStep[] = [
    {
      id: 'quiz',
      label: 'Diagnóstico gratuito',
      detail: hasQuizResult
        ? completedAt
          ? `Concluído em ${formatDayMonth(completedAt)}`
          : 'Concluído'
        : 'Responda o questionário gratuito',
      status: hasQuizResult ? 'done' : 'current',
    },
    {
      id: 'payment',
      label: 'Análise completa',
      detail: hasPaid
        ? paidAt
          ? `Desbloqueada em ${formatDayMonth(paidAt)}`
          : 'Desbloqueada'
        : `Pagamento único de ${OFFER.priceLabel}`,
      status: hasPaid ? 'done' : hasQuizResult ? 'current' : 'todo',
    },
    {
      id: 'analysis',
      label: 'Análise pronta para leitura',
      detail: analysisDetail,
      // Só "Gerando…" (etapa atual) enquanto há acesso; expirado mostra o fim do acesso.
      status: !hasPaid ? 'todo' : analysisReady ? 'done' : canAnalysis ? 'current' : 'todo',
    },
    {
      id: 'documents',
      label: 'Documentos',
      detail: !canDocuments
        ? 'Envie e organize os documentos do seu processo'
        : documentsCount === null
          ? 'Envie e organize os documentos do seu processo'
          : documentsCount === 0
            ? 'Nenhum documento enviado ainda'
            : documentsCount === 1
              ? '1 documento enviado'
              : `${documentsCount} documentos enviados`,
      status: canDocuments && documentsCount ? 'done' : canDocuments ? 'current' : 'todo',
    },
  ]

  return (
    <section aria-labelledby="dashboard-progress-title">
      <h2 id="dashboard-progress-title" className="mb-3 text-lg font-semibold text-foreground">
        Seu progresso
      </h2>
      <Card>
        <ol className="space-y-0">
          {steps.map((step, index) => (
            <li key={step.id} className="flex gap-3" data-testid={`timeline-${step.id}`} data-status={step.status}>
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
                    step.status === 'done' && 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]',
                    step.status === 'current' && 'bg-primary/[.08] text-primary',
                    step.status === 'todo' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {step.status === 'done' ? (
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  ) : step.status === 'current' ? (
                    <Circle aria-hidden="true" className="h-3 w-3 fill-current" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                  <span className="sr-only">
                    {step.status === 'done' ? 'Concluído:' : step.status === 'current' ? 'Etapa atual:' : 'Próxima etapa:'}
                  </span>
                </span>
                {index < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'my-1 w-0.5 flex-1',
                      step.status === 'done' ? 'bg-[hsl(var(--success)/0.3)]' : 'bg-border',
                    )}
                    style={{ minHeight: '1.25rem' }}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-5">
                <p className={cn('font-medium', step.status === 'todo' ? 'text-muted-foreground' : 'text-foreground')}>
                  {step.label}
                </p>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  )
}
