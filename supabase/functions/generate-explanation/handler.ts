// generate-explanation/handler.ts — lógica da função (sem imports remotos, testável no Deno).
//
// DI-004: posse obrigatória (JWT do dono ou session_id de assessment anônimo) → senão 404;
//         idempotente (se já existe resumo, devolve sem OpenAI e sem e-mail);
//         resposta NUNCA contém a análise completa; contexto sem PII;
//         disjuntor por hora (AI_HOURLY_CAP) → 202.
// DI-008: contexto com as chaves reais do quiz e as vias de _shared/pathways.ts; prompts pt-BR sem persona.
// DI-014: lê { error } do envio do welcome_free e registra log estruturado.

import { buildAnalysisContext } from '../_shared/analysis-context.ts'
import { type RawAiConfig, sanitizeAiConfig } from '../_shared/ai-config.ts'
import {
  canAccessAssessment,
  extractBearerToken,
  isUuid,
  resolveCaller,
} from '../_shared/assessment-access.ts'
import { corsHeaders, errorCode, jsonResponse, type Logger, readJsonBody } from '../_shared/http.ts'
import {
  ANALYSIS_GUARDRAILS,
  buildFullPrompt,
  buildShortPrompt,
  composeSystemPrompt,
} from '../_shared/prompts.ts'

export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
export const DEFAULT_AI_HOURLY_CAP = 60
/** Uma geração travada há mais que isto é considerada abandonada e pode ser retomada. */
export const GENERATION_LOCK_TTL_MS = 3 * 60 * 1000
export const SHORT_MAX_TOKENS = 150
export const LOCK_PREFIX = 'lock_'

export interface AssessmentWithResult {
  id: string
  user_id: string | null
  session_id: string | null
  email: string | null
  full_name: string | null
  answers: unknown
  result: {
    score_numeric: number | string | null
    score_category: string | null
    ia_explanation_short: string | null
    ia_model_used: string | null
  } | null
}

export interface ExplanationRepo {
  getUserIdFromToken(token: string): Promise<string | null>
  getAssessmentWithResult(assessmentId: string): Promise<AssessmentWithResult | null>
  countAiGenerationsSince(sinceIso: string): Promise<number>
  /** Resumo vazio legado ('' ou só espaços) volta a null para permitir nova geração. */
  clearEmptyShort(assessmentId: string, currentValue: string): Promise<void>
  /** Trava atômica: true só para quem conseguiu marcar a geração. */
  claimGeneration(assessmentId: string, lockToken: string, staleLockToken: string): Promise<boolean>
  releaseGeneration(assessmentId: string, lockToken: string): Promise<void>
  recordAiGeneration(entry: { assessmentId: string; model: string }): Promise<void>
  getAiConfig(useCase: 'analysis'): Promise<RawAiConfig | null>
  saveExplanation(
    assessmentId: string,
    lockToken: string,
    data: { short: string; full: string; model: string; tokens: number },
  ): Promise<boolean>
  hasWelcomeEmail(assessmentId: string): Promise<boolean>
}

export interface GenerateExplanationDeps {
  repo: ExplanationRepo
  fetch: typeof fetch
  sendWelcomeEmail(body: Record<string, unknown>): Promise<{ error: unknown | null }>
  log: Logger
  now(): number
  env: {
    openaiKey?: string
    serviceRoleKey?: string
    hourlyCap: number
    appUrl: string
  }
}

export function parseHourlyCap(raw: string | undefined | null): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_AI_HOURLY_CAP
}

export function lockTokenAt(ms: number): string {
  return `${LOCK_PREFIX}${String(Math.max(0, Math.floor(ms))).padStart(13, '0')}`
}

interface CompletionResult {
  text: string
  tokens: number
}

async function callOpenAI(
  deps: GenerateExplanationDeps,
  body: { model: string; temperature: number; max_tokens: number; system: string; user: string },
): Promise<CompletionResult> {
  const res = await deps.fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${deps.env.openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: body.model,
      temperature: body.temperature,
      max_tokens: body.max_tokens,
      messages: [
        { role: 'system', content: body.system },
        { role: 'user', content: body.user },
      ],
    }),
  })
  if (!res.ok) {
    throw Object.assign(new Error('openai_http_error'), { code: `openai_${res.status}` })
  }
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { total_tokens?: number }
  }
  return {
    text: (json.choices?.[0]?.message?.content ?? '').trim(),
    tokens: json.usage?.total_tokens ?? 0,
  }
}

export function createGenerateExplanationHandler(deps: GenerateExplanationDeps) {
  const { repo, log } = deps

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

    let lockToken: string | null = null
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

      const assessment = await repo.getAssessmentWithResult(assessmentId)
      if (!assessment || !canAccessAssessment(assessment, caller)) {
        return jsonResponse(404, { error: 'not_found' })
      }

      const result = assessment.result
      if (!result) return jsonResponse(409, { error: 'eligibility_not_computed' })

      // Idempotência: já existe resumo → devolve sem OpenAI e sem e-mail.
      const existingShort = (result.ia_explanation_short ?? '').trim()
      if (existingShort) {
        return jsonResponse(200, { status: 'ready', short: existingShort, cached: true })
      }

      if (!deps.env.openaiKey) {
        log('error', 'config_missing', { key: 'OPENAI_API_KEY' })
        return jsonResponse(503, { error: 'ai_unavailable' })
      }

      // Disjuntor de custo: gerações iniciadas na última hora.
      const nowMs = deps.now()
      const since = new Date(nowMs - 60 * 60 * 1000).toISOString()
      const recent = await repo.countAiGenerationsSince(since)
      if (recent >= deps.env.hourlyCap) {
        log('warn', 'ai_hourly_cap_reached', { cap: deps.env.hourlyCap, recent })
        return jsonResponse(202, { status: 'deferred', reason: 'capacity' })
      }

      if (result.ia_explanation_short !== null) {
        await repo.clearEmptyShort(assessmentId, result.ia_explanation_short)
      }

      lockToken = lockTokenAt(nowMs)
      const claimed = await repo.claimGeneration(
        assessmentId,
        lockToken,
        lockTokenAt(nowMs - GENERATION_LOCK_TTL_MS),
      )
      if (!claimed) {
        lockToken = null
        return jsonResponse(202, { status: 'in_progress' })
      }

      const config = sanitizeAiConfig('analysis', await repo.getAiConfig('analysis'))
      if (config.adjusted.length > 0) {
        log('warn', 'ai_config_adjusted', { use_case: 'analysis', fields: config.adjusted })
      }
      await repo.recordAiGeneration({ assessmentId, model: config.model })

      const context = buildAnalysisContext(assessment.answers, result)
      const system = composeSystemPrompt(ANALYSIS_GUARDRAILS, config.systemPrompt)

      const short = await callOpenAI(deps, {
        model: config.model,
        temperature: config.temperature,
        max_tokens: SHORT_MAX_TOKENS,
        system,
        user: buildShortPrompt(context, result.score_category),
      })
      const full = await callOpenAI(deps, {
        model: config.model,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        system,
        user: buildFullPrompt(context),
      })
      if (!short.text || !full.text) {
        throw Object.assign(new Error('openai_empty_completion'), { code: 'openai_empty' })
      }

      const saved = await repo.saveExplanation(assessmentId, lockToken, {
        short: short.text,
        full: full.text,
        model: config.model,
        tokens: short.tokens + full.tokens,
      })
      if (!saved) {
        // Outra execução assumiu a trava (expirada). Não sobrescreve nem envia e-mail.
        log('warn', 'explanation_lock_lost', { assessment_id: assessmentId })
        lockToken = null
        return jsonResponse(202, { status: 'in_progress' })
      }
      lockToken = null
      log('info', 'explanation_generated', {
        assessment_id: assessmentId,
        model: config.model,
        tokens: short.tokens + full.tokens,
      })

      // welcome_free: no máximo um por assessment (confere email_send_log).
      if (assessment.email) {
        try {
          if (await repo.hasWelcomeEmail(assessmentId)) {
            log('info', 'welcome_email_skipped', { assessment_id: assessmentId, reason: 'already_logged' })
          } else {
            const { error } = await deps.sendWelcomeEmail({
              trigger_key: 'welcome_free',
              recipient_email: assessment.email,
              variables: {
                name: assessment.full_name ?? 'Cliente',
                score_category: result.score_category ?? 'média',
                cta_link: `${deps.env.appUrl}/checkout`,
                assessment_id: assessmentId,
              },
            })
            if (error) {
              log('error', 'welcome_email_failed', {
                trigger_key: 'welcome_free',
                assessment_id: assessmentId,
                code: errorCode(error),
              })
            }
          }
        } catch (emailErr) {
          log('error', 'welcome_email_failed', {
            trigger_key: 'welcome_free',
            assessment_id: assessmentId,
            code: errorCode(emailErr),
          })
        }
      }

      return jsonResponse(200, { status: 'ready', short: short.text })
    } catch (err) {
      const code = errorCode(err)
      log('error', 'explanation_failed', { assessment_id: assessmentId, code })
      if (lockToken && assessmentId) {
        try {
          await repo.releaseGeneration(assessmentId, lockToken)
        } catch (releaseErr) {
          log('error', 'lock_release_failed', { assessment_id: assessmentId, code: errorCode(releaseErr) })
        }
      }
      const upstream = code.startsWith('openai_')
      return jsonResponse(upstream ? 502 : 500, { error: upstream ? 'ai_unavailable' : 'internal_error' })
    }
  }
}
