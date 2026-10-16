// ResultsPage.tsx — pré-resultado do quiz + oferta da análise completa.
//
// Objetivo: o primeiro scroll do resultado leva ao €30, sem enganar.
//
// DI-029: apresentação única por categoria (src/lib/category.ts): o mesmo
//   título e o mesmo ícone vindo do quiz, ao recarregar e em outro aparelho.
// DI-070: caminhos para a nacionalidade, o mais forte primeiro, com o blur
//   acessível (PathTeaser).
// DI-028: cartão do resultado compacto, link "Ver o que inclui" e CTA de compra
//   fixo no celular (StickyBuyBar) entre o resultado e a oferta.
// DI-030: oferta personalizada por categoria e caminho (PaywallCard).
// DI-031: e-mail de acesso visível e editável antes de pagar (AccessEmail).
// DI-024: /results?r=<token> abre o resultado em outro aparelho; o token sai da
//   URL antes de qualquer pageview e "Guardar meu resultado" copia o link.
// DI-011/DI-032: a compra usa useStartCheckout (1 clique, sem login); erros em
//   português logo abaixo do botão; ?checkout=cancelled mostra "Nada foi cobrado".
// DI-033: results_viewed e paywall_viewed uma vez por diagnóstico. O
//   quiz_completed é enviado só pelo useQuiz (aqui contaria em dobro, inclusive
//   em outro aparelho).
// DI-053: quem já pagou (ou enquanto a conta é confirmada) não vê o checkout:
//   vê "Ir para o painel" (results-access.ts + ResultsAccessCard). Partilha com
//   a família (link do quiz grátis, sem PII) e "Já comprou? Entrar" para quem
//   volta sem login.
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, ChevronDown, Info, Link2Off, Loader2, LogIn, RotateCcw, WifiOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuizResult } from '@/hooks/useQuiz'
import { pruneAnswers, suggestVisas, type VisaSuggestion } from '@/data/quiz-questions'
import { track, trackOnce } from '@/lib/analytics'
import { useAuth } from '@/hooks/useAuth'
import { readStoredCheckoutData, useStartCheckout, type CheckoutError } from '@/hooks/useStartCheckout'
import { QUIZ_RESULT_STORAGE_KEY } from '@/lib/stored-quiz-result'
import { hasStoredAuthSession } from '@/lib/stored-session'
import { categoryForPercentage, getCategoryPresentation, isScoreCategory, CATEGORY_THRESHOLDS } from '@/lib/category'
import { updateAccessEmail } from '@/lib/access-email'
import {
  RESUME_PARAM,
  fetchAssessmentByResumeToken,
  fetchOwnResumeToken,
  isValidResumeToken,
  readStoredResumeToken,
  rememberResumeToken,
  storeResumedResult,
  withoutParams,
} from '@/lib/resume-token'
import { Button, Card, Container } from '@/components/ui'
import { CategoryIcon } from '@/components/results/CategoryIcon'
import { PathTeaser } from '@/components/results/PathTeaser'
import { PAYWALL_ID, PAYWALL_TITLE_ID, PaywallCard } from '@/components/results/PaywallCard'
import { ResultsAccessCard } from '@/components/results/ResultsAccessCard'
import { getResultsAccessView, showsCheckout } from '@/components/results/results-access'
import { SaveResultLink } from '@/components/results/SaveResultLink'
import { StickyBuyBar } from '@/components/results/StickyBuyBar'
import { firstNameOf, sortPathways } from '@/components/results/results-copy'
import { ShareWithFamily } from '@/components/ShareButton'

/** Resultado pronto para a tela, com a identidade do envio do quiz. */
interface LoadedResult {
  result: QuizResult
  /** Identifica o envio do quiz (session_id) para os eventos "uma vez por diagnóstico". */
  key: string | null
  assessmentId: string | null
  sessionId: string | null
  /** Token do link "Guardar meu resultado", se já conhecido neste aparelho. */
  resumeToken: string | null
}

type ResumeStatus = 'idle' | 'loading' | 'ready' | 'invalid' | 'error'

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Rola até o elemento (sem animação com movimento reduzido); ignora navegadores sem a API. */
function scrollToElement(el: Element | null | undefined, block: ScrollLogicalPosition): void {
  if (!el || typeof el.scrollIntoView !== 'function') return
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block })
}

/**
 * O navegador deixa este site gravar no localStorage? Com cookies bloqueados (ou
 * em navegadores que travam o armazenamento), o resultado aparece pela memória,
 * mas o useStartCheckout não encontra o diagnóstico para comprar.
 */
function canUseStorage(): boolean {
  try {
    const probe = '__di_storage_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** Compra impossível porque o navegador não guarda dados: diz o porquê e o que fazer. */
const STORAGE_BLOCKED_ERROR: CheckoutError = {
  message:
    'Este navegador não deixa o site guardar dados (janela anônima ou cookies bloqueados), e sem isso não conseguimos abrir o pagamento. Abra o site no navegador padrão do celular, fora da janela anônima, e refaça o quiz grátis por lá ou abra de novo o link do seu resultado.',
  action: 'quiz',
  reason: 'storage_unavailable',
  status: null,
}

/** Tira parâmetros da barra de endereço na hora (antes do pageview agendado). */
function stripFromAddressBar(keys: readonly string[]): void {
  try {
    const { pathname, search, hash } = window.location
    const params = new URLSearchParams(search)
    if (!keys.some((key) => params.has(key))) return
    window.history.replaceState(window.history.state, '', `${pathname}${withoutParams(search, keys)}${hash}`)
  } catch {
    // sem history (ambiente de teste): o roteador limpa a URL logo em seguida
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ResultsPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  // Lidos na primeira renderização: a URL é limpa logo depois.
  const [initial] = useState(() => ({
    token: searchParams.get(RESUME_PARAM),
    cancelled: searchParams.get('checkout') === 'cancelled',
  }))
  const [resume, setResume] = useState<ResumeStatus>(() =>
    initial.token === null ? 'idle' : isValidResumeToken(initial.token) ? 'loading' : 'invalid',
  )
  const [resumed, setResumed] = useState<LoadedResult | null>(null)
  const [showCancelled, setShowCancelled] = useState(initial.cancelled)
  const cancelTrackedRef = useRef(false)

  // URL limpa ANTES de qualquer pageview (o analytics agenda o pageview para
  // depois da navegação): o token de ?r= nunca fica na barra de endereço, e
  // ?checkout=cancelled não repete o aviso ao recarregar.
  useLayoutEffect(() => {
    const hasToken = searchParams.has(RESUME_PARAM)
    const cancelled = searchParams.get('checkout') === 'cancelled'
    if (!hasToken && !cancelled) return
    if (cancelled && !cancelTrackedRef.current) {
      cancelTrackedRef.current = true
      setShowCancelled(true)
      track('checkout_cancelled', { plan: 'one_time' })
    }
    const keys = cancelled ? [RESUME_PARAM, 'checkout'] : [RESUME_PARAM]
    stripFromAddressBar(keys)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const key of keys) next.delete(key)
        return next
      },
      { replace: true, state: location.state },
    )
  }, [searchParams, setSearchParams, location.state])

  // Link de retomada: lê o resultado pelo token e guarda neste aparelho.
  useEffect(() => {
    const token = initial.token
    if (resume !== 'loading' || !token) return
    let active = true
    void fetchAssessmentByResumeToken(token).then((outcome) => {
      if (!active) return
      if (outcome.kind !== 'ok') {
        setResume(outcome.kind === 'not_found' ? 'invalid' : 'error')
        return
      }
      const record = storeResumedResult(outcome.data, token)
      setResumed(parseStoredResult(record))
      setResume('ready')
    })
    return () => {
      active = false
    }
  }, [resume, initial.token])

  const local = useMemo(() => loadResult(location.state), [location.state])
  const loaded = resume === 'ready' ? resumed : resume === 'idle' ? local : null

  const cancelledNotice = showCancelled ? <CancelledNotice onClose={() => setShowCancelled(false)} /> : null

  if (resume === 'loading') return <ResumeLoading />
  if (resume === 'invalid' || resume === 'error') {
    return (
      <ResumeProblem
        kind={resume}
        onRetry={() => setResume('loading')}
        onShowLocal={local ? () => setResume('idle') : undefined}
      />
    )
  }

  if (!loaded) {
    return (
      <Container size="sm" className="flex min-h-[60dvh] flex-col justify-center gap-6 py-10">
        {cancelledNotice}
        <div className="flex flex-col items-center gap-4 text-center" data-testid="results-empty">
          <p className="text-base text-muted-foreground">Não encontramos nenhum resultado do quiz neste aparelho.</p>
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

  // `key`: o useStartCheckout lê o resultado do aparelho ao montar — remonta
  // quando o resultado muda (ex.: aberto pelo link de retomada).
  return <ResultsContent key={loaded.key ?? 'local'} loaded={loaded} notice={cancelledNotice} />
}

// ─── Conteúdo ─────────────────────────────────────────────────────────────────

function ResultsContent({ loaded, notice }: { loaded: LoadedResult; notice: ReactNode }) {
  const navigate = useNavigate()
  const { session, loading, userDataError, access, hasAccess, refreshUser } = useAuth()
  const [mayHaveSession] = useState(() => hasStoredAuthSession())
  const accessView = getResultsAccessView({
    loading,
    hasSession: !!session,
    mayHaveSession,
    userDataError,
    access,
    canOpenDashboard: hasAccess('dashboard'),
  })
  // Já pagou ou ainda não sabemos: nada de oferta, barra fixa ou "Ver o que inclui".
  const paid = !showsCheckout(accessView)
  const checkout = useStartCheckout()
  const { score, visas, leadInfo } = loaded.result
  const category = score.category
  const onceKey = loaded.key ?? `${category}:${score.percentage}`

  const scoreRef = useRef<HTMLDivElement>(null)
  // Botão de compra da oferta: a barra fixa some enquanto ELE está na tela.
  const ctaRef = useRef<HTMLButtonElement>(null)
  const buySourceRef = useRef<'paywall' | 'sticky' | null>(null)
  const [storageBlocked, setStorageBlocked] = useState(false)
  const [editedEmail, setEditedEmail] = useState<string | null>(null)
  const [resumeToken, setResumeToken] = useState<string | null>(loaded.resumeToken)

  const pathways = useMemo(() => sortPathways(visas), [visas])
  const firstName = firstNameOf(leadInfo?.fullName)

  // Um evento por diagnóstico (recarregar /results não conta de novo).
  // Espera a conta ser confirmada para registrar has_access com o valor certo.
  const accessKnown = accessView !== 'checking'
  const hasPaidAccess = accessView === 'active'
  useEffect(() => {
    if (!accessKnown) return
    trackOnce('results_viewed', onceKey, { category, has_access: hasPaidAccess })
  }, [onceKey, category, accessKnown, hasPaidAccess])

  // Token do "Guardar meu resultado" no aparelho do quiz (posse pelo session_id).
  const { assessmentId, sessionId } = loaded
  useEffect(() => {
    if (resumeToken || paid || !assessmentId || !sessionId) return
    let active = true
    void fetchOwnResumeToken(assessmentId, sessionId).then((token) => {
      if (!active || !token) return
      rememberResumeToken(token, assessmentId)
      setResumeToken(token)
    })
    return () => {
      active = false
    }
  }, [resumeToken, paid, assessmentId, sessionId])

  const buy = (source: 'paywall' | 'sticky') => {
    const position = source === 'sticky' ? 'results_sticky' : 'results_paywall'
    // O resultado está na tela, mas o navegador não guardou o diagnóstico: o
    // checkout diria "não encontramos seu diagnóstico". Explica o motivo real.
    if (checkout.mode === 'empty' && !canUseStorage()) {
      setStorageBlocked(true)
      track('paywall_cta_clicked', { position })
      track('checkout_failed', { reason: STORAGE_BLOCKED_ERROR.reason, plan: 'one_time' })
      if (source === 'sticky') scrollToElement(ctaRef.current, 'center')
      return
    }
    setStorageBlocked(false)
    buySourceRef.current = source
    void checkout.start({ position })
  }

  // Compra iniciada pela barra fixa que voltou com erro ou aviso: leva a pessoa
  // até o botão da oferta, onde a mensagem e o "Tentar novamente" aparecem.
  useEffect(() => {
    if (checkout.phase !== 'error' && checkout.phase !== 'email_sent') return
    if (buySourceRef.current !== 'sticky') return
    buySourceRef.current = null
    scrollToElement(ctaRef.current, 'center')
  }, [checkout.phase])

  const goToOffer = () => {
    scrollToElement(document.getElementById(PAYWALL_ID), 'start')
    document.getElementById(PAYWALL_TITLE_ID)?.focus({ preventScroll: true })
  }

  const anonymous = checkout.mode === 'anonymous'
  const email = anonymous ? (editedEmail ?? leadInfo?.email ?? checkout.email) : checkout.email

  const handleEmailSave = async (next: string, source: 'manual' | 'suggestion') => {
    const outcome = await updateAccessEmail(next)
    if (outcome === 'saved' || outcome === 'saved_locally') {
      setEditedEmail(next)
      track('email_edited', { position: 'results', source })
      // Um erro anterior (ex.: diagnóstico não encontrado) não vale para o e-mail novo.
      if (checkout.phase === 'error' || checkout.phase === 'email_sent') checkout.reset()
    }
    return outcome
  }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      <Container size="sm" className="space-y-5 py-6 sm:space-y-6 sm:py-10">
        {notice}

        <ScoreCard ref={scoreRef} score={score} firstName={firstName} onSeeOffer={paid ? undefined : goToOffer} />

        {/* Já pagou (ou a conta não carregou): o atalho para o painel vem logo depois do resultado. */}
        {accessView !== 'none' && accessView !== 'checking' && (
          <ResultsAccessCard view={accessView} expiresAt={access?.expiresAt ?? null} onRetry={refreshUser} />
        )}

        <PathTeaser pathways={pathways} />

        {/* Confirmando a conta: espera no lugar da oferta (sem checkout até saber). */}
        {accessView === 'checking' && (
          <ResultsAccessCard view="checking" expiresAt={null} onRetry={refreshUser} />
        )}

        {accessView === 'none' && (
          <PaywallCard
            ctaRef={ctaRef}
            firstName={firstName}
            category={category}
            strongestPath={pathways[0] ?? null}
            paid={false}
            onceKey={onceKey}
            email={email}
            emailEditable={anonymous}
            onEmailSave={handleEmailSave}
            phase={storageBlocked ? 'error' : checkout.phase}
            isPending={checkout.isPending}
            error={storageBlocked ? STORAGE_BLOCKED_ERROR : checkout.error}
            onBuy={() => buy('paywall')}
          />
        )}

        <ShareWithFamily placement="results" />

        <div className="flex flex-col items-center gap-4 pt-1">
          {resumeToken && !paid && <SaveResultLink token={resumeToken} />}
          {/* Quem já comprou e voltou sem login (outro aparelho, sessão expirada). */}
          {accessView === 'none' && !session && (
            <Button asChild variant="link" size="sm" data-testid="results-login-link">
              <Link to="/login" state={{ returnTo: '/dashboard' }}>
                <LogIn aria-hidden="true" />
                Já comprou a análise? Entrar
              </Link>
            </Button>
          )}
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

      {!paid && (
        <StickyBuyBar
          anchorRef={scoreRef}
          inlineCtaRef={ctaRef}
          isPending={checkout.isPending}
          onBuy={() => buy('sticky')}
        />
      )}
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
        <p className="mt-1 text-sm text-muted-foreground">
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

interface ScoreCardProps {
  score: QuizResult['score']
  firstName: string | null
  /** Rola até a oferta ("Ver o que inclui"); ausente para quem já pagou. */
  onSeeOffer?: () => void
}

const ScoreCard = forwardRef<HTMLDivElement, ScoreCardProps>(function ScoreCard({ score, firstName, onSeeOffer }, ref) {
  const presentation = getCategoryPresentation(score.category)
  const { tone } = presentation
  const percentage = Math.max(0, Math.min(100, Math.round(score.percentage)))

  return (
    <Card
      ref={ref}
      data-testid="results-score"
      data-category={presentation.category}
      className={cn('border-transparent', tone.tint)}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card shadow-sm',
            tone.text,
          )}
        >
          <CategoryIcon category={presentation.category} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {firstName ? `${firstName}, este é seu resultado` : 'Seu resultado'}
          </p>
          <h1 className="text-h2 text-foreground" data-testid="results-title">
            {presentation.label}
          </h1>
        </div>
      </div>

      <p className="mt-3 text-base text-muted-foreground">{presentation.sublabel}</p>

      {/* Medidor com as faixas reais (baixa < 35% ≤ média < 60% ≤ alta). */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between text-sm text-muted-foreground">
          <span>Pontuação do diagnóstico</span>
          <span className={cn('text-base font-bold', tone.text)}>{percentage}%</span>
        </div>
        <div
          role="meter"
          aria-label="Pontuação de elegibilidade"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          aria-valuetext={`${percentage}%: ${presentation.label}`}
          className="relative h-2 w-full overflow-hidden rounded-full bg-card"
        >
          <div
            className={cn('h-full rounded-full transition-[width] duration-slow ease-out', tone.bar)}
            style={{ width: `${percentage}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-background"
            style={{ left: `${CATEGORY_THRESHOLDS.media}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-background"
            style={{ left: `${CATEGORY_THRESHOLDS.alta}%` }}
          />
        </div>
        <div aria-hidden="true" className="mt-1 flex text-xs text-muted-foreground">
          <span style={{ width: `${CATEGORY_THRESHOLDS.media}%` }}>Baixa</span>
          <span className="text-center" style={{ width: `${CATEGORY_THRESHOLDS.alta - CATEGORY_THRESHOLDS.media}%` }}>
            Média
          </span>
          <span className="flex-1 text-right">Alta</span>
        </div>
      </div>

      {onSeeOffer && (
        <button
          type="button"
          onClick={onSeeOffer}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl text-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-fast ease-out hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-testid="results-see-offer"
        >
          Ver o que inclui a análise completa
          <ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </Card>
  )
})

function ResumeLoading() {
  return (
    <Container size="sm" className="flex min-h-[60dvh] items-center justify-center py-10">
      <p
        role="status"
        className="flex items-center gap-2 text-base text-muted-foreground"
        data-testid="results-resume-loading"
      >
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
        Abrindo seu resultado…
      </p>
    </Container>
  )
}

function ResumeProblem({
  kind,
  onRetry,
  onShowLocal,
}: {
  kind: 'invalid' | 'error'
  onRetry: () => void
  /** Há outro resultado salvo neste aparelho. */
  onShowLocal?: () => void
}) {
  const invalid = kind === 'invalid'
  const Icon = invalid ? Link2Off : WifiOff
  return (
    <Container size="sm" className="flex min-h-[60dvh] flex-col justify-center py-10">
      <div
        className="flex flex-col items-center gap-4 text-center"
        data-testid={invalid ? 'results-resume-invalid' : 'results-resume-error'}
      >
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-primary"
        >
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="text-h2 text-foreground">
          {invalid ? 'Não encontramos esse resultado' : 'Não conseguimos abrir seu resultado agora'}
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          {invalid
            ? 'O link pode estar incompleto ou ter expirado. Refaça o quiz grátis para ver seu resultado de novo.'
            : 'Verifique sua conexão e tente de novo.'}
        </p>
        <div className="flex w-full max-w-sm flex-col gap-3">
          {invalid ? (
            <Button asChild size="md" className="w-full">
              <Link to="/quiz">
                Refazer o quiz grátis
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button size="md" className="w-full" onClick={onRetry}>
              <RotateCcw aria-hidden="true" />
              Tentar de novo
            </Button>
          )}
          {onShowLocal && (
            <Button variant="secondary" size="md" className="w-full" onClick={onShowLocal}>
              Ver o resultado salvo neste aparelho
            </Button>
          )}
          {invalid ? (
            <Button asChild variant="ghost" size="md" className="w-full">
              <Link to="/login" state={{ returnTo: '/dashboard' }}>
                Já paguei, entrar
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="md" className="w-full">
              <Link to="/quiz">Refazer o quiz grátis</Link>
            </Button>
          )}
        </div>
      </div>
    </Container>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MATCHES: readonly VisaSuggestion['match'][] = ['strong', 'possible', 'weak']

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function storedVisas(raw: unknown): VisaSuggestion[] {
  if (!Array.isArray(raw)) return []
  const out: VisaSuggestion[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const v = item as Record<string, unknown>
    if (typeof v.code !== 'string' || typeof v.name !== 'string') continue
    const match = MATCHES.includes(v.match as VisaSuggestion['match']) ? (v.match as VisaSuggestion['match']) : 'weak'
    out.push({ code: v.code, name: v.name, match, reason: asText(v.reason) ?? '' })
  }
  return out
}

function storedAnswers(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

/** Score no formato da tela, com rótulos da apresentação única (DI-029). */
function toScore(raw: { total?: unknown; max?: unknown; percentage: number; category?: unknown }): QuizResult['score'] {
  const percentage = Math.round(raw.percentage)
  // Categoria antiga/inválida: deduzida do percentual (nunca "?").
  const category = isScoreCategory(raw.category) ? raw.category : categoryForPercentage(percentage)
  const { label, sublabel } = getCategoryPresentation(category)
  return {
    total: typeof raw.total === 'number' ? raw.total : 0,
    max: typeof raw.max === 'number' ? raw.max : 0,
    percentage,
    category,
    label,
    sublabel,
  }
}

/**
 * Resultado salvo (localStorage ou o registro recém-criado pelo link de
 * retomada) no formato da tela. As vias são recalculadas das respostas, como no
 * painel, para que recarregar e abrir em outro aparelho mostrem o mesmo.
 */
function parseStoredResult(parsed: Record<string, unknown> | null): LoadedResult | null {
  if (!parsed) return null
  const rawScore = parsed.score as
    { total?: unknown; max?: unknown; percentage?: unknown; category?: unknown } | undefined
  if (!rawScore || typeof rawScore.percentage !== 'number' || !Number.isFinite(rawScore.percentage)) return null
  const answers = storedAnswers(parsed.answers)
  const visas = answers ? suggestVisas(pruneAnswers(answers)) : storedVisas(parsed.visas)
  const lead = parsed.leadInfo as { fullName?: unknown; email?: unknown; phone?: unknown } | null | undefined
  const sessionId = asText(parsed.sessionId)
  const assessmentId = asText(parsed.assessmentId)
  return {
    key: sessionId ?? assessmentId ?? asText(parsed.completedAt),
    sessionId,
    assessmentId,
    resumeToken: readStoredResumeToken(),
    result: {
      score: toScore({ ...rawScore, percentage: rawScore.percentage }),
      visas,
      leadInfo:
        lead && typeof lead === 'object'
          ? {
              fullName: asText(lead.fullName) ?? '',
              email: asText(lead.email) ?? '',
              ...(asText(lead.phone) ? { phone: asText(lead.phone) as string } : {}),
            }
          : null,
    },
  }
}

/**
 * Resultado a mostrar: o do roteador (vindo direto do quiz) ou o salvo neste
 * aparelho. `key` identifica o envio do quiz (session_id), estável mesmo quando
 * o assessmentId só aparece depois, ao salvar de novo.
 */
function loadResult(state: unknown): LoadedResult | null {
  const stored = readStoredCheckoutData()
  const routerState = (state ?? null) as { result?: QuizResult; assessmentId?: string | null } | null
  if (routerState?.result?.score) {
    const { result } = routerState
    return {
      key: stored?.sessionId ?? routerState.assessmentId ?? stored?.assessmentId ?? null,
      sessionId: stored?.sessionId ?? null,
      assessmentId: stored?.assessmentId ?? routerState.assessmentId ?? null,
      resumeToken: readStoredResumeToken(),
      result: {
        score: toScore(result.score),
        visas: Array.isArray(result.visas) ? result.visas : [],
        leadInfo: result.leadInfo ?? null,
      },
    }
  }
  try {
    const raw = localStorage.getItem(QUIZ_RESULT_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parseStoredResult(parsed as Record<string, unknown>)
      : null
  } catch {
    // JSON inválido ou sem storage: mostra o estado vazio
    return null
  }
}
