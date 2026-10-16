// QuizPage.tsx — Quiz Engine — Diagnóstico da Imigração
//
// Mobile primeiro (DI-039): barra fixa na zona do polegar com "Anterior" em
// ícone e "Próximo" largo; ao trocar de pergunta, a tela volta ao topo e o foco
// vai para o título; nas perguntas de escolha única, tocar numa opção avança
// sozinho (só toque/clique/Enter/Espaço — nunca as setas do teclado).
// A barra publica a própria altura em --sticky-cta-h enquanto está na tela, e
// o rodapé compacto reserva esse espaço (um espaçador aqui dobraria o branco
// no fim da página).
//
// Tela "em breve" (DI-037): a lista de espera grava pela RPC anônima (o insert
// direto era barrado pela RLS e o e-mail se perdia) e só confirma depois que o
// servidor respondeu; há um atalho para o diagnóstico de nacionalidade.
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, RotateCcw } from 'lucide-react'
import { useQuiz, type QuizNextAction } from '@/hooks/useQuiz'
import { useQuizQuestions } from '@/hooks/useQuizQuestions'
import { QuizIntro } from '@/components/quiz/QuizIntro'
import { QuizProgress } from '@/components/quiz/QuizProgress'
import { QuizQuestionCard, type QuizAnswerMeta } from '@/components/quiz/QuizQuestion'
import { CAPTURE_TITLE_ID, QuizCaptureForm } from '@/components/quiz/QuizCaptureForm'
import { useKeyboardActivation } from '@/components/quiz/keyboard-activation'
import { Badge, Button, Container, Input } from '@/components/ui'
import { usePublishStickyBarHeight } from '@/components/ui/sticky-bar'
import { Sentry } from '@/lib/sentry'
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
const NOTIFY_ERROR_ID = 'quiz-notify-error'
const EMAIL_SCHEMA = z.string().email()

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
      'Estamos preparando um caminho guiado para quem ainda não sabe por onde começar. Deixe seu e-mail para saber quando ele estiver disponível.',
  },
}

type NotifyStatus = 'idle' | 'sending' | 'done' | 'failed'

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
    backFromCapture,
    backFromComingSoon,
    switchToNationality,
    joinWaitlist,
  } = useQuiz()

  // Mesma query do useQuiz (cache compartilhado): usada só para recarregar.
  const { refetch: refetchQuestions, isFetching: isFetchingQuestions } = useQuizQuestions()

  // "Em breve": lista de espera
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifyStatus, setNotifyStatus] = useState<NotifyStatus>('idle')
  const [notifyFieldError, setNotifyFieldError] = useState<string | null>(null)
  const notifyInputRef = useRef<HTMLInputElement>(null)
  const notifyDoneRef = useRef<HTMLDivElement>(null)

  // "Responda para continuar": só depois de tocar no "Próximo" sem resposta.
  const [requiredHint, setRequiredHint] = useState(false)

  const textFieldFocused = useTextFieldFocused()
  const nextActivation = useKeyboardActivation()
  const navRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLElement>(null)

  const processoTipo = session.answers['processo_tipo'] ?? ''
  const comingSoonContent = COMING_SOON_LABELS[processoTipo] ?? COMING_SOON_LABELS['nao_sei']

  // Outro objetivo = outra lista: a confirmação anterior não vale mais.
  useEffect(() => {
    setNotifyStatus('idle')
    setNotifyFieldError(null)
  }, [processoTipo])

  // O formulário some ao confirmar: o foco vai para a confirmação (e é lida).
  useEffect(() => {
    if (notifyStatus === 'done') notifyDoneRef.current?.focus()
  }, [notifyStatus])

  // Guarda (DI-066): estado de pergunta sem pergunta para mostrar nunca fica em branco.
  const isQuestionMissing = quizState === 'question' && !currentQuestion

  // Altura da barra fixa para o rodapé reservar (0px com o teclado aberto,
  // fora das perguntas e a partir de sm, onde a navegação não é fixa).
  usePublishStickyBarHeight(navRef, quizState === 'question' && Boolean(currentQuestion) && !textFieldFocused)

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
    (value: string, { commit, keyboard }: QuizAnswerMeta) => {
      if (!currentQuestion) return
      // Toque fantasma é coisa de dedo: Enter/Espaço nunca é descartado.
      if (consumeGhostTap() && commit && !keyboard) return
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

  const handleNext = ({ keyboard = false }: { keyboard?: boolean } = {}) => {
    window.clearTimeout(autoAdvanceTimer.current)
    if (consumeGhostTap() && !keyboard) return
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
    if (notifyStatus === 'sending') return
    const email = notifyEmail.trim()
    if (!EMAIL_SCHEMA.safeParse(email).success) {
      setNotifyFieldError(
        email ? 'Confira o e-mail: ele parece incompleto (ex.: nome@email.com).' : 'Informe o seu e-mail.',
      )
      notifyInputRef.current?.focus()
      return
    }
    setNotifyFieldError(null)
    setNotifyStatus('sending')
    // Só confirma depois que o servidor gravou (nada de "Pronto!" sem salvar).
    const saved = await joinWaitlist(email)
    setNotifyStatus(saved ? 'done' : 'failed')
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
                  onSubmit={() => handleNext({ keyboard: true })}
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
                      onPointerDown={nextActivation.onPointerDown}
                      onKeyDown={nextActivation.onKeyDown}
                      onClick={() => handleNext({ keyboard: nextActivation.consumeKeyboard() })}
                      className="flex-1 sm:min-w-[12rem] sm:flex-none"
                    >
                      {NEXT_LABELS[nextAction]}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              </nav>

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
            <section
              ref={sectionRef}
              tabIndex={-1}
              aria-labelledby="quiz-comingsoon-title"
              className="animate-in fade-in-0 slide-in-from-bottom-4 space-y-4 duration-300 focus:outline-none motion-reduce:animate-none"
            >
              <div className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-8">
                <div className="text-center">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
                    <Mail className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <h2 id="quiz-comingsoon-title" className="mb-2 text-h2 text-foreground">
                    {comingSoonContent.title}
                  </h2>
                  <p className="mx-auto mb-6 max-w-sm text-base leading-relaxed text-muted-foreground">
                    {comingSoonContent.description}
                  </p>
                </div>

                {notifyStatus === 'done' ? (
                  <div
                    ref={notifyDoneRef}
                    role="status"
                    tabIndex={-1}
                    data-testid="quiz-notify-done"
                    className="flex items-start justify-center gap-2 rounded-xl focus:outline-none bg-[hsl(var(--success)/0.08)] px-4 py-3 text-left text-base font-medium text-[hsl(var(--success))]"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    Pronto! Seu e-mail foi salvo. Vamos avisar você quando estiver disponível.
                  </div>
                ) : (
                  <form
                    noValidate
                    onSubmit={handleNotifySubmit}
                    aria-label="Lista de espera"
                    className="flex flex-col gap-3 sm:flex-row sm:items-start"
                  >
                    <Input
                      ref={notifyInputRef}
                      id="quiz-notify-email"
                      label="Seu e-mail"
                      hideLabel
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="send"
                      value={notifyEmail}
                      onChange={(e) => {
                        setNotifyEmail(e.target.value)
                        if (notifyFieldError) setNotifyFieldError(null)
                      }}
                      placeholder="nome@email.com"
                      error={notifyFieldError}
                      aria-describedby={notifyStatus === 'failed' ? NOTIFY_ERROR_ID : undefined}
                      containerClassName="min-w-0 sm:flex-1"
                    />
                    <Button
                      type="submit"
                      data-testid="quiz-notify-submit"
                      loading={notifyStatus === 'sending'}
                      className="w-full sm:w-auto sm:shrink-0"
                    >
                      {notifyStatus === 'failed' ? (
                        <>
                          <RotateCcw aria-hidden="true" />
                          Tentar de novo
                        </>
                      ) : (
                        'Quero ser avisado(a)'
                      )}
                    </Button>
                  </form>
                )}
                {notifyStatus === 'failed' && (
                  <p id={NOTIFY_ERROR_ID} role="alert" className="mt-3 text-sm font-medium text-destructive">
                    Não conseguimos salvar seu e-mail agora. Confira a conexão e toque em “Tentar de novo”.
                  </p>
                )}
              </div>

              {/* Atalho: o diagnóstico que já existe (DI-037) */}
              <div className="rounded-[var(--radius)] border border-border bg-muted p-5 sm:p-6">
                <h3 className="text-h3 font-semibold text-foreground">
                  O diagnóstico de nacionalidade portuguesa já está disponível
                </h3>
                <p className="mt-1 text-base text-muted-foreground">
                  É gratuito e leva cerca de 5 minutos.
                </p>
                <Button
                  variant="outline"
                  data-testid="quiz-crosssell-nationality"
                  onClick={switchToNationality}
                  className="mt-4 w-full sm:w-auto"
                >
                  Verificar se tenho direito à nacionalidade
                  <ArrowRight aria-hidden="true" />
                </Button>
              </div>

              <Button variant="ghost" onClick={backFromComingSoon} className="mx-auto flex text-muted-foreground">
                <ArrowLeft aria-hidden="true" />
                Voltar e escolher outra opção
              </Button>
            </section>
          )}

          {/* ── CAPTURE ── */}
          {quizState === 'capture' && (
            <div className="space-y-3">
              <Button
                id="quiz-capture-back"
                variant="ghost"
                size="sm"
                onClick={backFromCapture}
                className="-ml-2 text-muted-foreground"
              >
                <ArrowLeft aria-hidden="true" />
                Voltar às perguntas
              </Button>
              <section
                ref={sectionRef}
                tabIndex={-1}
                aria-labelledby={CAPTURE_TITLE_ID}
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
              </section>
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
