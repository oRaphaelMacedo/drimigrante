import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// Shape returned by the messages table (not yet in generated types)
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

// Read assessmentId stored by the quiz on completion
function getStoredAssessmentId(): string | null {
  try {
    const raw = localStorage.getItem('dr_imigrante_quiz_result')
    return raw ? (JSON.parse(raw)?.assessmentId as string | null) ?? null : null
  } catch {
    return null
  }
}

export function useChatData() {
  const { authUser } = useAuth()
  const queryClient = useQueryClient()
  const userId = authUser?.user.id
  const userEmail = authUser?.user.email
  const storedAssessmentId = getStoredAssessmentId()

  const {
    data: assessment,
    isLoading: isLoadingAssessment,
  } = useQuery({
    queryKey: ['chat-assessment', storedAssessmentId ?? userId ?? userEmail],
    queryFn: async () => {
      // 1. Prefer localStorage ID — assessments are saved without user_id (anonymous quiz)
      if (storedAssessmentId) {
        const { data, error } = await supabase
          .from('assessments')
          .select('id, answers')
          .eq('id', storedAssessmentId)
          .single()
        if (!error && data) return data
      }

      // 2. Try by user_id for assessments linked post-auth
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

      // 3. Try by email — anonymous quiz assessments are saved with email only
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

  const {
    data: messagesData,
    isLoading: isLoadingMessages,
  } = useQuery({
    queryKey: ['chat-messages', assessment?.id],
    queryFn: async () => {
      // Cast to `any` because `messages` table was added after types were generated
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

  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke('chat-completion', {
        body: { message, assessmentId: assessment!.id },
      })
      if (error) throw error
      return data as { reply: string; messageId: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', assessment?.id] })
    },
  })

  return {
    assessment,
    isLoadingAssessment,
    messages: messagesData ?? [],
    isLoadingMessages,
    sendMessage,
  }
}
