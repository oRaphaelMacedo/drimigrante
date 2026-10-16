// generate-explanation/repo.ts — acesso ao banco (service role) usado pelo handler.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { AssessmentWithResult, ExplanationRepo } from './handler.ts'
import { LOCK_PREFIX } from './handler.ts'

/** Ação registrada em audit_log a cada geração iniciada (base do disjuntor AI_HOURLY_CAP). */
export const AI_GENERATION_ACTION = 'ai_generation'

export function createExplanationRepo(db: SupabaseClient): ExplanationRepo {
  return {
    async getUserIdFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      if (error || !data?.user) return null
      return data.user.id
    },

    async getAssessmentWithResult(assessmentId) {
      const { data, error } = await db
        .from('assessments')
        .select(
          'id, user_id, session_id, email, full_name, answers, ' +
            'assessment_results(score_numeric, score_category, ia_explanation_short, ia_model_used)',
        )
        .eq('id', assessmentId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as Omit<AssessmentWithResult, 'result'> & {
        assessment_results: AssessmentWithResult['result'] | AssessmentWithResult['result'][] | null
      }
      const rel = row.assessment_results
      const result = Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null)
      return {
        id: row.id,
        user_id: row.user_id,
        session_id: row.session_id,
        email: row.email,
        full_name: row.full_name,
        answers: row.answers,
        result,
      }
    },

    async countAiGenerationsSince(sinceIso) {
      const { count, error } = await db
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', AI_GENERATION_ACTION)
        .gte('created_at', sinceIso)
      if (error) throw error
      return count ?? 0
    },

    async clearEmptyShort(assessmentId, currentValue) {
      const { error } = await db
        .from('assessment_results')
        .update({ ia_explanation_short: null })
        .eq('assessment_id', assessmentId)
        .eq('ia_explanation_short', currentValue)
      if (error) throw error
    },

    async claimGeneration(assessmentId, lockToken, staleLockToken) {
      // UPDATE condicional = trava atômica: só uma requisição concorrente marca a linha.
      // Livre quando: sem modelo gravado, valor que não é trava, ou trava mais antiga que o TTL.
      const { data, error } = await db
        .from('assessment_results')
        .update({ ia_model_used: lockToken })
        .eq('assessment_id', assessmentId)
        .is('ia_explanation_short', null)
        .or(
          `ia_model_used.is.null,ia_model_used.not.like.${LOCK_PREFIX}*,ia_model_used.lt.${staleLockToken}`,
        )
        .select('id')
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async releaseGeneration(assessmentId, lockToken) {
      const { error } = await db
        .from('assessment_results')
        .update({ ia_model_used: null })
        .eq('assessment_id', assessmentId)
        .eq('ia_model_used', lockToken)
      if (error) throw error
    },

    async recordAiGeneration({ assessmentId, model }) {
      const { error } = await db.from('audit_log').insert({
        table_name: 'assessment_results',
        record_id: assessmentId,
        action: AI_GENERATION_ACTION,
        actor_type: 'edge_function',
        new_values: { function: 'generate-explanation', use_case: 'analysis', model },
      })
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

    async saveExplanation(assessmentId, lockToken, { short, full, model, tokens }) {
      const { data, error } = await db
        .from('assessment_results')
        .update({
          ia_explanation_short: short,
          ia_explanation_full: full,
          ia_model_used: model,
          ia_tokens_used: tokens,
        })
        .eq('assessment_id', assessmentId)
        .eq('ia_model_used', lockToken)
        .select('id')
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async hasWelcomeEmail(assessmentId) {
      const { data, error } = await db
        .from('email_send_log')
        .select('id, email_templates!inner(trigger_key)')
        .eq('email_templates.trigger_key', 'welcome_free')
        .eq('variables_used->>assessment_id', assessmentId)
        .limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },
  }
}
