// useAssessment.ts — Day 3: Supabase Backend Integration
// Persists quiz assessments to the `assessments` table and reads back results

import { useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Assessment } from '@/lib/database.types'

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
 * Upserts an assessment record to Supabase.
 * Matches on session_id — safe to call multiple times (idempotent).
 */
export async function persistAssessment(
  params: PersistAssessmentParams,
): Promise<PersistAssessmentResult> {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30) // 30-day expiry

  const { data, error } = await supabase.from('assessments')
    .upsert(
      {
        session_id: params.sessionId,
        full_name: params.fullName,
        email: params.email,
        phone: params.phone ?? null,
        answers: params.answers,
        status: 'completed',
        questions_answered: params.questionsAnswered,
        total_questions: params.totalQuestions,
        completion_percentage:
          params.totalQuestions > 0
            ? Math.round((params.questionsAnswered / params.totalQuestions) * 100)
            : 0,
        utm_source: params.utmSource ?? null,
        utm_medium: params.utmMedium ?? null,
        utm_campaign: params.utmCampaign ?? null,
        completed_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'session_id' },
    )
    .select()
    .single()

  if (error) {
    console.error('[useAssessment] persist error:', error)
    return { assessment: null, error: error.message }
  }

  return { assessment: data as Assessment, error: null }
}

/**
 * Fetches the assessment result for a given assessment_id.
 * Called after compute-eligibility edge function returns.
 */
export async function fetchAssessmentResult(assessmentId: string) {
  const { data, error } = await supabase
    .from('assessment_results')
    .select('*')
    .eq('assessment_id', assessmentId)
    .single()

  if (error) return null
  return data
}

/**
 * Fetches the latest assessment for the currently logged-in user.
 */
export function useAssessment() {
  const getUserLatestAssessment = useCallback(async (email: string) => {
    const { data } = await supabase
      .from('assessments')
      .select('*, assessment_results(*)')
      .eq('email', email)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single()

    return data ?? null
  }, [])

  return { getUserLatestAssessment }
}
