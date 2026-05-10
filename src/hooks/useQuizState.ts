import { useReducer } from 'react'
import type { QuizResult } from './useQuiz'

export type QuizFlowState = 'intro' | 'question' | 'capture' | 'processing' | 'results'

interface State {
  quizState: QuizFlowState
  currentIndex: number
  animationDirection: 'forward' | 'backward'
  result: QuizResult | null
  isSubmitting: boolean
}

type Action =
  | { type: 'START' }
  | { type: 'NEXT_QUESTION'; totalVisible: number }
  | { type: 'PREV_QUESTION' }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; payload: QuizResult }
  | { type: 'SUBMIT_ERROR' }
  | { type: 'RESET' }

const initialState: State = {
  quizState: 'intro',
  currentIndex: 0,
  animationDirection: 'forward',
  result: null,
  isSubmitting: false,
}

function quizReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':
      return { ...state, quizState: 'question', currentIndex: 0, animationDirection: 'forward' }
    case 'NEXT_QUESTION':
      if (state.currentIndex < action.totalVisible - 1) {
        return { ...state, currentIndex: state.currentIndex + 1, animationDirection: 'forward' }
      }
      return { ...state, quizState: 'capture' }
    case 'PREV_QUESTION':
      if (state.currentIndex > 0) {
        return { ...state, currentIndex: state.currentIndex - 1, animationDirection: 'backward' }
      }
      return { ...state, quizState: 'intro' }
    case 'SUBMIT_START':
      return { ...state, quizState: 'processing', isSubmitting: true }
    case 'SUBMIT_SUCCESS':
      return { ...state, quizState: 'results', isSubmitting: false, result: action.payload }
    case 'SUBMIT_ERROR':
      return { ...state, quizState: 'capture', isSubmitting: false }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export function useQuizState() {
  const [state, dispatch] = useReducer(quizReducer, initialState)
  return { state, dispatch }
}
