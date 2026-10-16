// QuizPage.tsx — Quiz Engine — Diagnóstico da Imigração
//
// Mobile primeiro (DI-039): barra fixa na zona do polegar com "Anterior" em
// ícone e "Próximo" largo; ao trocar de pergunta, a tela volta ao topo e o foco
// vai para o título; nas perguntas de escolha única, tocar numa opção avança
// sozinho (só toque/clique/Enter/Espaço — nunca as setas do teclado).
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, RotateCcw } from 'lucide-react'
import { useQuiz, type QuizNextAction } from '@/hooks/useQuiz'
import { useQuizQuestions } from '@/hooks/useQuizQuestions'
import { QuizIntro } from '@/components/quiz/QuizIntro'
import { QuizProgress } from '@/components/quiz/QuizProgress'
import { QuizQuestionCard, type QuizAnswerMeta } from '@/components/quiz/QuizQuestion'
import { QuizCaptureForm } from '@/components/quiz/QuizCaptureForm'
import { Badge, Button, Container, Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { Sentry } from '@/lib/sentry'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

/** Espera entre o toque numa opção de escolha única e o avanço (critério: ≤400ms). */
const AUTO_ADVANCE_MS = 250
/**
 * Logo depois de um auto-avanço, um segundo toque (o "Próximo" por hábito ou um
 * toque duplo na opção) cairia na pergunta nova e a pularia sem a pessoa ver.
 * O primeiro toque nesse intervalo é ignorado; qualquer outra interação com a
 * pergunta nova desfaz a proteção.
 */
const GHOST_TAP_MS = 500
const REQUIRED_HINT_ID = 'quiz-required-hint'

// Sem prometer advogado nem serviço que não existe (DI-065).
const COMING_SOON_LABELS: Record<string, { title: string; description: string }> = {
  visto: {
    title: 'Diagnóstico de vistos em breve',
    description:
      'Estamos preparando o diagnóstico para vistos de residência, trabalho e nômade digital. Deixe seu e-mail para saber quando ele estiver disponível.',
  },
  regularizacao: {
    title: 'Diagnóstico de regularização em breve',
    description:
      'O diagnóstico para regularizar a situação junto da AIMA ainda não está disponível. Deixe seu e-mail para saber quando ele for lançado.',
  },
  nao_sei: {
    title: 'Orientação guiada em breve',
    description:
      'Estamos preparando um caminho guiado para quem ainda não sabe por onde começar. Se o seu objetivo for a nacionalidade portuguesa, você já pode fazer o diagnóstico: volte e escolha essa opção.',
  },
}

const NEXT_LABELS: Record<QuizNextAction, string> = {
  next: 'Próximo',
  results: 'Ver meu resultado',
  continue: 'Continuar',
  skip: 'Pular esta pergunta',
  skip_results: 'Pular e ver meu resultado',
}

const TEXT_INPUT_TYPES_WITHOUT_KEYBOARD = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

function opensVirtualKeyboard(el: EventTarget | Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !TEXT_INPUT_TYPES_WITHOUT_KEYBOARD.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

/**
 * true enquanto um campo de texto/número está focado (teclado virtual aberto).
 * A barra fixa some nesse caso para não cobrir o campo; o Enter do teclado
 * faz o papel do "Próximo".
 */
function useTextFieldFocused(): boolean {
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    let timer: number | undefined
    const handleFocusIn = (event: FocusEvent) => {
      if (opensVirtualKeyboard(event.target)) setFocused(true)
    }
    // Durante o focusout o foco ainda não mudou: confere no próximo tick.
    const handleFocusOut = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setFocused(opensVirtualKeyboard(document.activeElement)), 0)
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])
  return focused
}

/**
 * Altura atual do elemento (ResizeObserver). Usada para reservar, no fim do
 * conteúdo, o espaço exato da barra fixa — que cresce com o aviso de resposta
 * obrigatória e com a área segura do iPhone.
 */
function useElementHeight<T extends HTMLElement>(): [React.RefCallback<T>, number | null] {
  const [height, setHeight] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: T | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!el) return
    const measure = () => setHeight(Math.ceil(el.getBoundingClientRect().height))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    observerRef.current = new ResizeObserver(measure)
    observerRef.current.observe(el)
  }, [])
  useEffect(() => () => observerRef.current?.disconnect(), [])
  return [ref, height]
}

function requiredHintText(fieldType: string | undefined): string {
  if (fieldType === 'multiselect') return 'Marque pelo menos uma opção para continuar.'
  if (fieldType === 'number' || fieldType === 'select') return 'Responda para continuar.'
  return 'Escolha uma opção para continuar.'
}

export function QuizPage() {
  const {
    quizState,
    session,
    currentQuestion,
    currentIndex,
    currentAnswer,
    totalQuestions,
    questionsAnswered,
    progress,
    themes,
    currentThemeName,
    isSubmitting,
    canProceed,
    nextAction,
    animationDirection,
    resumeStep,
    processingThemes,
    startQuiz,
    resumeQuiz,
    restartQuiz,
    answerQuestion,
    nextQuestion,
    prevQuestion,
    leadsToAnotherStep,
    submitQuiz,
    backFromComingSoon,
  } = useQuiz()

  // Mesma query do useQuiz (cache compartilhado): usada só para recarregar.
  const { refetch: refetchQuestions, isFetching: isFetchingQuestions } = useQuizQuestions()

  // Coming soon — email capture state
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyDone, setNotifyDone] = useState(false)
  const [notifyFailed, setNotifyFailed] = useState(false)

  // "Responda para continuar": só depois de tocar no "Próximo" sem resposta.
  const [requiredHint, setRequiredHint] = useState(false)

  const textFieldFocused = useTextFieldFocused()
  const [navRef, navHeight] = useElementHeight<HTMLElement>()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)

  const comingSoonContent =
    COMING_SOON_LABELS[session.answers['processo_tipo'] ?? ''] ??
    COMING_SOON_LABELS['nao_sei']

  // Guarda (DI-066): estado de pergunta sem pergunta para mostrar nunca fica em branco.
  const isQuestionMissing = quizState === 'question' && !currentQuestion

  const currentQuestionKey = currentQuestion?.key

  // Nova pergunta/etapa: volta ao topo e leva o foco ao título (leitores de tela
  // anunciam a pergunta; no celular a pergunta nunca abre rolada para baixo).
  useEffect(() => {
    window.scrollTo(0, 0)
    setRequiredHint(false)
    if (quizState === 'question') headingRef.current?.focus({ preventScroll: true })
    else if (quizState === 'capture' || quizState === 'comingsoon') sectionRef.current?.focus({ preventScroll: true })
  }, [currentQuestionKey, quizState])

  // Auto-avanço: um timer por toque; trocar de pergunta (ou sair) cancela.
  const autoAdvanceTimer = useRef<number | undefined>(undefined)
  const nextQuestionRef = useRef(nextQuestion)
  const currentKeyRef = useRef(currentQuestionKey)
  useEffect(() => {
    nextQuestionRef.current = nextQuestion
    currentKeyRef.current = currentQuestionKey
  })
  useEffect(() => {
    return () => window.clearTimeout(autoAdvanceTimer.current)
  }, [currentQuestionKey, quizState])

  useEffect(() => {
    if (!isQuestionMissing) return
    Sentry.captureMessage('quiz: estado question sem pergunta visível', {
      level: 'warning',
      tags: { area: 'quiz' },
      extra: { currentIndex, totalQuestions },
    })
  }, [isQuestionMissing, currentIndex, totalQuestions])

  /** Momento do último auto-avanço (0 = sem proteção ativa). */
  const lastAutoAdvanceAt = useRef(0)
  /** true se este é o toque "fantasma" logo após o auto-avanço. Sempre desliga a proteção. */
  const consumeGhostTap = useCallback(() => {
    const ghost = lastAutoAdvanceAt.current > 0 && Date.now() - lastAutoAdvanceAt.current < GHOST_TAP_MS
    lastAutoAdvanceAt.current = 0
    return ghost
  }, [])

  const handleAnswer = useCallback(
    (value: string, { commit }: QuizAnswerMeta) => {
      if (!currentQuestion) return
      if (consumeGhostTap() && commit) return
      const key = currentQuestion.key
      answerQuestion(key, value)
      setRequiredHint(false)
      window.clearTimeout(autoAdvanceTimer.current)
      // Só escolha única avança sozinha, e só quando há outra etapa depois
      // (a última pergunta pede o toque em "Ver meu resultado").
      if (!commit || currentQuestion.fieldType !== 'radio' || !value) return
      if (!leadsToAnotherStep(key, value)) return
      autoAdvanceTimer.current = window.setTimeout(() => {
        if (currentKeyRef.current !== key) return
        if (nextQuestionRef.current()) lastAutoAdvanceAt.current = Date.now()
      }, AUTO_ADVANCE_MS)
    },
    [currentQuestion, consumeGhostTap, answerQuestion, leadsToAnotherStep],
  )

  const handleNext = () => {
    window.clearTimeout(autoAdvanceTimer.current)
    if (consumeGhostTap()) return
    if (!nextQuestion()) setRequiredHint(true)
  }

  // "Anterior" cancela um auto-avanço pendente (o voltar pelo histórico é assíncrono).
  const handlePrev = () => {
    window.clearTimeout(autoAdvanceTimer.current)
    lastAutoAdvanceAt.current = 0
    prevQuestion()
  }

  const handleRetryQuestions = async () => {
    await refetchQuestions()
    // Volta para a primeira pergunta; as respostas já dadas continuam marcadas.
    startQuiz('retry')
  }

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notifyEmail.trim() || notifyLoading) return
    setNotifyLoading(true)
    setNotifyFailed(false)
    try {
      // Save as incomplete assessment so admin can see waitlist leads
      const { error } = await supabase.from('assessments').insert({
        email: notifyEmail.trim(),
        status: 'incomplete',
        answers: { processo_tipo: session.answers['processo_tipo'] ?? 'nao_sei', waitlist: true },
        questions_answered: 1,
        total_questions: 1,
        completion_percentage: 0,
      })
      if (error) throw error
      setNotifyDone(true)
      track('waitlist_joined', { processo_tipo: session.answers['processo_tipo'] ?? 'nao_sei' })
    } catch {
      // Não confirmar um cadastro que não foi salvo.
      setNotifyFailed(true)
    } finally {
      setNotifyLoading(false)
    }
  }

  const progressLabel =
    progress.total !== null ? `Pergunta ${progress.position} de ${progress.total}` : `Pergunta ${progress.position}`
  const showRequiredHint = requiredHint && !canProceed

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-background">
      <Container size="sm" className="py-4 sm:py-12">
        <div>

          {/* ── INTRO ── */}
          {quizState === 'intro' && (
            <div className="pt-2 sm:pt-0">
              <QuizIntro
                onStart={() => startQuiz('intro')}
                resume={
                  resumeStep
                    ? { answeredCount: questionsAnswered, onContinue: resumeQuiz, onRestart: restartQuiz }
                    : null
                }
              />
            </div>
          )}

          {/* ── QUESTIONS ── */}
          {quizState === 'question' && currentQuestion && (
            <div className="space-y-4 sm:space-y-6">
              <div className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-8">
                <div className="mb-5 sm:mb-8">
                  <QuizProgress
                    label={progressLabel}
                    themeName={currentThemeName}
                    percentage={progress.percentage}
                    segments={themes}
                  />
                </div>

                <QuizQuestionCard
                  question={currentQuestion}
                  answer={currentAnswer}
                  onChange={handleAnswer}
                  onSubmit={handleNext}
                  animationDirection={animationDirection}
                  headingRef={headingRef}
                  errorId={showRequiredHint ? REQUIRED_HINT_ID : undefined}
                />
              </div>

              {/* Navegação: fixa na zona do polegar no celular, inline a partir de sm */}
              <nav
                ref={navRef}
                aria-label="Navegação do diagnóstico"
                data-state={textFieldFocused ? 'hidden' : 'visible'}
                data-testid="quiz-nav"
                className={cn(
                  'fixed inset-x-0 z-30 border-t bg-card/95 px-4 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(20_26_41/0.12)] backdrop-blur',
                  'transition-[transform,opacity,visibility] duration-base ease-out motion-reduce:transition-none',
                  'data-[state=hidden]:pointer-events-none data-[state=hidden]:invisible data-[state=hidden]:translate-y-full data-[state=hidden]:opacity-0',
                  'sm:static sm:z-auto sm:translate-y-0 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none',
                  'sm:data-[state=hidden]:pointer-events-auto sm:data-[state=hidden]:visible sm:data-[state=hidden]:translate-y-0 sm:data-[state=hidden]:opacity-100',
                )}
                style={{ bottom: 'var(--cookie-banner-h, 0px)' }}
              >
                <div className="mx-auto w-full max-w-2xl">
                  {showRequiredHint && (
                    <p
                      id={REQUIRED_HINT_ID}
                      role="alert"
                      className="mb-2 text-center text-sm font-medium text-destructive sm:text-left"
                    >
                      {requiredHintText(currentQuestion.fieldType)}
                    </p>
                  )}
                  <div className="flex items-center gap-3 sm:justify-between">
                    <Button
                      id="quiz-prev-btn"
                      variant="secondary"
                      onClick={handlePrev}
                      className="h-12 w-12 shrink-0 px-0 sm:w-auto sm:px-5"
                    >
                      <ArrowLeft aria-hidden="true" />
                      <span className="sr-only sm:hidden">
                        {currentIndex > 0 ? 'Pergunta anterior' : 'Voltar à apresentação'}
                      </span>
                      <span className="hidden sm:inline">Anterior</span>
                    </Button>

                    <Button
                      id="quiz-next-btn"
                      data-testid="quiz-next"
                      onClick={handleNext}
                      className="flex-1 sm:min-w-[12rem] sm:flex-none"
                    >
                      {NEXT_LABELS[nextAction]}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </nav>

              {/* Espaço para a barra fixa (e o banner de cookies) não cobrir o fim do conteúdo */}
              <div
                aria-hidden="true"
                className="sm:hidden"
                style={{
                  height: navHeight
                    ? `calc(${navHeight}px + var(--cookie-banner-h, 0px))`
                    : 'calc(4.5rem + env(safe-area-inset-bottom, 0px) + var(--cookie-banner-h, 0px))',
                }}
              />
            </div>
          )}

          {/* ── PERGUNTA INDISPONÍVEL (nunca deixar a tela em branco) ── */}
          {isQuestionMissing && (
            <div
              role="alert"
              data-testid="quiz-question-missing"
              className="rounded-[var(--radius)] border border-border bg-card p-6 text-center shadow-[var(--shadow-sm)] sm:p-8"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <AlertTriangle className="h-6 w-6 text-foreground" aria-hidden="true" />
              </div>
              <h2 className="mb-2 text-xl font-bold text-foreground">
                Não foi possível carregar esta pergunta
              </h2>
              <p className="mx-auto mb-6 max-w-sm text-base text-muted-foreground">
                Suas respostas continuam salvas neste aparelho. Toque em “Tentar novamente” para
                recarregar as perguntas.
              </p>
              <Button
                onClick={handleRetryQuestions}
                loading={isFetchingQuestions}
                className="w-full sm:w-auto"
              >
                {!isFetchingQuestions && <RotateCcw aria-hidden="true" />}
                Tentar novamente
              </Button>
            </div>
          )}

          {/* ── EM BREVE ── */}
          {quizState === 'comingsoon' && (
            <div
              ref={sectionRef}
              tabIndex={-1}
              aria-labelledby="quiz-comingsoon-title"
              className="animate-in fade-in-0 slide-in-from-bottom-4 space-y-4 duration-300 focus:outline-none"
            >
              <div className="rounded-[var(--radius)] border border-border bg-card p-5 text-center shadow-[var(--shadow-sm)] sm:p-8">
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
                  <Mail className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>

                <h2
                  id="quiz-comingsoon-title"
                  className="mb-2 text-2xl font-bold text-foreground [text-wrap:balance]"
                >
                  {comingSoonContent.title}
                </h2>
                <p className="mx-auto mb-6 max-w-sm text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">
                  {comingSoonContent.description}
                </p>

                {notifyDone ? (
                  <div
                    role="status"
                    className="flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--success)/0.08)] px-4 py-3 text-base font-medium text-[hsl(var(--success))]"
                  >
                    <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
                    Pronto! Vamos avisar você quando estiver disponível.
                  </div>
                ) : (
                  <form onSubmit={handleNotifySubmit} className="flex flex-col gap-2 text-left sm:flex-row">
                    <Input
                      id="quiz-notify-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="Seu e-mail"
                      aria-label="Seu e-mail"
                      aria-invalid={notifyFailed || undefined}
                      aria-describedby={notifyFailed ? 'quiz-notify-error' : undefined}
                      className="min-w-0 sm:flex-1"
                    />
                    <Button type="submit" loading={notifyLoading} className="shrink-0">
                      Quero ser avisado(a)
                    </Button>
                  </form>
                )}
                {notifyFailed && !notifyDone && (
                  <p id="quiz-notify-error" role="alert" className="mt-3 text-sm font-medium text-destructive">
                    Não conseguimos salvar seu e-mail agora. Tente novamente mais tarde.
                  </p>
                )}
              </div>

              <Button variant="ghost" onClick={backFromComingSoon} className="mx-auto flex text-muted-foreground">
                <ArrowLeft aria-hidden="true" />
                Voltar e escolher outra opção
              </Button>
            </div>
          )}

          {/* ── CAPTURE ── */}
          {quizState === 'capture' && (
            <div className="space-y-3">
              <Button
                id="quiz-capture-back"
                variant="ghost"
                size="sm"
                onClick={prevQuestion}
                className="-ml-2 text-muted-foreground"
              >
                <ArrowLeft aria-hidden="true" />
                Voltar às perguntas
              </Button>
              <div
                ref={sectionRef}
                tabIndex={-1}
                aria-label="Seus dados para ver o resultado"
                className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-[var(--shadow-sm)] focus:outline-none sm:p-8"
              >
                <div className="mb-6">
                  <QuizProgress
                    label="Perguntas concluídas"
                    percentage={100}
                    segments={themes.map((t) => ({ ...t, answered: t.total }))}
                  />
                </div>
                <QuizCaptureForm onSubmit={submitQuiz} isSubmitting={isSubmitting} />
              </div>
            </div>
          )}

          {/* ── PROCESSING ── */}
          {quizState === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-6 py-20 text-center" role="status">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
              <div>
                <h2 className="mb-2 text-xl font-bold text-foreground">Analisando o seu perfil…</h2>
                <p className="text-base text-muted-foreground">
                  Estamos calculando a sua elegibilidade. Só um momento.
                </p>
              </div>
              {processingThemes.length > 0 && (
                <ul className="flex flex-wrap justify-center gap-2" aria-label="Temas analisados">
                  {processingThemes.map((name) => (
                    <li key={name}>
                      <Badge variant="primary">{name}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

        </div>
      </Container>
    </div>
  )
}
