// QuizPage.tsx — Quiz Engine — Diagnóstico da Imigração
import { useEffect, useState } from 'react'
import { Loader2, ArrowLeft, Mail, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react'
import { useQuiz } from '@/hooks/useQuiz'
import { useQuizQuestions } from '@/hooks/useQuizQuestions'
import { QuizIntro } from '@/components/quiz/QuizIntro'
import { QuizProgress } from '@/components/quiz/QuizProgress'
import { QuizQuestionCard } from '@/components/quiz/QuizQuestion'
import { QuizCaptureForm } from '@/components/quiz/QuizCaptureForm'
import { supabase } from '@/lib/supabase'
import { Sentry } from '@/lib/sentry'
import { track } from '@/lib/analytics'

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

export function QuizPage() {
  const {
    quizState,
    session,
    currentQuestion,
    currentIndex,
    currentAnswer,
    totalQuestions,
    progressPercentage,
    isSubmitting,
    canProceed,
    animationDirection,
    startQuiz,
    answerQuestion,
    nextQuestion,
    prevQuestion,
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

  const comingSoonContent =
    COMING_SOON_LABELS[session.answers['processo_tipo'] ?? ''] ??
    COMING_SOON_LABELS['nao_sei']

  // Guarda (DI-066): estado de pergunta sem pergunta para mostrar nunca fica em branco.
  const isQuestionMissing = quizState === 'question' && !currentQuestion

  // No celular o "Próximo" fica no fim da página; sem isto a pergunta seguinte
  // (às vezes mais curta) abre rolada para o rodapé e a tela parece vazia.
  const currentQuestionKey = currentQuestion?.key
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [currentQuestionKey, quizState])

  useEffect(() => {
    if (!isQuestionMissing) return
    Sentry.captureMessage('quiz: estado question sem pergunta visível', {
      level: 'warning',
      tags: { area: 'quiz' },
      extra: { currentIndex, totalQuestions },
    })
  }, [isQuestionMissing, currentIndex, totalQuestions])

  const handleRetryQuestions = async () => {
    await refetchQuestions()
    // Volta para a primeira pergunta; as respostas já dadas continuam marcadas.
    startQuiz()
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
    } catch {
      // Não confirmar um cadastro que não foi salvo.
      setNotifyFailed(true)
    } finally {
      setNotifyLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100dvh-64px)] bg-background">
      <div className="container py-6 sm:py-12">
        <div className="mx-auto max-w-2xl">

          {/* ── INTRO ── */}
          {quizState === 'intro' && (
            <QuizIntro
              onStart={() => {
                track('quiz_started')
                startQuiz()
              }}
            />
          )}

          {/* ── QUESTIONS ── */}
          {quizState === 'question' && currentQuestion && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
                <div className="mb-8">
                  <QuizProgress
                    currentThemeCode={currentQuestion.themeCode}
                    progressPercentage={progressPercentage}
                    currentIndex={currentIndex}
                    totalQuestions={totalQuestions}
                  />
                </div>

                <QuizQuestionCard
                  question={currentQuestion}
                  answer={currentAnswer}
                  onChange={(value) => answerQuestion(currentQuestion.key, value)}
                  animationDirection={animationDirection}
                />
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-3">
                <button
                  id="quiz-prev-btn"
                  type="button"
                  onClick={prevQuestion}
                  className="h-12 rounded-xl border-2 border-border bg-card px-5 text-base font-medium text-foreground transition hover:bg-muted"
                >
                  Anterior
                </button>

                <button
                  id="quiz-next-btn"
                  type="button"
                  data-testid="quiz-next"
                  onClick={() => { if (canProceed) nextQuestion() }}
                  disabled={!canProceed}
                  className="h-12 flex-1 rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-sm transition-colors hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-8"
                >
                  {currentIndex === totalQuestions - 1 ? 'Concluir diagnóstico' : 'Próximo'}
                </button>
              </div>

              {!currentQuestion.isRequired && (
                <p className="text-center text-sm text-muted-foreground">
                  Esta pergunta é opcional.{' '}
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center px-1 font-medium text-primary underline hover:no-underline"
                    onClick={nextQuestion}
                  >
                    Pular
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ── PERGUNTA INDISPONÍVEL (nunca deixar a tela em branco) ── */}
          {isQuestionMissing && (
            <div
              role="alert"
              data-testid="quiz-question-missing"
              className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8"
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
              <button
                type="button"
                onClick={handleRetryQuestions}
                disabled={isFetchingQuestions}
                aria-busy={isFetchingQuestions}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-bold text-primary-foreground transition-colors hover:bg-brand-800 disabled:opacity-60 sm:w-auto"
              >
                {isFetchingQuestions ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                )}
                Tentar novamente
              </button>
            </div>
          )}

          {/* ── EM BREVE ── */}
          {quizState === 'comingsoon' && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-400 space-y-6">
              <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                  <Mail className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>

                <h2 className="mb-2 text-2xl font-extrabold text-foreground">
                  {comingSoonContent.title}
                </h2>
                <p className="mx-auto mb-6 max-w-sm text-base leading-relaxed text-muted-foreground">
                  {comingSoonContent.description}
                </p>

                {/* Email capture */}
                {notifyDone ? (
                  <div
                    role="status"
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-base font-medium text-emerald-800"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Pronto! Vamos avisar você quando estiver disponível.
                  </div>
                ) : (
                  <form onSubmit={handleNotifySubmit} className="flex flex-col gap-2 sm:flex-row">
                    <label htmlFor="quiz-notify-email" className="sr-only">
                      Seu e-mail
                    </label>
                    <input
                      id="quiz-notify-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="Seu e-mail"
                      aria-invalid={notifyFailed || undefined}
                      aria-describedby={notifyFailed ? 'quiz-notify-error' : undefined}
                      className="h-12 w-full min-w-0 rounded-xl border-2 border-input bg-card px-4 text-base text-foreground focus:border-primary focus:outline-none sm:flex-1"
                    />
                    <button
                      type="submit"
                      disabled={notifyLoading}
                      aria-busy={notifyLoading}
                      className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground transition-colors hover:bg-brand-800 disabled:opacity-60"
                    >
                      {notifyLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Quero ser avisado(a)'}
                    </button>
                  </form>
                )}
                {notifyFailed && !notifyDone && (
                  <p id="quiz-notify-error" role="alert" className="mt-3 text-sm font-medium text-red-700">
                    Não conseguimos salvar seu e-mail agora. Tente novamente mais tarde.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={backFromComingSoon}
                className="mx-auto flex min-h-[44px] items-center gap-1.5 px-2 text-base text-muted-foreground transition hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar e escolher outra opção
              </button>
            </div>
          )}

          {/* ── CAPTURE ── */}
          {quizState === 'capture' && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
              <QuizCaptureForm onSubmit={submitQuiz} isSubmitting={isSubmitting} />
            </div>
          )}

          {/* ── PROCESSING ── */}
          {quizState === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-6 py-24 text-center" role="status">
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-brand-100">
                  <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-primary" aria-hidden="true" />
                </div>
                <div className="absolute -inset-2 animate-ping rounded-full bg-brand-200 opacity-30 motion-reduce:hidden" />
              </div>
              <div>
                <h2 className="mb-2 text-xl font-bold text-foreground">
                  Analisando o seu perfil…
                </h2>
                <p className="text-base text-muted-foreground">
                  Estamos calculando a sua elegibilidade. Só um momento.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {['Descendência', 'Matrimônio', 'Residência', 'Documentação'].map((step, i) => (
                  <div
                    key={step}
                    className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-800"
                    style={{ animationDelay: `${i * 200}ms` }}
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
