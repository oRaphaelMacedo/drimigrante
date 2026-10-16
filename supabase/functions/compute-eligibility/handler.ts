// compute-eligibility/handler.ts — lógica da função (sem imports remotos, testável no Deno).
//
// DI-004: exige posse (JWT do dono ou session_id do assessment anônimo) → senão 404,
// para ninguém reescrever resultados de terceiros. Se a análise de IA já foi gerada,
// o resultado fica congelado (devolve o existente sem reescrever), para score e análise
// não divergirem. A resposta só traz colunas de score — nunca as análises de IA.
//
// DI-006: o score vem de _shared/quiz-engine.ts, o mesmo cálculo do front (só perguntas
// visíveis, limiares 60/35, bônus do caso E), sobre as perguntas ativas do banco. Toda
// leitura acontece antes de qualquer escrita: se uma query falhar, a resposta é 500 e
// nada é gravado (antes, o erro PGRST201 virava score 0/'baixa' para todo mundo).
//
// DI-077: o welcome_free sai DAQUI (antes saía do generate-explanation, depois da
// OpenAI — se a IA falhasse, ninguém recebia). Regras:
//   · com a categoria já calculada aqui (rótulo de src/lib/category.ts) e o link de
//     retomada /results?r=<token> (DI-024), mais o link de descadastro (HMAC);
//   · no máximo um por assessment (email_send_log) e um por destinatário em 24 h;
//   · só para o dono (session_id/JWT) — chamadas da service role (scripts) não enviam;
//   · respeita o descadastro geral ('all'); não depende do opt-in de marketing (é o
//     resultado que a pessoa pediu);
//   · DRY-RUN por padrão (LIFECYCLE_EMAILS_DRY_RUN): só loga 'welcome_email_dry_run';
//   · roda depois da resposta (defer → EdgeRuntime.waitUntil) e nunca muda o resultado:
//     qualquer erro vira log e o score continua 200.

import {
  canAccessAssessment,
  extractBearerToken,
  isUuid,
  resolveCaller,
} from '../_shared/assessment-access.ts'
import {
  buildResultUrl,
  buildUnsubscribeUrl,
  categoryLabel,
  createUnsubscribeToken,
  DAY_MS,
  emailHash,
  greetingFor,
  isSuppressedFor,
  isUsableSecret,
  isWaitlistAnswers,
} from '../_shared/email-lifecycle.ts'
import { corsHeaders, errorCode, jsonResponse, type Logger, readJsonBody } from '../_shared/http.ts'
import { normalizeEmail } from '../_shared/payments.ts'
import { type DbScoringQuestionRow, scoreAssessment } from '../_shared/quiz-engine.ts'
import { evaluateRule } from './scoring.ts'

export interface EligibilityAssessment {
  id: string
  user_id: string | null
  session_id: string | null
  answers: unknown
  email?: string | null
  full_name?: string | null
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
  /** Perguntas ativas com as opções ativas (select QUIZ_SCORING_SELECT). Lança em erro. */
  getScoringQuestions(): Promise<DbScoringQuestionRow[]>
  getActiveVisaRules(): Promise<VisaRule[]>
  upsertResult(row: {
    assessment_id: string
    score_numeric: number
    score_category: string
    suggested_visa_types: SuggestedVisaType[]
    computed_at: string
  }): Promise<SafeResult>
  markCompleted(assessmentId: string, completedAtIso: string): Promise<void>
  /** assessments.resume_token (migration 20261025000200). Lança se a coluna não existir. */
  getResumeToken(assessmentId: string): Promise<string | null>
  /** Já existe welcome_free (enviado ou com falha) para este assessment. */
  hasWelcomeEmail(assessmentId: string): Promise<boolean>
  /** Já saiu welcome_free para este e-mail desde `sinceIso`. */
  hasRecentWelcomeTo(email: string, sinceIso: string): Promise<boolean>
  /** Escopos de descadastro do hash do e-mail (tabela email_suppressions). */
  getSuppressionScopes(emailHash: string): Promise<Set<string>>
}

export interface WelcomeEmailConfig {
  /** LIFECYCLE_EMAILS_DRY_RUN (parseDryRun): true salvo "false" explícito. */
  dryRun: boolean
  appUrl: string
  unsubscribeSecret?: string
  /** URL pública da function unsubscribe. */
  unsubscribeUrl: string
  /** send-email com o INTERNAL_SECRET (devolve o { error } do invoke). */
  send(body: Record<string, unknown>): Promise<{ error: unknown | null }>
}

export interface ComputeEligibilityDeps {
  repo: EligibilityRepo
  log: Logger
  now(): number
  env: { serviceRoleKey?: string }
  /** Sem esta configuração, nenhum e-mail é considerado. */
  welcome?: WelcomeEmailConfig
  /** Mantém a tarefa viva depois da resposta (EdgeRuntime.waitUntil). Sem ela, espera. */
  defer?(task: Promise<unknown>): void
}

/** Um welcome_free por destinatário neste intervalo (ex.: o mesmo resultado aberto em outro aparelho e comprado lá). */
export const WELCOME_RECIPIENT_WINDOW_MS = DAY_MS

/** welcome_free do quiz recém-calculado. Nunca lança: tudo vira log. */
async function sendWelcomeEmail(
  deps: ComputeEligibilityDeps,
  assessment: EligibilityAssessment,
  category: string,
  nowMs: number,
): Promise<void> {
  const cfg = deps.welcome
  if (!cfg) return
  const { repo, log } = deps
  const assessmentId = assessment.id
  const skip = (reason: string) => log('info', 'welcome_email_skipped', { assessment_id: assessmentId, reason })

  const email = normalizeEmail(assessment.email)
  if (!email) return skip('no_email')
  if (isWaitlistAnswers(assessment.answers)) return skip('waitlist')

  try {
    if (await repo.hasWelcomeEmail(assessmentId)) return skip('already_logged')
    if (await repo.hasRecentWelcomeTo(email, new Date(nowMs - WELCOME_RECIPIENT_WINDOW_MS).toISOString())) {
      return skip('recent_for_recipient')
    }

    const secret = cfg.unsubscribeSecret
    const secretOk = isUsableSecret(secret)
    if (!secretOk && !cfg.dryRun) {
      // Sem segredo não há como conferir o descadastro nem montar o link: não envia.
      log('error', 'config_missing', { key: 'EMAIL_UNSUBSCRIBE_SECRET' })
      return
    }
    let unsubscribeLink = ''
    if (secretOk) {
      const hash = await emailHash(secret, email)
      if (hash && isSuppressedFor('service', await repo.getSuppressionScopes(hash))) return skip('suppressed')
      const token = await createUnsubscribeToken(secret, email, 'all')
      if (token) unsubscribeLink = buildUnsubscribeUrl(cfg.unsubscribeUrl, token)
    }

    let resumeToken: string | null = null
    try {
      resumeToken = await repo.getResumeToken(assessmentId)
    } catch (err) {
      log('warn', 'welcome_resume_token_unavailable', { assessment_id: assessmentId, code: errorCode(err) })
    }
    // Sem o link de retomada o e-mail prometeria algo que não abre em outro aparelho.
    if (!resumeToken) return skip('no_resume_token')

    if (cfg.dryRun) {
      log('info', 'welcome_email_dry_run', {
        assessment_id: assessmentId,
        category,
        suppression_checked: secretOk,
      })
      return
    }

    const label = categoryLabel(category)
    const resultLink = buildResultUrl(cfg.appUrl, resumeToken)
    const { error } = await cfg.send({
      trigger_key: 'welcome_free',
      recipient_email: email,
      ...(assessment.user_id ? { user_id: assessment.user_id } : {}),
      variables: {
        greeting: greetingFor(assessment.full_name),
        category_label: label,
        result_link: resultLink,
        unsubscribe_link: unsubscribeLink,
        assessment_id: assessmentId,
        dedupe_key: `welcome_free:${assessmentId}`,
        // Compatíveis com o modelo antigo, caso a migration 20261030000000 ainda não
        // tenha sido aplicada quando o envio for ligado.
        name: assessment.full_name?.trim() || 'Cliente',
        score_category: label,
        cta_link: resultLink,
      },
    })
    if (error) {
      log('error', 'welcome_email_failed', {
        trigger_key: 'welcome_free',
        assessment_id: assessmentId,
        code: errorCode(error),
      })
    } else {
      log('info', 'welcome_email_sent', { trigger_key: 'welcome_free', assessment_id: assessmentId })
    }
  } catch (err) {
    log('error', 'welcome_email_failed', { trigger_key: 'welcome_free', assessment_id: assessmentId, code: errorCode(err) })
  }
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

      // Leituras primeiro: qualquer erro aqui cai no catch (500) sem gravar nada.
      const [questionRows, visaRules] = await Promise.all([
        repo.getScoringQuestions(),
        repo.getActiveVisaRules(),
      ])

      const score = scoreAssessment(assessment.answers, questionRows)
      if (score.repairedConditions.length > 0) {
        // Condições incompletas no banco (migration 20261016000200 ainda não aplicada):
        // usamos a regra do código, como o navegador faz.
        log('warn', 'quiz_conditions_repaired', { question_keys: score.repairedConditions })
      }
      if (score.usedCodeQuestions) log('warn', 'quiz_questions_empty', {})

      // As regras de visto (JSON-Logic) continuam lendo as respostas como estão no banco.
      const rawAnswers = (assessment.answers && typeof assessment.answers === 'object'
        ? assessment.answers
        : {}) as Record<string, unknown>

      const suggestedVisaTypes: SuggestedVisaType[] = []
      for (const vt of visaRules) {
        suggestedVisaTypes.push({
          visa_type_id: vt.id,
          visa_type_code: vt.code,
          visa_type_name: vt.name_pt,
          eligible: evaluateRule(vt.rules, rawAnswers),
          rule_version_id: vt.ruleVersionId,
        })
      }
      // Elegíveis primeiro.
      suggestedVisaTypes.sort((a, b) => (b.eligible ? 1 : 0) - (a.eligible ? 1 : 0))

      const nowIso = new Date(deps.now()).toISOString()
      const result = await repo.upsertResult({
        assessment_id: assessmentId,
        score_numeric: score.percentage,
        score_category: score.category,
        suggested_visa_types: suggestedVisaTypes,
        computed_at: nowIso,
      })
      await repo.markCompleted(assessmentId, nowIso)

      // DI-077: welcome_free sem depender da OpenAI, depois da resposta.
      if (deps.welcome && !caller.isServiceRole) {
        const task = sendWelcomeEmail(deps, assessment, score.category, deps.now())
        if (deps.defer) deps.defer(task)
        else await task
      }

      return jsonResponse(200, { result })
    } catch (err) {
      log('error', 'eligibility_failed', { assessment_id: assessmentId, code: errorCode(err) })
      return jsonResponse(500, { error: 'internal_error' })
    }
  }
}
