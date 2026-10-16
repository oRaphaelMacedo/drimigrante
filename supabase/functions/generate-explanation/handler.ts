// generate-explanation/handler.ts — lógica da função (sem imports remotos, testável no Deno).
//
// DI-004: posse obrigatória (JWT do dono ou session_id de assessment anônimo) → senão 404;
//         idempotente (o que já existe volta sem OpenAI e sem e-mail);
//         resposta NUNCA contém a análise completa; contexto sem PII;
//         disjuntor por hora (AI_HOURLY_CAP) → 202.
// DI-008: contexto com as chaves reais do quiz e as vias de _shared/pathways.ts; prompts pt-BR sem persona.
// DI-014: lê { error } do envio do welcome_free e registra log estruturado.
// DI-018: dois modos, cada um gera SÓ a sua parte.
//   · mode 'short' (padrão, fim do quiz): só o resumo grátis + welcome_free. Nunca gera a análise paga.
//   · mode 'full' (AnalysisPage, sob demanda): exige JWT do dono (ou a service role) e
//     has_active_access(dono, 'full_analysis') → 401 auth_required / 404 / 403 payment_required.
//     Idempotente: análise já gravada → 200 sem OpenAI. A trava evita gerações paralelas (202).

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
/** Tempo máximo de espera pela OpenAI (abaixo do TTL da trava). */
export const OPENAI_TIMEOUT_MS: Record<ExplanationMode, number> = { short: 30_000, full: 120_000 }

export type ExplanationMode = 'short' | 'full'

/** Estado da análise completa sem o texto (o handler nunca precisa dele). */
export type FullStatus = 'missing' | 'blank' | 'ready'

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
    ia_tokens_used: number | null
    full_status: FullStatus
  } | null
}

export interface ExplanationRepo {
  getUserIdFromToken(token: string): Promise<string | null>
  getAssessmentWithResult(assessmentId: string): Promise<AssessmentWithResult | null>
  /** has_active_access(_user_id, 'full_analysis') — RPC só da service role (DI-016). */
  hasFullAnalysisAccess(userId: string): Promise<boolean>
  countAiGenerationsSince(sinceIso: string): Promise<number>
  /** Texto vazio legado ('' ou só espaços) volta a null para permitir nova geração. */
  clearBlank(assessmentId: string, mode: ExplanationMode): Promise<void>
  /** Trava atômica: true só para quem conseguiu marcar a geração deste modo. */
  claimGeneration(
    assessmentId: string,
    mode: ExplanationMode,
    lockToken: string,
    staleLockToken: string,
  ): Promise<boolean>
  /** Solta a trava devolvendo o modelo que estava gravado antes dela. */
  releaseGeneration(assessmentId: string, lockToken: string, restoreModel: string | null): Promise<void>
  recordAiGeneration(entry: { assessmentId: string; model: string; mode: ExplanationMode }): Promise<void>
  getAiConfig(useCase: 'analysis'): Promise<RawAiConfig | null>
  /** Grava só o texto do modo pedido; false = a trava foi perdida para outra execução. */
  saveExplanation(
    assessmentId: string,
    lockToken: string,
    mode: ExplanationMode,
    data: { text: string; model: string; tokens: number },
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

/** `mode` ausente = 'short' (o quiz não manda o campo). Valor desconhecido → null (400). */
export function parseMode(raw: unknown): ExplanationMode | null {
  if (raw === undefined || raw === null) return 'short'
  return raw === 'short' || raw === 'full' ? raw : null
}

interface CompletionResult {
  text: string
  tokens: number
}

async function callOpenAI(
  deps: GenerateExplanationDeps,
  body: { model: string; temperature: number; max_tokens: number; system: string; user: string; timeoutMs: number },
): Promise<CompletionResult> {
  let res: Response
  try {
    res = await deps.fetch(OPENAI_CHAT_URL, {
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
      signal: AbortSignal.timeout(body.timeoutMs),
    })
  } catch (err) {
    const name = errorCode(err)
    const code = name === 'TimeoutError' || name === 'AbortError' ? 'openai_timeout' : 'openai_network'
    throw Object.assign(new Error('openai_fetch_failed'), { code })
  }
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
    let restoreModel: string | null = null
    let assessmentId: string | null = null
    let mode: ExplanationMode = 'short'

    try {
      const body = await readJsonBody(req)
      const rawId = body?.assessment_id
      const parsedMode = parseMode(body?.mode)
      if (!isUuid(rawId) || !parsedMode) return jsonResponse(400, { error: 'invalid_request' })
      assessmentId = rawId
      mode = parsedMode

      // A análise paga só sai para uma conta: o session_id do quiz não serve aqui.
      const caller = await resolveCaller(
        extractBearerToken(req),
        mode === 'full' ? null : body?.session_id,
        {
          serviceRoleKey: deps.env.serviceRoleKey,
          getUserIdFromToken: (t) => repo.getUserIdFromToken(t),
        },
      )
      if (mode === 'full' && !caller.userId && !caller.isServiceRole) {
        return jsonResponse(401, { error: 'auth_required' })
      }
      if (!caller.userId && !caller.sessionId && !caller.isServiceRole) {
        return jsonResponse(404, { error: 'not_found' })
      }

      const assessment = await repo.getAssessmentWithResult(assessmentId)
      if (!assessment || !canAccessAssessment(assessment, caller)) {
        return jsonResponse(404, { error: 'not_found' })
      }

      // Pagamento conferido no servidor, também para a service role (só gera para quem pagou).
      if (mode === 'full') {
        const ownerId = assessment.user_id
        if (!ownerId || !(await repo.hasFullAnalysisAccess(ownerId))) {
          log('info', 'explanation_payment_required', { assessment_id: assessmentId })
          return jsonResponse(403, { error: 'payment_required' })
        }
      }

      const result = assessment.result
      if (!result) return jsonResponse(409, { error: 'eligibility_not_computed' })

      // Idempotência: o que já existe volta sem OpenAI e sem e-mail.
      const existingShort = (result.ia_explanation_short ?? '').trim()
      if (mode === 'short' && existingShort) {
        return jsonResponse(200, { status: 'ready', short: existingShort, cached: true })
      }
      if (mode === 'full' && result.full_status === 'ready') {
        return jsonResponse(200, { status: 'ready', cached: true })
      }

      if (!deps.env.openaiKey) {
        log('error', 'config_missing', { key: 'OPENAI_API_KEY' })
        return jsonResponse(503, { error: 'ai_unavailable' })
      }

      // Disjuntor de custo: gerações iniciadas na última hora (os dois modos contam).
      const nowMs = deps.now()
      const since = new Date(nowMs - 60 * 60 * 1000).toISOString()
      const recent = await repo.countAiGenerationsSince(since)
      if (recent >= deps.env.hourlyCap) {
        log('warn', 'ai_hourly_cap_reached', { cap: deps.env.hourlyCap, recent, mode })
        return jsonResponse(202, { status: 'deferred', reason: 'capacity' })
      }

      const blank = mode === 'short' ? result.ia_explanation_short !== null : result.full_status === 'blank'
      if (blank) await repo.clearBlank(assessmentId, mode)

      const previousModel = result.ia_model_used
      restoreModel = previousModel && !previousModel.startsWith(LOCK_PREFIX) ? previousModel : null
      lockToken = lockTokenAt(nowMs)
      const claimed = await repo.claimGeneration(
        assessmentId,
        mode,
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
      await repo.recordAiGeneration({ assessmentId, model: config.model, mode })

      const context = buildAnalysisContext(assessment.answers, result)
      const system = composeSystemPrompt(ANALYSIS_GUARDRAILS, config.systemPrompt)

      const completion = await callOpenAI(deps, {
        model: config.model,
        temperature: config.temperature,
        max_tokens: mode === 'short' ? SHORT_MAX_TOKENS : config.maxTokens,
        system,
        user: mode === 'short' ? buildShortPrompt(context, result.score_category) : buildFullPrompt(context),
        timeoutMs: OPENAI_TIMEOUT_MS[mode],
      })
      if (!completion.text) {
        throw Object.assign(new Error('openai_empty_completion'), { code: 'openai_empty' })
      }

      const tokens = (result.ia_tokens_used ?? 0) + completion.tokens
      const saved = await repo.saveExplanation(assessmentId, lockToken, mode, {
        text: completion.text,
        model: config.model,
        tokens,
      })
      if (!saved) {
        // Outra execução assumiu a trava (expirada). Não sobrescreve nem envia e-mail.
        log('warn', 'explanation_lock_lost', { assessment_id: assessmentId, mode })
        lockToken = null
        return jsonResponse(202, { status: 'in_progress' })
      }
      lockToken = null
      log('info', 'explanation_generated', {
        assessment_id: assessmentId,
        mode,
        model: config.model,
        tokens: completion.tokens,
      })

      if (mode === 'full') return jsonResponse(200, { status: 'ready' })

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

      return jsonResponse(200, { status: 'ready', short: completion.text })
    } catch (err) {
      const code = errorCode(err)
      log('error', 'explanation_failed', { assessment_id: assessmentId, mode, code })
      if (lockToken && assessmentId) {
        try {
          await repo.releaseGeneration(assessmentId, lockToken, restoreModel)
        } catch (releaseErr) {
          log('error', 'lock_release_failed', { assessment_id: assessmentId, code: errorCode(releaseErr) })
        }
      }
      const upstream = code.startsWith('openai_')
      return jsonResponse(upstream ? 502 : 500, { error: upstream ? 'ai_unavailable' : 'internal_error' })
    }
  }
}
