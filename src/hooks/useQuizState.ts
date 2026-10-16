// useQuizState.ts — máquina de estados da tela do quiz (intro → perguntas →
// captura → processamento → resultado, e "em breve"). Testes: useQuizState.test.ts.
import { useReducer } from 'react'
import type { QuizStep } from '@/lib/quiz-flow'
import type { QuizResult } from './useQuiz'

export type QuizFlowState = 'intro' | 'question' | 'capture' | 'processing' | 'results' | 'comingsoon'

export interface QuizMachineState {
  quizState: QuizFlowState
  currentIndex: number
  animationDirection: 'forward' | 'backward'
  result: QuizResult | null
  isSubmitting: boolean
}

/** Etapas em que a retomada pode deixar a pessoa. */
export type ResumeStep = Extract<QuizStep, { kind: 'question' } | { kind: 'capture' }>

export type QuizAction =
  | { type: 'START' }
  /** "Continuar" no card de retomada (DI-041). */
  | { type: 'RESUME'; step: ResumeStep }
  /**
   * Ir para uma etapa: "Próximo"/"Anterior" (destino calculado pelo useQuiz) ou
   * ?passo= da URL (voltar/avançar do sistema), já ajustada por clampStep.
   */
  | { type: 'GO_TO_STEP'; step: QuizStep }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS'; payload: QuizResult }
  | { type: 'SUBMIT_ERROR' }
  | { type: 'RESET' }

export const initialQuizState: QuizMachineState = {
  quizState: 'intro',
  currentIndex: 0,
  animationDirection: 'forward',
  result: null,
  isSubmitting: false,
}

function stepRank(state: QuizMachineState): number {
  switch (state.quizState) {
    case 'intro':
      return -1
    case 'question':
      return state.currentIndex
    default:
      return Number.MAX_SAFE_INTEGER
  }
}

export function quizReducer(state: QuizMachineState, action: QuizAction): QuizMachineState {
  switch (action.type) {
    case 'START':
      return { ...state, quizState: 'question', currentIndex: 0, animationDirection: 'forward' }
    case 'RESUME':
      if (state.isSubmitting) return state
      return action.step.kind === 'capture'
        ? { ...state, quizState: 'capture', animationDirection: 'forward' }
        : { ...state, quizState: 'question', currentIndex: Math.max(0, action.step.index), animationDirection: 'forward' }
    case 'GO_TO_STEP': {
      // Durante o envio a etapa não muda (o voltar do sistema não interrompe o processamento).
      if (state.isSubmitting || state.quizState === 'processing' || state.quizState === 'results') return state
      const step = action.step
      switch (step.kind) {
        case 'intro':
          return { ...state, quizState: 'intro', currentIndex: 0, animationDirection: 'backward' }
        case 'capture':
          return { ...state, quizState: 'capture', animationDirection: 'forward' }
        case 'comingsoon':
          return { ...state, quizState: 'comingsoon', animationDirection: 'forward' }
        case 'question': {
          const index = Math.max(0, step.index)
          return {
            ...state,
            quizState: 'question',
            currentIndex: index,
            animationDirection: index < stepRank(state) ? 'backward' : 'forward',
          }
        }
        default:
          return state
      }
    }
    case 'SUBMIT_START':
      if (state.isSubmitting) return state
      return { ...state, quizState: 'processing', isSubmitting: true }
    case 'SUBMIT_SUCCESS':
      return { ...state, quizState: 'results', isSubmitting: false, result: action.payload }
    case 'SUBMIT_ERROR':
      return { ...state, quizState: 'capture', isSubmitting: false }
    case 'RESET':
      return initialQuizState
    default:
      return state
  }
}

export function useQuizState() {
  const [state, dispatch] = useReducer(quizReducer, initialQuizState)
  return { state, dispatch }
}
