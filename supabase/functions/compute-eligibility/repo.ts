// compute-eligibility/repo.ts — acesso ao banco (service role) usado pelo handler.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
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

    async getScoringOptions() {
      const { data, error } = await db
        .from('form_question_options')
        .select('option_key, score, form_questions!inner(question_key)')
        .eq('is_active', true)
      if (error) throw error
      return (data ?? []).map((o: Record<string, unknown>) => {
        const fq = o.form_questions as { question_key: string } | Array<{ question_key: string }>
        return {
          question_key: Array.isArray(fq) ? fq[0]?.question_key : fq.question_key,
          option_key: o.option_key as string,
          score: o.score as number,
        }
      })
    },

    async getActiveVisaRules() {
      const { data, error } = await db
        .from('visa_types')
        .select('id, code, name_pt, rule_versions!inner(id, rules, is_active)')
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
