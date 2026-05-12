// QuizPage.tsx — Quiz Engine — Diagnóstico da Imigração
import { useState } from 'react'
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react'
import { useQuiz } from '@/hooks/useQuiz'
import { QuizIntro } from '@/components/quiz/QuizIntro'
import { QuizProgress } from '@/components/quiz/QuizProgress'
import { QuizQuestionCard } from '@/components/quiz/QuizQuestion'
import { QuizCaptureForm } from '@/components/quiz/QuizCaptureForm'
import { supabase } from '@/lib/supabase'

const COMING_SOON_LABELS: Record<string, { title: string; description: string }> = {
  visto: {
    title: 'Diagnóstico de Vistos — Em Breve',
    description:
      'Estamos a preparar o diagnóstico completo para vistos de residência, trabalho e nómadas digitais. Em breve estará disponível.',
  },
  regularizacao: {
    title: 'Diagnóstico de Regularização — Em Breve',
    description:
      'O módulo de regularização de situação junto da AIMA estará disponível em breve. Enquanto isso, um dos nossos advogados pode orientá-lo(a) diretamente.',
  },
  nao_sei: {
    title: 'Orientação Personalizada — Em Breve',
    description:
      'Estamos a preparar uma jornada guiada para quem ainda não sabe por onde começar. Por enquanto, podemos conectá-lo(a) com um advogado especializado que irá orientá-lo(a).',
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

  // Coming soon — email capture state
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifyDone, setNotifyDone] = useState(false)

  const comingSoonContent =
    COMING_SOON_LABELS[session.answers['processo_tipo'] ?? ''] ??
    COMING_SOON_LABELS['nao_sei']

  const handleNotifySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notifyEmail.trim() || notifyLoading) return
    setNotifyLoading(true)
    try {
      // Save as an assessment with status 'waiting_list' for this pathway
      // Save as incomplete assessment so admin can see waitlist leads
      await supabase.from('assessments').insert({
        email: notifyEmail.trim(),
        status: 'incomplete',
        answers: { processo_tipo: session.answers['processo_tipo'] ?? 'nao_sei', waitlist: true },
        questions_answered: 1,
        total_questions: 1,
        completion_percentage: 0,
      })
    } catch {
      // fail silently — lead capture is best-effort
    } finally {
      setNotifyLoading(false)
      setNotifyDone(true)
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-brand-50/40 to-white">
      <div className="container py-8 sm:py-12">
        <div className="mx-auto max-w-2xl">

          {/* ── INTRO ── */}
          {quizState === 'intro' && <QuizIntro onStart={startQuiz} />}

          {/* ── QUESTIONS ── */}
          {quizState === 'question' && currentQuestion && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
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
                  onClick={prevQuestion}
                  className="rounded-xl border-2 border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Anterior
                </button>

                <button
                  id="quiz-next-btn"
                  onClick={() => { if (canProceed) nextQuestion() }}
                  disabled={!canProceed}
                  className="flex-1 rounded-xl bg-brand-700 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-8"
                >
                  {currentIndex === totalQuestions - 1 ? 'Concluir Diagnóstico' : 'Próximo'}
                </button>
              </div>

              {!currentQuestion.isRequired && (
                <p className="text-center text-xs text-gray-400">
                  Esta pergunta é opcional.{' '}
                  <button
                    className="text-brand-600 underline hover:no-underline"
                    onClick={nextQuestion}
                  >
                    Saltar
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ── EM BREVE ── */}
          {quizState === 'comingsoon' && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-400 space-y-6">
              <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm text-center">
                <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
                  <Mail className="h-6 w-6 text-brand-600" />
                </div>

                <h2 className="mb-2 text-2xl font-extrabold text-gray-900">
                  {comingSoonContent.title}
                </h2>
                <p className="mb-8 text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                  {comingSoonContent.description}
                </p>

                <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-left mb-6">
                  <p className="mb-3 text-sm font-semibold text-gray-700">
                    Entretanto, podemos:
                  </p>
                  <ul className="space-y-2 text-sm text-gray-600">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-bold">1</span>
                      Notificá-lo(a) assim que este módulo estiver disponível
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-bold">2</span>
                      Conectá-lo(a) com um advogado especializado em imigração para Portugal
                    </li>
                  </ul>
                </div>

                {/* Email capture */}
                {notifyDone ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    Guardado! Avisaremos assim que estiver disponível.
                  </div>
                ) : (
                  <form onSubmit={handleNotifySubmit} className="flex gap-2">
                    <input
                      type="email"
                      required
                      value={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.value)}
                      placeholder="O seu e-mail"
                      className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm text-gray-700 focus:border-brand-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={notifyLoading}
                      className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 transition whitespace-nowrap disabled:opacity-60"
                    >
                      {notifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Quero ser notificado(a)'}
                    </button>
                  </form>
                )}
              </div>

              <button
                onClick={backFromComingSoon}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition mx-auto"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar e escolher outra opção
              </button>
            </div>
          )}

          {/* ── CAPTURE ── */}
          {quizState === 'capture' && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
              <QuizCaptureForm onSubmit={submitQuiz} isSubmitting={isSubmitting} />
            </div>
          )}

          {/* ── PROCESSING ── */}
          {quizState === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-6 py-24 text-center">
              <div className="relative">
                <div className="h-20 w-20 rounded-full bg-brand-100">
                  <Loader2 className="absolute inset-0 m-auto h-10 w-10 animate-spin text-brand-600" />
                </div>
                <div className="absolute -inset-2 animate-ping rounded-full bg-brand-200 opacity-30" />
              </div>
              <div>
                <h2 className="mb-2 text-xl font-bold text-gray-900">
                  A analisar o seu perfil...
                </h2>
                <p className="text-sm text-gray-500">
                  A nossa IA está a calcular a sua elegibilidade. Um momento.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {['Descendência', 'Matrimônio', 'Residência', 'Documentação'].map((step, i) => (
                  <div
                    key={step}
                    className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700"
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
