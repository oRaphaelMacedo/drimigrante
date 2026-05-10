// QuizPage.tsx — Day 2: Quiz Engine I
// Full multi-step quiz UI with state machine
import { Loader2 } from 'lucide-react'
import { useQuiz } from '@/hooks/useQuiz'
import { QuizIntro } from '@/components/quiz/QuizIntro'
import { QuizProgress } from '@/components/quiz/QuizProgress'
import { QuizQuestionCard } from '@/components/quiz/QuizQuestion'
import { QuizCaptureForm } from '@/components/quiz/QuizCaptureForm'

export function QuizPage() {
  const {
    quizState,
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
  } = useQuiz()

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-brand-50/40 to-white">
      <div className="container py-8 sm:py-12">
        <div className="mx-auto max-w-2xl">

          {/* ── INTRO ── */}
          {quizState === 'intro' && <QuizIntro onStart={startQuiz} />}

          {/* ── QUESTIONS ── */}
          {quizState === 'question' && currentQuestion && (
            <div className="space-y-6">
              {/* Card */}
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
                {/* Progress */}
                <div className="mb-8">
                  <QuizProgress
                    currentThemeCode={currentQuestion.themeCode}
                    progressPercentage={progressPercentage}
                    currentIndex={currentIndex}
                    totalQuestions={totalQuestions}
                  />
                </div>

                {/* Question */}
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
                  ← Anterior
                </button>

                <button
                  id="quiz-next-btn"
                  onClick={() => {
                    if (canProceed) nextQuestion()
                  }}
                  disabled={!canProceed}
                  className="flex-1 rounded-xl bg-brand-700 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-8"
                >
                  {currentIndex === totalQuestions - 1 ? 'Concluir Quiz →' : 'Próximo →'}
                </button>
              </div>

              {/* Skip note for optional conditional questions */}
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
                  A calcular o seu perfil...
                </h2>
                <p className="text-sm text-gray-500">
                  A nossa IA está a analisar as suas respostas. Um momento.
                </p>
              </div>
              <div className="flex gap-2">
                {['Perfil Pessoal', 'Finanças', 'Família', 'Qualificações'].map((step, i) => (
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
