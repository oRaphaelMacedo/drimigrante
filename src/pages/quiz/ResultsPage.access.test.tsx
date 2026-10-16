// @vitest-environment jsdom
/**
 * DI-053 — /results conforme o acesso da conta: quem já pagou nunca vê o
 * checkout (vê "Ir para o painel"), nem enquanto a conta é confirmada; partilha
 * com a família e "Já comprou? Entrar" para quem volta sem login.
 * Supabase, auth, analytics e Sentry mockados: nenhuma chamada de rede.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccessState } from '@/lib/access'

type AuthMock = {
  authUser: null | { user: { id: string; email: string }; subscription: null; roles: [] }
  session: null | { user: { id: string } }
  loading: boolean
  userDataError: Error | null
  access: AccessState
  dashboard: boolean
}

const NONE: AccessState = { state: 'none', expiresAt: null, daysLeft: null, hasPaidOnce: false, isStaff: false }

const mocks = vi.hoisted(() => ({
  auth: null as unknown as AuthMock,
  listeners: new Set<() => void>(),
  refreshUser: vi.fn(async () => null),
  invoke: vi.fn(),
  rpc: vi.fn(),
  track: vi.fn(),
  trackOnce: vi.fn(() => true),
}))

function setAuth(patch: Partial<AuthMock>) {
  mocks.auth = { ...mocks.auth, ...patch }
  act(() => {
    for (const listener of mocks.listeners) listener()
  })
}

vi.mock('@/hooks/useAuth', async () => {
  const { useSyncExternalStore } = await import('react')
  const subscribe = (listener: () => void) => {
    mocks.listeners.add(listener)
    return () => mocks.listeners.delete(listener)
  }
  return {
    useAuth: () => {
      const auth = useSyncExternalStore(subscribe, () => mocks.auth)
      return {
        authUser: auth.authUser,
        session: auth.session,
        loading: auth.loading,
        userDataError: auth.userDataError,
        access: auth.access,
        refreshUser: mocks.refreshUser,
        hasAccess: (feature: string) => feature === 'dashboard' && auth.dashboard,
      }
    },
  }
})
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  },
}))
vi.mock('@/hooks/useAssessment', () => ({ persistAssessment: vi.fn() }))
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mocks.track(...args),
  trackOnce: (...args: unknown[]) => mocks.trackOnce(...(args as [])),
}))
vi.mock('@/lib/attribution', () => ({ getAttribution: () => ({}) }))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: () => undefined, captureMessage: () => undefined },
}))

import { ResultsPage } from '@/pages/quiz/ResultsPage'

const ANSWERS = {
  processo_tipo: 'nacionalidade',
  caso_tipo: 'B,D',
  b1_tempo_casamento: 'mais_3_anos',
  d1_situacao_legal: 'sim',
  d2_tempo_autorizacao: 'menos_5',
}
const SESSION_KEY = 'sb-krjirhlmdnxqqrpzmowz-auth-token'
const USER = { id: 'u1', email: 'maria.souza@gmail.com' }

function seedQuiz() {
  localStorage.setItem(
    'dr_imigrante_quiz_result',
    JSON.stringify({
      sessionId: 'sessao-results-0001',
      assessmentId: '00000000-0000-0000-0000-000000000001',
      answers: ANSWERS,
      score: { total: 80, max: 100, percentage: 80, category: 'alta' },
      leadInfo: { fullName: 'Maria Souza', email: 'maria.souza@gmail.com' },
      completedAt: '2026-10-16T10:00:00.000Z',
    }),
  )
}

function signedIn(patch: Partial<AuthMock> = {}): Partial<AuthMock> {
  return {
    authUser: { user: USER, subscription: null, roles: [] },
    session: { user: { id: USER.id } },
    ...patch,
  }
}

function renderResults() {
  const router = createMemoryRouter(
    [
      { path: '/results', element: <ResultsPage /> },
      { path: '/dashboard', element: <h1>Painel</h1> },
      { path: '/dashboard/analysis', element: <h1>Análise</h1> },
      { path: '/login', element: <h1>Entrar</h1> },
      { path: '/quiz', element: <h1>Quiz</h1> },
    ],
    {
      initialEntries: ['/results'],
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

function expectNoCheckout() {
  expect(screen.queryByTestId('results-paywall')).toBeNull()
  expect(screen.queryByTestId('results-cta-paywall')).toBeNull()
  expect(screen.queryByTestId('results-sticky-cta')).toBeNull()
  expect(screen.queryByTestId('results-see-offer')).toBeNull()
  expect(document.body.textContent).not.toMatch(/Desbloquear por|4,90/)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mocks.auth = { authUser: null, session: null, loading: false, userDataError: null, access: NONE, dashboard: false }
  mocks.refreshUser.mockReset()
  mocks.refreshUser.mockResolvedValue(null)
  mocks.invoke.mockReset()
  mocks.rpc.mockReset()
  mocks.rpc.mockResolvedValue({ data: [], error: null })
  mocks.track.mockReset()
  mocks.trackOnce.mockClear()
  seedQuiz()
})

describe('quem já pagou', () => {
  it('acesso ativo: "Ir para o painel" com a data, sem checkout', async () => {
    mocks.auth = {
      ...mocks.auth,
      ...signedIn(),
      dashboard: true,
      access: { state: 'active', expiresAt: new Date(2026, 10, 15, 12), daysLeft: 30, hasPaidOnce: true, isStaff: false },
    }
    const router = renderResults()

    const card = await screen.findByTestId('results-paid')
    expect(card).toHaveTextContent('Você já tem acesso à análise completa')
    expect(within(card).getByTestId('results-paid-until')).toHaveTextContent('Seu acesso vai até 15 de novembro de 2026.')
    expectNoCheckout()
    expect(mocks.trackOnce).toHaveBeenCalledWith('results_viewed', 'sessao-results-0001', {
      category: 'alta',
      has_access: true,
    })

    await userEvent.click(within(card).getByRole('link', { name: /Ir para o painel/ }))
    expect(router.state.location.pathname).toBe('/dashboard')
  })

  it('o atalho secundário abre a análise completa', async () => {
    mocks.auth = { ...mocks.auth, ...signedIn(), dashboard: true, access: { ...NONE, state: 'recurring', hasPaidOnce: true } }
    renderResults()
    const card = await screen.findByTestId('results-paid')
    expect(within(card).getByRole('link', { name: 'Abrir a análise completa' })).toHaveAttribute('href', '/dashboard/analysis')
    // Assinatura: sem data de fim.
    expect(within(card).queryByTestId('results-paid-until')).toBeNull()
  })

  it('acesso expirado: painel com as opções, nunca a oferta de €30 de novo', async () => {
    mocks.auth = {
      ...mocks.auth,
      ...signedIn(),
      access: { state: 'expired', expiresAt: new Date(0), daysLeft: 0, hasPaidOnce: true, isStaff: false },
    }
    renderResults()

    const card = await screen.findByTestId('results-paid-expired')
    expect(card).toHaveTextContent('Seu acesso de 30 dias terminou')
    expect(within(card).getByRole('link', { name: /Ir para o painel/ })).toHaveAttribute('href', '/dashboard?acesso=expirado')
    expectNoCheckout()
  })
})

describe('conta ainda não confirmada', () => {
  it('logado e carregando: espera sem checkout e mostra a oferta se não houver compra', async () => {
    mocks.auth = { ...mocks.auth, ...signedIn(), loading: true }
    renderResults()

    expect(await screen.findByTestId('results-access-checking')).toHaveTextContent('Confirmando o acesso da sua conta')
    expectNoCheckout()
    // results_viewed espera o acesso ser conhecido (has_access certo).
    expect(mocks.trackOnce).not.toHaveBeenCalledWith('results_viewed', expect.anything(), expect.anything())

    setAuth({ loading: false })
    expect(await screen.findByTestId('results-paywall')).toBeInTheDocument()
    expect(mocks.trackOnce).toHaveBeenCalledWith('results_viewed', 'sessao-results-0001', {
      category: 'alta',
      has_access: false,
    })
  })

  it('sessão guardada no navegador, antes do INITIAL_SESSION: também espera', async () => {
    localStorage.setItem(SESSION_KEY, '{"access_token":"x"}')
    mocks.auth = { ...mocks.auth, loading: true }
    renderResults()
    expect(await screen.findByTestId('results-access-checking')).toBeInTheDocument()
    expectNoCheckout()
  })

  it('sem sessão nenhuma: a oferta aparece já (sem esperar o AuthContext)', async () => {
    mocks.auth = { ...mocks.auth, loading: true }
    renderResults()
    expect(await screen.findByTestId('results-paywall')).toBeInTheDocument()
  })

  it('falha ao carregar a assinatura: "Tentar de novo" e painel, nunca o checkout', async () => {
    mocks.auth = { ...mocks.auth, ...signedIn(), userDataError: new Error('timeout') }
    renderResults()

    const card = await screen.findByTestId('results-access-unknown')
    expect(card).toHaveTextContent('Não conseguimos confirmar seu acesso agora')
    expect(within(card).getByRole('link', { name: 'Ir para o painel' })).toHaveAttribute('href', '/dashboard')
    expectNoCheckout()

    await userEvent.click(within(card).getByRole('button', { name: 'Tentar de novo' }))
    expect(mocks.refreshUser).toHaveBeenCalledTimes(1)
  })
})

describe('sem compra', () => {
  it('visitante sem login: oferta e "Já comprou a análise? Entrar"', async () => {
    const router = renderResults()
    expect(await screen.findByTestId('results-paywall')).toBeInTheDocument()

    const login = screen.getByTestId('results-login-link')
    expect(login).toHaveTextContent('Já comprou a análise? Entrar')
    await userEvent.click(login)
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ returnTo: '/dashboard' })
  })

  it('logado sem compra: oferta, sem o link de entrar', async () => {
    mocks.auth = { ...mocks.auth, ...signedIn() }
    renderResults()
    expect(await screen.findByTestId('results-paywall')).toBeInTheDocument()
    expect(screen.queryByTestId('results-login-link')).toBeNull()
  })
})

describe('partilha com a família', () => {
  it('aparece para quem não pagou, abaixo da oferta', async () => {
    renderResults()
    const share = await screen.findByTestId('share-with-family')
    const paywall = screen.getByTestId('results-paywall')
    expect(paywall.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('aparece para quem já pagou', async () => {
    mocks.auth = { ...mocks.auth, ...signedIn(), dashboard: true, access: { ...NONE, state: 'active', hasPaidOnce: true } }
    renderResults()
    await screen.findByTestId('results-paid')
    await waitFor(() => expect(screen.getByTestId('share-with-family')).toBeInTheDocument())
  })
})
