// @vitest-environment jsdom
/**
 * DI-025 — o AuthContext não pode tratar falha de carregamento como
 * "sem assinatura", e só vincula o assessment anônimo com o mesmo e-mail.
 * Supabase, Sentry e analytics são mockados (nenhuma chamada de rede).
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: string, session: unknown) => void
type Responder = (table: string) => Promise<{ data: unknown; error: unknown }>

const mocks = vi.hoisted(() => ({
  listeners: [] as Array<(event: string, session: unknown) => void>,
  respond: null as null | ((table: string) => Promise<{ data: unknown; error: unknown }>),
  queries: [] as string[],
  linked: [] as Array<[string, string]>,
  identified: [] as string[],
  resets: 0,
}))

vi.mock('@/lib/supabase', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {}
    const self = () => chain
    chain.select = self
    chain.eq = self
    chain.abortSignal = self
    chain.maybeSingle = self
    chain.retry = () => {
      mocks.queries.push(table)
      return mocks.respond ? mocks.respond(table) : Promise.resolve({ data: null, error: null })
    }
    return chain
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      auth: {
        onAuthStateChange: (cb: Listener) => {
          mocks.listeners.push(cb)
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  mocks.listeners = mocks.listeners.filter((l: Listener) => l !== cb)
                },
              },
            },
          }
        },
        signOut: async () => ({ error: null }),
        signInWithOtp: async () => ({ error: null }),
        verifyOtp: async () => ({ error: null }),
        signInWithPassword: async () => ({ error: null }),
        signInWithOAuth: async () => ({ error: null }),
      },
    },
  }
})

vi.mock('@/lib/sentry', () => ({
  Sentry: {
    captureException: () => undefined,
    captureMessage: () => undefined,
    addBreadcrumb: () => undefined,
  },
}))

vi.mock('@/lib/analytics', () => ({
  identify: (userId: string) => {
    mocks.identified.push(userId)
  },
  resetAnalytics: () => {
    mocks.resets++
  },
}))

vi.mock('@/lib/query-client', () => ({ queryClient: { clear: () => undefined } }))

vi.mock('@/hooks/useAssessment', () => ({
  linkAnonAssessmentToUser: async (id: string, sessionId: string) => {
    mocks.linked.push([id, sessionId])
    return { assessment: null, error: null }
  },
}))

import { AuthProvider, useAuth } from './AuthContext'

const USER = { id: 'user-1', email: 'Ana.Souza@example.com' }
const SESSION = { access_token: 't', user: USER }
const DAY = 86_400_000

function Probe() {
  const { loading, userDataError, authUser, access, hasAccess } = useAuth()
  return (
    <pre data-testid="probe">
      {JSON.stringify({
        loading,
        error: userDataError ? userDataError.name : null,
        hasSubscription: Boolean(authUser?.subscription),
        state: access.state,
        dashboard: hasAccess('dashboard'),
      })}
    </pre>
  )
}

function readProbe() {
  return JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as {
    loading: boolean
    error: string | null
    hasSubscription: boolean
    state: string
    dashboard: boolean
  }
}

function emit(event: string, session: unknown) {
  act(() => {
    for (const listener of [...mocks.listeners]) listener(event, session)
  })
}

const paidSubscription = () => ({
  user_id: USER.id,
  one_time_paid: true,
  one_time_access_expires_at: new Date(Date.now() + 20 * DAY).toISOString(),
  recurring_active: false,
  has_dashboard_access: true,
  has_full_analysis: true,
  has_chat_access: true,
})

const okResponder: Responder = (table) => {
  if (table === 'subscriptions') return Promise.resolve({ data: paidSubscription(), error: null })
  if (table === 'user_roles') return Promise.resolve({ data: [], error: null })
  return Promise.resolve({ data: { id: USER.id, full_name: 'Ana' }, error: null })
}

beforeEach(() => {
  vi.useFakeTimers()
  mocks.listeners = []
  mocks.respond = null
  mocks.queries = []
  mocks.linked = []
  mocks.identified = []
  mocks.resets = 0
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AuthContext', () => {
  it('carrega a assinatura e calcula o acesso', async () => {
    mocks.respond = okResponder
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    emit('INITIAL_SESSION', SESSION)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(readProbe()).toEqual({
      loading: false,
      error: null,
      hasSubscription: true,
      state: 'active',
      dashboard: true,
    })
    expect(mocks.identified).toEqual([USER.id])
  })

  it('timeout simulado expõe userDataError (não vira "sem assinatura" silencioso)', async () => {
    // Nenhuma consulta responde: cada tentativa estoura o timeout de 8 s.
    mocks.respond = () => new Promise(() => {})
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    emit('INITIAL_SESSION', SESSION)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(readProbe().loading).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000)
    })
    const probe = readProbe()
    expect(probe.loading).toBe(false)
    expect(probe.error).toBe('UserDataLoadError')
    expect(probe.dashboard).toBe(false)
    // 3 tentativas × 3 consultas
    expect(mocks.queries.filter((t: string) => t === 'subscriptions')).toHaveLength(3)
  })

  it('erro do PostgREST na assinatura também expõe userDataError', async () => {
    mocks.respond = (table: string) =>
      table === 'subscriptions'
        ? Promise.resolve({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } })
        : okResponder(table)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    emit('INITIAL_SESSION', SESSION)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(readProbe()).toMatchObject({ loading: false, error: 'UserDataLoadError' })
  })

  it('falha num refresh em segundo plano mantém os últimos dados confiáveis', async () => {
    mocks.respond = okResponder
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    emit('INITIAL_SESSION', SESSION)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(readProbe().state).toBe('active')

    // Aba volta a ficar visível (supabase-js emite SIGNED_IN) e a rede falha.
    mocks.respond = () => Promise.resolve({ data: null, error: { message: 'fetch failed' } })
    emit('SIGNED_IN', SESSION)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(readProbe()).toMatchObject({ loading: false, error: null, state: 'active', dashboard: true })
  })

  it('vincula o assessment anônimo só quando o e-mail do quiz é o da conta', async () => {
    mocks.respond = okResponder
    localStorage.setItem(
      'dr_imigrante_quiz_result',
      JSON.stringify({ assessmentId: 'a-1', sessionId: 's-1', leadInfo: { email: 'ana.souza@EXAMPLE.com' } }),
    )
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    emit('SIGNED_IN', SESSION)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(mocks.linked).toEqual([['a-1', 's-1']])
  })

  it('não vincula o assessment de outro e-mail e não apaga o resultado local', async () => {
    mocks.respond = okResponder
    const stored = JSON.stringify({
      assessmentId: 'a-2',
      sessionId: 's-2',
      leadInfo: { email: 'outra.pessoa@example.com' },
    })
    localStorage.setItem('dr_imigrante_quiz_result', stored)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    emit('SIGNED_IN', SESSION)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(mocks.linked).toEqual([])
    expect(localStorage.getItem('dr_imigrante_quiz_result')).toBe(stored)
  })

  it('SIGNED_OUT limpa o estado e reseta o analytics', async () => {
    mocks.respond = okResponder
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    emit('INITIAL_SESSION', SESSION)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    emit('SIGNED_OUT', null)
    expect(readProbe()).toMatchObject({ loading: false, hasSubscription: false, state: 'none' })
    expect(mocks.resets).toBe(1)
  })
})
