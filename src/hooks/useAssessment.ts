// useAssessment.ts — Day 3: Supabase Backend Integration
// Persists quiz assessments via SECURITY DEFINER RPC (B02-A21/A22 fix).
// Anonymous clients no longer have direct REST access to `assessments`;
// all anon reads/writes go through the upsert_anon_assessment /
// get_anon_assessment / link_anon_assessment_to_user functions.

import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Assessment, AssessmentResultClientRow, FullAnalysisRow } from '@/lib/database.types'

/**
 * Colunas de assessment_results que o cliente pode ler (DI-016).
 * Nunca use `select('*')` nem `assessment_results(*)`: o papel `authenticated`
 * não tem SELECT em ia_explanation_full (a consulta inteira falharia com
 * "permission denied"). A análise completa vem da RPC `get_full_analysis`.
 */
export const ASSESSMENT_RESULT_CLIENT_COLUMNS =
  'assessment_id, score_numeric, score_category, suggested_visa_types, ia_explanation_short, computed_at'

/** Campos de ASSESSMENT_RESULT_CLIENT_COLUMNS. */
export type AssessmentResultClient = Pick<
  AssessmentResultClientRow,
  | 'assessment_id'
  | 'score_numeric'
  | 'score_category'
  | 'suggested_visa_types'
  | 'ia_explanation_short'
  | 'computed_at'
>

export interface PersistAssessmentParams {
  sessionId: string
  answers: Record<string, string>
  fullName: string
  email: string
  phone?: string
  questionsAnswered: number
  totalQuestions: number
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
}

export interface PersistAssessmentResult {
  assessment: Assessment | null
  error: string | null
}

/**
 * Persists an assessment via `upsert_anon_assessment` RPC.
 * Matches on session_id — safe to call multiple times (idempotent).
 *
 * B02-A21/A22: this RPC is `SECURITY DEFINER` and validates session_id
 * ownership server-side. Anon REST writes to `assessments` are now blocked
 * by RLS, so this path is the only way for an anonymous client to persist.
 */
export async function persistAssessment(
  params: PersistAssessmentParams,
): Promise<PersistAssessmentResult> {
  const completionPercentage =
    params.totalQuestions > 0
      ? Math.round((params.questionsAnswered / params.totalQuestions) * 100)
      : 0

  const { data, error } = await supabase.rpc('upsert_anon_assessment', {
    p_session_id: params.sessionId,
    p_answers: params.answers,
    p_full_name: params.fullName,
    p_email: params.email,
    p_phone: params.phone ?? undefined,
    p_questions_answered: params.questionsAnswered,
    p_total_questions: params.totalQuestions,
    p_completion_percentage: completionPercentage,
    p_status: 'completed',
    p_utm_source: params.utmSource ?? undefined,
    p_utm_medium: params.utmMedium ?? undefined,
    p_utm_campaign: params.utmCampaign ?? undefined,
  })

  if (error) {
    console.error('[useAssessment] persist error:', error)
    return { assessment: null, error: error.message }
  }

  return { assessment: (data as Assessment) ?? null, error: null }
}

/**
 * Fetches an anonymous assessment by id + session_id (proof of ownership).
 * Used before signup when the user has only the localStorage session_id.
 */
export async function getAnonAssessment(
  id: string,
  sessionId: string,
): Promise<Assessment | null> {
  const { data, error } = await supabase.rpc('get_anon_assessment', {
    p_id: id,
    p_session_id: sessionId,
  })

  if (error) {
    console.error('[useAssessment] getAnonAssessment error:', error)
    return null
  }
  const rows = data as Assessment[] | null
  return rows && rows.length > 0 ? rows[0] : null
}

/**
 * Links an anonymous assessment to the currently authenticated user.
 * Called after signup/login when localStorage still holds the anon session_id.
 * Idempotent: returns success if already linked to the same user.
 */
export async function linkAnonAssessmentToUser(
  id: string,
  sessionId: string,
): Promise<{ assessment: Assessment | null; error: string | null }> {
  const { data, error } = await supabase.rpc('link_anon_assessment_to_user', {
    p_id: id,
    p_session_id: sessionId,
  })

  if (error) {
    console.error('[useAssessment] link error:', error)
    return { assessment: null, error: error.message }
  }
  return { assessment: (data as Assessment) ?? null, error: null }
}

/**
 * Fetches the assessment result for a given assessment_id (sem a análise completa).
 * Called after compute-eligibility edge function returns.
 */
export async function fetchAssessmentResult(assessmentId: string): Promise<AssessmentResultClient | null> {
  const { data, error } = await supabase
    .from('assessment_results')
    .select(ASSESSMENT_RESULT_CLIENT_COLUMNS)
    .eq('assessment_id', assessmentId)
    .maybeSingle()

  if (error) return null
  return data
}

/**
 * Análise completa do assessment via RPC `get_full_analysis` (DI-016).
 * O servidor confere posse e acesso vigente; erros com `code`:
 * PT401 (sem sessão), PT404 (não existe ou não é seu), PT402 (sem pagamento ou expirado).
 * `null` = ainda não há resultado para este assessment.
 */
export async function fetchFullAnalysis(assessmentId: string): Promise<FullAnalysisRow | null> {
  const { data, error } = await supabase.rpc('get_full_analysis', { p_assessment_id: assessmentId })
  if (error) throw error
  return data?.[0] ?? null
}

export type FullAnalysisErrorKind = 'payment_required' | 'not_found' | 'auth_required' | 'other'

/** Classifica o erro de get_full_analysis (SQLSTATE PTxxx da migration 20261020000000). */
export function getFullAnalysisErrorKind(error: unknown): FullAnalysisErrorKind {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  const text = typeof message === 'string' ? message : ''
  if (code === 'PT402' || /payment required/i.test(text)) return 'payment_required'
  if (code === 'PT404' || /^not found$/i.test(text)) return 'not_found'
  if (code === 'PT401' || /authentication required/i.test(text)) return 'auth_required'
  return 'other'
}

/**
 * Fetches the latest assessment for the currently logged-in user.
 * Authenticated path — uses standard RLS (user_id = auth.uid()).
 */
export function useAssessment() {
  const getUserLatestAssessment = useCallback(async (email: string) => {
    const { data } = await supabase
      .from('assessments')
      .select(`id, full_name, email, status, completed_at, answers, assessment_results(${ASSESSMENT_RESULT_CLIENT_COLUMNS})`)
      .eq('email', email)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return data ?? null
  }, [])

  return { getUserLatestAssessment }
}
