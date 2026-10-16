// @vitest-environment jsdom
/**
 * DI-053 — ganchos de retorno no Layout público:
 *  - banner "seu pré-diagnóstico está guardado" (nome e data, sem login, dispensável por 7 dias);
 *  - app instalado (/?source=pwa) com sessão vai direto para o painel.
 * useAuth, analytics e CookieBanner mockados; as páginas são placeholders.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type AuthMock = {
  authUser: null | { user: { id: string } }
  session: null | { user: { id: string } }
  loading: boolean
}

const mocks = vi.hoisted(() => ({
  auth: { authUser: null, session: null, loading: false } as AuthMock,
  listeners: new Set<() => void>(),
  signOut: vi.fn(),
  track: vi.fn(),
  trackOnce: vi.fn(() => true),
}))

/** Troca o estado do useAuth falso e re-renderiza quem o usa (como o AuthContext). */
function setAuth(next: AuthMock) {
  mocks.auth = next
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
      return { ...auth, signOut: mocks.signOut }
    },
  }
})
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mocks.track(...args),
  trackOnce: (...args: unknown[]) => mocks.trackOnce(...(args as [])),
}))
vi.mock('@/components/CookieBanner', () => ({ CookieBanner: () => null }))

import { Layout } from './Layout'
import { PWA_SESSION_WAIT_MS } from './pwa-launch'
import { RETURNING_BANNER_DISMISS_KEY } from '@/lib/returning-visit'

const QUIZ_KEY = 'dr_imigrante_quiz_result'
const SESSION_KEY = 'sb-krjirhlmdnxqqrpzmowz-auth-token'

function seedResult(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    QUIZ_KEY,
    JSON.stringify({
      sessionId: 'sessao-0001',
      assessmentId: '00000000-0000-0000-0000-000000000001',
      score: { total: 80, max: 100, percentage: 80, category: 'alta' },
      leadInfo: { fullName: 'Maria Souza', email: 'maria@example.com' },
      // Meio-dia local: o dia não muda com o fuso do ambiente de teste.
      completedAt: new Date(new Date().getFullYear(), 9, 16, 12).toISOString(),
      ...overrides,
    }),
  )
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <h1>Landing</h1> },
          { path: '/termos', element: <h1>Termos</h1> },
          { path: '/quiz', element: <h1>Quiz</h1> },
          { path: '/results', element: <h1>Resultado</h1> },
          { path: '/checkout/success', element: <h1>Pagamento confirmado</h1> },
          { path: '/login', element: <h1>Entrar</h1> },
        ],
      },
      { path: '/dashboard', element: <h1>Painel</h1> },
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
  const view = render(<RouterProvider router={router} future={{ v7_startTransition: true }} />)
  return { router, ...view }
}

const banner = () => screen.queryByTestId('returning-banner')

beforeEach(() => {
  localStorage.clear()
  mocks.auth = { authUser: null, session: null, loading: false }
  mocks.track.mockReset()
  mocks.trackOnce.mockClear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

afterEach(() => {
  vi.useRealTimers()
})

describe('banner de visitante que voltou', () => {
  it('com resultado e sem login: nome, data e atalho para o resultado', async () => {
    seedResult()
    const { router } = renderAt('/')

    const text = screen.getByTestId('returning-banner-text')
    expect(text).toHaveTextContent('Maria, seu pré-diagnóstico de 16/10 está guardado neste aparelho.')
    expect(text).not.toHaveTextContent(/e-?mail/i)
    expect(mocks.trackOnce).toHaveBeenCalledWith('returning_banner_viewed', expect.stringContaining('sessao-0001:'))

    await userEvent.click(screen.getByRole('link', { name: /Ver meu resultado/ }))
    expect(mocks.track).toHaveBeenCalledWith('returning_banner_clicked')
    expect(router.state.location.pathname).toBe('/results')
    // No /results (modo foco) o banner some.
    expect(banner()).toBeNull()
  })

  it('aparece na primeira pintura quando não há sessão guardada, mesmo com o AuthContext carregando', () => {
    seedResult()
    mocks.auth.loading = true
    renderAt('/')
    expect(banner()).not.toBeNull()
  })

  it('com sessão guardada, espera o AuthContext antes de mostrar', () => {
    seedResult()
    localStorage.setItem(SESSION_KEY, '{"access_token":"x"}')
    mocks.auth.loading = true
    renderAt('/termos')
    expect(banner()).toBeNull()
  })

  it('logado: não aparece', () => {
    seedResult()
    mocks.auth = { authUser: { user: { id: 'u1' } }, session: { user: { id: 'u1' } }, loading: false }
    renderAt('/')
    expect(banner()).toBeNull()
  })

  it('sem resultado válido: não aparece', () => {
    seedResult({ score: null })
    renderAt('/')
    expect(banner()).toBeNull()
  })

  it.each(['/quiz', '/results', '/login', '/checkout/success'])('%s: não aparece', (path) => {
    seedResult()
    renderAt(path)
    expect(banner()).toBeNull()
  })

  it('sem nome: frase neutra', () => {
    seedResult({ leadInfo: null })
    renderAt('/')
    expect(screen.getByTestId('returning-banner-text')).toHaveTextContent(
      /^Seu pré-diagnóstico de 16\/10 está guardado neste aparelho\.$/,
    )
  })

  it('dispensar: some, guarda por 7 dias e o foco vai para o conteúdo', async () => {
    seedResult()
    const { unmount } = renderAt('/')

    await userEvent.click(screen.getByRole('button', { name: 'Dispensar aviso' }))

    expect(banner()).toBeNull()
    expect(mocks.track).toHaveBeenCalledWith('returning_banner_dismissed')
    expect(JSON.parse(localStorage.getItem(RETURNING_BANNER_DISMISS_KEY) ?? '{}')).toMatchObject({ key: 'sessao-0001' })
    expect(document.activeElement).toBe(screen.getByRole('main'))

    unmount()
    renderAt('/')
    expect(banner()).toBeNull()
  })

  it('o botão de dispensar tem alvo de 44px', () => {
    seedResult()
    renderAt('/')
    expect(screen.getByRole('button', { name: 'Dispensar aviso' })).toHaveClass('h-11', 'w-11')
  })
})

describe('app instalado (/?source=pwa)', () => {
  it('com sessão: vai direto para o painel (replace)', async () => {
    mocks.auth = { authUser: { user: { id: 'u1' } }, session: { user: { id: 'u1' } }, loading: true }
    const { router } = renderAt('/?source=pwa')

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(mocks.track).toHaveBeenCalledWith('pwa_launched', { signed_in: true })
  })

  it('sem sessão: fica na landing', () => {
    const { router } = renderAt('/?source=pwa')
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { name: 'Landing' })).toBeInTheDocument()
    expect(mocks.track).toHaveBeenCalledWith('pwa_launched', { signed_in: false })
  })

  it('sem ?source=pwa, logado na landing: não redireciona', () => {
    mocks.auth = { authUser: { user: { id: 'u1' } }, session: { user: { id: 'u1' } }, loading: false }
    const { router } = renderAt('/')
    expect(router.state.location.pathname).toBe('/')
    expect(mocks.track).not.toHaveBeenCalledWith('pwa_launched', expect.anything())
  })

  it('sessão guardada ainda carregando: "Abrindo o app…" em vez de piscar a landing', async () => {
    localStorage.setItem(SESSION_KEY, '{"access_token":"x"}')
    mocks.auth.loading = true
    const view = renderAt('/?source=pwa')

    expect(screen.getByTestId('pwa-launch-pending')).toHaveTextContent('Abrindo o app…')
    expect(screen.queryByRole('heading', { name: 'Landing' })).toBeNull()

    setAuth({ authUser: null, session: { user: { id: 'u1' } }, loading: true })
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/dashboard'))
  })

  it('a espera tem limite: sem resposta, mostra a landing', async () => {
    vi.useFakeTimers()
    localStorage.setItem(SESSION_KEY, '{"access_token":"x"}')
    mocks.auth.loading = true
    renderAt('/?source=pwa')
    expect(screen.getByTestId('pwa-launch-pending')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(PWA_SESSION_WAIT_MS + 10)
    })
    expect(screen.queryByTestId('pwa-launch-pending')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Landing' })).toBeInTheDocument()
  })
})
