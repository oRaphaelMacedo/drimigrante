// @vitest-environment jsdom
/**
 * Telas de compra (DI-010, DI-011, DI-026, DI-033): Resultado, /checkout e
 * /checkout/success com Supabase, auth, analytics e Sentry mockados (nenhuma
 * chamada de rede, nenhum Stripe).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  verifyOtp: vi.fn(),
  persist: vi.fn(),
  track: vi.fn(),
  trackOnce: vi.fn(() => true),
  refreshUser: vi.fn(async () => null),
  paid: false,
  loading: false,
  authUser: null as null | { user: { id: string; email: string } },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    auth: { verifyOtp: (...args: unknown[]) => mocks.verifyOtp(...args) },
  },
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    authUser: mocks.authUser,
    loading: mocks.loading,
    refreshUser: mocks.refreshUser,
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
import { CheckoutPage } from '@/pages/checkout/CheckoutPage'
import { SuccessPage } from '@/pages/checkout/SuccessPage'
import { CHECKOUT_SESSION_STORAGE_KEY } from '@/pages/checkout/success-flow'

const STORAGE_KEY = 'dr_imigrante_quiz_result'
const SESSION_ID = 'cs_test_a1B2c3D4'

/** Textos proibidos antes do pagamento e na confirmação (DI-010). */
const FORBIDDEN_COPY =
  /advogados|24h|24 horas|garantia|mais popular|cancele quando quiser|subscrição mensal|assinatura mensal|4,90|Ref:|Enviámos um recibo/i

function seedQuiz() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sessionId: 'e2e-session-0001-anon',
      assessmentId: '00000000-0000-0000-0000-000000000001',
      answers: { processo_tipo: 'nacionalidade' },
      score: { total: 50, max: 100, percentage: 62, category: 'media' },
      visas: [
        { code: 'NAC_RES', name: 'Nacionalidade por residência', match: 'strong', reason: 'detalhe pago' },
        { code: 'D7', name: 'Visto D7', match: 'weak', reason: 'detalhe pago' },
      ],
      leadInfo: { fullName: 'Maria Souza', email: 'maria.souza@gmail.com' },
      completedAt: '2026-10-16T10:00:00.000Z',
    }),
  )
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/results', element: <ResultsPage /> },
      { path: '/checkout', element: <CheckoutPage /> },
      { path: '/checkout/success', element: <SuccessPage /> },
      { path: '/dashboard', element: <h1>Painel</h1> },
      { path: '/login', element: <h1>Entrar na sua conta</h1> },
      { path: '/quiz', element: <h1>Quiz</h1> },
      { path: '/termos', element: <h1>Termos</h1> },
    ],
    {
      initialEntries: [path],
      future: {
        v7_relativeSplatPath: true,
        v7_fetcherPersist: true,
        v7_normalizeFormMethod: true,
        v7_partialHydration: true,
        v7_skipActionErrorRevalidation: true,
      },
    },
  )
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />)
  return router
}

function httpError(status: number, body: unknown) {
  return new FunctionsHttpError(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mocks.invoke.mockReset()
  mocks.verifyOtp.mockReset()
  mocks.persist.mockReset()
  mocks.track.mockReset()
  mocks.trackOnce.mockClear()
  mocks.refreshUser.mockClear()
  mocks.paid = false
  mocks.loading = false
  mocks.authUser = null
})

describe('ResultsPage', () => {
  it('mostra a oferta do €30 sem promessas falsas nem o plano mensal', async () => {
    seedQuiz()
    renderAt('/results')

    expect(await screen.findByTestId('results-cta-paywall')).toHaveTextContent('Desbloquear por €30')
    expect(document.body.textContent).not.toMatch(FORBIDDEN_COPY)
    expect(screen.getByText(/maria\.souza@gmail\.com/)).toBeInTheDocument()
  })

  it('?checkout=cancelled: aviso neutro, evento único e URL limpa', async () => {
    seedQuiz()
    const router = renderAt('/results?checkout=cancelled')

    expect(await screen.findByTestId('checkout-cancelled-notice')).toHaveTextContent(
      'Pagamento não concluído. Nada foi cobrado.',
    )
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(mocks.track.mock.calls.filter(([name]) => name === 'checkout_cancelled')).toHaveLength(1)
  })

  it('results_viewed e quiz_completed usam trackOnce por diagnóstico', async () => {
    seedQuiz()
    renderAt('/results')
    await screen.findByTestId('results-score')

    const onceEvents = mocks.trackOnce.mock.calls.map((call) => (call as unknown[])[0])
    expect(onceEvents).toEqual(expect.arrayContaining(['results_viewed', 'quiz_completed', 'paywall_viewed']))
    expect(mocks.track).not.toHaveBeenCalledWith('results_viewed', expect.anything())
  })

  it('erro do pagamento aparece em português, logo abaixo do botão, com "Tentar novamente"', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(500, { error: 'internal_error' }) })
    renderAt('/results')

    await userEvent.click(await screen.findByTestId('results-cta-paywall'))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/problema do nosso lado/)
    expect(alert).not.toHaveTextContent(/non-2xx|internal_error/)
    expect(screen.getByTestId('checkout-retry')).toBeInTheDocument()
  })
})

describe('CheckoutPage', () => {
  it('anônimo com dados locais: resumo único, sem login, e o banner de cancelamento', async () => {
    seedQuiz()
    renderAt('/checkout?cancelled=1')

    expect(await screen.findByTestId('checkout-cancelled-banner')).toHaveTextContent('Nada foi cobrado')
    expect(screen.getByTestId('checkout-plan-onetime')).toBeInTheDocument()
    expect(screen.getByTestId('checkout-submit')).toHaveTextContent('Pagar €30')
    expect(screen.queryByRole('radio')).toBeNull()
    expect(document.body.textContent).not.toMatch(/Será pedido para entrar/)
    expect(document.body.textContent).not.toMatch(FORBIDDEN_COPY)
    expect(screen.getByRole('link', { name: /Voltar ao resultado/ })).toHaveAttribute('href', '/results')
  })

  it('o botão chama create-checkout-session direto (sem /login)', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: { status: 'email_sent' }, error: null })
    const router = renderAt('/checkout')

    await userEvent.click(await screen.findByTestId('checkout-submit'))

    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('create-checkout-session', expect.anything()))
    expect(router.state.location.pathname).toBe('/checkout')
    expect(await screen.findByTestId('checkout-email-sent')).toBeInTheDocument()
  })

  it('sem dados locais nem login: estado vazio com quiz e "Já paguei, entrar"', async () => {
    renderAt('/checkout')

    expect(await screen.findByTestId('checkout-empty')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Fazer o quiz grátis/ })).toHaveAttribute('href', '/quiz')
    expect(screen.getByRole('link', { name: 'Já paguei, entrar' })).toHaveAttribute('href', '/login')
  })

  it('quem já tem acesso vai para o painel', async () => {
    mocks.paid = true
    renderAt('/checkout')
    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument()
  })
})

describe('SuccessPage', () => {
  it('tira o session_id da URL, não mostra o id e conta a compra uma vez', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: { status: 'email_sent' }, error: null })
    const router = renderAt(`/checkout/success?session_id=${SESSION_ID}`)

    await waitFor(() => expect(screen.getByTestId('checkout-success')).toHaveAttribute('data-state', 'email_sent'))
    expect(router.state.location.search).toBe('')
    expect(sessionStorage.getItem(CHECKOUT_SESSION_STORAGE_KEY)).toBe(SESSION_ID)
    expect(document.body.textContent).not.toContain(SESSION_ID)
    expect(document.body.textContent).not.toMatch(FORBIDDEN_COPY)
    expect(screen.getByText(/ma•••@gmail\.com/)).toBeInTheDocument()

    const purchases = mocks.trackOnce.mock.calls.filter((call) => (call as unknown[])[0] === 'purchase')
    expect(purchases).toHaveLength(1)
    const [, key, props] = purchases[0] as unknown as [string, string, Record<string, unknown>]
    expect(key).not.toContain(SESSION_ID)
    expect(props).toMatchObject({ value: 30, currency: 'EUR' })
  })

  it('claim 500: fallback com reenvio e contato, sem dizer que o pagamento foi confirmado', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(500, { error: 'internal_error' }) })
    renderAt(`/checkout/success?session_id=${SESSION_ID}`)

    await waitFor(() => expect(screen.getByTestId('checkout-success')).toHaveAttribute('data-state', 'fallback'))
    expect(screen.getByTestId('checkout-success-resend')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /@drimigrante\.com/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:/),
    )
    expect(document.body.textContent).not.toMatch(/Pagamento confirmado/)
    expect(mocks.trackOnce.mock.calls.some((call) => (call as unknown[])[0] === 'purchase')).toBe(false)
  })

  it('claim com token: entra com verifyOtp (sem /login)', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'token', token_hash: 'hash-123' }, error: null })
    mocks.verifyOtp.mockResolvedValue({ data: {}, error: null })
    const router = renderAt(`/checkout/success?session_id=${SESSION_ID}`)

    await waitFor(() => expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash-123' }))
    expect(screen.getByTestId('checkout-success')).toHaveAttribute('data-state', 'signing_in')
    expect(router.state.location.pathname).toBe('/checkout/success')
  })

  it('pagamento em processamento (403) não manda para o login', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(403, { error: 'payment_not_completed' }) })
    const router = renderAt(`/checkout/success?session_id=${SESSION_ID}`)

    await waitFor(() => expect(screen.getByTestId('checkout-success')).toHaveAttribute('data-state', 'processing'))
    expect(router.state.location.pathname).toBe('/checkout/success')
  })

  it('sem session_id e sem login: pede para entrar com o e-mail da compra', async () => {
    renderAt('/checkout/success')
    await waitFor(() => expect(screen.getByTestId('checkout-success')).toHaveAttribute('data-state', 'missing'))
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
