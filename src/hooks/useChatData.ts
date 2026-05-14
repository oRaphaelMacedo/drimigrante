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

interface StoredQuizResult {
  assessmentId: string | null
  sessionId: string | null
}

// Read both assessmentId and sessionId stored by the quiz on completion.
// sessionId is required to fall back to get_anon_assessment RPC when the
// assessment has not yet been linked to the authenticated user (B02-A21).
function getStoredQuizResult(): StoredQuizResult {
  try {
    const raw = localStorage.getItem('dr_imigrante_quiz_result')
    if (!raw) return { assessmentId: null, sessionId: null }
    const parsed = JSON.parse(raw)
    return {
      assessmentId: (parsed?.assessmentId as string | null) ?? null,
      sessionId: (parsed?.sessionId as string | null) ?? null,
    }
  } catch {
    return { assessmentId: null, sessionId: null }
  }
}

export function useChatData() {
  const { authUser } = useAuth()
  const queryClient = useQueryClient()
  const userId = authUser?.user.id
  const userEmail = authUser?.user.email
  const { assessmentId: storedAssessmentId, sessionId: storedSessionId } = getStoredQuizResult()

  const {
    data: assessment,
    isLoading: isLoadingAssessment,
  } = useQuery({
    queryKey: ['chat-assessment', storedAssessmentId ?? userId ?? userEmail],
    queryFn: async () => {
      // 1. Prefer localStorage ID — direct REST works ONLY if assessment is
      //    already linked to the authenticated user (RLS: user_id = auth.uid()).
      //    AuthContext does this linking on SIGNED_IN, so this is the fast path.
      if (storedAssessmentId) {
        const { data, error } = await supabase
          .from('assessments')
          .select('id, answers')
          .eq('id', storedAssessmentId)
          .maybeSingle()
        if (!error && data) return data

        // 1b. Linking may have failed or not happened yet — fall back to
        //     the anon RPC which validates session_id ownership server-side.
        if (storedSessionId) {
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_anon_assessment', {
            p_id: storedAssessmentId,
            p_session_id: storedSessionId,
          })
          if (!rpcError && rpcData && (rpcData as Array<{ id: string; answers: unknown }>).length > 0) {
            const row = (rpcData as Array<{ id: string; answers: unknown }>)[0]
            return { id: row.id, answers: row.answers }
          }
        }
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
