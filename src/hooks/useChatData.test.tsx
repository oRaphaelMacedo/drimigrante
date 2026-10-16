// @vitest-environment jsdom
/**
 * useChatData (DI-051): histórico das mensagens MAIS RECENTES com "carregar
 * anteriores" e erros de envio tipados. Sem rede: Supabase e fetch falsos.
 */
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHAT_ASSESSMENT_ID,
  jsonResponse,
  makeMessages,
  sseResponse,
  type ChatSupabaseState,
} from '@/test/chat-fakes'

const h = vi.hoisted(() => ({ state: { rows: [], messageQueries: [] } as unknown as ChatSupabaseState }))

vi.mock('@/lib/supabase', async () => {
  const fakes = await import('@/test/chat-fakes')
  const client = fakes.createChatSupabase(h.state)
  return { supabase: client }
})
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ authUser: { user: { id: 'u1', email: 'ana@example.com' } } }),
}))

import {
  CHAT_PAGE_SIZE,
  ChatSendError,
  chatErrorFromResponse,
  describeChatSendError,
  flattenMessagePages,
  useChatData,
} from './useChatData'

// Folga no tempo de cada teste com a máquina carregada (jsdom + React Query).
vi.setConfig({ testTimeout: 20_000 })

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

beforeEach(() => {
  localStorage.setItem('dr_imigrante_quiz_result', JSON.stringify({ assessmentId: CHAT_ASSESSMENT_ID }))
  h.state.rows = []
  h.state.messageQueries = []
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('useChatData — histórico', () => {
  it('com 60 mensagens, abre nas 50 MAIS RECENTES em ordem cronológica e oferece as anteriores', async () => {
    h.state.rows = makeMessages(60)
    const { result } = renderHook(() => useChatData(), { wrapper })
    await waitFor(() => expect(result.current.messages).toHaveLength(CHAT_PAGE_SIZE))
    expect(result.current.messages[result.current.messages.length - 1].content).toBe('Mensagem 60')
    expect(result.current.messages[0].content).toBe('Mensagem 11')
    expect(result.current.hasOlderMessages).toBe(true)
    // Consulta do mais novo para o mais antigo, uma a mais para saber se há anteriores.
    expect(h.state.messageQueries[0]).toEqual({ lt: null, ascending: false, limit: CHAT_PAGE_SIZE + 1 })

    let loaded = false
    await act(async () => {
      loaded = await result.current.loadOlderMessages()
    })
    expect(loaded).toBe(true)
    await waitFor(() => expect(result.current.messages).toHaveLength(60))
    expect(result.current.messages[0].content).toBe('Mensagem 1')
    expect(result.current.messages[59].content).toBe('Mensagem 60')
    expect(result.current.hasOlderMessages).toBe(false)
    expect(h.state.messageQueries[1].lt).toBe(makeMessages(60)[10].created_at)
  })

  it('poucas mensagens: sem "carregar anteriores"', async () => {
    h.state.rows = makeMessages(3)
    const { result } = renderHook(() => useChatData(), { wrapper })
    await waitFor(() => expect(result.current.messages).toHaveLength(3))
    expect(result.current.hasOlderMessages).toBe(false)
  })

  it('flattenMessagePages junta páginas sem repetir e em ordem cronológica', () => {
    const rows = makeMessages(4)
    const pages = [
      { messages: [rows[3], rows[2]], hasMore: true },
      { messages: [rows[2], rows[1], rows[0]], hasMore: false },
    ]
    expect(flattenMessagePages(pages).map((m) => m.id)).toEqual(['m001', 'm002', 'm003', 'm004'])
    expect(flattenMessagePages(undefined)).toEqual([])
  })
})

describe('useChatData — envio', () => {
  it('SSE: acumula a resposta e mantém a troca na tela até o histórico trazê-la', async () => {
    h.state.rows = makeMessages(2)
    fetchMock.mockImplementation(async () => {
      // O servidor grava pergunta e resposta antes de fechar o stream.
      h.state.rows = [
        ...makeMessages(2),
        { id: 'q', role: 'user', content: 'Qual o próximo passo?', created_at: '2026-10-02T10:00:00.000Z' },
        { id: 'r', role: 'assistant', content: 'Reúna os documentos.', created_at: '2026-10-02T10:00:05.000Z' },
      ]
      return sseResponse(['Reúna ', 'os documentos.'])
    })
    const { result } = renderHook(() => useChatData(), { wrapper })
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    let outcome: Awaited<ReturnType<typeof result.current.sendMessage>> | null = null
    await act(async () => {
      outcome = await result.current.sendMessage('Qual o próximo passo?')
    })
    expect(outcome).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/chat-completion$/)
    expect(JSON.parse(String(init?.body))).toEqual({ message: 'Qual o próximo passo?', assessmentId: CHAT_ASSESSMENT_ID })
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste')

    await waitFor(() => expect(result.current.messages).toHaveLength(4))
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.pendingUserMessage).toBeNull()
    expect(result.current.streamingText).toBe('')
    expect(result.current.sendError).toBeNull()
  })

  it('500 → { ok: false, kind: server }, erro na tela e nada pendurado', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'internal_error' }))
    const { result } = renderHook(() => useChatData(), { wrapper })
    await waitFor(() => expect(result.current.assessment?.id).toBe(CHAT_ASSESSMENT_ID))
    let outcome: Awaited<ReturnType<typeof result.current.sendMessage>> | null = null
    await act(async () => {
      outcome = await result.current.sendMessage('Olá')
    })
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'server', status: 500 } })
    expect(result.current.sendError?.kind).toBe('server')
    expect(result.current.pendingUserMessage).toBeNull()
    expect(result.current.isStreaming).toBe(false)
  })

  it('429 por dia, 401, 403 e 400 message_too_long viram tipos distintos', async () => {
    const cases: Array<[Response, string, string | null]> = [
      [jsonResponse(429, { error: 'rate_limited', window: 'day', limit: 200 }), 'rate_limited', 'day'],
      [jsonResponse(401, { error: 'unauthorized' }), 'auth', null],
      [jsonResponse(403, { error: 'no_access' }), 'no_access', null],
      [jsonResponse(400, { error: 'message_too_long' }), 'too_long', null],
    ]
    const { result } = renderHook(() => useChatData(), { wrapper })
    await waitFor(() => expect(result.current.assessment?.id).toBe(CHAT_ASSESSMENT_ID))
    for (const [response, kind, window] of cases) {
      fetchMock.mockResolvedValueOnce(response)
      let outcome: Awaited<ReturnType<typeof result.current.sendMessage>> | null = null
      await act(async () => {
        outcome = await result.current.sendMessage('Olá')
      })
      expect(outcome).toMatchObject({ ok: false, error: { kind, window } })
    }
  })

  it('sem rede → kind network; resposta vazia → kind interrupted', async () => {
    const { result } = renderHook(() => useChatData(), { wrapper })
    await waitFor(() => expect(result.current.assessment?.id).toBe(CHAT_ASSESSMENT_ID))

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    let outcome: Awaited<ReturnType<typeof result.current.sendMessage>> | null = null
    await act(async () => {
      outcome = await result.current.sendMessage('Olá')
    })
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'network' } })

    fetchMock.mockResolvedValueOnce(sseResponse([]))
    await act(async () => {
      outcome = await result.current.sendMessage('Olá')
    })
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'interrupted' } })
  })
})

describe('mensagens de erro do chat', () => {
  it('são frases em português, sem detalhes técnicos', () => {
    expect(chatErrorFromResponse(502, 'ai_unavailable', undefined).kind).toBe('server')
    expect(chatErrorFromResponse(404, 'not_found', undefined).kind).toBe('invalid')
    expect(describeChatSendError(new ChatSendError('rate_limited', { window: 'hour' }))).toMatch(/Aguarde/)
    expect(describeChatSendError(new ChatSendError('rate_limited', { window: 'day' }))).toMatch(/hoje/)
    expect(describeChatSendError(new ChatSendError('too_long'))).toContain('2.000')
    for (const kind of ['auth', 'no_access', 'invalid', 'server', 'interrupted', 'network'] as const) {
      const text = describeChatSendError(new ChatSendError(kind))
      expect(text).not.toMatch(/\b(4\d\d|5\d\d)\b|error|fetch/i)
    }
  })
})
