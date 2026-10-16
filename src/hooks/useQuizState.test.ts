/**
 * DI-041 — reducer do quiz: retomada (RESUME), recomeço (RESET) e etapas
 * vindas da URL (GO_TO_STEP, voltar/avançar do sistema).
 */
import { describe, expect, it } from 'vitest'
import { initialQuizState, quizReducer, type QuizMachineState } from './useQuizState'
import type { QuizResult } from './useQuiz'

const atQuestion = (index: number, extra: Partial<QuizMachineState> = {}): QuizMachineState => ({
  ...initialQuizState,
  quizState: 'question',
  currentIndex: index,
  ...extra,
})

const RESULT: QuizResult = {
  score: {
    total: 10,
    max: 20,
    percentage: 50,
    category: 'media',
    label: 'Média',
    sublabel: '',
    color: '',
    bgColor: '',
    emoji: '',
  },
  visas: [],
  leadInfo: { fullName: 'Ana', email: 'ana@example.com' },
}

describe('quizReducer — RESUME', () => {
  it('"Continuar" leva à pergunta onde a pessoa parou', () => {
    const next = quizReducer(initialQuizState, { type: 'RESUME', step: { kind: 'question', index: 4 } })
    expect(next).toMatchObject({ quizState: 'question', currentIndex: 4, animationDirection: 'forward' })
  })

  it('retoma na captura', () => {
    const next = quizReducer(initialQuizState, { type: 'RESUME', step: { kind: 'capture' } })
    expect(next.quizState).toBe('capture')
  })

  it('índice negativo vira a primeira pergunta', () => {
    const next = quizReducer(initialQuizState, { type: 'RESUME', step: { kind: 'question', index: -3 } })
    expect(next.currentIndex).toBe(0)
  })

  it('não interrompe um envio em andamento', () => {
    const submitting = quizReducer(atQuestion(3), { type: 'SUBMIT_START' })
    expect(quizReducer(submitting, { type: 'RESUME', step: { kind: 'question', index: 1 } })).toBe(submitting)
  })
})

describe('quizReducer — RESET e START', () => {
  it('RESET volta ao estado inicial (intro, sem resultado)', () => {
    const done = quizReducer(quizReducer(atQuestion(5), { type: 'SUBMIT_START' }), {
      type: 'SUBMIT_SUCCESS',
      payload: RESULT,
    })
    expect(done).toMatchObject({ quizState: 'results', result: RESULT, isSubmitting: false })
    expect(quizReducer(done, { type: 'RESET' })).toEqual(initialQuizState)
  })

  it('START sempre começa na primeira pergunta', () => {
    expect(quizReducer(atQuestion(7), { type: 'START' })).toMatchObject({ quizState: 'question', currentIndex: 0 })
  })
})

describe('quizReducer — GO_TO_STEP (?passo=)', () => {
  it('voltar do sistema na pergunta 3 mostra a 2, com animação para trás', () => {
    const next = quizReducer(atQuestion(2), { type: 'GO_TO_STEP', step: { kind: 'question', index: 1 } })
    expect(next).toMatchObject({ quizState: 'question', currentIndex: 1, animationDirection: 'backward' })
  })

  it('avançar do sistema anima para frente', () => {
    const next = quizReducer(atQuestion(1), { type: 'GO_TO_STEP', step: { kind: 'question', index: 2 } })
    expect(next.animationDirection).toBe('forward')
  })

  it('da captura para a última pergunta anima para trás', () => {
    const capture: QuizMachineState = { ...initialQuizState, quizState: 'capture', currentIndex: 4 }
    const next = quizReducer(capture, { type: 'GO_TO_STEP', step: { kind: 'question', index: 4 } })
    expect(next).toMatchObject({ quizState: 'question', currentIndex: 4, animationDirection: 'backward' })
  })

  it('intro, captura e "em breve"', () => {
    expect(quizReducer(atQuestion(0), { type: 'GO_TO_STEP', step: { kind: 'intro' } }).quizState).toBe('intro')
    expect(quizReducer(atQuestion(4), { type: 'GO_TO_STEP', step: { kind: 'capture' } }).quizState).toBe('capture')
    expect(quizReducer(atQuestion(0), { type: 'GO_TO_STEP', step: { kind: 'comingsoon' } }).quizState).toBe(
      'comingsoon',
    )
  })

  it('é ignorado durante o processamento e depois do resultado', () => {
    const processing = quizReducer(atQuestion(3), { type: 'SUBMIT_START' })
    expect(quizReducer(processing, { type: 'GO_TO_STEP', step: { kind: 'question', index: 1 } })).toBe(processing)
    const results = quizReducer(processing, { type: 'SUBMIT_SUCCESS', payload: RESULT })
    expect(quizReducer(results, { type: 'GO_TO_STEP', step: { kind: 'intro' } })).toBe(results)
  })
})

describe('quizReducer — envio', () => {
  it('SUBMIT_START é idempotente e SUBMIT_ERROR devolve a captura', () => {
    const started = quizReducer({ ...initialQuizState, quizState: 'capture' }, { type: 'SUBMIT_START' })
    expect(started).toMatchObject({ quizState: 'processing', isSubmitting: true })
    expect(quizReducer(started, { type: 'SUBMIT_START' })).toBe(started)
    expect(quizReducer(started, { type: 'SUBMIT_ERROR' })).toMatchObject({ quizState: 'capture', isSubmitting: false })
  })
})
