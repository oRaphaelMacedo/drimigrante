// @vitest-environment jsdom
/**
 * DI-039/DI-040 na tela do quiz (rede mockada):
 *  - escolha única avança sozinha em ≤400ms por toque/clique, nunca pelas setas;
 *  - múltipla escolha não avança sozinha;
 *  - ao avançar: topo da página e foco no título da pergunta;
 *  - toque "fantasma" logo depois do auto-avanço não pula a pergunta seguinte;
 *  - primeira pergunta sem "de N" e sem "Ver meu resultado";
 *  - "Nenhuma destas situações" (DI-075) é exclusiva e libera o "Próximo".
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
  trackOnce: vi.fn(() => true),
}))

vi.mock('@/hooks/useAssessment', () => ({ persistAssessment: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() }, from: vi.fn() },
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track, trackOnce: mocks.trackOnce }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn(), captureMessage: vi.fn() } }))
vi.mock('@/lib/attribution', () => ({ getAttribution: () => ({}) }))
vi.mock('@/hooks/useQuizQuestions', async () => {
  const { QUIZ_QUESTIONS } = await import('@/data/quiz-questions')
  return { useQuizQuestions: () => ({ data: QUIZ_QUESTIONS, refetch: vi.fn(), isFetching: false }) }
})

import { QuizPage } from './QuizPage'

function renderPage() {
  const router = createMemoryRouter([{ path: '/quiz', element: <QuizPage /> }], { initialEntries: ['/quiz'] })
  render(<RouterProvider router={router} />)
  return router
}

const title = () => screen.getByTestId('quiz-question').querySelector('h2')
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  mocks.track.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

async function start() {
  const router = renderPage()
  fireEvent.click(screen.getByTestId('quiz-intro-start'))
  await advance(0)
  return router
}

describe('QuizPage — auto-avanço e foco (DI-039)', () => {
  it('primeira pergunta: "Pergunta 1", sem total, botão "Próximo"', async () => {
    await start()
    expect(screen.getByTestId('quiz-progress-label')).toHaveTextContent(/^Pergunta 1$/)
    expect(screen.getByTestId('quiz-next')).toHaveTextContent('Próximo')
    expect(screen.queryByText(/Concluir|Ver meu resultado/)).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('toque numa opção de escolha única avança em ≤400ms, com topo e foco no título', async () => {
    const router = await start()
    expect(title()).toHaveTextContent('Qual é o seu objetivo principal?')
    vi.mocked(window.scrollTo).mockClear()

    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    await advance(200)
    expect(title()).toHaveTextContent('Qual é o seu objetivo principal?')
    await advance(200)
    expect(title()).toHaveTextContent('Quais destas situações')
    expect(router.state.location.search).toBe('?passo=2')
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
    expect(document.activeElement).toBe(title())
  })

  it('setas do teclado mudam a seleção sem avançar', async () => {
    await start()
    const first = screen.getByTestId('quiz-option-nacionalidade')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    await advance(800)
    expect(title()).toHaveTextContent('Qual é o seu objetivo principal?')
    expect(screen.getByTestId('quiz-option-visto')).toHaveAttribute('aria-checked', 'true')
    expect(document.activeElement).toBe(screen.getByTestId('quiz-option-visto'))
    expect(screen.getByTestId('quiz-next')).toHaveTextContent('Continuar')
  })

  it('múltipla escolha não avança sozinha', async () => {
    await start()
    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    await advance(1000) // auto-avanço + tempo de ler a pergunta nova
    fireEvent.click(screen.getByTestId('quiz-option-A'))
    await advance(800)
    expect(title()).toHaveTextContent('Quais destas situações')
    expect(screen.getByTestId('quiz-progress-label')).toHaveTextContent('Pergunta 2 de 4')
  })

  it('"Próximo" logo depois do auto-avanço não pula a pergunta seguinte', async () => {
    await start()
    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    await advance(300)
    expect(title()).toHaveTextContent('Quais destas situações')
    fireEvent.click(screen.getByTestId('quiz-next'))
    await advance(50)
    expect(title()).toHaveTextContent('Quais destas situações')
    expect(screen.queryByRole('alert')).toBeNull()
    // Só o primeiro toque é ignorado: responder e tocar em "Próximo" segue normal.
    fireEvent.click(screen.getByTestId('quiz-option-B'))
    fireEvent.click(screen.getByTestId('quiz-next'))
    await advance(0)
    expect(title()).toHaveTextContent('Há quanto tempo')
  })

  it('toque duplo na opção: o segundo toque não responde a pergunta nova', async () => {
    await start()
    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    await advance(400)
    fireEvent.click(screen.getByTestId('quiz-option-A'))
    await advance(0)
    // O "toque fantasma" é ignorado, então A não fica marcado.
    expect(screen.getByTestId('quiz-option-A')).toHaveAttribute('aria-checked', 'false')
  })

  it('"Anterior" logo depois de tocar numa opção cancela o auto-avanço', async () => {
    const router = await start()
    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    await advance(1000)
    expect(router.state.location.search).toBe('?passo=2')
    fireEvent.click(screen.getByTestId('quiz-option-A'))
    await advance(600)
    // Volta à P1, toca de novo numa opção e logo em "Anterior": fica na intro.
    fireEvent.click(screen.getByRole('button', { name: /Pergunta anterior/ }))
    await advance(0)
    expect(title()).toHaveTextContent('Qual é o seu objetivo principal?')
    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    fireEvent.click(screen.getByRole('button', { name: /Voltar à apresentação/ }))
    await advance(600)
    expect(screen.queryByTestId('quiz-question')).toBeNull()
    expect(screen.getByTestId('quiz-resume-card')).toBeInTheDocument()
  })

  it('"Próximo" sem resposta obrigatória avisa e não avança', async () => {
    await start()
    fireEvent.click(screen.getByTestId('quiz-next'))
    await advance(0)
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha uma opção para continuar.')
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-describedby', expect.stringContaining('quiz-required-hint'))
    expect(title()).toHaveTextContent('Qual é o seu objetivo principal?')
  })

  it('a última pergunta não avança sozinha: pede "Ver meu resultado"', async () => {
    await start()
    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    await advance(1000)
    fireEvent.click(screen.getByTestId('quiz-option-B'))
    await advance(0)
    fireEvent.click(screen.getByTestId('quiz-next'))
    await advance(0)
    expect(title()).toHaveTextContent('Há quanto tempo')
    fireEvent.click(screen.getByTestId('quiz-option-mais_3_anos'))
    await advance(800)
    expect(screen.getByTestId('quiz-next')).toHaveTextContent('Ver meu resultado')
    expect(screen.queryByTestId('quiz-question')).not.toBeNull()
    fireEvent.click(screen.getByTestId('quiz-next'))
    await advance(0)
    expect(screen.getByTestId('quiz-progress-label')).toHaveTextContent('100%')
  })
})

describe('QuizPage — "Nenhuma destas situações" (DI-075)', () => {
  async function reachCaseQuestion() {
    await start()
    fireEvent.click(screen.getByTestId('quiz-option-nacionalidade'))
    await advance(1000)
    expect(title()).toHaveTextContent('Quais destas situações')
  }

  it('marcar "Nenhuma" desmarca as outras, e marcar outra desmarca "Nenhuma"', async () => {
    await reachCaseQuestion()
    fireEvent.click(screen.getByTestId('quiz-option-A'))
    fireEvent.click(screen.getByTestId('quiz-option-D'))
    await advance(0)
    expect(screen.getByTestId('quiz-option-A')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('quiz-option-D')).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByTestId('quiz-option-nenhum'))
    await advance(0)
    expect(screen.getByTestId('quiz-option-nenhum')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('quiz-option-A')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByTestId('quiz-option-D')).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(screen.getByTestId('quiz-option-B'))
    await advance(0)
    expect(screen.getByTestId('quiz-option-B')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('quiz-option-nenhum')).toHaveAttribute('aria-checked', 'false')
  })

  it('só "Nenhuma" já libera o "Próximo" e leva ao resultado, sem perguntas de caso', async () => {
    await reachCaseQuestion()
    fireEvent.click(screen.getByTestId('quiz-option-nenhum'))
    await advance(800)
    // Múltipla escolha não avança sozinha; o botão já pede o resultado.
    expect(title()).toHaveTextContent('Quais destas situações')
    expect(screen.getByTestId('quiz-next')).toHaveTextContent('Ver meu resultado')
    fireEvent.click(screen.getByTestId('quiz-next'))
    await advance(0)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByTestId('quiz-question')).toBeNull()
    expect(screen.getByTestId('quiz-progress-label')).toHaveTextContent('Perguntas concluídas')
  })
})
