// useQuiz.ts — State machine for the quiz flow
// Refactored to use modular hooks for State and Persistence
import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getVisibleQuestions,
  computeScore,
  suggestVisas,
  type ScoreResult,
  type VisaSuggestion,
} from '@/data/quiz-questions'
import { persistAssessment } from '@/hooks/useAssessment'
import { useQuizPersistence, type QuizSession } from './useQuizPersistence'
import { useQuizState, type QuizFlowState } from './useQuizState'
import { useQuizQuestions } from './useQuizQuestions'

export type QuizState = QuizFlowState
export type { QuizSession }

export interface QuizResult {
  score: ScoreResult
  visas: VisaSuggestion[]
  leadInfo: LeadInfo | null
}

export interface LeadInfo {
  fullName: string
  email: string
  phone?: string
}

export function useQuiz() {
  const navigate = useNavigate()

  // 0. Questions source — Supabase with hardcoded fallback
  const { data: allQuestions = [] } = useQuizQuestions()

  // 1. Persistence Hook
  const { session, updateAnswers, resetSession } = useQuizPersistence()

  // 2. State Machine Hook
  const { state, dispatch } = useQuizState()
  const { quizState, currentIndex, animationDirection, result, isSubmitting } = state

  // Derive visible questions based on current answers
  const visibleQuestions = useMemo(
    () => getVisibleQuestions(session.answers, allQuestions),
    [session.answers, allQuestions],
  )

  const currentQuestion = visibleQuestions[currentIndex] ?? null
  const totalQuestions = visibleQuestions.length
  const questionsAnswered = Object.keys(session.answers).filter((k) =>
    allQuestions.some((q) => q.key === k),
  ).length

  // Theme progress
  const themeProgress = useMemo(() => {
    const themes = [...new Set(visibleQuestions.map((q) => q.themeCode))]
    const currentTheme = currentQuestion?.themeCode
    const currentThemeIndex = currentTheme ? themes.indexOf(currentTheme) : -1
    return { themes, currentThemeIndex, totalThemes: themes.length }
  }, [visibleQuestions, currentQuestion])

  // Answer the current question
  const answerQuestion = useCallback((questionKey: string, value: string) => {
    updateAnswers(questionKey, value)
  }, [updateAnswers])

  // Move to next question
  const nextQuestion = useCallback(() => {
    dispatch({ type: 'NEXT_QUESTION', totalVisible: visibleQuestions.length })
  }, [dispatch, visibleQuestions.length])

  // Move to previous question
  const prevQuestion = useCallback(() => {
    dispatch({ type: 'PREV_QUESTION' })
  }, [dispatch])

  // Start the quiz
  const startQuiz = useCallback(() => {
    dispatch({ type: 'START' })
  }, [dispatch])

  // Submit with lead info — compute result and persist
  const submitQuiz = useCallback(
    async (leadInfo: LeadInfo) => {
      dispatch({ type: 'SUBMIT_START' })

      try {
        const score = computeScore(session.answers, allQuestions)
        const visas = suggestVisas(session.answers)

        const quizResult: QuizResult = {
          score,
          visas,
          leadInfo,
        }

        // Persist to Supabase (fails gracefully)
        let assessmentId: string | null = null
        try {
          const urlParams = new URLSearchParams(window.location.search)
          const { assessment } = await persistAssessment({
            sessionId: session.sessionId,
            answers: session.answers,
            fullName: leadInfo.fullName,
            email: leadInfo.email,
            phone: leadInfo.phone,
            questionsAnswered: Object.keys(session.answers).length,
            totalQuestions: visibleQuestions.length,
            utmSource: urlParams.get('utm_source'),
            utmMedium: urlParams.get('utm_medium'),
            utmCampaign: urlParams.get('utm_campaign'),
          })
          if (assessment) {
            assessmentId = assessment.id
          }
        } catch (dbErr) {
          console.warn('[useQuiz] Supabase persist failed, continuing with localStorage:', dbErr)
        }

        // Store result in localStorage
        try {
          localStorage.setItem(
            'dr_imigrante_quiz_result',
            JSON.stringify({
              sessionId: session.sessionId,
              assessmentId,
              answers: session.answers,
              score: {
                total: score.total,
                max: score.max,
                percentage: score.percentage,
                category: score.category,
              },
              visas,
              leadInfo,
              completedAt: new Date().toISOString(),
            }),
          )
        } catch {}

        // Simulate brief processing delay (AI feel)
        await new Promise((r) => setTimeout(r, 2000))

        dispatch({ type: 'SUBMIT_SUCCESS', payload: quizResult })
        navigate('/results', { state: { result: quizResult, assessmentId } })
      } catch (err) {
        dispatch({ type: 'SUBMIT_ERROR' })
      }
    },
    [session, navigate, visibleQuestions.length, dispatch, allQuestions],
  )

  // Reset quiz
  const resetQuiz = useCallback(() => {
    resetSession()
    dispatch({ type: 'RESET' })
  }, [resetSession, dispatch])

  const currentAnswer = currentQuestion ? session.answers[currentQuestion.key] ?? '' : ''
  const canProceed = !currentQuestion?.isRequired || currentAnswer !== ''
  const progressPercentage = totalQuestions > 0 ? Math.round((currentIndex / totalQuestions) * 100) : 0

  return {
    // State
    quizState,
    session,
    currentQuestion,
    currentIndex,
    currentAnswer,
    totalQuestions,
    questionsAnswered,
    progressPercentage,
    themeProgress,
    result,
    isSubmitting,
    canProceed,
    animationDirection,

    // Actions
    startQuiz,
    answerQuestion,
    nextQuestion,
    prevQuestion,
    submitQuiz,
    resetQuiz,
  }
}
