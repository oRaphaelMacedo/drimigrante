// @vitest-environment jsdom
/**
 * DI-011 / DI-032 — compra em 1 clique: sem login, salvando de novo o
 * diagnóstico quando falta o assessmentId, com timeout e erros em português.
 * Supabase, analytics e Sentry são mockados (nenhuma chamada de rede).
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  persist: vi.fn(),
  track: vi.fn(),
  refreshUser: vi.fn(async () => null),
  authUser: null as null | { user: { email: string } },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) } },
}))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ authUser: mocks.authUser, refreshUser: mocks.refreshUser }),
}))
vi.mock('@/hooks/useAssessment', () => ({
  persistAssessment: (...args: unknown[]) => mocks.persist(...args),
}))
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mocks.track(...args),
}))
vi.mock('@/lib/attribution', () => ({ getAttribution: () => ({ utm_source: 'teste' }) }))
vi.mock('@/lib/sentry', () => ({
  Sentry: { captureException: () => undefined, captureMessage: () => undefined },
}))

import {
  CHECKOUT_TIMEOUT_MS,
  checkoutNavigation,
  parseStoredCheckoutData,
  resolveCheckoutMode,
  useStartCheckout,
} from './useStartCheckout'

const STORAGE_KEY = 'dr_imigrante_quiz_result'
const ASSESSMENT_ID = '00000000-0000-0000-0000-000000000001'

function seedQuiz(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      sessionId: 'e2e-session-0001-anon',
      assessmentId: ASSESSMENT_ID,
      answers: { processo_tipo: 'nacionalidade', tempo_residencia: '5_mais' },
      score: { total: 50, max: 100, percentage: 50, category: 'media' },
      leadInfo: { fullName: 'Maria Teste', email: 'Maria@Example.com' },
      ...overrides,
    }),
  )
}

const assign = vi.fn()

beforeEach(() => {
  localStorage.clear()
  mocks.invoke.mockReset()
  mocks.persist.mockReset()
  mocks.track.mockReset()
  mocks.refreshUser.mockClear()
  mocks.authUser = null
  assign.mockReset()
  checkoutNavigation.assign = assign
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dados locais e modo', () => {
  it('lê o resultado do quiz e decide o modo', () => {
    const data = parseStoredCheckoutData(
      JSON.stringify({ sessionId: 'abcdefgh-1', assessmentId: null, answers: { a: 'b' }, leadInfo: { email: 'x@y.pt' } }),
    )
    expect(data).toMatchObject({ sessionId: 'abcdefgh-1', assessmentId: null, email: 'x@y.pt' })
    expect(resolveCheckoutMode(false, data)).toBe('anonymous')
    expect(resolveCheckoutMode(true, null)).toBe('authenticated')
    expect(resolveCheckoutMode(false, null)).toBe('empty')
    expect(resolveCheckoutMode(false, { ...data!, email: null })).toBe('empty')
  })
})

describe('useStartCheckout', () => {
  it('anônimo com dados locais vai direto para o Stripe, sem login', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/pay/cs_test_x' }, error: null })
    const { result } = renderHook(() => useStartCheckout())
    expect(result.current.mode).toBe('anonymous')

    await act(() => result.current.start({ position: 'results_paywall' }))

    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    const [name, options] = mocks.invoke.mock.calls[0] as [string, { body: Record<string, unknown> }]
    expect(name).toBe('create-checkout-session')
    expect(options.body).toEqual({
      plan: 'one_time',
      assessmentId: ASSESSMENT_ID,
      sessionId: 'e2e-session-0001-anon',
      email: 'Maria@Example.com',
    })
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_x')
    expect(result.current.phase).toBe('redirecting')
    expect(mocks.track).toHaveBeenCalledWith('paywall_cta_clicked', { position: 'results_paywall' })
    expect(mocks.track).toHaveBeenCalledWith(
      'checkout_started',
      expect.objectContaining({ plan: 'one_time', value: 30, currency: 'EUR' }),
    )
  })

  it('sem assessmentId salva o diagnóstico de novo em vez de pedir para refazer o quiz', async () => {
    seedQuiz({ assessmentId: null })
    mocks.persist.mockResolvedValue({ assessment: { id: ASSESSMENT_ID }, error: null })
    mocks.invoke.mockImplementation(async (name: string) =>
      name === 'create-checkout-session'
        ? { data: { url: 'https://checkout.stripe.com/c/pay/cs_test_y' }, error: null }
        : { data: {}, error: null },
    )
    const { result } = renderHook(() => useStartCheckout())

    await act(() => result.current.start())

    expect(mocks.persist).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'e2e-session-0001-anon', email: 'Maria@Example.com', utmSource: 'teste' }),
    )
    const checkoutCall = mocks.invoke.mock.calls.find(([name]) => name === 'create-checkout-session') as [
      string,
      { body: Record<string, unknown> },
    ]
    expect(checkoutCall[1].body.assessmentId).toBe(ASSESSMENT_ID)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).assessmentId).toBe(ASSESSMENT_ID)
    expect(assign).toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('diagnóstico já ligado a uma conta: pede para entrar, não para tentar de novo', async () => {
    seedQuiz({ assessmentId: null })
    mocks.persist.mockResolvedValue({ assessment: null, error: 'Assessment already linked to a user' })
    const { result } = renderHook(() => useStartCheckout())

    await act(() => result.current.start())

    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(result.current.error).toMatchObject({ action: 'login', reason: 'assessment_linked' })
    expect(result.current.error?.message).not.toMatch(/refaça/i)
  })

  it('assessment_not_found do servidor: salva de novo uma vez e repete a compra', async () => {
    seedQuiz()
    const fresh = '00000000-0000-0000-0000-0000000000b3'
    mocks.persist.mockResolvedValue({ assessment: { id: fresh }, error: null })
    const notFound = () =>
      new FunctionsHttpError(
        new Response(JSON.stringify({ error: 'assessment_not_found' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    const checkoutBodies: Array<Record<string, unknown>> = []
    mocks.invoke.mockImplementation(async (name: string, options: { body: Record<string, unknown> }) => {
      if (name !== 'create-checkout-session') return { data: {}, error: null }
      checkoutBodies.push(options.body)
      return checkoutBodies.length === 1
        ? { data: null, error: notFound() }
        : { data: { url: 'https://checkout.stripe.com/c/pay/cs_test_w' }, error: null }
    })
    const { result } = renderHook(() => useStartCheckout())

    await act(() => result.current.start())

    expect(mocks.persist).toHaveBeenCalledTimes(1)
    expect(checkoutBodies.map((b) => b.assessmentId)).toEqual([ASSESSMENT_ID, fresh])
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_w')
  })

  it('erro do servidor nunca mostra a mensagem técnica', async () => {
    seedQuiz()
    const response = new Response(JSON.stringify({ error: 'internal_error', message: 'Stripe exploded' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) })
    const { result } = renderHook(() => useStartCheckout())

    await act(() => result.current.start())

    expect(result.current.error).toMatchObject({ action: 'retry', status: 500 })
    expect(result.current.error?.message).not.toMatch(/Stripe exploded|non-2xx/)
    expect(mocks.track).toHaveBeenCalledWith('checkout_failed', expect.objectContaining({ status: 500 }))
  })

  it('tempo esgotado: mensagem em português e "Tentar novamente"', async () => {
    vi.useFakeTimers()
    seedQuiz()
    mocks.invoke.mockImplementation(
      (_name: string, options: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          options.signal.addEventListener('abort', () =>
            resolve({ data: null, error: new FunctionsFetchError(options.signal.reason) }),
          )
        }),
    )
    const { result } = renderHook(() => useStartCheckout())

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.start()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CHECKOUT_TIMEOUT_MS + 10)
      await pending
    })

    expect(result.current.phase).toBe('error')
    expect(result.current.error).toMatchObject({ action: 'retry', reason: 'timeout' })
    expect(result.current.error?.message).toMatch(/demorou para responder/)
    expect(mocks.track).toHaveBeenCalledWith('checkout_failed', expect.objectContaining({ reason: 'timeout' }))
    expect(assign).not.toHaveBeenCalled()
  })

  it('409 already_active oferece abrir o painel', async () => {
    seedQuiz()
    const response = new Response(JSON.stringify({ error: 'already_active' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    })
    mocks.invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) })
    const { result } = renderHook(() => useStartCheckout())

    await act(() => result.current.start())

    expect(result.current.error).toMatchObject({ action: 'dashboard', reason: 'already_active', status: 409 })
  })

  it('email_sent (e-mail com acesso vigente) não redireciona', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: { status: 'email_sent', url: 'https://app/login' }, error: null })
    const { result } = renderHook(() => useStartCheckout())

    await act(() => result.current.start())

    expect(result.current.phase).toBe('email_sent')
    expect(assign).not.toHaveBeenCalled()
  })

  it('URL que não é https é recusada', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: { url: 'javascript:alert(1)' }, error: null })
    const { result } = renderHook(() => useStartCheckout())

    await act(() => result.current.start())

    expect(assign).not.toHaveBeenCalled()
    expect(result.current.error).toMatchObject({ reason: 'no_checkout_url', action: 'retry' })
  })

  it('sem dados locais nem login: leva ao quiz', async () => {
    const { result } = renderHook(() => useStartCheckout())
    expect(result.current.mode).toBe('empty')

    await act(() => result.current.start())

    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(result.current.error).toMatchObject({ action: 'quiz' })
  })

  it('voltar do Stripe pelo bfcache destrava o botão', async () => {
    seedQuiz()
    mocks.invoke.mockResolvedValue({ data: { url: 'https://checkout.stripe.com/c/pay/cs_test_z' }, error: null })
    const { result } = renderHook(() => useStartCheckout())
    await act(() => result.current.start())
    expect(result.current.isPending).toBe(true)

    act(() => {
      const event = new Event('pageshow') as PageTransitionEvent
      Object.defineProperty(event, 'persisted', { value: true })
      window.dispatchEvent(event)
    })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.phase).toBe('idle')
  })
})
