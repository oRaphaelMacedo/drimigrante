// compute-eligibility/handler.ts — lógica da função (sem imports remotos, testável no Deno).
//
// DI-004: exige posse (JWT do dono ou session_id do assessment anônimo) → senão 404,
// para ninguém reescrever resultados de terceiros. Se a análise de IA já foi gerada,
// o resultado fica congelado (devolve o existente sem reescrever), para score e análise
// não divergirem. A resposta só traz colunas de score — nunca as análises de IA.

import {
  canAccessAssessment,
  extractBearerToken,
  isUuid,
  resolveCaller,
} from '../_shared/assessment-access.ts'
import { corsHeaders, errorCode, jsonResponse, type Logger, readJsonBody } from '../_shared/http.ts'
import { calculateScore, evaluateRule, type ScoringOption, scoreCategoryFor } from './scoring.ts'

export interface EligibilityAssessment {
  id: string
  user_id: string | null
  session_id: string | null
  answers: unknown
}

export interface SafeResult {
  id: string
  assessment_id: string
  score_numeric: number | string | null
  score_category: string | null
  suggested_visa_types: unknown
  computed_at: string | null
}

export interface VisaRule {
  id: string
  code: string
  name_pt: string
  ruleVersionId: string
  rules: unknown
}

export interface SuggestedVisaType {
  visa_type_id: string
  visa_type_code: string
  visa_type_name: string
  eligible: boolean
  rule_version_id: string
}

export interface EligibilityRepo {
  getUserIdFromToken(token: string): Promise<string | null>
  getAssessment(assessmentId: string): Promise<EligibilityAssessment | null>
  getResult(assessmentId: string): Promise<{ result: SafeResult; hasAnalysis: boolean } | null>
  getScoringOptions(): Promise<ScoringOption[]>
  getActiveVisaRules(): Promise<VisaRule[]>
  upsertResult(row: {
    assessment_id: string
    score_numeric: number
    score_category: string
    suggested_visa_types: SuggestedVisaType[]
    computed_at: string
  }): Promise<SafeResult>
  markCompleted(assessmentId: string, completedAtIso: string): Promise<void>
}

export interface ComputeEligibilityDeps {
  repo: EligibilityRepo
  log: Logger
  now(): number
  env: { serviceRoleKey?: string }
}

export function createComputeEligibilityHandler(deps: ComputeEligibilityDeps) {
  const { repo, log } = deps

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

    let assessmentId: string | null = null
    try {
      const body = await readJsonBody(req)
      const rawId = body?.assessment_id
      if (!isUuid(rawId)) return jsonResponse(400, { error: 'invalid_request' })
      assessmentId = rawId

      const caller = await resolveCaller(extractBearerToken(req), body?.session_id, {
        serviceRoleKey: deps.env.serviceRoleKey,
        getUserIdFromToken: (t) => repo.getUserIdFromToken(t),
      })
      if (!caller.userId && !caller.sessionId && !caller.isServiceRole) {
        return jsonResponse(404, { error: 'not_found' })
      }

      const assessment = await repo.getAssessment(assessmentId)
      if (!assessment || !canAccessAssessment(assessment, caller)) {
        return jsonResponse(404, { error: 'not_found' })
      }

      const existing = await repo.getResult(assessmentId)
      if (existing?.hasAnalysis) {
        return jsonResponse(200, { result: existing.result, cached: true })
      }

      const answers = (assessment.answers && typeof assessment.answers === 'object'
        ? assessment.answers
        : {}) as Record<string, unknown>

      const scoreNumeric = calculateScore(answers, await repo.getScoringOptions())
      const scoreCategory = scoreCategoryFor(scoreNumeric)

      const suggestedVisaTypes: SuggestedVisaType[] = []
      for (const vt of await repo.getActiveVisaRules()) {
        suggestedVisaTypes.push({
          visa_type_id: vt.id,
          visa_type_code: vt.code,
          visa_type_name: vt.name_pt,
          eligible: evaluateRule(vt.rules, answers),
          rule_version_id: vt.ruleVersionId,
        })
      }
      // Elegíveis primeiro.
      suggestedVisaTypes.sort((a, b) => (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0))

      const nowIso = new Date(deps.now()).toISOString()
      const result = await repo.upsertResult({
        assessment_id: assessmentId,
        score_numeric: scoreNumeric,
        score_category: scoreCategory,
        suggested_visa_types: suggestedVisaTypes,
        computed_at: nowIso,
      })
      await repo.markCompleted(assessmentId, nowIso)

      return jsonResponse(200, { result })
    } catch (err) {
      log('error', 'eligibility_failed', { assessment_id: assessmentId, code: errorCode(err) })
      return jsonResponse(500, { error: 'internal_error' })
    }
  }
}
