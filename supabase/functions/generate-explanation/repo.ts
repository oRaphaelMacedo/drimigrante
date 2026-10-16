// generate-explanation/repo.ts — acesso ao banco (service role) usado pelo handler.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import type { AssessmentWithResult, ExplanationMode, ExplanationRepo, FullStatus } from './handler.ts'
import { LOCK_PREFIX } from './handler.ts'

/** Ação registrada em audit_log a cada geração iniciada (base do disjuntor AI_HOURLY_CAP). */
export const AI_GENERATION_ACTION = 'ai_generation'

/** Coluna de texto de cada modo. */
const TEXT_COLUMN: Record<ExplanationMode, 'ia_explanation_short' | 'ia_explanation_full'> = {
  short: 'ia_explanation_short',
  full: 'ia_explanation_full',
}

/** Regex do Postgres (operador ~ do PostgREST) para texto vazio ou só com espaços. */
const BLANK_TEXT_RE = '^[[:space:]]*$'

interface ResultRow {
  score_numeric: number | string | null
  score_category: string | null
  ia_explanation_short: string | null
  ia_explanation_full: string | null
  ia_model_used: string | null
  ia_tokens_used: number | null
}

function fullStatusOf(text: string | null): FullStatus {
  if (text === null) return 'missing'
  return text.trim() ? 'ready' : 'blank'
}

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
          // Sem e-mail nem nome: esta function não manda e-mail (DI-077) e o contexto da IA não leva PII.
          'id, user_id, session_id, answers, ' +
            'assessment_results(score_numeric, score_category, ia_explanation_short, ia_explanation_full, ' +
            'ia_model_used, ia_tokens_used)',
        )
        .eq('id', assessmentId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const row = data as unknown as Omit<AssessmentWithResult, 'result'> & {
        assessment_results: ResultRow | ResultRow[] | null
      }
      const rel = row.assessment_results
      const raw = Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null)
      // O texto da análise completa não sai daqui: o handler só precisa saber se ela existe.
      const result: AssessmentWithResult['result'] = raw
        ? {
          score_numeric: raw.score_numeric,
          score_category: raw.score_category,
          ia_explanation_short: raw.ia_explanation_short,
          ia_model_used: raw.ia_model_used,
          ia_tokens_used: typeof raw.ia_tokens_used === 'number' ? raw.ia_tokens_used : null,
          full_status: fullStatusOf(raw.ia_explanation_full),
        }
        : null
      return {
        id: row.id,
        user_id: row.user_id,
        session_id: row.session_id,
        answers: row.answers,
        result,
      }
    },

    async hasFullAnalysisAccess(userId) {
      // Migration 20261020000000_full_analysis_paywall.sql (EXECUTE só para a service_role).
      const { data, error } = await db.rpc('has_active_access', {
        _user_id: userId,
        _feature: 'full_analysis',
      })
      if (error) throw error
      return data === true
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

    async clearBlank(assessmentId, mode) {
      // Condicional: só zera se o texto AINDA estiver vazio (não apaga uma geração concorrente).
      const column = TEXT_COLUMN[mode]
      const { error } = await db
        .from('assessment_results')
        .update({ [column]: null })
        .eq('assessment_id', assessmentId)
        .filter(column, 'match', BLANK_TEXT_RE)
      if (error) throw error
    },

    async claimGeneration(assessmentId, mode, lockToken, staleLockToken) {
      // UPDATE condicional = trava atômica: só uma requisição concorrente marca a linha.
      // A trava (ia_model_used) é a mesma para os dois modos: resumo e análise nunca
      // são gerados ao mesmo tempo para o mesmo assessment.
      // Livre quando: sem modelo gravado, valor que não é trava, ou trava mais antiga que o TTL.
      const { data, error } = await db
        .from('assessment_results')
        .update({ ia_model_used: lockToken })
        .eq('assessment_id', assessmentId)
        .is(TEXT_COLUMN[mode], null)
        .or(
          `ia_model_used.is.null,ia_model_used.not.like.${LOCK_PREFIX}*,ia_model_used.lt.${staleLockToken}`,
        )
        .select('id')
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async releaseGeneration(assessmentId, lockToken, restoreModel) {
      const { error } = await db
        .from('assessment_results')
        .update({ ia_model_used: restoreModel })
        .eq('assessment_id', assessmentId)
        .eq('ia_model_used', lockToken)
      if (error) throw error
    },

    async recordAiGeneration({ assessmentId, model, mode }) {
      const { error } = await db.from('audit_log').insert({
        table_name: 'assessment_results',
        record_id: assessmentId,
        action: AI_GENERATION_ACTION,
        actor_type: 'edge_function',
        new_values: { function: 'generate-explanation', use_case: 'analysis', mode, model },
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

    async saveExplanation(assessmentId, lockToken, mode, { text, model, tokens }) {
      const { data, error } = await db
        .from('assessment_results')
        .update({
          [TEXT_COLUMN[mode]]: text,
          ia_model_used: model,
          ia_tokens_used: tokens,
        })
        .eq('assessment_id', assessmentId)
        .eq('ia_model_used', lockToken)
        .select('id')
      if (error) throw error
      return (data?.length ?? 0) > 0
    },
  }
}
