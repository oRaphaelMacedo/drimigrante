/**
 * Dados do chat IA (DI-017 / DI-051).
 *
 * - Histórico paginado do MAIS RECENTE para o mais antigo: a tela abre nas
 *   últimas `CHAT_PAGE_SIZE` mensagens e "Carregar anteriores" busca a página
 *   seguinte (cursor por created_at). A lista devolvida é cronológica.
 * - Envio pela Edge Function chat-completion (SSE `data: {"delta"}`). A troca
 *   em andamento (pergunta + resposta parcial) fica na tela até o histórico
 *   recarregado já trazê-la, sem piscar nem duplicar.
 * - Erro no envio: `sendMessage` devolve `{ ok: false, error }` com o tipo do
 *   problema (401/403/429/400/5xx/rede/resposta interrompida) para a tela
 *   devolver o texto ao campo e explicar o que fazer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { QUIZ_RESULT_STORAGE_KEY, parseStoredQuizIdentity } from '@/lib/stored-quiz-result'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

/** Mensagens por página do histórico. */
export const CHAT_PAGE_SIZE = 50
/** Mesmo limite do servidor (chat-completion/history.ts). */
export const CHAT_MESSAGE_MAX_CHARS = 2000

export type ChatSendErrorKind =
  /** 401: sessão expirada. */
  | 'auth'
  /** 403: chat não liberado nesta conta agora. */
  | 'no_access'
  /** 429: limite de mensagens por hora/dia. */
  | 'rate_limited'
  /** 400 message_too_long. */
  | 'too_long'
  /** Outros 4xx (dados inválidos, diagnóstico não encontrado). */
  | 'invalid'
  /** 5xx: a IA ou o servidor falharam. */
  | 'server'
  /** A resposta começou mas foi cortada (ou veio vazia). */
  | 'interrupted'
  /** Sem conexão / requisição não chegou. */
  | 'network'

export class ChatSendError extends Error {
  readonly kind: ChatSendErrorKind
  readonly status: number | null
  /** Para 429: janela do limite que foi atingido. */
  readonly window: 'hour' | 'day' | null

  constructor(kind: ChatSendErrorKind, options: { status?: number | null; window?: 'hour' | 'day' | null } = {}) {
    super(`chat_send_failed:${kind}`)
    this.name = 'ChatSendError'
    this.kind = kind
    this.status = options.status ?? null
    this.window = options.window ?? null
  }
}

export type SendMessageResult = { ok: true } | { ok: false; error: ChatSendError }

/** Tipo do erro a partir do status HTTP e do código devolvido pelo chat-completion. */
export function chatErrorFromResponse(status: number, code: string | null, window: unknown): ChatSendError {
  const limitWindow = window === 'hour' || window === 'day' ? window : null
  if (status === 401) return new ChatSendError('auth', { status })
  if (status === 403) return new ChatSendError('no_access', { status })
  if (status === 429) return new ChatSendError('rate_limited', { status, window: limitWindow })
  if (status === 400 && code === 'message_too_long') return new ChatSendError('too_long', { status })
  if (status >= 500) return new ChatSendError('server', { status })
  return new ChatSendError('invalid', { status })
}

/** Frase para a tela (sem detalhes técnicos). */
export function describeChatSendError(error: ChatSendError): string {
  switch (error.kind) {
    case 'auth':
      return 'Sua sessão expirou. Entre de novo para continuar a conversa.'
    case 'no_access':
      return 'O chat não está liberado na sua conta agora.'
    case 'rate_limited':
      return error.window === 'day'
        ? 'Você chegou ao limite de mensagens de hoje. Tente de novo amanhã.'
        : 'Muitas mensagens em pouco tempo. Aguarde um pouco e tente de novo.'
    case 'too_long':
      return `Sua mensagem passou de ${CHAT_MESSAGE_MAX_CHARS.toLocaleString('pt-BR')} caracteres. Encurte e envie de novo.`
    case 'invalid':
      return 'Não foi possível enviar sua mensagem. Atualize a página e tente de novo.'
    case 'interrupted':
      return 'A resposta foi interrompida. Sua mensagem voltou para o campo: envie de novo.'
    case 'network':
      return 'Sem conexão. Verifique sua internet: sua mensagem voltou para o campo.'
    case 'server':
    default:
      return 'O assistente não conseguiu responder agora. Sua mensagem voltou para o campo: tente de novo.'
  }
}

/** Assessment do quiz feito neste aparelho (mesma leitura segura da autenticação). */
function getStoredAssessmentId(): string | null {
  try {
    return parseStoredQuizIdentity(localStorage.getItem(QUIZ_RESULT_STORAGE_KEY))?.assessmentId ?? null
  } catch {
    return null
  }
}

const FUNCTIONS_URL =
  (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined) ??
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

interface MessagesPage {
  /** Do mais recente para o mais antigo. */
  messages: ChatMessage[]
  hasMore: boolean
}

/** Troca em andamento: fica na tela até o histórico recarregado trazê-la. */
interface LiveExchange {
  user: string
  reply: string
  /** Quando a resposta terminou (Date.now()); null enquanto chega. */
  endedAt: number | null
}

async function fetchMessagesPage(assessmentId: string, before: string | null): Promise<MessagesPage> {
  let query = supabase.from('messages').select('id, role, content, created_at').eq('assessment_id', assessmentId)
  if (before) query = query.lt('created_at', before)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(CHAT_PAGE_SIZE + 1)
  if (error) throw error
  const rows = (data ?? []) as ChatMessage[]
  return { messages: rows.slice(0, CHAT_PAGE_SIZE), hasMore: rows.length > CHAT_PAGE_SIZE }
}

/** Páginas (cada uma da mais nova para a mais antiga) → lista cronológica, sem repetidos. */
export function flattenMessagePages(pages: readonly MessagesPage[] | undefined): ChatMessage[] {
  const seen = new Set<string>()
  const newestFirst: ChatMessage[] = []
  for (const page of pages ?? []) {
    for (const message of page.messages) {
      if (seen.has(message.id)) continue
      seen.add(message.id)
      newestFirst.push(message)
    }
  }
  return newestFirst.reverse()
}

export function useChatData() {
  const { authUser } = useAuth()
  const queryClient = useQueryClient()
  const userId = authUser?.user.id
  const userEmail = authUser?.user.email
  const storedAssessmentId = getStoredAssessmentId()

  const [exchange, setExchange] = useState<LiveExchange | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [sendError, setSendError] = useState<ChatSendError | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Saiu da página no meio da resposta: para de ler (o servidor grava a resposta mesmo assim).
  useEffect(() => () => abortRef.current?.abort(), [])

  const { data: assessment, isLoading: isLoadingAssessment } = useQuery({
    queryKey: ['chat-assessment', storedAssessmentId ?? userId ?? userEmail],
    queryFn: async () => {
      if (storedAssessmentId) {
        const { data, error } = await supabase
          .from('assessments')
          .select('id, answers')
          .eq('id', storedAssessmentId)
          .single()
        if (!error && data) return data
      }
      if (userId) {
        const { data } = await supabase
          .from('assessments')
          .select('id, answers')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (data) return data
      }
      if (userEmail) {
        const { data, error } = await supabase
          .from('assessments')
          .select('id, answers')
          .eq('email', userEmail)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (error) throw error
        return data
      }
      throw new Error('No assessment found')
    },
    enabled: !!storedAssessmentId || !!userId || !!userEmail,
    staleTime: 5 * 60 * 1000,
  })

  const assessmentId = assessment?.id ?? null
  const messagesKey = useMemo(() => ['chat-messages', assessmentId] as const, [assessmentId])

  const messagesQuery = useInfiniteQuery<
    MessagesPage,
    Error,
    InfiniteData<MessagesPage, string | null>,
    typeof messagesKey,
    string | null
  >({
    queryKey: messagesKey,
    initialPageParam: null,
    queryFn: ({ pageParam }) => fetchMessagesPage(assessmentId as string, pageParam),
    // Cursor = created_at da mensagem mais antiga da página (texto cru do banco, sem perder precisão).
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.messages[lastPage.messages.length - 1]?.created_at ?? undefined) : undefined,
    enabled: !!assessmentId,
    staleTime: 30 * 1000,
  })

  const messages = useMemo(() => flattenMessagePages(messagesQuery.data?.pages), [messagesQuery.data])

  // A troca terminada some quando o histórico recarregado (depois do fim) já traz a
  // resposta gravada — até lá ela continua na tela (sem piscar nem sumir).
  const lastStored = messages[messages.length - 1]
  const exchangeSynced =
    !!exchange &&
    exchange.endedAt !== null &&
    messagesQuery.dataUpdatedAt >= exchange.endedAt &&
    lastStored?.role !== 'user' &&
    lastStored?.content.trim() === exchange.reply.trim()
  const liveExchange = exchange && !exchangeSynced ? exchange : null

  // Se um recarregamento no meio da resposta já trouxe a pergunta gravada, não a mostra duas vezes.
  const questionStored =
    !!liveExchange && lastStored?.role === 'user' && lastStored.content.trim() === liveExchange.user.trim()

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = messagesQuery
  /** Busca a página anterior do histórico; false se falhou. */
  const loadOlderMessages = useCallback(async (): Promise<boolean> => {
    if (!hasNextPage || isFetchingNextPage) return false
    const next = await fetchNextPage()
    return !next.isError
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const sendMessage = useCallback(
    async (message: string): Promise<SendMessageResult> => {
      if (!assessmentId) return { ok: false, error: new ChatSendError('invalid') }
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setSendError(null)
      setExchange({ user: message, reply: '', endedAt: null })
      setIsStreaming(true)

      let accumulated = ''
      let responseStarted = false
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new ChatSendError('auth')

        let response: Response
        try {
          response = await fetch(`${FUNCTIONS_URL}/chat-completion`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, assessmentId }),
            signal: controller.signal,
          })
        } catch (err) {
          if (controller.signal.aborted) throw err
          throw new ChatSendError('network')
        }

        if (!response.ok || !response.body) {
          let body: { error?: unknown; window?: unknown } | null = null
          try {
            body = (await response.json()) as { error?: unknown; window?: unknown }
          } catch {
            body = null
          }
          throw chatErrorFromResponse(
            response.ok ? 502 : response.status,
            typeof body?.error === 'string' ? body.error : null,
            body?.window,
          )
        }

        responseStarted = true
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]' || !data) continue
            try {
              const parsed = JSON.parse(data) as { delta?: unknown }
              if (typeof parsed.delta === 'string' && parsed.delta) {
                accumulated += parsed.delta
                const reply = accumulated
                setExchange((current) => (current ? { ...current, reply } : current))
              }
            } catch {
              // pedaço malformado: ignora
            }
          }
        }

        // Resposta vazia: o servidor apaga a pergunta (não fica sem resposta no histórico).
        if (!accumulated.trim()) throw new ChatSendError('interrupted')

        const endedAt = Date.now()
        setExchange((current) => (current ? { ...current, reply: accumulated, endedAt } : current))
        setIsStreaming(false)
        await queryClient.invalidateQueries({ queryKey: ['chat-messages', assessmentId] })
        return { ok: true }
      } catch (err) {
        if (controller.signal.aborted) return { ok: false, error: new ChatSendError('network') }
        const error =
          err instanceof ChatSendError ? err : new ChatSendError(responseStarted ? 'interrupted' : 'network')
        setExchange(null)
        setIsStreaming(false)
        setSendError(error)
        // O servidor pode ter apagado a pergunta: o histórico volta ao estado real.
        void queryClient.invalidateQueries({ queryKey: ['chat-messages', assessmentId] })
        return { ok: false, error }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    },
    [assessmentId, queryClient],
  )

  const clearSendError = useCallback(() => setSendError(null), [])

  return {
    assessment,
    isLoadingAssessment,
    /** Histórico em ordem cronológica (as `CHAT_PAGE_SIZE` mais recentes + páginas anteriores carregadas). */
    messages,
    isLoadingMessages: messagesQuery.isLoading,
    hasOlderMessages: !!hasNextPage,
    isLoadingOlderMessages: isFetchingNextPage,
    loadOlderMessages,
    sendMessage,
    isStreaming,
    /** Resposta da troca em andamento (ou recém-terminada, até o histórico trazê-la). */
    streamingText: liveExchange?.reply ?? '',
    /** Pergunta da troca em andamento (idem). */
    pendingUserMessage: liveExchange && !questionStored ? liveExchange.user : null,
    sendError,
    clearSendError,
  }
}
