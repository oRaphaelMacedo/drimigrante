import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Baby,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  FileText,
  Globe2,
  Heart,
  Home,
  Info,
  ListChecks,
  Lock,
  Mail,
  MessageSquare,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult, type ResultPathway } from '@/hooks/useAssessmentResult'
import { fetchFullAnalysis, getFullAnalysisErrorKind } from '@/hooks/useAssessment'
import { useFullAnalysisGeneration } from '@/hooks/useFullAnalysisGeneration'
import { Badge, Button, Card } from '@/components/ui'
import { MarkdownText } from '@/components/MarkdownText'
import { ShareWithFamily } from '@/components/ShareButton'
import {
  getNationalityPath,
  getPathDocuments,
  getPathSteps,
  getPathTimeline,
  type NationalityPathCode,
} from '@/data/nationality-paths'
import { splitMarkdownSections, type MarkdownSection } from '@/lib/markdown-sections'
import { OFFER } from '@/lib/offer'
import { SUPPORT_EMAIL, mailtoHref } from '@/config/contact'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

// ── Constantes de apresentação ───────────────────────────────────────────────

const PATH_ICONS: Record<NationalityPathCode, LucideIcon> = {
  nacionalidade_descendencia_1: Users,
  nacionalidade_descendencia_2: Users,
  pesquisa_genealogica: Search,
  nacionalidade_casamento: Heart,
  nacionalidade_nascimento: Baby,
  naturalizacao_residencia: Home,
  reaquisicao_nacionalidade: RotateCcw,
  nacionalidade_ex_colonias: Globe2,
  analise_personalizada: Compass,
}

const MATCH_ORDER: Record<ResultPathway['match'], number> = { strong: 0, possible: 1, weak: 2 }

const MATCH_BADGE: Record<ResultPathway['match'], { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  strong: { label: 'Alta compatibilidade', variant: 'success' },
  possible: { label: 'Compatibilidade média', variant: 'warning' },
  weak: { label: 'Compatibilidade baixa', variant: 'neutral' },
}

const SCORE_COLOR: Record<string, string> = {
  alta: 'text-[hsl(var(--success))]',
  media: 'text-[hsl(var(--warning))]',
  baixa: 'text-primary',
}

/** Seção da análise com requisitos e documentos (ver ANALYSIS_SECTIONS em _shared/prompts.ts). */
const REQUIREMENTS_TITLE = /^requisitos/i

const PATHS_ANCHOR = 'caminhos'
const ANALYSIS_ANCHOR = 'analise-detalhada'

/**
 * Impressão / "Salvar em PDF" (DI-050): só o conteúdo da análise, sem
 * navegação, barras fixas, banners nem botões; todas as seções do acordeão
 * abertas. Os ancestrais do conteúdo perdem altura fixa, overflow e recuos do
 * layout (sidebar, barra inferior) para o texto não ser cortado na 1.ª página.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 14mm 12mm; }
  html, body { background: #fff !important; }
  aside, nav, header, footer, .fixed, .sticky, [data-sonner-toaster], [data-print-hide] { display: none !important; }
  :has([data-print-root]) {
    display: block !important;
    position: static !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
  }
  [data-accordion-panel] { display: block !important; }
  [data-print-root] { max-width: none !important; padding: 0 !important; }
  [data-print-root] section, [data-print-root] li { break-inside: avoid; }
  [data-print-root] h2, [data-print-root] h3 { break-after: avoid; }
}
@media print {
  body *:not([data-print-root]):not([data-print-root] *):not(:has([data-print-root])) { display: none !important; }
}
`

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(date)
}

function sortPathways(pathways: ResultPathway[]): ResultPathway[] {
  return pathways
    .map((p, index) => ({ p, index }))
    .sort((a, b) => MATCH_ORDER[a.p.match] - MATCH_ORDER[b.p.match] || a.index - b.index)
    .map(({ p }) => p)
}

function pathTitle(pathway: ResultPathway): string {
  return getNationalityPath(pathway.code)?.title ?? pathway.name
}

function canPrint(): boolean {
  if (typeof window === 'undefined' || typeof window.print !== 'function') return false
  // Navegadores embutidos (Instagram, Facebook, TikTok) costumam ignorar window.print().
  return !isInAppBrowser(typeof navigator !== 'undefined' ? navigator.userAgent : null)
}

function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

// ── Página ───────────────────────────────────────────────────────────────────

export function AnalysisPage() {
  const { hasAccess, access, refreshUser } = useAuth()
  const { result, isLoading, error: resultError, refetch: refetchResult, isFetching: refetchingResult } = useAssessmentResult()
  const hasFullAccess = hasAccess('full_analysis')
  const canChat = hasAccess('chat')
  const assessmentId = result?.assessmentId || null

  const fullQuery = useQuery({
    queryKey: ['full-analysis', assessmentId],
    queryFn: () => fetchFullAnalysis(assessmentId as string),
    enabled: hasFullAccess && !!assessmentId,
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => getFullAnalysisErrorKind(error) === 'other' && count < 1,
  })

  const pathways = useMemo(() => sortPathways(result?.pathways ?? []), [result?.pathways])
  const topPathway = pathways[0] ?? null

  const fullText = fullQuery.data?.ia_explanation_full?.trim() || null
  const fullErrorKind = fullQuery.isError ? getFullAnalysisErrorKind(fullQuery.error) : null

  // DI-018: quem pagou e ainda não tem a análise completa pede a geração (JWT) e
  // a página relê pela RPC até o texto chegar. Sem chamada se a RPC negou o acesso.
  const { refetch: refetchFull } = fullQuery
  const generation = useFullAnalysisGeneration({
    assessmentId,
    enabled: hasFullAccess && fullQuery.isSuccess && !fullErrorKind,
    ready: !!fullText,
    refetch: refetchFull,
  })
  const accessDenied = fullErrorKind === 'payment_required' || generation.status === 'payment_required'
  const sessionExpired = fullErrorKind === 'auth_required' || generation.status === 'auth_required'

  const analysis = useMemo(() => splitMarkdownSections(fullText), [fullText])
  // null = ainda não mexeu: só a primeira seção aberta.
  const [openIds, setOpenIds] = useState<ReadonlySet<string> | null>(null)
  const firstSectionId = analysis.sections[0]?.id
  const effectiveOpen = useMemo(
    () => openIds ?? new Set(firstSectionId ? [firstSectionId] : []),
    [openIds, firstSectionId],
  )
  const setSectionOpen = (id: string, open: boolean) => {
    const next = new Set(effectiveOpen)
    if (open) next.add(id)
    else next.delete(id)
    setOpenIds(next)
  }

  const requirementsSection = analysis.sections.find((section) => REQUIREMENTS_TITLE.test(section.title)) ?? null

  // Evento uma vez por visita, quando há conteúdo pago para mostrar.
  const viewedRef = useRef(false)
  useEffect(() => {
    if (viewedRef.current || !hasFullAccess || !result) return
    viewedRef.current = true
    track('analysis_viewed', { pathway: topPathway?.code })
  }, [hasFullAccess, result, topPathway?.code])

  // O servidor é a autoridade (DI-016): se ele diz que não há acesso ativo,
  // recarrega a assinatura uma vez para a tela mostrar o estado certo
  // (acesso expirado ou oferta de €30) em vez de confiar no cache do cliente.
  const refreshedRef = useRef(false)
  useEffect(() => {
    if (!accessDenied || refreshedRef.current) return
    refreshedRef.current = true
    void refreshUser()
  }, [accessDenied, refreshUser])

  if (!hasFullAccess) {
    return <NoAccess expired={access.state === 'expired'} assessmentId={assessmentId} />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3" role="status">
        <RefreshCw className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <p className="text-base text-muted-foreground">Carregando sua análise…</p>
      </div>
    )
  }

  if (!result && resultError) {
    return (
      <StateMessage
        icon={AlertTriangle}
        title="Não foi possível carregar seu diagnóstico"
        description="Verifique sua conexão e tente de novo."
        action={
          <Button loading={refetchingResult} onClick={() => void refetchResult()}>
            Tentar de novo
          </Button>
        }
        secondary={<SupportLink subject="Não consigo ver minha análise completa" className="self-center" />}
      />
    )
  }

  if (!result) {
    return (
      <StateMessage
        icon={AlertTriangle}
        title="Ainda não encontramos seu diagnóstico"
        description="Faça o diagnóstico gratuito para ver os caminhos para a nacionalidade portuguesa que combinam com o seu perfil."
        action={
          <Button asChild>
            <Link to="/quiz">Fazer o diagnóstico</Link>
          </Button>
        }
      />
    )
  }

  const diagnosedAt = formatDate(result.completedAt)

  return (
    <article data-print-root className="mx-auto w-full max-w-3xl space-y-6 text-foreground sm:space-y-8">
      <style>{PRINT_CSS}</style>

      {/* Cabeçalho */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3" data-print-hide>
          <Link
            to="/dashboard"
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao painel
          </Link>
          {canPrint() && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                track('analysis_pdf_clicked')
                window.print()
              }}
            >
              <Printer aria-hidden="true" />
              Salvar em PDF
            </Button>
          )}
        </div>
        <p className="hidden text-sm text-muted-foreground print:block">Doutor Imigrante</p>
        <div className="space-y-1.5">
          <h1 className="text-h1 text-foreground">Sua análise completa</h1>
          <p className="text-base text-muted-foreground [text-wrap:pretty]">
            {diagnosedAt ? `Diagnóstico de ${diagnosedAt}.` : 'Feita a partir das suas respostas no diagnóstico.'}
          </p>
        </div>
      </div>

      {/* Resumo: índice de elegibilidade + 3 pontos */}
      <SummaryCard
        score={{ percentage: result.scorePercentage, category: result.scoreCategory, label: result.scoreLabel }}
        pathway={topPathway}
        others={pathways.slice(1)}
        canChat={canChat}
      />

      {/* Atalhos */}
      <SectionChips
        sections={fullText ? analysis.sections : []}
        onOpenSection={(id) => {
          if (analysis.sections.some((s) => s.id === id)) setSectionOpen(id, true)
        }}
      />

      {/* Caminhos para a nacionalidade */}
      <section id={PATHS_ANCHOR} aria-labelledby={`${PATHS_ANCHOR}-title`} className="scroll-mt-20 space-y-4">
        <div className="space-y-1">
          <h2 id={`${PATHS_ANCHOR}-title`} className="text-h2 text-foreground">
            Caminhos para a nacionalidade
          </h2>
          {pathways.length > 1 && (
            <p className="text-base text-muted-foreground [text-wrap:pretty]">Em ordem de compatibilidade com as suas respostas.</p>
          )}
        </div>
        {pathways.length > 0 ? (
          <ul className="space-y-3">
            {pathways.map((pathway) => (
              <li key={pathway.code}>
                <PathwayCard pathway={pathway} />
              </li>
            ))}
          </ul>
        ) : (
          <Card variant="muted">
            <p className="text-base">
              Suas respostas não indicaram um caminho específico. A análise detalhada abaixo explica as possibilidades do
              seu caso.
            </p>
          </Card>
        )}
        {pathways.length > 0 && pathways.every((p) => getPathDocuments(getNationalityPath(p.code)).length === 0) && (
          <p className="flex gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {requirementsSection ? (
              <span>
                Requisitos e documentos de cada caminho: veja{' '}
                <a
                  href={`#${requirementsSection.id}`}
                  data-print-hide
                  onClick={(event) => {
                    event.preventDefault()
                    setSectionOpen(requirementsSection.id, true)
                    requestAnimationFrame(() => scrollToId(requirementsSection.id))
                  }}
                  className="py-[14px] font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                >
                  {requirementsSection.title}
                </a>
                <span className="hidden print:inline">“{requirementsSection.title}”</span> na análise detalhada.
              </span>
            ) : (
              <span>Requisitos e documentos de cada caminho: veja a análise detalhada abaixo.</span>
            )}
          </p>
        )}
      </section>

      {/* Análise detalhada (IA) */}
      <section id={ANALYSIS_ANCHOR} aria-labelledby={`${ANALYSIS_ANCHOR}-title`} className="scroll-mt-20 space-y-4">
        <h2 id={`${ANALYSIS_ANCHOR}-title`} className="text-h2 text-foreground">
          Análise detalhada
        </h2>
        {!assessmentId ? (
          <Card variant="muted">
            <p className="text-base [text-wrap:pretty]">
              A análise detalhada aparece aqui assim que o seu diagnóstico estiver salvo na sua conta.
              {SUPPORT_EMAIL ? ' Se ela não aparecer, fale com o suporte.' : ''}
            </p>
            <div className="mt-3" data-print-hide>
              <SupportLink subject="Minha análise completa não apareceu" />
            </div>
          </Card>
        ) : fullQuery.isPending ? (
          <AnalysisSkeleton />
        ) : accessDenied ? (
          <AccessEndedCard />
        ) : sessionExpired ? (
          <SessionExpiredCard />
        ) : fullErrorKind ? (
          <AnalysisError
            notFound={fullErrorKind === 'not_found'}
            onRetry={() => fullQuery.refetch()}
            retrying={fullQuery.isFetching}
          />
        ) : fullText ? (
          <AnalysisAccordion
            intro={analysis.intro}
            sections={analysis.sections}
            openIds={effectiveOpen}
            onToggle={(id) => setSectionOpen(id, !effectiveOpen.has(id))}
          />
        ) : generation.status === 'not_found' ? (
          <AnalysisError notFound onRetry={generation.retry} retrying={false} />
        ) : generation.status === 'deferred' || generation.status === 'failed' ? (
          <AnalysisGenerationProblem busy={generation.status === 'deferred'} onRetry={generation.retry} />
        ) : (
          <AnalysisPreparing />
        )}
      </section>

      {/* Próximos passos (some quando o servidor nega o acesso: a ação é a do card acima) */}
      {!accessDenied && <NextStepsCard canChat={canChat} />}

      {/* DI-053: convite para a família fazer o quiz grátis (link sem dados desta conta). */}
      <div data-print-hide className="print:hidden">
        <ShareWithFamily placement="analysis" />
      </div>

      <p className="border-t pt-4 text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
        Análise informativa, gerada por IA a partir das suas respostas. Não constitui aconselhamento jurídico. Antes de
        dar entrada no pedido, confirme os requisitos atuais nas fontes oficiais, como o IRN.
      </p>
    </article>
  )
}

// ── Blocos ───────────────────────────────────────────────────────────────────

function joinTitles(titles: string[]): string {
  if (titles.length <= 1) return titles[0] ?? ''
  return `${titles.slice(0, -1).join(', ')} e ${titles[titles.length - 1]}`
}

function SummaryCard({
  score,
  pathway,
  others,
  canChat,
}: {
  score: { percentage: number; category: string; label: string }
  pathway: ResultPathway | null
  others: ResultPathway[]
  canChat: boolean
}) {
  const path = pathway ? getNationalityPath(pathway.code) : null
  const firstStep = getPathSteps(path)[0]
  const badge = pathway ? MATCH_BADGE[pathway.match] : null
  const value = Math.max(0, Math.min(100, Math.round(score.percentage)))
  return (
    <Card variant="elevated">
      <h2 id="resumo-title" className="sr-only">
        Resumo
      </h2>
      <div className="flex items-center gap-4">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center" aria-hidden="true">
          <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9155" fill="none" stroke="hsl(var(--muted))" strokeWidth="3.2" />
            <circle
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeDasharray={`${value} 100`}
              className={SCORE_COLOR[score.category] ?? 'text-primary'}
            />
          </svg>
          <span className="text-lg font-bold">{value}%</span>
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-muted-foreground">Índice de elegibilidade</p>
          <p className="text-lg font-semibold leading-snug">
            <span className="sr-only">{value}%, </span>
            {score.label}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-3 border-t pt-4 text-base">
        <li className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="[text-wrap:pretty]">
            {pathway && badge ? (
              <>
                Caminho mais compatível: <strong className="font-semibold">{pathTitle(pathway)}</strong>{' '}
                <span className="text-muted-foreground">({badge.label.toLowerCase()})</span>.
              </>
            ) : (
              'Suas respostas não indicaram um caminho específico: a análise detalhada explica as possibilidades.'
            )}
          </span>
        </li>
        {others.length > 0 ? (
          <li className="flex gap-3">
            <Compass className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="[text-wrap:pretty]">
              {others.length === 1 ? 'Outro caminho possível: ' : 'Outros caminhos possíveis: '}
              {joinTitles(others.map(pathTitle))}.
            </span>
          </li>
        ) : (
          pathway?.reason && (
            <li className="flex gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="[text-wrap:pretty]">{pathway.reason}</span>
            </li>
          )
        )}
        <li className="flex gap-3">
          <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="[text-wrap:pretty]">
            {firstStep
              ? `Primeiro passo: ${firstStep.label}.`
              : canChat
                ? 'Veja os requisitos na análise detalhada e tire dúvidas no chat IA.'
                : 'Veja os requisitos na análise detalhada.'}
          </span>
        </li>
      </ul>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
        O índice resume as suas respostas e não é garantia de aprovação.
      </p>
    </Card>
  )
}

function SectionChips({
  sections,
  onOpenSection,
}: {
  sections: MarkdownSection[]
  onOpenSection: (id: string) => void
}) {
  const chips = [
    { id: PATHS_ANCHOR, label: 'Caminhos' },
    ...(sections.length > 1 ? sections.map((s) => ({ id: s.id, label: s.title })) : [{ id: ANALYSIS_ANCHOR, label: 'Análise detalhada' }]),
  ]
  return (
    <nav aria-label="Atalhos da análise" data-print-hide>
      {/*
        w-0 + min-w-full: a fileira rola na horizontal sem alargar o layout
        (sem isso, a largura dos chips vira a largura mínima da página no celular).
      */}
      <ul className="flex w-0 min-w-full gap-2 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => (
          <li key={chip.id} className="shrink-0">
            <a
              href={`#${chip.id}`}
              onClick={(event) => {
                event.preventDefault()
                // Abre a seção do acordeão (se for uma) e rola até ela.
                onOpenSection(chip.id)
                requestAnimationFrame(() => scrollToId(chip.id))
              }}
              className="inline-flex min-h-11 items-center whitespace-nowrap rounded-xl border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
            >
              {chip.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function PathwayCard({ pathway }: { pathway: ResultPathway }) {
  const path = getNationalityPath(pathway.code)
  const Icon = path ? PATH_ICONS[path.code] : FileText
  const badge = MATCH_BADGE[pathway.match]
  const timeline = getPathTimeline(path)
  const documents = getPathDocuments(path)
  const steps = getPathSteps(path)

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/[.08] text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1.5">
          <h3 className="text-lg font-semibold leading-snug [text-wrap:balance]">
            {pathTitle(pathway)}
          </h3>
          <Badge variant={badge.variant} size="sm">
            {badge.label}
          </Badge>
        </div>
      </div>

      {pathway.reason ? (
        <p className="text-base leading-relaxed [text-wrap:pretty]">{pathway.reason}</p>
      ) : (
        path?.summary && <p className="text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">{path.summary}</p>
      )}

      {timeline && (
        <p className="flex items-start gap-2 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>
            <span className="font-medium">Prazo típico:</span> {timeline}
          </span>
        </p>
      )}

      {documents.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Documentos principais</h4>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {documents.map((doc) => (
              <li key={doc.key} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  {doc.label}
                  {doc.hint && <span className="block text-muted-foreground">{doc.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">Próximos passos</h4>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm marker:font-semibold marker:text-primary">
            {steps.map((step) => (
              <li key={step.key} className="pl-1">
                {step.label}
                {step.detail && <span className="block text-muted-foreground">{step.detail}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  )
}

function AnalysisAccordion({
  intro,
  sections,
  openIds,
  onToggle,
}: {
  intro: string
  sections: MarkdownSection[]
  openIds: ReadonlySet<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      {intro && (
        <Card variant="muted">
          <MarkdownText minHeadingLevel={4}>{intro}</MarkdownText>
        </Card>
      )}
      <div className="divide-y overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-sm)]">
        {sections.map((section) => (
          <AccordionItem
            key={section.id}
            section={section}
            open={openIds.has(section.id)}
            onToggle={() => onToggle(section.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AccordionItem({ section, open, onToggle }: { section: MarkdownSection; open: boolean; onToggle: () => void }) {
  const panelId = `${section.id}-painel`
  const buttonId = `${section.id}-botao`
  return (
    <section id={section.id} className="scroll-mt-20">
      <h3>
        <button
          id={buttonId}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3 text-left text-lg font-semibold leading-snug hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6"
        >
          <span className="[text-wrap:balance]">{section.title}</span>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-base ease-out print:hidden',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        data-accordion-panel
        className="px-5 pb-5 sm:px-6"
      >
        {section.body ? (
          <MarkdownText minHeadingLevel={4}>{section.body}</MarkdownText>
        ) : (
          <p className="text-base text-muted-foreground">Sem conteúdo nesta seção.</p>
        )}
      </div>
    </section>
  )
}

function AnalysisSkeleton() {
  return (
    <Card role="status" aria-label="Carregando a análise detalhada">
      <div className="animate-pulse space-y-3" aria-hidden="true">
        <div className="h-5 w-2/3 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-11/12 rounded bg-muted" />
        <div className="h-4 w-4/5 rounded bg-muted" />
      </div>
    </Card>
  )
}

/** Análise completa sendo escrita (DI-018): a página confere sozinha, sem botão. */
function AnalysisPreparing() {
  return (
    <Card variant="muted" role="status" aria-live="polite" data-testid="analysis-preparing">
      <div className="flex gap-3">
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-base font-semibold">Preparando sua análise detalhada…</p>
          <p className="text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
            Estamos escrevendo a análise a partir das suas respostas. Leva alguns instantes: pode continuar nesta
            página, o texto aparece aqui sozinho.
          </p>
        </div>
      </div>
      <div className="mt-4 animate-pulse space-y-2.5" aria-hidden="true">
        <div className="h-4 w-2/3 rounded bg-border" />
        <div className="h-3.5 w-full rounded bg-border/70" />
        <div className="h-3.5 w-11/12 rounded bg-border/70" />
        <div className="h-3.5 w-4/5 rounded bg-border/70" />
      </div>
    </Card>
  )
}

/** A geração não terminou (erro, tempo esgotado ou muita procura): tentar de novo pelo botão. */
function AnalysisGenerationProblem({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <Card variant="muted" role="alert" data-testid="analysis-generation-problem">
      <div className="flex gap-3">
        <AlertTriangle
          className={cn('mt-0.5 h-5 w-5 shrink-0', busy ? 'text-[hsl(var(--warning))]' : 'text-destructive')}
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-base font-semibold">
            {busy ? 'Muitas análises sendo preparadas agora' : 'Não foi possível preparar sua análise agora'}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
            {busy
              ? 'Tente de novo em alguns minutos.'
              : SUPPORT_EMAIL
                ? 'Tente de novo. Se o problema continuar, fale com o suporte.'
                : 'Tente de novo em instantes.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row" data-print-hide>
        <Button variant="secondary" onClick={onRetry}>
          Tentar de novo
        </Button>
        <SupportLink subject="Minha análise completa não apareceu" />
      </div>
    </Card>
  )
}

function AnalysisError({ notFound, onRetry, retrying }: { notFound: boolean; onRetry: () => void; retrying: boolean }) {
  return (
    <Card variant="muted" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-base font-semibold">
            {notFound ? 'Não encontramos a análise deste diagnóstico na sua conta' : 'Não foi possível carregar a análise'}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {notFound
              ? 'Confira se você entrou com o mesmo e-mail usado no diagnóstico e na compra.'
              : 'Verifique sua conexão e tente de novo.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row" data-print-hide>
        {!notFound && (
          <Button variant="secondary" loading={retrying} onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
        <SupportLink subject="Não consigo ver minha análise completa" />
      </div>
    </Card>
  )
}

/** O servidor recusou a análise (PT402): sem acesso ativo nesta conta. */
function AccessEndedCard() {
  return (
    <Card variant="muted" role="status">
      <div className="flex gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-base font-semibold">Seu acesso à análise completa não está ativo</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            O acesso dura {OFFER.accessDays} dias depois do pagamento. Veja no painel as opções para continuar.
          </p>
        </div>
      </div>
      <Button asChild className="mt-4 w-full sm:w-auto" data-print-hide>
        <Link to="/dashboard?acesso=expirado">Ver opções no painel</Link>
      </Button>
    </Card>
  )
}

/** Sessão expirada no meio da visita (PT401): entrar de novo e voltar para cá. */
function SessionExpiredCard() {
  return (
    <Card variant="muted" role="alert">
      <div className="flex gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-base font-semibold">Sua sessão expirou</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Entre de novo com o seu e-mail para ver a análise detalhada.
          </p>
        </div>
      </div>
      <Button asChild className="mt-4 w-full sm:w-auto" data-print-hide>
        <Link to={`/login?next=${encodeURIComponent('/dashboard/analysis')}`}>Entrar de novo</Link>
      </Button>
    </Card>
  )
}

function NextStepsCard({ canChat }: { canChat: boolean }) {
  return (
    <section aria-labelledby="continuar-title" data-print-hide className="print:hidden">
      <h2 id="continuar-title" className="text-lg font-semibold leading-snug">
        {canChat ? 'Tire dúvidas e organize seus documentos' : 'Organize seus documentos'}
      </h2>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {canChat && (
          <Button asChild>
            <Link to="/dashboard/chat">
              <MessageSquare aria-hidden="true" />
              Tirar dúvidas no chat IA
            </Link>
          </Button>
        )}
        <Button asChild variant={canChat ? 'secondary' : 'primary'}>
          <Link to="/dashboard/documents">
            <FileText aria-hidden="true" />
            Meus documentos
          </Link>
        </Button>
      </div>
      {SUPPORT_EMAIL && (
        <div className="mt-3">
          <SupportLink subject="Dúvida sobre minha análise" />
        </div>
      )}
    </section>
  )
}

function SupportLink({ subject, className }: { subject: string; className?: string }) {
  if (!SUPPORT_EMAIL) return null
  return (
    <Button asChild variant="link" size="sm" className={cn('self-start px-0', className)}>
      <a href={mailtoHref(SUPPORT_EMAIL, subject)}>
        <Mail aria-hidden="true" />
        Falar com o suporte
      </a>
    </Button>
  )
}

function NoAccess({ expired, assessmentId }: { expired: boolean; assessmentId: string | null }) {
  if (expired) {
    return (
      <StateMessage
        icon={Lock}
        title="Seu acesso à análise completa terminou"
        description={`O acesso de ${OFFER.accessDays} dias depois do pagamento chegou ao fim. Veja no painel as opções para continuar.`}
        action={
          <Button asChild>
            <Link to="/dashboard?acesso=expirado">Ver opções no painel</Link>
          </Button>
        }
      />
    )
  }
  return (
    <StateMessage
      icon={Lock}
      title="A análise completa é para quem desbloqueou o diagnóstico"
      description={`Por ${OFFER.priceLabel}, você recebe a análise do seu caminho, os requisitos e documentos de cada caminho e os próximos passos, com acesso por ${OFFER.accessDays} dias.`}
      action={
        <Button asChild variant="pay" size="lg">
          <Link to="/checkout" state={{ plan: 'one_time', assessmentId }}>
            Desbloquear por {OFFER.priceLabel}
          </Link>
        </Button>
      }
      secondary={
        <Button asChild variant="link" size="sm">
          <Link to="/dashboard">Voltar ao painel</Link>
        </Button>
      }
    />
  )
}

function StateMessage({
  icon: Icon,
  title,
  description,
  action,
  secondary,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  secondary?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Icon className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-h2 text-foreground">{title}</h1>
      <p className="text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">{description}</p>
      {action && <div className="mt-2 flex w-full flex-col items-center gap-2">{action}</div>}
      {secondary}
    </div>
  )
}
