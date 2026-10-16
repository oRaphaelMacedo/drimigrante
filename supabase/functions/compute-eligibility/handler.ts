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
// DI-077: as boas-vindas saem DAQUI (antes saíam do generate-explanation, depois da
// OpenAI — se a IA falhasse, ninguém recebia). Modelo welcome_free_v2: o antigo
// 'welcome_free' fica intacto no banco porque o generate-explanation em produção ainda
// o envia com outras variáveis (ver WELCOME_TEMPLATE_KEY). Regras:
//   · com a categoria já calculada aqui (rótulo de src/lib/category.ts) e o link de
//     retomada /results?r=<token> (DI-024), mais o link de descadastro (HMAC);
//   · no máximo um por assessment e um por destinatário em 24 h, contando o modelo
//     antigo e o novo (email_send_log); trava 'pending' por assessment (índice único
//     de dedupe_key) para o fim do quiz e o início do checkout, chamados juntos, não
//     mandarem dois; a trava é conferida de novo depois de obtida e apagada no fim;
//   · só para resultado novo: se este assessment já tinha resultado calculado há mais
//     de 24 h (ex.: checkout de um quiz antigo), não manda boas-vindas atrasadas;
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
  WELCOME_TEMPLATE_KEY,
  welcomeDedupeKey,
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
  /**
   * Já existe boas-vindas (welcome_free ou welcome_free_v2, enviada ou com falha) para
   * este assessment. Ignora as travas 'pending' (a própria inclusive).
   */
  hasWelcomeEmail(assessmentId: string): Promise<boolean>
  /** Já saiu boas-vindas (modelo antigo ou novo) para este e-mail desde `sinceIso`, sem diferenciar maiúsculas. */
  hasRecentWelcomeTo(email: string, sinceIso: string): Promise<boolean>
  /** Escopos de descadastro do hash do e-mail (tabela email_suppressions). */
  getSuppressionScopes(emailHash: string): Promise<Set<string>>
  /** id do modelo ativo (null se a migration 20261030000000 não foi aplicada ou o modelo foi desativado). */
  getActiveTemplateId(triggerKey: string): Promise<string | null>
  /** Trava 'pending' em email_send_log; null = outra chamada já travou esta chave. */
  claimWelcome(row: WelcomeClaimRow): Promise<{ id: string } | null>
  /** Apaga a trava (o log do envio fica com o send-email). */
  releaseWelcomeClaim(id: string): Promise<void>
}

/** Linha de trava do welcome_free_v2 (sem assunto nem corpo: não é um envio). */
export interface WelcomeClaimRow {
  template_id: string
  user_id: string | null
  recipient_email: string
  provider: 'resend'
  status: 'pending'
  variables_used: { dedupe_key: string; assessment_id: string }
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

/** Uma boas-vindas por destinatário neste intervalo (ex.: o mesmo resultado aberto em outro aparelho e comprado lá). */
export const WELCOME_RECIPIENT_WINDOW_MS = DAY_MS

/**
 * Resultado calculado antes há mais que isto = assessment antigo (ex.: o checkout chama
 * o compute-eligibility de novo dias depois): não manda boas-vindas atrasadas.
 */
export const WELCOME_MAX_PREVIOUS_RESULT_AGE_MS = DAY_MS

/** Boas-vindas do quiz recém-calculado (welcome_free_v2). Nunca lança: tudo vira log. */
async function sendWelcomeEmail(
  deps: ComputeEligibilityDeps,
  assessment: EligibilityAssessment,
  category: string,
  nowMs: number,
  previousComputedAt: string | null,
): Promise<void> {
  const cfg = deps.welcome
  if (!cfg) return
  const { repo, log } = deps
  const assessmentId = assessment.id
  const skip = (reason: string) => log('info', 'welcome_email_skipped', { assessment_id: assessmentId, reason })

  const email = normalizeEmail(assessment.email)
  if (!email) return skip('no_email')
  if (isWaitlistAnswers(assessment.answers)) return skip('waitlist')
  if (previousComputedAt !== null) {
    const previousMs = Date.parse(previousComputedAt)
    if (!Number.isFinite(previousMs) || nowMs - previousMs > WELCOME_MAX_PREVIOUS_RESULT_AGE_MS) {
      return skip('stale_assessment')
    }
  }

  const sinceIso = new Date(nowMs - WELCOME_RECIPIENT_WINDOW_MS).toISOString()
  /** Motivo para não enviar por já ter recebido (antes e depois da trava). */
  const alreadyWelcomed = async (): Promise<string | null> => {
    if (await repo.hasWelcomeEmail(assessmentId)) return 'already_logged'
    if (await repo.hasRecentWelcomeTo(email, sinceIso)) return 'recent_for_recipient'
    return null
  }

  let claimId: string | null = null
  try {
    const before = await alreadyWelcomed()
    if (before) return skip(before)

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

    const templateId = await repo.getActiveTemplateId(WELCOME_TEMPLATE_KEY)

    if (cfg.dryRun) {
      log('info', 'welcome_email_dry_run', {
        assessment_id: assessmentId,
        category,
        suppression_checked: secretOk,
        template_ready: templateId !== null,
      })
      return
    }

    // Sem o modelo novo (migration ausente ou modelo desativado) nada sai: nunca cai no
    // welcome_free antigo, que tem outras variáveis.
    if (!templateId) return skip('template_missing')
    if (!unsubscribeLink) return skip('no_unsubscribe_link')

    const claim = await repo.claimWelcome({
      template_id: templateId,
      user_id: assessment.user_id ?? null,
      recipient_email: email,
      provider: 'resend',
      status: 'pending',
      variables_used: { dedupe_key: welcomeDedupeKey(assessmentId), assessment_id: assessmentId },
    })
    if (!claim) return skip('concurrent')
    claimId = claim.id

    // Outra chamada pode ter terminado entre a 1ª conferência e a trava.
    const after = await alreadyWelcomed()
    if (after) return skip(after)

    const { error } = await cfg.send({
      trigger_key: WELCOME_TEMPLATE_KEY,
      recipient_email: email,
      ...(assessment.user_id ? { user_id: assessment.user_id } : {}),
      variables: {
        greeting: greetingFor(assessment.full_name),
        category_label: categoryLabel(category),
        result_link: buildResultUrl(cfg.appUrl, resumeToken),
        unsubscribe_link: unsubscribeLink,
        // Fica no log do send-email: é o que hasWelcomeEmail confere depois.
        assessment_id: assessmentId,
      },
    })
    if (error) {
      log('error', 'welcome_email_failed', {
        trigger_key: WELCOME_TEMPLATE_KEY,
        assessment_id: assessmentId,
        code: errorCode(error),
      })
    } else {
      log('info', 'welcome_email_sent', { trigger_key: WELCOME_TEMPLATE_KEY, assessment_id: assessmentId })
    }
  } catch (err) {
    log('error', 'welcome_email_failed', {
      trigger_key: WELCOME_TEMPLATE_KEY,
      assessment_id: assessmentId,
      code: errorCode(err),
    })
  } finally {
    if (claimId) {
      try {
        await repo.releaseWelcomeClaim(claimId)
      } catch (err) {
        // A trava fica 'pending' e bloqueia novas boas-vindas deste assessment (conservador).
        log('warn', 'welcome_claim_release_failed', { assessment_id: assessmentId, code: errorCode(err) })
      }
    }
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

      // DI-077: boas-vindas sem depender da OpenAI, depois da resposta.
      if (deps.welcome && !caller.isServiceRole) {
        // Resultado que já existia antes desta conta ('' = existia, mas sem data → antigo).
        const previousComputedAt = existing ? existing.result.computed_at ?? '' : null
        const task = sendWelcomeEmail(deps, assessment, score.category, deps.now(), previousComputedAt)
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
