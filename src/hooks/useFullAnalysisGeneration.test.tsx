// @vitest-environment jsdom
/**
 * useFullAnalysisGeneration (DI-018): disparo único, polling curto e limitado,
 * mapeamento dos erros. Sem rede: o supabase-js é falso.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  invoke: vi.fn(async (_name: string, _options?: unknown): Promise<{ data: unknown; error: unknown }> => ({
    data: { status: 'ready' },
    error: null,
  })),
}))

vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: h.invoke } } }))

import { useFullAnalysisGeneration, type UseFullAnalysisGenerationOptions } from './useFullAnalysisGeneration'

const ID = '00000000-0000-4000-8000-0000000000aa'

function setup(overrides: Partial<UseFullAnalysisGenerationOptions> = {}) {
  const refetch = vi.fn(async () => undefined)
  const initialProps: UseFullAnalysisGenerationOptions = {
    assessmentId: ID,
    enabled: true,
    ready: false,
    refetch,
    pollIntervalMs: 10,
    maxPolls: 3,
    ...overrides,
  }
  // Todos os estados por que o hook passou (sem depender do intervalo do waitFor).
  const seen: string[] = []
  const hook = renderHook(
    (props: UseFullAnalysisGenerationOptions) => {
      const value = useFullAnalysisGeneration(props)
      seen.push(value.status)
      return value
    },
    { initialProps },
  )
  return { ...hook, refetch, initialProps, seen }
}

beforeEach(() => {
  h.invoke.mockReset()
  h.invoke.mockImplementation(async () => ({ data: { status: 'ready' }, error: null }))
})

describe('useFullAnalysisGeneration', () => {
  it('sem acesso/sem RPC (enabled=false) ou com a análise pronta → não chama a função', async () => {
    setup({ enabled: false })
    setup({ ready: true })
    setup({ assessmentId: null })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('dispara uma única vez por assessment, mesmo com novas renderizações', async () => {
    const { rerender, initialProps } = setup()
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1))
    rerender({ ...initialProps })
    rerender({ ...initialProps, refetch: vi.fn(async () => undefined) })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(h.invoke).toHaveBeenCalledTimes(1)
    expect(h.invoke).toHaveBeenCalledWith('generate-explanation', {
      body: { assessment_id: ID, mode: 'full' },
      timeout: expect.any(Number),
    })
  })

  it('"ready" → relê a análise na hora; com o texto chegando, para de conferir', async () => {
    const { result, rerender, refetch, initialProps } = setup()
    await waitFor(() => expect(refetch).toHaveBeenCalled())
    rerender({ ...initialProps, ready: true })
    expect(result.current.status).toBe('idle')
    const calls = refetch.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(refetch.mock.calls.length).toBe(calls)
  })

  it('202 in_progress → polling curto e limitado; sem o texto, termina em "failed" (sem loop)', async () => {
    h.invoke.mockImplementation(async () => ({ data: { status: 'in_progress' }, error: null }))
    const { result, refetch, seen } = setup()
    await waitFor(() => expect(result.current.status).toBe('failed'))
    expect(seen).toContain('waiting')
    // 1 leitura imediata + até maxPolls (3) leituras.
    expect(refetch).toHaveBeenCalledTimes(4)
    expect(h.invoke).toHaveBeenCalledTimes(1)
  })

  it('queda de conexão no meio → continua conferindo (a geração pode ter terminado no servidor)', async () => {
    h.invoke.mockImplementation(async () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to fetch' } }))
    const { refetch, seen } = setup({ pollIntervalMs: 50, maxPolls: 100 })
    await waitFor(() => expect(refetch).toHaveBeenCalled())
    expect(seen).toContain('waiting')
    expect(seen).not.toContain('failed')
  })

  it.each([
    [401, 'auth_required'],
    [403, 'payment_required'],
    [404, 'not_found'],
    [409, 'failed'],
    [500, 'failed'],
  ])('HTTP %i → %s', async (status, expected) => {
    h.invoke.mockImplementation(async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status } } }))
    const { result, refetch } = setup()
    await waitFor(() => expect(result.current.status).toBe(expected))
    expect(refetch).not.toHaveBeenCalled()
  })

  it('202 deferred → "deferred"; "Tentar de novo" chama a função de novo; clique repetido durante o pedido é ignorado', async () => {
    h.invoke.mockImplementation(async () => ({ data: { status: 'deferred', reason: 'capacity' }, error: null }))
    const { result } = setup({ pollIntervalMs: 1_000 })
    await waitFor(() => expect(result.current.status).toBe('deferred'))

    let finish: (value: { data: unknown; error: unknown }) => void = () => undefined
    h.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    act(() => {
      result.current.retry()
      result.current.retry()
    })
    expect(result.current.status).toBe('generating')
    expect(h.invoke).toHaveBeenCalledTimes(2)
    await act(async () => {
      finish({ data: { status: 'ready' }, error: null })
    })
    expect(result.current.status).toBe('waiting')
  })

  it('desmontar no meio do pedido não atualiza o estado', async () => {
    let finish: (value: { data: unknown; error: unknown }) => void = () => undefined
    h.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { unmount, refetch } = setup()
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => {
      finish({ data: { status: 'ready' }, error: null })
    })
    expect(refetch).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
