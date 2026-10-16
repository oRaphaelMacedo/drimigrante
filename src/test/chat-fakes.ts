/**
 * Supabase e chat-completion falsos para os testes do chat (DI-051). Nada de rede.
 *
 * - `createChatSupabase(rows)`: `from('messages')` aplica eq/lt/order/limit sobre
 *   `rows` em memória (como o PostgREST); `from('assessments')` devolve o
 *   assessment do teste; `auth.getSession()` devolve um token falso.
 * - `sseResponse(chunks)`: resposta 200 em SSE no formato do chat-completion.
 */
import type { ChatMessage } from '@/hooks/useChatData'

export const CHAT_ASSESSMENT_ID = '00000000-0000-4000-8000-0000000000cc'

/** `count` mensagens alternando user/assistant, a 1 minuto uma da outra (a última é a mais recente). */
export function makeMessages(count: number, start = Date.UTC(2026, 9, 1, 12, 0, 0)): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${String(i + 1).padStart(3, '0')}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Mensagem ${i + 1}`,
    created_at: new Date(start + i * 60_000).toISOString(),
  }))
}

export interface ChatSupabaseState {
  rows: ChatMessage[]
  messageQueries: Array<{ lt: string | null; ascending: boolean | null; limit: number | null }>
}

export function createChatSupabase(state: ChatSupabaseState) {
  function messagesBuilder() {
    const query = { lt: null as string | null, ascending: null as boolean | null, limit: null as number | null }
    const run = () => {
      state.messageQueries.push({ ...query })
      let rows = [...state.rows]
      if (query.lt) rows = rows.filter((r) => r.created_at < (query.lt as string))
      rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
      if (query.ascending === false) rows.reverse()
      if (query.limit !== null) rows = rows.slice(0, query.limit)
      return { data: rows, error: null }
    }
    const builder = {
      select: () => builder,
      eq: () => builder,
      lt: (_column: string, value: string) => {
        query.lt = value
        return builder
      },
      order: (_column: string, options?: { ascending?: boolean }) => {
        query.ascending = options?.ascending ?? true
        return builder
      },
      limit: (n: number) => {
        query.limit = n
        return builder
      },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }
    return builder
  }

  function assessmentsBuilder() {
    const result = { data: { id: CHAT_ASSESSMENT_ID, answers: {} }, error: null }
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => result,
      maybeSingle: async () => result,
    }
    return builder
  }

  return {
    from: (table: string) => (table === 'messages' ? messagesBuilder() : assessmentsBuilder()),
    auth: { getSession: async () => ({ data: { session: { access_token: 'token-de-teste' } } }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  }
}

export function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`))
      controller.enqueue(encoder.encode('event: done\ndata: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

export function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
