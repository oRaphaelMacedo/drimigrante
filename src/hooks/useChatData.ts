import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

function getStoredAssessmentId(): string | null {
  try {
    const raw = localStorage.getItem('dr_imigrante_quiz_result')
    return raw ? (JSON.parse(raw)?.assessmentId as string | null) ?? null : null
  } catch {
    return null
  }
}

const FUNCTIONS_URL =
  (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined) ??
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export function useChatData() {
  const { authUser } = useAuth()
  const queryClient = useQueryClient()
  const userId = authUser?.user.id
  const userEmail = authUser?.user.email
  const storedAssessmentId = getStoredAssessmentId()

  // Streaming UI state
  const [streamingText, setStreamingText] = useState('')
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [sendError, setSendError] = useState<Error | null>(null)

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

  const { data: messagesData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ['chat-messages', assessment?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('messages')
        .select('id, role, content, created_at')
        .eq('assessment_id', assessment!.id)
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      return data as ChatMessage[]
    },
    enabled: !!assessment?.id,
    staleTime: 30 * 1000,
  })

  const sendMessage = useCallback(
    async (message: string) => {
      if (!assessment?.id) return
      setSendError(null)
      setPendingUserMessage(message)
      setStreamingText('')
      setIsStreaming(true)

      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('Não autenticado')

        const response = await fetch(`${FUNCTIONS_URL}/chat-completion`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message, assessmentId: assessment.id }),
        })

        if (!response.ok || !response.body) {
          throw new Error(`Erro ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulated = ''

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
              const parsed = JSON.parse(data)
              if (parsed.delta) {
                accumulated += parsed.delta
                setStreamingText(accumulated)
              }
            } catch {
              // ignore
            }
          }
        }

        // Stream complete — refresh persisted messages from DB
        await queryClient.invalidateQueries({ queryKey: ['chat-messages', assessment.id] })
      } catch (err) {
        setSendError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setIsStreaming(false)
        setStreamingText('')
        setPendingUserMessage(null)
      }
    },
    [assessment?.id, queryClient],
  )

  return {
    assessment,
    isLoadingAssessment,
    messages: messagesData ?? [],
    isLoadingMessages,
    sendMessage,
    isStreaming,
    streamingText,
    pendingUserMessage,
    sendError,
  }
}
