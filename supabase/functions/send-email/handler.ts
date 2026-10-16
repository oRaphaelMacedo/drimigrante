// send-email/handler.ts — envio transacional via Resend (sem imports remotos, testável).
//
// DI-014: toda falha gera log estruturado em JSON ({ fn, event, trigger_key, status, code })
// e uma linha em email_send_log; quem chamou recebe status != 2xx com { error, code },
// para conseguir ler o { error } do functions.invoke. Nunca loga e-mail nem nome.

import { corsHeaders, errorCode, jsonResponse, type Logger, readJsonBody } from '../_shared/http.ts'
import { safeEqual } from '../_shared/assessment-access.ts'

export const RESEND_URL = 'https://api.resend.com/emails'
export const DEFAULT_FROM = 'Doutor Imigrante <noreply@mail.drimigrante.com>'

export interface EmailTemplate {
  id: string
  subject_pt: string
  body_html_pt: string
}

export interface EmailLogRow {
  template_id: string
  user_id: string | null
  recipient_email: string
  subject: string
  body_html: string
  provider: string
  provider_message_id: string | null
  status: 'sent' | 'failed'
  error_message: string | null
  variables_used: Record<string, string>
  sent_at: string | null
}

export interface SendEmailRepo {
  getTemplate(triggerKey: string): Promise<EmailTemplate | null>
  getProfile(userId: string): Promise<{ email: string | null; full_name: string | null } | null>
  insertLog(row: EmailLogRow): Promise<void>
}

export interface SendEmailDeps {
  repo: SendEmailRepo
  fetch: typeof fetch
  log: Logger
  now(): number
  env: { internalSecret?: string; resendKey?: string; from?: string }
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// B03-A06: escape user-supplied variables before injecting into HTML bodies
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function toStringVars(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
  }
  return out
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function createSendEmailHandler(deps: SendEmailDeps) {
  const { repo, log } = deps

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    // B03-A05: só outras Edge Functions chamam esta função (INTERNAL_SECRET).
    const callerSecret = req.headers.get('x-internal-secret') ?? ''
    if (!deps.env.internalSecret || !safeEqual(callerSecret, deps.env.internalSecret)) {
      log('warn', 'email_forbidden', {})
      return jsonResponse(403, { error: 'forbidden' })
    }
    if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

    let triggerKey: string | null = null
    try {
      const body = await readJsonBody(req)
      triggerKey = typeof body?.trigger_key === 'string' && body.trigger_key ? body.trigger_key : null
      if (!triggerKey) return jsonResponse(400, { error: 'invalid_request' })

      if (!deps.env.resendKey) {
        log('error', 'email_send', { trigger_key: triggerKey, status: 'failed', code: 'resend_key_missing' })
        return jsonResponse(500, { error: 'email_not_configured', code: 'resend_key_missing' })
      }

      const template = await repo.getTemplate(triggerKey)
      if (!template) {
        log('error', 'email_send', { trigger_key: triggerKey, status: 'failed', code: 'template_not_found' })
        return jsonResponse(404, { error: 'template_not_found', code: 'template_not_found' })
      }

      const variables = toStringVars(body?.variables)
      const userId = typeof body?.user_id === 'string' && body.user_id ? body.user_id : null
      let to = isEmail(body?.recipient_email) ? body.recipient_email : null
      let name = variables.name ?? 'Cliente'

      if (userId && !to) {
        const profile = await repo.getProfile(userId)
        if (profile && isEmail(profile.email)) {
          to = profile.email
          name = profile.full_name ?? name
        }
      }

      if (!to) {
        log('error', 'email_send', { trigger_key: triggerKey, status: 'failed', code: 'no_recipient' })
        return jsonResponse(400, { error: 'no_recipient', code: 'no_recipient' })
      }

      const mergedVars: Record<string, string> = { name, ...variables }
      // Assunto é texto puro; o corpo é HTML → variáveis escapadas (XSS).
      const subject = interpolate(template.subject_pt, mergedVars)
      const safeVars = Object.fromEntries(Object.entries(mergedVars).map(([k, v]) => [k, escapeHtml(v)]))
      const bodyHtml = interpolate(template.body_html_pt, safeVars)

      let providerStatus = 0
      let providerJson: Record<string, unknown> = {}
      let networkError: string | null = null
      try {
        const res = await deps.fetch(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${deps.env.resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: deps.env.from || DEFAULT_FROM, to: [to], subject, html: bodyHtml }),
        })
        providerStatus = res.status
        try {
          const parsed = await res.json()
          if (parsed && typeof parsed === 'object') providerJson = parsed as Record<string, unknown>
        } catch {
          providerJson = {}
        }
      } catch (fetchErr) {
        networkError = errorCode(fetchErr)
      }

      const sent = !networkError && providerStatus >= 200 && providerStatus < 300
      const code = sent
        ? null
        : networkError
        ? `network_${networkError}`
        : typeof providerJson.name === 'string' && providerJson.name
        ? providerJson.name
        : `http_${providerStatus}`
      // Mensagem do provedor sem endereços de e-mail (alguns erros do Resend citam o destinatário).
      const providerMessage = typeof providerJson.message === 'string'
        ? providerJson.message.replace(/[^\s@<>()"']+@[^\s@<>()"']+/g, '[email]').slice(0, 300)
        : null

      try {
        await repo.insertLog({
          template_id: template.id,
          user_id: userId,
          recipient_email: to,
          subject,
          body_html: bodyHtml,
          provider: 'resend',
          provider_message_id: typeof providerJson.id === 'string' ? providerJson.id : null,
          status: sent ? 'sent' : 'failed',
          error_message: sent
            ? null
            : JSON.stringify({ code, status: providerStatus || null, message: providerMessage }),
          variables_used: mergedVars,
          sent_at: sent ? new Date(deps.now()).toISOString() : null,
        })
      } catch (logErr) {
        log('error', 'email_log_insert_failed', { trigger_key: triggerKey, code: errorCode(logErr) })
      }

      if (!sent) {
        log('error', 'email_send', {
          trigger_key: triggerKey,
          status: 'failed',
          code,
          provider_status: providerStatus || null,
          provider_message: providerMessage,
        })
        return jsonResponse(502, { error: 'email_send_failed', code })
      }

      log('info', 'email_send', { trigger_key: triggerKey, status: 'sent' })
      return jsonResponse(200, {
        success: true,
        message_id: typeof providerJson.id === 'string' ? providerJson.id : null,
      })
    } catch (err) {
      log('error', 'email_send', { trigger_key: triggerKey, status: 'failed', code: errorCode(err) })
      return jsonResponse(500, { error: 'internal_error' })
    }
  }
}
