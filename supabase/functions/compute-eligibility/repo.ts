// compute-eligibility/repo.ts — acesso ao banco (service role) usado pelo handler.
// Toda query checa `error` e lança: o handler responde 500 sem gravar nada (DI-006).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import { type DbScoringQuestionRow, QUIZ_SCORING_SELECT } from '../_shared/quiz-engine.ts'
import type { EligibilityRepo, SafeResult, VisaRule } from './handler.ts'

/** Só colunas de score: a resposta nunca carrega as análises de IA. */
const SAFE_RESULT_COLUMNS = 'id, assessment_id, score_numeric, score_category, suggested_visa_types, computed_at'

export function createEligibilityRepo(db: SupabaseClient): EligibilityRepo {
  return {
    async getUserIdFromToken(token) {
      const { data, error } = await db.auth.getUser(token)
      if (error || !data?.user) return null
      return data.user.id
    },

    async getAssessment(assessmentId) {
      const { data, error } = await db
        .from('assessments')
        .select('id, user_id, session_id, answers')
        .eq('id', assessmentId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async getResult(assessmentId) {
      const { data, error } = await db
        .from('assessment_results')
        .select(`${SAFE_RESULT_COLUMNS}, ia_explanation_short`)
        .eq('assessment_id', assessmentId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { ia_explanation_short, ...result } = data as SafeResult & { ia_explanation_short: string | null }
      return { result, hasAnalysis: !!(ia_explanation_short ?? '').trim() }
    },

    async getScoringQuestions() {
      // Hint da FK obrigatória: form_question_options tem 3 FKs para form_questions e o
      // embed sem hint devolve PGRST201 (era o que zerava o score de todo mundo).
      const { data, error } = await db
        .from('form_questions')
        .select(QUIZ_SCORING_SELECT)
        .eq('is_active', true)
        .eq('form_question_options.is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as unknown as DbScoringQuestionRow[]
    },

    async getActiveVisaRules() {
      const { data, error } = await db
        .from('visa_types')
        .select('id, code, name_pt, rule_versions!rule_versions_visa_type_id_fkey!inner(id, rules, is_active)')
        .eq('is_active', true)
        .eq('rule_versions.is_active', true)
      if (error) throw error
      const rules: VisaRule[] = []
      for (const vt of (data ?? []) as Array<Record<string, unknown>>) {
        const versions = (Array.isArray(vt.rule_versions) ? vt.rule_versions : [vt.rule_versions]) as Array<
          { id: string; rules: unknown } | null
        >
        const active = versions[0]
        if (!active) continue
        rules.push({
          id: vt.id as string,
          code: vt.code as string,
          name_pt: vt.name_pt as string,
          ruleVersionId: active.id,
          rules: active.rules,
        })
      }
      return rules
    },

    async upsertResult(row) {
      const { data, error } = await db
        .from('assessment_results')
        .upsert(row, { onConflict: 'assessment_id' })
        .select(SAFE_RESULT_COLUMNS)
        .single()
      if (error) throw error
      return data as SafeResult
    },

    async markCompleted(assessmentId, completedAtIso) {
      const { error } = await db
        .from('assessments')
        .update({ status: 'completed', completed_at: completedAtIso })
        .eq('id', assessmentId)
      if (error) throw error
    },
  }
}
