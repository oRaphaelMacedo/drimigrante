// @vitest-environment jsdom
/**
 * /results (W3-01): apresentação única por categoria (DI-029), teaser de
 * caminhos (DI-070), CTA fixo (DI-028), oferta personalizada (DI-030), e-mail
 * de acesso editável (DI-031) e link de retomada ?r= (DI-024).
 * Supabase, auth, analytics e Sentry mockados: nenhuma chamada de rede.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  rpc: vi.fn(),
  persist: vi.fn(),
  track: vi.fn(),
  trackOnce: vi.fn(() => true),
  paid: false,
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    authUser: null,
    loading: false,
    refreshUser: async () => null,
    hasAccess: () => mocks.paid,
  }),
}))
vi.mock('@/hooks/useAssessment', () => ({
  persistAssessment: (...args: unknown[]) => mocks.persist(...args),
}))
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mocks.track(...args),
  trackOnce: (...args: unknown[]) => mocks.trackOnce(...(args as [])),
}))
vi.mock('@/lib/attribution', () => ({ getAttribution: () => ({}) }))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: () => undefined, captureMessage: () => undefined },
}))

import { ResultsPage } from '@/pages/quiz/ResultsPage'
import { CATEGORY_PRESENTATION, type ScoreCategory } from '@/lib/category'
import { computeScore, suggestVisas } from '@/data/quiz-questions'

const STORAGE_KEY = 'dr_imigrante_quiz_result'
const TOKEN = '0123456789abcdef'.repeat(4)

const ANSWERS = {
  processo_tipo: 'nacionalidade',
  caso_tipo: 'B,D',
  b1_tempo_casamento: 'mais_3_anos',
  d1_situacao_legal: 'sim',
  d2_tempo_autorizacao: 'menos_5',
}

function seedQuiz(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sessionId: 'sessao-results-0001',
      assessmentId: '00000000-0000-0000-0000-000000000001',
      answers: ANSWERS,
      score: { total: 80, max: 100, percentage: 80, category: 'alta' },
      visas: suggestVisas(ANSWERS),
      leadInfo: { fullName: 'Maria Souza', email: 'maria.souza@gmail.com' },
      completedAt: '2026-10-16T10:00:00.000Z',
      ...overrides,
    }),
  )
}

function storedRecord() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
}

function renderAt(path: string, state?: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/results', element: <ResultsPage /> },
      { path: '/quiz', element: <h1>Quiz</h1> },
      { path: '/login', element: <h1>Entrar</h1> },
      { path: '/dashboard/analysis', element: <h1>Análise</h1> },
    ],
    {
      initialEntries: [
        state
          ? { pathname: path.split('?')[0], search: path.includes('?') ? `?${path.split('?')[1]}` : '', state }
          : path,
      ],
      future: {
        v7_relativeSplatPath: true,
        v7_fetcherPersist: true,
        v7_normalizeFormMethod: true,
        v7_partialHydration: true,
        v7_skipActionErrorRevalidation: true,
      },
    },
  )
  const view = render(<RouterProvider router={router} future={{ v7_startTransition: true }} />)
  return { router, ...view }
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mocks.invoke.mockReset()
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  mocks.persist.mockReset()
  mocks.track.mockReset()
  mocks.trackOnce.mockClear()
  mocks.paid = false
})

describe('apresentação única por categoria (DI-029)', () => {
  it('router state e recarregar mostram o mesmo título e o mesmo ícone', async () => {
    seedQuiz()
    const score = { ...computeScore(ANSWERS), percentage: 80, category: 'alta' as const }
    const fromQuiz = renderAt('/results', {
      result: {
        score,
        visas: suggestVisas(ANSWERS),
        leadInfo: { fullName: 'Maria Souza', email: 'maria.souza@gmail.com' },
      },
    })
    const quizTitle = (await screen.findByTestId('results-title')).textContent
    const quizIcon = screen.getByTestId('results-score').querySelector('svg[data-icon]')?.getAttribute('data-icon')
    fromQuiz.unmount()

    renderAt('/results')
    expect((await screen.findByTestId('results-title')).textContent).toBe(quizTitle)
    expect(screen.getByTestId('results-score').querySelector('svg[data-icon]')?.getAttribute('data-icon')).toBe(
      quizIcon,
    )
    expect(quizTitle).toBe(CATEGORY_PRESENTATION.alta.label)
  })

  it.each(['alta', 'media', 'baixa'] as const)(
    '%s: sem "+", "~" ou "?" como ícone',
    async (category: ScoreCategory) => {
      seedQuiz({ score: { percentage: category === 'alta' ? 80 : category === 'media' ? 45 : 10, category } })
      renderAt('/results')
      const card = await screen.findByTestId('results-score')
      expect(within(card).getByRole('heading', { level: 1 })).toHaveTextContent(CATEGORY_PRESENTATION[category].label)
      expect(card.querySelector('svg[data-icon]')?.getAttribute('data-icon')).toBe(CATEGORY_PRESENTATION[category].icon)
      for (const symbol of ['+', '~', '?']) {
        expect(
          Array.from(card.querySelectorAll('[aria-hidden="true"]')).some((el) => el.textContent?.trim() === symbol),
        ).toBe(false)
      }
    },
  )

  it('categoria antiga ou inválida é deduzida do percentual', async () => {
    seedQuiz({ score: { percentage: 45, category: '~' } })
    renderAt('/results')
    expect(await screen.findByTestId('results-title')).toHaveTextContent(CATEGORY_PRESENTATION.media.label)
  })

  it('não envia quiz_completed (só o useQuiz envia)', async () => {
    seedQuiz()
    renderAt('/results')
    await screen.findByTestId('results-score')
    const names = [...mocks.trackOnce.mock.calls, ...mocks.track.mock.calls].map((call) => (call as unknown[])[0])
    expect(names).not.toContain('quiz_completed')
    expect(names).toContain('results_viewed')
  })
})

describe('caminhos e oferta (DI-070, DI-030)', () => {
  it('caminho mais forte primeiro, sem "Visto", e o desfoque fora da árvore de acessibilidade', async () => {
    seedQuiz()
    renderAt('/results')
    const paths = await screen.findAllByTestId('results-path')
    expect(paths.map((p) => p.getAttribute('data-match'))).toEqual(['strong', 'possible'])
    expect(screen.getByRole('heading', { name: 'Caminhos para a nacionalidade no seu perfil' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/visto/i)
    for (const path of paths) {
      const blurred = path.querySelector('.blur-\\[3px\\]')
      expect(blurred).not.toBeNull()
      expect(blurred?.closest('[aria-hidden="true"]')).not.toBeNull()
      expect(within(path).getByText(/Detalhes na análise completa/)).toHaveClass('sr-only')
      expect(path.querySelector('svg.lucide-lock')).not.toBeNull()
    }
  })

  it('título da oferta com o caminho mais forte e subtítulo por categoria', async () => {
    seedQuiz()
    const { unmount } = renderAt('/results')
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: /Maria, veja o passo a passo para a nacionalidade pelo casamento/,
      }),
    ).toBeInTheDocument()
    const subtitles = [screen.getByTestId('results-offer-subtitle').textContent]
    unmount()

    for (const [percentage, category] of [
      [45, 'media'],
      [10, 'baixa'],
    ] as const) {
      localStorage.clear()
      seedQuiz({ score: { percentage, category } })
      const view = renderAt('/results')
      subtitles.push((await screen.findByTestId('results-offer-subtitle')).textContent)
      view.unmount()
    }
    expect(new Set(subtitles).size).toBe(3)
  })

  it('inclusões de OFFER, preço com 30 dias, mini-FAQ e bloco da Stripe; sem "menos de €1"', async () => {
    seedQuiz()
    renderAt('/results')
    const includes = await screen.findByTestId('results-offer-includes')
    expect(within(includes).getAllByRole('listitem')).toHaveLength(5)
    expect(screen.getByText('pagamento único, com 30 dias de acesso')).toBeInTheDocument()
    expect(screen.getByText(/Pagamento processado pela Stripe/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade')
    expect(screen.getAllByRole('group')).toHaveLength(3) // <details>
    expect(screen.queryByTestId('results-company')).toBeNull()
    expect(document.body.textContent).not.toMatch(/menos de €1|4,90|A_PREENCHER|garantia/i)
  })
})

describe('CTA fixo (DI-028)', () => {
  it('barra fixa com testid próprio e um único results-cta-paywall', async () => {
    seedQuiz()
    renderAt('/results')
    const sticky = await screen.findByTestId('results-sticky-cta')
    expect(sticky).toHaveTextContent('Ver minha análise completa')
    expect(screen.getAllByTestId('results-cta-paywall')).toHaveLength(1)
    expect(screen.getByRole('region', { name: 'Comprar a análise completa' })).toHaveTextContent('pagamento único')
  })

  it('a barra usa o mesmo checkout (create-checkout-session)', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: { status: 'email_sent' }, error: null })
    renderAt('/results')
    await userEvent.click(await screen.findByTestId('results-sticky-cta'))
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'create-checkout-session',
        expect.objectContaining({ body: expect.objectContaining({ email: 'maria.souza@gmail.com' }) }),
      ),
    )
    expect(mocks.track).toHaveBeenCalledWith('paywall_cta_clicked', { position: 'results_sticky' })
    // O aviso aparece junto do botão da oferta (a página continua de pé).
    expect(await screen.findByTestId('checkout-email-sent')).toBeInTheDocument()
    expect(screen.getByTestId('results-score')).toBeInTheDocument()
  })

  it('"Ver o que inclui" leva à oferta e move o foco para o título dela', async () => {
    seedQuiz()
    const scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
    try {
      renderAt('/results')
      await userEvent.click(await screen.findByTestId('results-see-offer'))
      expect(scrolled.map((el) => el.id)).toContain('oferta')
      expect(screen.getByRole('heading', { level: 2, name: /veja o passo a passo/ })).toHaveFocus()
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('quem já pagou não vê a barra nem a oferta', async () => {
    seedQuiz()
    mocks.paid = true
    renderAt('/results')
    expect(await screen.findByTestId('results-paid')).toBeInTheDocument()
    expect(screen.queryByTestId('results-sticky-cta')).toBeNull()
    expect(screen.queryByTestId('results-see-offer')).toBeNull()
  })
})

describe('e-mail de acesso (DI-031)', () => {
  it('aparece acima do CTA; Alterar atualiza o localStorage, o diagnóstico e o próximo POST', async () => {
    seedQuiz()
    mocks.persist.mockResolvedValue({ assessment: { id: '00000000-0000-0000-0000-000000000001' }, error: null })
    mocks.invoke.mockResolvedValue({ data: { status: 'email_sent' }, error: null })
    renderAt('/results')

    const box = await screen.findByTestId('results-access-email')
    expect(box).toHaveTextContent('Seu acesso será criado para')
    const cta = screen.getByTestId('results-cta-paywall')
    expect(box.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await userEvent.click(screen.getByTestId('results-access-email-edit'))
    const input = screen.getByTestId('results-access-email-input')
    expect(input).toHaveFocus()
    await userEvent.clear(input)
    await userEvent.type(input, 'maria.nova@gmail.com')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e-mail' }))

    expect(await screen.findByText('maria.nova@gmail.com')).toBeInTheDocument()
    expect(storedRecord().leadInfo.email).toBe('maria.nova@gmail.com')
    expect(mocks.persist).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'maria.nova@gmail.com', sessionId: 'sessao-results-0001' }),
    )
    expect(mocks.track).toHaveBeenCalledWith('email_edited', { position: 'results', source: 'manual' })

    await userEvent.click(screen.getByTestId('results-cta-paywall'))
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'create-checkout-session',
        expect.objectContaining({ body: expect.objectContaining({ email: 'maria.nova@gmail.com' }) }),
      ),
    )
  })

  it("e-mail inválido mostra erro; 'x@gmial.com' sugere 'gmail.com'", async () => {
    seedQuiz({ leadInfo: { fullName: 'Maria Souza', email: 'x@gmial.com' } })
    mocks.persist.mockResolvedValue({ assessment: { id: '00000000-0000-0000-0000-000000000001' }, error: null })
    renderAt('/results')

    const suggestion = await screen.findByTestId('results-access-email-suggestion')
    expect(screen.getByText('@gmail.com')).toBeInTheDocument()
    await userEvent.click(suggestion)
    await waitFor(() => expect(storedRecord().leadInfo.email).toBe('x@gmail.com'))
    expect(mocks.track).toHaveBeenCalledWith('email_edited', { position: 'results', source: 'suggestion' })

    await userEvent.click(screen.getByTestId('results-access-email-edit'))
    const input = screen.getByTestId('results-access-email-input')
    await userEvent.clear(input)
    await userEvent.type(input, 'sem-arroba')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e-mail' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/nome@provedor\.com/)
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(storedRecord().leadInfo.email).toBe('x@gmail.com')
  })
})

describe('link de retomada (DI-024)', () => {
  const ROW = {
    answers: ANSWERS,
    full_name: 'Maria Souza',
    email: 'maria.souza@gmail.com',
    completed_at: '2026-10-10T10:00:00.000Z',
    score_numeric: 81,
    score_category: 'alta',
  }

  it('/results?r=token em navegador limpo mostra o resultado, limpa a URL e o CTA funciona', async () => {
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'get_assessment_by_resume_token' ? { data: [ROW], error: null } : { data: [], error: null },
    )
    mocks.persist.mockResolvedValue({ assessment: { id: '00000000-0000-0000-0000-0000000000aa' }, error: null })
    mocks.invoke.mockImplementation(async (fn: string) =>
      fn === 'create-checkout-session' ? { data: { status: 'email_sent' }, error: null } : { data: {}, error: null },
    )
    const { router } = renderAt(`/results?r=${TOKEN}`)

    expect(router.state.location.search).toBe('')
    expect(await screen.findByTestId('results-title')).toHaveTextContent(CATEGORY_PRESENTATION.alta.label)
    expect(screen.getByText('81%')).toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenCalledWith('get_assessment_by_resume_token', { p_token: TOKEN })

    const record = storedRecord()
    expect(record).toMatchObject({
      assessmentId: null,
      leadInfo: { email: 'maria.souza@gmail.com' },
      resume: { token: TOKEN },
    })
    expect(record.sessionId).toMatch(/^[0-9a-f-]{36}$|^s_/)
    expect(screen.getByTestId('results-save-link')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('results-cta-paywall'))
    await waitFor(() =>
      expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ sessionId: record.sessionId })),
    )
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith(
        'create-checkout-session',
        expect.objectContaining({
          body: expect.objectContaining({
            assessmentId: '00000000-0000-0000-0000-0000000000aa',
            sessionId: record.sessionId,
          }),
        }),
      ),
    )
    // Nada do token em eventos.
    expect(JSON.stringify([...mocks.track.mock.calls, ...mocks.trackOnce.mock.calls])).not.toContain(TOKEN)
  })

  it('token inválido: estado com CTA para refazer o quiz e URL sem r', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const { router } = renderAt(`/results?r=${TOKEN}`)
    const box = await screen.findByTestId('results-resume-invalid')
    expect(within(box).getByRole('link', { name: /Refazer o quiz grátis/ })).toHaveAttribute('href', '/quiz')
    expect(router.state.location.search).toBe('')
  })

  it('token malformado nem chama a RPC', async () => {
    renderAt('/results?r=abc')
    expect(await screen.findByTestId('results-resume-invalid')).toBeInTheDocument()
    expect(mocks.rpc).not.toHaveBeenCalledWith('get_assessment_by_resume_token', expect.anything())
  })

  it('falha de rede: "Tentar de novo" repete a leitura', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
    renderAt(`/results?r=${TOKEN}`)
    await screen.findByTestId('results-resume-error')
    mocks.rpc.mockResolvedValue({ data: [ROW], error: null })
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))
    expect(await screen.findByTestId('results-title')).toHaveTextContent(CATEGORY_PRESENTATION.alta.label)
  })

  it('no aparelho do quiz, "Guardar meu resultado" aparece com o token de get_anon_assessment', async () => {
    seedQuiz()
    mocks.rpc.mockImplementation(async (fn: string) =>
      fn === 'get_anon_assessment'
        ? { data: [{ id: 'x', resume_token: TOKEN }], error: null }
        : { data: [], error: null },
    )
    renderAt('/results')
    expect(await screen.findByTestId('results-save-link')).toHaveTextContent('Guardar meu resultado')
    expect(mocks.rpc).toHaveBeenCalledWith('get_anon_assessment', {
      p_id: '00000000-0000-0000-0000-000000000001',
      p_session_id: 'sessao-results-0001',
    })
    expect(storedRecord().resume).toEqual({ token: TOKEN, assessmentId: '00000000-0000-0000-0000-000000000001' })
  })

  it('sem token conhecido (migration não aplicada), o botão não aparece', async () => {
    seedQuiz()
    mocks.rpc.mockResolvedValue({ data: [{ id: 'x' }], error: null })
    renderAt('/results')
    await screen.findByTestId('results-score')
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled())
    expect(screen.queryByTestId('results-save-link')).toBeNull()
  })
})
