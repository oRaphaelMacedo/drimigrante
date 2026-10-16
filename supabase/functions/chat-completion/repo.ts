// chat-completion/repo.ts — acesso ao banco (service role) usado pelo handler.
// Todas as escritas em `messages` passam por aqui (o cliente perde o INSERT na
// migration 20261016000300_messages_server_only_insert.sql).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { ChatRepo } from './handler.ts'

const STAFF_ROLES = ['super_admin', 'hub_admin', 'lawyer', 'paralegal']

export function createChatRepo(db: SupabaseClient): ChatRepo {
  return {
    async getUserIdFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      if (error || !data?.user) return null
      return data.user.id
    },

    async getOwnedAssessment(assessmentId, userId) {
      const { data, error } = await db
        .from('assessments')
        .select('id, answers')
        .eq('id', assessmentId)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async getResultSummary(assessmentId) {
      const { data, error } = await db
        .from('assessment_results')
        .select('score_numeric, score_category')
        .eq('assessment_id', assessmentId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async getSubscription(userId) {
      const { data, error } = await db
        .from('subscriptions')
        .select('recurring_active, has_chat_access, one_time_access_expires_at')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async isStaff(userId, nowIso) {
      const { data, error } = await db
        .from('user_roles')
        .select('role, expires_at')
        .eq('user_id', userId)
        .in('role', STAFF_ROLES)
      if (error) throw error
      const nowMs = Date.parse(nowIso)
      return (data ?? []).some(
        (r: { expires_at: string | null }) => !r.expires_at || Date.parse(r.expires_at) > nowMs,
      )
    },

    async countUserMessagesSince(userId, sinceIso) {
      const { count, error } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('role', 'user')
        .gte('created_at', sinceIso)
      if (error) throw error
      return count ?? 0
    },

    async getRecentMessages(assessmentId, userId, limit) {
      const { data, error } = await db
        .from('messages')
        .select('role, content, created_at')
        .eq('assessment_id', assessmentId)
        .eq('user_id', userId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },

    async insertMessage(row) {
      const { error } = await db.from('messages').insert(row)
      if (error) throw error
    },

    async getAiConfig(useCase) {
      const { data, error } = await db
        .from('ai_configurations')
        .select('model, temperature, max_tokens, system_prompt')
        .eq('use_case', useCase)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data
    },
  }
}
