// lifecycle-emails/handler.ts — sequência de e-mails do ciclo de vida (DI-077), testável.
//
// Chamado pelo agendador (pg_cron + pg_net) ou pelo dono, nunca pelo navegador:
//   POST { sequence?: 'all' | 'nurture' | 'access' | 'waitlist_launch',
//          product?: 'visto' | 'regularizacao' | 'nao_sei'   (só waitlist_launch),
//          dry_run?: true, now?: ISO (só em dry-run), limit?: 1..50, confirm?: true }
//   Autenticação: x-internal-secret = INTERNAL_SECRET, ou Bearer = service role.
//
// DRY-RUN É O PADRÃO (env.dryRun, de LIFECYCLE_EMAILS_DRY_RUN): lista quem receberia
// cada e-mail — com o e-mail mascarado — e por que os outros ficaram de fora, sem
// nenhuma requisição ao Resend e sem gravar nada. `dry_run: true` no corpo força o
// dry-run mesmo com o envio ligado; o corpo nunca liga o envio.
//
// Envio real (só com LIFECYCLE_EMAILS_DRY_RUN=false, RESEND_API_KEY e
// EMAIL_UNSUBSCRIBE_SECRET): no máximo `limit` e-mails por execução (padrão e teto 50),
// um por vez com pausa (limite de taxa do Resend). Cada envio é travado antes com uma
// linha 'pending' em email_send_log (índice único por dedupe_key): duas execuções ao
// mesmo tempo não mandam o mesmo e-mail duas vezes. Marketing e serviço levam link de
// descadastro no corpo e List-Unsubscribe (one-click) no cabeçalho.
//
// Regras de quem recebe: _shared/email-lifecycle.ts (planNurture / planAccess / planWaitlist).

import {
  type AccessCandidate,
  ACCESS_WINDOW,
  buildUnsubscribeUrl,
  createUnsubscribeToken,
  DAY_MS,
  emailHash,
  isUsableSecret,
  isWaitlistProduct,
  type LifecycleTemplateKey,
  maskEmail,
  mergeSkips,
  NURTURE_LOOKBACK_DAYS,
  NURTURE_STEPS,
  type NurtureCandidate,
  type PlanContext,
  type PlannedEmail,
  planAccess,
  planNurture,
  planWaitlist,
  renderEmail,
  scopeForCategory,
  type SentState,
  type SkipCounts,
  type WaitlistCandidate,
  type WaitlistProduct,
} from '../_shared/email-lifecycle.ts'
import { safeEqual } from '../_shared/assessment-access.ts'
import { errorCode, jsonResponse, type Logger, readJsonBody } from '../_shared/http.ts'
import { normalizeEmail } from '../_shared/payments.ts'

export const RESEND_URL = 'https://api.resend.com/emails'
export const DEFAULT_FROM = 'Doutor Imigrante <noreply@mail.drimigrante.com>'
/** Teto de e-mails por execução (o plano gratuito do Resend tem limite diário). */
export const MAX_SENDS_PER_RUN = 50
/** Pausa entre envios (o Resend limita requisições por segundo). */
export const SEND_INTERVAL_MS = 600

export type Sequence = 'all' | 'nurture' | 'access' | 'waitlist_launch'

export interface EmailTemplateRow {
  id: string
  trigger_key: string
  subject_pt: string
  body_html_pt: string
}

export interface PendingLogRow {
  template_id: string
  user_id: string | null
  recipient_email: string
  subject: string
  body_html: string
  provider: 'resend'
  status: 'pending'
  variables_used: Record<string, string>
}

export interface LifecycleRepo {
  /** Quizzes concluídos com e-mail entre as datas (nutrição). */
  listCompletedAssessments(sinceIso: string, untilIso: string): Promise<NurtureCandidate[]>
  /** Quem já pagou o €30 ou tem assinatura ativa, por user_id e por e-mail. */
  getPaidAccounts(userIds: string[], emails: string[]): Promise<{ userIds: Set<string>; emails: Set<string> }>
  /** Quem pagou o €30 com fim de acesso entre as datas (avisos de prazo). */
  listAccessCandidates(fromIso: string, toIso: string): Promise<AccessCandidate[]>
  /** Linhas da lista de espera de um produto. */
  listWaitlist(product: WaitlistProduct): Promise<WaitlistCandidate[]>
  /** Estado de envio das chaves (sent/pending = já enviado; failed conta tentativas). */
  getSentState(dedupeKeys: string[]): Promise<SentState>
  /** Escopos de descadastro por hash do e-mail. */
  getSuppressions(emailHashes: string[]): Promise<Map<string, Set<string>>>
  getTemplates(keys: LifecycleTemplateKey[]): Promise<Map<string, EmailTemplateRow>>
  /** Trava o envio (INSERT 'pending'); null = outra execução já travou esta chave. */
  claimSend(row: PendingLogRow): Promise<{ id: string } | null>
  finishSend(
    id: string,
    patch: {
      status: 'sent' | 'failed'
      provider_message_id: string | null
      error_message: string | null
      sent_at: string | null
    },
  ): Promise<void>
}

export interface LifecycleDeps {
  repo: LifecycleRepo
  fetch: typeof fetch
  log: Logger
  now(): number
  sleep(ms: number): Promise<void>
  env: {
    /** LIFECYCLE_EMAILS_DRY_RUN (parseDryRun): true salvo "false" explícito. */
    dryRun: boolean
    internalSecret?: string
    serviceRoleKey?: string
    resendKey?: string
    from?: string
    unsubscribeSecret?: string
    appUrl: string
    /** URL pública da function unsubscribe (link do corpo e List-Unsubscribe). */
    unsubscribeUrl: string
  }
}

interface ParsedBody {
  sequence: Sequence
  product: WaitlistProduct | null
  dryRun: boolean
  nowMs: number | null
  limit: number
  confirm: boolean
}

function parseBody(body: Record<string, unknown> | null): ParsedBody | { error: string } {
  const b = body ?? {}
  const sequence = b.sequence ?? 'all'
  if (sequence !== 'all' && sequence !== 'nurture' && sequence !== 'access' && sequence !== 'waitlist_launch') {
    return { error: 'invalid_sequence' }
  }
  let product: WaitlistProduct | null = null
  if (sequence === 'waitlist_launch') {
    if (!isWaitlistProduct(b.product)) return { error: 'invalid_product' }
    product = b.product
  }
  if (b.dry_run !== undefined && typeof b.dry_run !== 'boolean') return { error: 'invalid_dry_run' }
  let nowMs: number | null = null
  if (b.now !== undefined) {
    nowMs = typeof b.now === 'string' ? Date.parse(b.now) : NaN
    if (!Number.isFinite(nowMs)) return { error: 'invalid_now' }
  }
  let limit = MAX_SENDS_PER_RUN
  if (b.limit !== undefined) {
    if (typeof b.limit !== 'number' || !Number.isInteger(b.limit) || b.limit < 1 || b.limit > MAX_SENDS_PER_RUN) {
      return { error: 'invalid_limit' }
    }
    limit = b.limit
  }
  return { sequence, product, dryRun: b.dry_run === true, nowMs, limit, confirm: b.confirm === true }
}

function isAuthorized(req: Request, env: LifecycleDeps['env']): boolean {
  const internal = req.headers.get('x-internal-secret') ?? ''
  if (env.internalSecret && internal && safeEqual(internal, env.internalSecret)) return true
  const auth = req.headers.get('Authorization') ?? ''
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1]?.trim() ?? ''
  return !!env.serviceRoleKey && !!bearer && safeEqual(bearer, env.serviceRoleKey)
}

function uniq<T>(items: Iterable<T>): T[] {
  return [...new Set(items)]
}

interface Collected {
  nurture: NurtureCandidate[]
  access: AccessCandidate[]
  waitlist: WaitlistCandidate[]
}

/** Plano completo (com descadastros, pagamentos e envios anteriores). Só leituras. */
async function buildPlan(
  deps: LifecycleDeps,
  parsed: ParsedBody,
  nowMs: number,
): Promise<{ due: PlannedEmail[]; skipped: SkipCounts; suppressionChecked: boolean }> {
  const { repo } = deps
  const wantNurture = parsed.sequence === 'all' || parsed.sequence === 'nurture'
  const wantAccess = parsed.sequence === 'all' || parsed.sequence === 'access'
  const product = parsed.sequence === 'waitlist_launch' ? parsed.product : null

  const collected: Collected = {
    nurture: wantNurture
      ? await repo.listCompletedAssessments(
        new Date(nowMs - NURTURE_LOOKBACK_DAYS * DAY_MS).toISOString(),
        new Date(nowMs - NURTURE_STEPS[0].fromDays * DAY_MS).toISOString(),
      )
      : [],
    access: wantAccess
      ? await repo.listAccessCandidates(
        new Date(nowMs - ACCESS_WINDOW.expiredUntilDays * DAY_MS).toISOString(),
        new Date(nowMs + ACCESS_WINDOW.expiringFromDays * DAY_MS).toISOString(),
      )
      : [],
    waitlist: product ? await repo.listWaitlist(product) : [],
  }

  const emails = uniq(
    [...collected.nurture, ...collected.access, ...collected.waitlist]
      .map((c) => normalizeEmail(c.email))
      .filter((e): e is string => !!e),
  )

  // Descadastros: só com o segredo (sem ele, em dry-run, ficam "não conferidos").
  const secret = deps.env.unsubscribeSecret
  const emailHashes = new Map<string, string>()
  let suppressions: Map<string, Set<string>> | null = null
  if (isUsableSecret(secret)) {
    for (const email of emails) {
      const hash = await emailHash(secret, email)
      if (hash) emailHashes.set(email, hash)
    }
    const byHash = await repo.getSuppressions(uniq(emailHashes.values()))
    suppressions = new Map()
    for (const [email, hash] of emailHashes) {
      const scopes = byHash.get(hash)
      if (scopes && scopes.size > 0) suppressions.set(email, scopes)
    }
  }

  const paid = wantNurture
    ? await repo.getPaidAccounts(
      uniq(collected.nurture.map((c) => c.userId).filter((id): id is string => !!id)),
      uniq(collected.nurture.map((c) => normalizeEmail(c.email)).filter((e): e is string => !!e)),
    )
    : { userIds: new Set<string>(), emails: new Set<string>() }

  const run = (sentState: SentState) => {
    const ctx: PlanContext = { nowMs, appUrl: deps.env.appUrl, sentState, suppressions, emailHashes }
    const parts = [
      planNurture(collected.nurture, { ...ctx, paidUserIds: paid.userIds, paidEmails: paid.emails }),
      planAccess(collected.access, ctx),
      ...(product ? [planWaitlist(collected.waitlist, product, ctx)] : []),
    ]
    return { due: parts.flatMap((p) => p.due), skipped: mergeSkips(...parts.map((p) => p.skipped)) }
  }

  // 1ª passada: descobre as chaves; 2ª: aplica o que já foi enviado.
  const firstPass = run({ sent: new Set(), failedAttempts: new Map() })
  const sentState = firstPass.due.length > 0
    ? await repo.getSentState(uniq(firstPass.due.map((d) => d.dedupeKey)))
    : { sent: new Set<string>(), failedAttempts: new Map<string, number>() }
  return { ...run(sentState), suppressionChecked: suppressions !== null }
}

function countByTemplate(due: readonly PlannedEmail[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of due) out[d.template] = (out[d.template] ?? 0) + 1
  return out
}

function maskKey(plan: PlannedEmail): string {
  return plan.dedupeKey.split(plan.email).join(maskEmail(plan.email))
}

export function createLifecycleEmailsHandler(deps: LifecycleDeps) {
  const { repo, log } = deps

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })
    if (!isAuthorized(req, deps.env)) {
      log('warn', 'lifecycle_forbidden', {})
      return jsonResponse(403, { error: 'forbidden' })
    }

    const parsed = parseBody(await readJsonBody(req))
    if ('error' in parsed) return jsonResponse(400, { error: parsed.error })

    const dryRun = deps.env.dryRun || parsed.dryRun
    if (!dryRun && parsed.nowMs !== null) return jsonResponse(400, { error: 'now_only_in_dry_run' })
    if (!dryRun && parsed.sequence === 'waitlist_launch' && !parsed.confirm) {
      return jsonResponse(400, { error: 'confirm_required' })
    }
    if (!dryRun) {
      const missing = [
        ...(deps.env.resendKey ? [] : ['RESEND_API_KEY']),
        ...(isUsableSecret(deps.env.unsubscribeSecret) ? [] : ['EMAIL_UNSUBSCRIBE_SECRET']),
      ]
      if (missing.length > 0) {
        log('error', 'config_missing', { keys: missing.join(',') })
        return jsonResponse(503, { error: 'email_not_configured', missing })
      }
    }

    const nowMs = parsed.nowMs ?? deps.now()
    const nowIso = new Date(nowMs).toISOString()
    const sequences = parsed.sequence === 'all' ? ['nurture', 'access'] : [parsed.sequence]

    try {
      const { due, skipped, suppressionChecked } = await buildPlan(deps, parsed, nowMs)
      const templates = await repo.getTemplates(uniq(due.map((d) => d.template)))
      const warnings: string[] = []
      if (!suppressionChecked) warnings.push('EMAIL_UNSUBSCRIBE_SECRET ausente: descadastros não conferidos nesta lista')
      for (const key of uniq(due.map((d) => d.template))) {
        if (!templates.has(key)) warnings.push(`modelo ${key} ausente ou inativo em email_templates`)
      }

      if (dryRun) {
        const byTemplate = countByTemplate(due)
        log('info', 'lifecycle_dry_run', { sequence: parsed.sequence, planned: due.length, by_template: byTemplate, skipped })
        return jsonResponse(200, {
          dry_run: true,
          now: nowIso,
          sequences,
          planned_total: due.length,
          by_template: byTemplate,
          planned: due.map((d) => ({
            template: d.template,
            to: maskEmail(d.email),
            key: maskKey(d),
            assessment_id: d.assessmentId,
            user_id: d.userId,
            subject: templates.has(d.template)
              ? renderEmail(templates.get(d.template)!, { ...d.variables, unsubscribe_link: '' }).subject
              : null,
          })),
          skipped,
          warnings,
        })
      }

      // ── Envio real ────────────────────────────────────────────────────────
      const secret = deps.env.unsubscribeSecret as string
      const batch = due.slice(0, parsed.limit)
      const result = { sent: 0, failed: 0, skipped_concurrent: 0, skipped_template: 0, capped: due.length - batch.length }

      for (let i = 0; i < batch.length; i++) {
        const plan = batch[i]
        const template = templates.get(plan.template)
        if (!template) {
          result.skipped_template++
          continue
        }
        const scope = scopeForCategory(plan.category)
        const token = scope ? await createUnsubscribeToken(secret, plan.email, scope) : null
        const unsubscribeLink = token ? buildUnsubscribeUrl(deps.env.unsubscribeUrl, token) : ''
        const variables = { ...plan.variables, ...(token ? { unsubscribe_link: unsubscribeLink } : {}) }
        const rendered = renderEmail(template, variables)
        if (rendered.missing.length > 0 || (scope && !token)) {
          // Nunca sai e-mail com {{variável}} crua nem sem o link de descadastro.
          log('error', 'lifecycle_template_problem', { template: plan.template, missing: rendered.missing.join(',') })
          result.skipped_template++
          continue
        }

        const claim = await repo.claimSend({
          template_id: template.id,
          user_id: plan.userId,
          recipient_email: plan.email,
          subject: rendered.subject,
          body_html: rendered.html,
          provider: 'resend',
          status: 'pending',
          variables_used: {
            ...variables,
            dedupe_key: plan.dedupeKey,
            ...(plan.assessmentId ? { assessment_id: plan.assessmentId } : {}),
          },
        })
        if (!claim) {
          result.skipped_concurrent++
          continue
        }

        if (result.sent + result.failed > 0) await deps.sleep(SEND_INTERVAL_MS)

        let providerStatus = 0
        let providerJson: Record<string, unknown> = {}
        let networkError: string | null = null
        try {
          const res = await deps.fetch(RESEND_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${deps.env.resendKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': plan.dedupeKey.slice(0, 256),
            },
            body: JSON.stringify({
              from: deps.env.from || DEFAULT_FROM,
              to: [plan.email],
              subject: rendered.subject,
              html: rendered.html,
              ...(token
                ? {
                  headers: {
                    'List-Unsubscribe': `<${unsubscribeLink}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                  },
                }
                : {}),
            }),
          })
          providerStatus = res.status
          try {
            const parsedJson = await res.json()
            if (parsedJson && typeof parsedJson === 'object') providerJson = parsedJson as Record<string, unknown>
          } catch {
            providerJson = {}
          }
        } catch (fetchErr) {
          networkError = errorCode(fetchErr)
        }

        const ok = !networkError && providerStatus >= 200 && providerStatus < 300
        const code = ok
          ? null
          : networkError
          ? `network_${networkError}`
          : typeof providerJson.name === 'string' && providerJson.name
          ? providerJson.name
          : `http_${providerStatus}`
        const providerMessage = typeof providerJson.message === 'string'
          ? providerJson.message.replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '[email]').slice(0, 300)
          : null

        await repo.finishSend(claim.id, {
          status: ok ? 'sent' : 'failed',
          provider_message_id: typeof providerJson.id === 'string' ? providerJson.id : null,
          error_message: ok
            ? null
            : JSON.stringify({ code, status: providerStatus || null, message: providerMessage, trigger_key: plan.template }),
          sent_at: ok ? new Date(deps.now()).toISOString() : null,
        })

        if (ok) {
          result.sent++
          log('info', 'email_send', { trigger_key: plan.template, status: 'sent' })
        } else {
          result.failed++
          log('error', 'email_send', { trigger_key: plan.template, status: 'failed', code, provider_status: providerStatus || null })
        }
      }

      log('info', 'lifecycle_run', { sequence: parsed.sequence, ...result })
      return jsonResponse(200, {
        dry_run: false,
        now: nowIso,
        sequences,
        planned_total: due.length,
        by_template: countByTemplate(batch),
        ...result,
        skipped,
        warnings,
      })
    } catch (err) {
      log('error', 'lifecycle_failed', { sequence: parsed.sequence, code: errorCode(err) })
      return jsonResponse(500, { error: 'internal_error' })
    }
  }
}
