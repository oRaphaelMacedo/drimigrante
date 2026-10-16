// @vitest-environment jsdom
/**
 * useSubscribeCheckout — assinatura de €4,90/mês a partir do dashboard.
 * Nada de rede: a function create-checkout-session é um mock.
 */
import { act, renderHook } from '@testing-library/react'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  refreshUser: vi.fn(async () => null),
  track: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: mocks.invoke } } }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ refreshUser: mocks.refreshUser }) }))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { SUBSCRIBE_TIMEOUT_MS, useSubscribeCheckout } from './useSubscribeCheckout'

const ASSESSMENT_ID = '00000000-0000-4000-8000-0000000000aa'

function httpError(status: number, body: Record<string, unknown>) {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }))
}

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, assign },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useSubscribeCheckout', () => {
  it('chama a function do plano recorrente com limite de tempo e vai para o Stripe', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { url: 'https://checkout.stripe.com/c/abc' }, error: null })
    const { result } = renderHook(() => useSubscribeCheckout(ASSESSMENT_ID))

    await act(async () => {
      await result.current.subscribe('sheet_chat')
    })

    expect(mocks.invoke).toHaveBeenCalledWith('create-checkout-session', {
      body: { plan: 'recurring', assessmentId: ASSESSMENT_ID },
      timeout: SUBSCRIBE_TIMEOUT_MS,
    })
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/abc')
    expect(mocks.track).toHaveBeenCalledWith('upsell_clicked', { placement: 'sheet_chat' })
    // Indo para o Stripe, o botão continua ocupado.
    expect(result.current.isPending).toBe(true)
  })

  it('nunca segue para uma URL que não seja https', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { url: 'javascript:alert(1)' }, error: null })
    const { result } = renderHook(() => useSubscribeCheckout(null))

    await act(async () => {
      await result.current.subscribe('home_card')
    })

    expect(assign).not.toHaveBeenCalled()
    expect(mocks.toast.error).toHaveBeenCalledWith('Não foi possível abrir o pagamento', expect.anything())
    expect(result.current.isPending).toBe(false)
  })

  it('409 already_active: atualiza a conta em vez de cobrar de novo', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: httpError(409, { error: 'already_active' }) })
    const { result } = renderHook(() => useSubscribeCheckout(null))

    await act(async () => {
      await result.current.subscribe('banner_expired')
    })

    expect(mocks.refreshUser).toHaveBeenCalled()
    expect(mocks.toast.success).toHaveBeenCalledWith('Sua assinatura já está ativa.')
    expect(assign).not.toHaveBeenCalled()
  })

  it('403 one_time_required: explica que a assinatura vem depois do €30', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: httpError(403, { error: 'one_time_required' }) })
    const { result } = renderHook(() => useSubscribeCheckout(null))

    await act(async () => {
      await result.current.subscribe('sheet_plan')
    })

    expect(mocks.toast.error).toHaveBeenCalledWith('Assinatura indisponível', expect.anything())
    expect(mocks.track).toHaveBeenCalledWith('checkout_failed', {
      plan: 'recurring',
      status: 403,
      reason: 'one_time_required',
    })
  })

  it('tempo esgotado: mensagem em português e o botão volta ao normal', async () => {
    const abort = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(abort) })
    const { result } = renderHook(() => useSubscribeCheckout(null))

    await act(async () => {
      await result.current.subscribe('banner_expiring')
    })

    expect(mocks.toast.error).toHaveBeenCalledWith('A conexão está lenta', expect.anything())
    expect(mocks.track).toHaveBeenCalledWith('checkout_failed', { plan: 'recurring', reason: 'timeout' })
    expect(result.current.isPending).toBe(false)
  })

  it('voltar do Stripe pelo bfcache libera o botão', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { url: 'https://checkout.stripe.com/c/abc' }, error: null })
    const { result } = renderHook(() => useSubscribeCheckout(null))

    await act(async () => {
      await result.current.subscribe('sheet_chat')
    })
    expect(result.current.isPending).toBe(true)

    act(() => {
      const event = new Event('pageshow') as PageTransitionEvent
      Object.defineProperty(event, 'persisted', { value: true })
      window.dispatchEvent(event)
    })
    expect(result.current.isPending).toBe(false)
  })

  it('ignora toques repetidos enquanto a chamada está em andamento', async () => {
    let resolve: (value: unknown) => void = () => undefined
    mocks.invoke.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => useSubscribeCheckout(null))

    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.subscribe('sheet_chat')
      void result.current.subscribe('sheet_chat')
    })
    await act(async () => {
      resolve({ data: { url: 'https://checkout.stripe.com/c/abc' }, error: null })
      await first
    })

    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })
})
