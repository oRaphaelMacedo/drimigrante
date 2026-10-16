// @vitest-environment jsdom
/**
 * useQuiz de ponta a ponta, com rede mockada (nenhuma chamada real ao Supabase,
 * às edge functions ou ao analytics):
 *  - DI-041: retomada, ?passo= com voltar do sistema, sessão nova depois do envio,
 *    "Refazer" com session_id novo, 42501 → session_id novo e nova tentativa;
 *  - DI-040: nada de total nem de "Ver meu resultado" na primeira pergunta;
 *  - DI-042: só respostas visíveis no envio, functions lentas não seguram o
 *    resultado além de ~9s, análise de IA sem await;
 *  - DI-068: eventos por etapa uma vez por pergunta.
 */
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QUIZ_QUESTIONS, getVisibleQuestions } from '@/data/quiz-questions'
import { QUIZ_RESULT_KEY } from '@/lib/quiz-submission'

const mocks = vi.hoisted(() => ({
  persistAssessment: vi.fn(),
  invoke: vi.fn(),
  track: vi.fn(),
  trackOnce: vi.fn(() => true),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('@/hooks/useAssessment', () => ({ persistAssessment: mocks.persistAssessment }))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }))
vi.mock('@/lib/analytics', () => ({ track: mocks.track, trackOnce: mocks.trackOnce }))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: mocks.captureException, captureMessage: mocks.captureMessage },
}))
vi.mock('@/lib/attribution', () => ({ getAttribution: () => ({ utm_source: 'teste' }) }))
vi.mock('@/hooks/useQuizQuestions', async () => {
  const { QUIZ_QUESTIONS: questions } = await import('@/data/quiz-questions')
  return { useQuizQuestions: () => ({ data: questions, refetch: vi.fn(), isFetching: false }) }
})

import { useQuiz } from './useQuiz'
import { QUIZ_SESSION_KEY, readStoredQuizSession } from './useQuizPersistence'

type QuizApi = ReturnType<typeof useQuiz>

let api: QuizApi
let resultsState: unknown = null

function QuizHarness() {
  api = useQuiz()
  return null
}

function ResultsProbe() {
  resultsState = useLocation().state
  return null
}

function renderQuiz(initialEntry = '/quiz') {
  const router = createMemoryRouter(
    [
      { path: '/quiz', element: <QuizHarness /> },
      { path: '/results', element: <ResultsProbe /> },
    ],
    { initialEntries: [initialEntry] },
  )
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

const search = (router: ReturnType<typeof renderQuiz>['router']) => router.state.location.search
const pathname = (router: ReturnType<typeof renderQuiz>['router']) => router.state.location.pathname

/** Responde e avança como a pessoa faria (escolhe e toca em "Próximo"). */
function answerAndNext(key: string, value: string) {
  act(() => api.answerQuestion(key, value))
  expect(api.currentQuestion?.key).toBe(key)
  act(() => {
    api.nextQuestion()
  })
}

const LEAD = { fullName: 'Ana Teste', email: 'ana@example.com' }
const okPersist = (id: string) => ({ assessment: { id }, error: null })

function storedResult(): Record<string, unknown> | null {
  const raw = localStorage.getItem(QUIZ_RESULT_KEY)
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

function trackedNames(): string[] {
  return mocks.track.mock.calls.map((call) => call[0] as string)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resultsState = null
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  mocks.persistAssessment.mockReset()
  mocks.invoke.mockReset().mockResolvedValue({ data: {}, error: null })
  mocks.track.mockReset()
  mocks.trackOnce.mockReset().mockReturnValue(true)
  mocks.captureException.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('progresso honesto (DI-040)', () => {
  it('primeira pergunta: sem total, sem porcentagem e sem "Ver meu resultado"', () => {
    renderQuiz()
    act(() => api.startQuiz())
    expect(api.currentQuestion?.key).toBe('processo_tipo')
    expect(api.progress.total).toBeNull()
    expect(api.progress.percentage).toBeNull()
    expect(api.nextAction).toBe('next')

    act(() => api.answerQuestion('processo_tipo', 'nacionalidade'))
    expect(api.nextAction).toBe('next')
    act(() => api.answerQuestion('processo_tipo', 'visto'))
    expect(api.nextAction).toBe('continue')
  })

  it('"Ver meu resultado" só na última pergunta visível', () => {
    renderQuiz()
    act(() => api.startQuiz())
    answerAndNext('processo_tipo', 'nacionalidade')
    act(() => api.answerQuestion('caso_tipo', 'B'))
    expect(api.nextAction).toBe('next')
    expect(api.progress.total).toBe(3)
    act(() => {
      api.nextQuestion()
    })
    expect(api.currentQuestion?.key).toBe('b1_tempo_casamento')
    act(() => api.answerQuestion('b1_tempo_casamento', 'mais_3_anos'))
    expect(api.nextAction).toBe('results')
    act(() => {
      api.nextQuestion()
    })
    expect(api.quizState).toBe('capture')
  })

  it('pergunta opcional sem resposta: "Pular" (e "Pular e ver meu resultado" quando é a última)', () => {
    renderQuiz()
    act(() => api.startQuiz())
    answerAndNext('processo_tipo', 'nacionalidade')
    answerAndNext('caso_tipo', 'A')
    answerAndNext('a1_antepassado', 'avo')
    answerAndNext('a2_documento', 'sim')
    answerAndNext('a4_lacos', 'sim')
    expect(api.currentQuestion?.key).toBe('a6_filiacao')
    expect(api.canProceed).toBe(true)
    expect(api.nextAction).toBe('skip_results')
  })

  it('obrigatória sem resposta não avança', () => {
    renderQuiz()
    act(() => api.startQuiz())
    let advanced = true
    act(() => {
      advanced = api.nextQuestion()
    })
    expect(advanced).toBe(false)
    expect(api.currentQuestion?.key).toBe('processo_tipo')
  })
})

describe('etapa na URL e voltar do sistema (DI-041)', () => {
  it('cada pergunta tem o seu ?passo= e o voltar do celular mostra a anterior em /quiz', async () => {
    const { router } = renderQuiz()
    act(() => api.startQuiz())
    expect(search(router)).toBe('?passo=1')
    answerAndNext('processo_tipo', 'nacionalidade')
    answerAndNext('caso_tipo', 'A')
    expect(search(router)).toBe('?passo=3')
    expect(api.currentQuestion?.key).toBe('a1_antepassado')

    await act(async () => {
      await router.navigate(-1)
    })
    expect(pathname(router)).toBe('/quiz')
    expect(search(router)).toBe('?passo=2')
    expect(api.currentQuestion?.key).toBe('caso_tipo')
    expect(api.animationDirection).toBe('backward')
    expect(mocks.track).toHaveBeenCalledWith('quiz_back', { question_key: 'a1_antepassado', index: 2 })

    // Avançar do sistema volta para a pergunta 3 (já liberada pela resposta).
    await act(async () => {
      await router.navigate(1)
    })
    expect(api.currentQuestion?.key).toBe('a1_antepassado')
  })

  it('"Anterior" usa o histórico (não acumula entradas) e registra quiz_back uma vez', async () => {
    const { router } = renderQuiz()
    act(() => api.startQuiz())
    answerAndNext('processo_tipo', 'nacionalidade')
    expect(search(router)).toBe('?passo=2')
    await act(async () => {
      api.prevQuestion()
    })
    expect(search(router)).toBe('?passo=1')
    expect(api.currentQuestion?.key).toBe('processo_tipo')
    expect(trackedNames().filter((name) => name === 'quiz_back')).toHaveLength(1)
  })

  it('link com ?passo= adiantado não pula perguntas: abre na intro com a retomada', () => {
    const { router } = renderQuiz('/quiz?passo=7')
    expect(search(router)).toBe('')
    expect(api.quizState).toBe('intro')
    expect(api.resumeStep).toBeNull()
  })
})

describe('retomada (DI-041)', () => {
  const answers = {
    processo_tipo: 'nacionalidade',
    caso_tipo: 'A',
    a1_antepassado: 'avo',
    a2_documento: 'sim',
  }
  const fifthKey = getVisibleQuestions(answers, QUIZ_QUESTIONS)[4].key

  function storeSession(extra: Record<string, unknown> = {}) {
    const now = new Date().toISOString()
    localStorage.setItem(
      QUIZ_SESSION_KEY,
      JSON.stringify({
        sessionId: 's_1760000000000_retoma1',
        answers,
        startedAt: now,
        updatedAt: now,
        status: 'in_progress',
        currentKey: fifthKey,
        ...extra,
      }),
    )
  }

  it('recarregar na pergunta 5 → intro com "Continuar" → pergunta 5', () => {
    storeSession()
    const { router } = renderQuiz('/quiz?passo=5')
    expect(api.quizState).toBe('intro')
    expect(search(router)).toBe('')
    expect(api.resumeStep).toEqual({ kind: 'question', index: 4 })
    expect(api.questionsAnswered).toBe(4)

    act(() => api.resumeQuiz())
    expect(api.quizState).toBe('question')
    expect(api.currentIndex).toBe(4)
    expect(api.currentQuestion?.key).toBe(fifthKey)
    expect(search(router)).toBe('?passo=5')
    expect(mocks.track).toHaveBeenCalledWith('quiz_resume_clicked', { index: 4 })
  })

  it('"Recomeçar" apaga as respostas e gera session_id novo', () => {
    storeSession()
    renderQuiz()
    act(() => api.restartQuiz())
    expect(api.session.sessionId).not.toBe('s_1760000000000_retoma1')
    expect(api.session.answers).toEqual({})
    expect(api.currentQuestion?.key).toBe('processo_tipo')
    expect(mocks.track).toHaveBeenCalledWith('quiz_restart_clicked', { index: 4 })
  })

  it('sessão parada há mais de 30 dias não é oferecida', () => {
    storeSession({ updatedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() })
    renderQuiz()
    expect(api.resumeStep).toBeNull()
    expect(api.session.answers).toEqual({})
  })

  it('/quiz?novo=1 começa uma sessão nova', () => {
    storeSession()
    const { router } = renderQuiz('/quiz?novo=1')
    expect(search(router)).toBe('')
    expect(api.resumeStep).toBeNull()
    expect(api.session.sessionId).not.toBe('s_1760000000000_retoma1')
  })
})

describe('eventos por etapa (DI-068)', () => {
  it('quiz_step_viewed uma vez por pergunta, com a key certa, mesmo indo e voltando', async () => {
    const { router } = renderQuiz()
    act(() => api.startQuiz())
    answerAndNext('processo_tipo', 'nacionalidade')
    await act(async () => {
      api.prevQuestion()
    })
    act(() => {
      api.nextQuestion()
    })
    const viewed = mocks.track.mock.calls.filter((call) => call[0] === 'quiz_step_viewed')
    expect(viewed.map((call) => (call[1] as { question_key: string }).question_key)).toEqual([
      'processo_tipo',
      'caso_tipo',
    ])
    expect(viewed[0][1]).toMatchObject({ index: 0, theme: 'processo' })
    const answered = mocks.track.mock.calls.filter((call) => call[0] === 'quiz_step_answered')
    expect(answered).toHaveLength(1)
    expect(search(router)).toBe('?passo=2')
  })

  it('não envia nada que identifique a pessoa', async () => {
    vi.useFakeTimers()
    mocks.persistAssessment.mockResolvedValue(okPersist('a-1'))
    renderQuiz()
    act(() => api.startQuiz())
    answerAndNext('processo_tipo', 'nacionalidade')
    answerAndNext('caso_tipo', 'B')
    answerAndNext('b1_tempo_casamento', 'mais_3_anos')
    await act(async () => {
      const done = api.submitQuiz(LEAD)
      await vi.advanceTimersByTimeAsync(2000)
      await done
    })
    const payload = JSON.stringify([...mocks.track.mock.calls, ...mocks.trackOnce.mock.calls])
    expect(payload).not.toContain(LEAD.email)
    expect(payload).not.toContain(LEAD.fullName)
    expect(payload).not.toContain('sessionId')
    expect(mocks.trackOnce).toHaveBeenCalledWith('lead_submitted', expect.any(String), { category: expect.any(String) })
    expect(trackedNames()).toContain('quiz_capture_viewed')
  })
})

describe('envio (DI-041/DI-042)', () => {
  /** Chega à captura com B; deixa uma resposta antiga de A (ramo oculto) na sessão. */
  function reachCaptureWithHiddenAnswer() {
    act(() => api.startQuiz())
    answerAndNext('processo_tipo', 'nacionalidade')
    act(() => api.answerQuestion('caso_tipo', 'A'))
    act(() => {
      api.nextQuestion()
    })
    answerAndNext('a1_antepassado', 'avo')
    // Volta e troca A por B: a resposta de a1 fica guardada, mas oculta.
    act(() => api.prevQuestion())
    act(() => api.answerQuestion('caso_tipo', 'B'))
    act(() => {
      api.nextQuestion()
    })
    answerAndNext('b1_tempo_casamento', 'mais_3_anos')
    expect(api.quizState).toBe('capture')
    expect(api.session.answers.a1_antepassado).toBe('avo')
  }

  async function submit(advanceMs = 2000) {
    await act(async () => {
      const done = api.submitQuiz(LEAD)
      await vi.advanceTimersByTimeAsync(advanceMs)
      await done
    })
  }

  it('envia só as respostas visíveis e abre o resultado com o mesmo score', async () => {
    vi.useFakeTimers()
    mocks.persistAssessment.mockResolvedValue(okPersist('a-1'))
    const { router } = renderQuiz()
    reachCaptureWithHiddenAnswer()
    const firstSession = api.session.sessionId
    await submit()

    expect(mocks.persistAssessment).toHaveBeenCalledTimes(1)
    const params = mocks.persistAssessment.mock.calls[0][0] as Record<string, unknown>
    expect(params.answers).toEqual({
      processo_tipo: 'nacionalidade',
      caso_tipo: 'B',
      b1_tempo_casamento: 'mais_3_anos',
    })
    expect(params).toMatchObject({ sessionId: firstSession, questionsAnswered: 3, totalQuestions: 3, utmSource: 'teste' })

    expect(pathname(router)).toBe('/results')
    const state = resultsState as { assessmentId: string; result: { score: { category: string; percentage: number } } }
    expect(state.assessmentId).toBe('a-1')
    expect(storedResult()).toMatchObject({ sessionId: firstSession, assessmentId: 'a-1' })
    expect((storedResult() as { score: { category: string } }).score.category).toBe(state.result.score.category)
  })

  it('depois do envio a sessão gira; "Refazer" gera session_id novo e assessmentId não nulo', async () => {
    vi.useFakeTimers()
    mocks.persistAssessment.mockResolvedValueOnce(okPersist('a-1')).mockResolvedValueOnce(okPersist('a-2'))
    const first = renderQuiz()
    reachCaptureWithHiddenAnswer()
    const firstSession = api.session.sessionId
    await submit()
    expect(readStoredQuizSession()?.sessionId).not.toBe(firstSession)
    expect(readStoredQuizSession()?.answers).toEqual({})
    first.unmount()

    // "Refazer o quiz" no resultado → /quiz
    renderQuiz()
    expect(api.resumeStep).toBeNull()
    act(() => api.startQuiz())
    answerAndNext('processo_tipo', 'nacionalidade')
    answerAndNext('caso_tipo', 'B')
    answerAndNext('b1_tempo_casamento', 'menos_3_anos')
    await submit()

    const secondParams = mocks.persistAssessment.mock.calls[1][0] as { sessionId: string }
    expect(secondParams.sessionId).not.toBe(firstSession)
    expect((resultsState as { assessmentId: string }).assessmentId).toBe('a-2')
    expect(storedResult()).toMatchObject({ sessionId: secondParams.sessionId, assessmentId: 'a-2' })
  })

  it('assessment já vinculado a uma conta (42501): session_id novo e nova tentativa', async () => {
    vi.useFakeTimers()
    mocks.persistAssessment
      .mockResolvedValueOnce({ assessment: null, error: 'Assessment already linked to a user' })
      .mockResolvedValueOnce(okPersist('a-novo'))
    renderQuiz()
    reachCaptureWithHiddenAnswer()
    const linkedSession = api.session.sessionId
    await submit()

    expect(mocks.persistAssessment).toHaveBeenCalledTimes(2)
    const retry = mocks.persistAssessment.mock.calls[1][0] as { sessionId: string }
    expect(retry.sessionId).not.toBe(linkedSession)
    expect((resultsState as { assessmentId: string }).assessmentId).toBe('a-novo')
  })

  it('com as functions 20s atrasadas, o resultado abre em até 9s e a IA não é esperada', async () => {
    vi.useFakeTimers()
    const never = new Promise(() => undefined)
    mocks.persistAssessment.mockReturnValue(new Promise((resolve) => setTimeout(() => resolve(okPersist('a-lento')), 20_000)))
    mocks.invoke.mockReturnValue(never)
    const { router } = renderQuiz()
    reachCaptureWithHiddenAnswer()

    await act(async () => {
      void api.submitQuiz(LEAD)
      await vi.advanceTimersByTimeAsync(9000)
    })
    expect(pathname(router)).toBe('/results')
    expect((resultsState as { assessmentId: string | null }).assessmentId).toBeNull()
    expect(mocks.trackOnce).toHaveBeenCalledWith('quiz_completed', expect.any(String), expect.objectContaining({ duration_ms: expect.any(Number) }))

    // A gravação lenta termina depois: o id entra no resultado guardado e o cálculo começa.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000)
    })
    expect(storedResult()).toMatchObject({ assessmentId: 'a-lento' })
    expect(mocks.invoke).toHaveBeenCalledWith('compute-eligibility', expect.anything())
  })

  it('compute-eligibility lento: espera no máximo 8s; generate-explanation roda depois, sem await', async () => {
    vi.useFakeTimers()
    mocks.persistAssessment.mockResolvedValue(okPersist('a-1'))
    let finishEligibility!: () => void
    mocks.invoke.mockImplementation((name: string) => {
      if (name === 'compute-eligibility') {
        return new Promise((resolve) => {
          finishEligibility = () => resolve({ data: {}, error: null })
        })
      }
      return new Promise(() => undefined) // generate-explanation nunca termina
    })
    const { router } = renderQuiz()
    reachCaptureWithHiddenAnswer()

    await act(async () => {
      void api.submitQuiz(LEAD)
      await vi.advanceTimersByTimeAsync(8000)
    })
    expect(pathname(router)).toBe('/results')
    expect(mocks.invoke).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishEligibility()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mocks.invoke).toHaveBeenLastCalledWith('generate-explanation', {
      body: { assessment_id: 'a-1', session_id: expect.any(String) },
    })
  })

  it('reenvio que falha não apaga o assessmentId já gravado para a mesma sessão', async () => {
    vi.useFakeTimers()
    const now = new Date().toISOString()
    const answers = { processo_tipo: 'nacionalidade', caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' }
    localStorage.setItem(
      QUIZ_SESSION_KEY,
      JSON.stringify({ sessionId: 's_1760000000000_reenvio', answers, startedAt: now, updatedAt: now, status: 'in_progress', currentKey: 'contato' }),
    )
    localStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify({ sessionId: 's_1760000000000_reenvio', assessmentId: 'a-antigo', answers }))
    mocks.persistAssessment.mockResolvedValue({ assessment: null, error: 'Failed to fetch' })

    renderQuiz()
    act(() => api.resumeQuiz())
    expect(api.quizState).toBe('capture')
    await submit()

    expect((mocks.persistAssessment.mock.calls[0][0] as { sessionId: string }).sessionId).toBe('s_1760000000000_reenvio')
    expect(storedResult()).toMatchObject({ assessmentId: 'a-antigo' })
    expect((resultsState as { assessmentId: string }).assessmentId).toBe('a-antigo')
    // Sem gravação confirmada, a sessão continua retomável.
    expect(readStoredQuizSession()?.sessionId).toBe('s_1760000000000_reenvio')
  })
})
