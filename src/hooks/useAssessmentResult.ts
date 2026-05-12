// useAssessmentResult.ts — fetches assessment + result from Supabase
// Falls back to localStorage so the UI never breaks even if DB call fails.
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AssessmentResult {
  assessmentId: string
  scoreNumeric: number
  scoreCategory: string
  scoreLabel: string
  scorePercentage: number
  suggestedVisaTypes: Array<{ visa_type_name: string; eligible: boolean; visa_type_code: string }>
  iaExplanationShort: string | null
  iaExplanationFull: string | null
  leadName: string | null
  leadEmail: string | null
  completedAt: string | null
  // Raw localStorage visas (client-side scoring, always available)
  localVisas: Array<{ code: string; name: string; match: string; reason?: string }>
}

function getLocalData(): {
  assessmentId: string | null
  score: { percentage: number; category: string; label: string } | null
  visas: Array<{ code: string; name: string; match: string; reason?: string }>
  leadInfo: { fullName: string; email: string } | null
  completedAt: string | null
} {
  try {
    const raw = localStorage.getItem('dr_imigrante_quiz_result')
    if (!raw) return { assessmentId: null, score: null, visas: [], leadInfo: null, completedAt: null }
    const p = JSON.parse(raw)
    return {
      assessmentId: p.assessmentId ?? null,
      score: p.score ?? null,
      visas: p.visas ?? [],
      leadInfo: p.leadInfo ?? null,
      completedAt: p.completedAt ?? null,
    }
  } catch {
    return { assessmentId: null, score: null, visas: [], leadInfo: null, completedAt: null }
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  alta: 'Alta Elegibilidade',
  media: 'Média Elegibilidade',
  baixa: 'Elegibilidade em Desenvolvimento',
}

export function useAssessmentResult() {
  const local = getLocalData()
  const assessmentId = local.assessmentId

  const { data, isLoading, error } = useQuery({
    queryKey: ['assessment-result', assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('id, full_name, email, completed_at, assessment_results(*)')
        .eq('id', assessmentId!)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!assessmentId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // Merge DB result with localStorage fallback
  const dbResult = data?.assessment_results
    ? (Array.isArray(data.assessment_results)
        ? data.assessment_results[0]
        : data.assessment_results)
    : null

  const scoreNumeric = dbResult?.score_numeric ?? local.score?.percentage ?? 0
  const scoreCategory = dbResult?.score_category ?? local.score?.category ?? 'baixa'

  const result: AssessmentResult | null = assessmentId
    ? {
        assessmentId,
        scoreNumeric,
        scoreCategory,
        scoreLabel: CATEGORY_LABEL[scoreCategory] ?? scoreCategory,
        scorePercentage: scoreNumeric,
        suggestedVisaTypes: (dbResult?.suggested_visa_types as AssessmentResult['suggestedVisaTypes']) ?? [],
        iaExplanationShort: dbResult?.ia_explanation_short ?? null,
        iaExplanationFull: dbResult?.ia_explanation_full ?? null,
        leadName: data?.full_name ?? local.leadInfo?.fullName ?? null,
        leadEmail: data?.email ?? local.leadInfo?.email ?? null,
        completedAt: data?.completed_at ?? local.completedAt ?? null,
        localVisas: local.visas,
      }
    : null

  // If no DB record yet but localStorage has data, return localStorage-only result
  const fallbackResult: AssessmentResult | null =
    !result && local.score
      ? {
          assessmentId: '',
          scoreNumeric: local.score.percentage,
          scoreCategory: local.score.category,
          scoreLabel: local.score.label,
          scorePercentage: local.score.percentage,
          suggestedVisaTypes: [],
          iaExplanationShort: null,
          iaExplanationFull: null,
          leadName: local.leadInfo?.fullName ?? null,
          leadEmail: local.leadInfo?.email ?? null,
          completedAt: local.completedAt,
          localVisas: local.visas,
        }
      : null

  return {
    result: result ?? fallbackResult,
    isLoading: isLoading && !!assessmentId,
    hasDbResult: !!dbResult,
    error,
  }
}
