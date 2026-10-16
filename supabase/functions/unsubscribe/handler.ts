// unsubscribe/handler.ts — descadastro dos e-mails do ciclo de vida (DI-077), testável.
//
// Entradas (o token vem em ?t= ou no corpo):
//   GET  ?t=<token>  → página de confirmação com botão (NÃO descadastra: leitores de
//                      link e antivírus de e-mail abrem GETs sozinhos).
//   POST ?t=<token>  → descadastra (idempotente) e mostra a página de sucesso. Aceita:
//                      · formulário da própria página (t=<token>);
//                      · one-click do cliente de e-mail (RFC 8058, corpo
//                        "List-Unsubscribe=One-Click"), resposta curta em texto;
//                      · JSON { token } de uma futura página do front
//                        (Accept/Content-Type application/json → resposta JSON).
//   HEAD → 200 sem corpo e sem efeito.
// Respostas: 200 · 400 token inválido · 405 · 500 falha ao gravar · 503 sem segredo.
// O token só leva o hash do e-mail e o escopo (ver _shared/email-lifecycle.ts); nada de
// e-mail na URL, no banco nem nos logs.

import {
  type UnsubscribeScope,
  verifyUnsubscribeToken,
} from '../_shared/email-lifecycle.ts'
import { errorCode, type Logger } from '../_shared/http.ts'
import { type PageKind, pageHeaders, renderPage } from './page.ts'

export type SuppressionSource = 'unsubscribe_link' | 'one_click'

export interface UnsubscribeRepo {
  /** Grava (email_hash, scope); repetir não muda nada. Lança em erro. */
  addSuppression(emailHash: string, scope: UnsubscribeScope, source: SuppressionSource): Promise<void>
}

export interface UnsubscribeDeps {
  repo: UnsubscribeRepo
  log: Logger
  env: { secret?: string; appUrl: string }
}

const MAX_BODY = 4096

type Format = 'html' | 'json' | 'text'

interface ParsedRequest {
  token: string | null
  oneClick: boolean
  format: Format
}

async function parseRequest(req: Request): Promise<ParsedRequest> {
  const url = new URL(req.url)
  const accept = req.headers.get('Accept') ?? ''
  const contentType = (req.headers.get('Content-Type') ?? '').toLowerCase()
  let token = url.searchParams.get('t')
  let oneClick = false
  let wantsJson = accept.includes('application/json')

  if (req.method === 'POST') {
    const raw = (await req.text()).slice(0, MAX_BODY)
    if (contentType.includes('application/json')) {
      wantsJson = true
      try {
        const body = JSON.parse(raw) as Record<string, unknown> | null
        const fromBody = body && typeof body === 'object' ? body.token ?? body.t : null
        if (typeof fromBody === 'string') token = fromBody
      } catch {
        // corpo inválido: fica com o token da URL (se houver)
      }
    } else {
      const form = new URLSearchParams(raw)
      oneClick = form.get('List-Unsubscribe') === 'One-Click'
      token = form.get('t') ?? token
    }
  }
  return { token, oneClick, format: wantsJson ? 'json' : oneClick ? 'text' : 'html' }
}

const TEXT_BODY: Record<number, string> = {
  200: 'Descadastro feito.',
  400: 'Link de descadastro inválido.',
  500: 'Não foi possível concluir agora. Tente de novo em alguns minutos.',
  503: 'Descadastro indisponível no momento.',
}

async function respond(
  deps: UnsubscribeDeps,
  format: Format,
  status: number,
  page: { kind: PageKind; scope?: UnsubscribeScope; token?: string },
  json: Record<string, unknown>,
): Promise<Response> {
  if (format === 'json') {
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }
  if (format === 'text') {
    return new Response(TEXT_BODY[status] ?? '', {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }
  return new Response(renderPage({ ...page, appUrl: deps.env.appUrl }), { status, headers: await pageHeaders() })
}

export function createUnsubscribeHandler(deps: UnsubscribeDeps) {
  const { repo, log } = deps

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    if (req.method !== 'GET' && req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', Allow: 'GET, POST, HEAD' },
      })
    }

    const { token, oneClick, format } = await parseRequest(req)

    if (!deps.env.secret) {
      log('error', 'config_missing', { key: 'EMAIL_UNSUBSCRIBE_SECRET' })
      return respond(deps, format, 503, { kind: 'unavailable' }, { error: 'unavailable' })
    }

    const verified = await verifyUnsubscribeToken(deps.env.secret, token)
    if (!verified) {
      log('warn', 'unsubscribe_invalid_token', { method: req.method })
      return respond(deps, format, 400, { kind: 'invalid' }, { error: 'invalid_token' })
    }
    const { emailHash, scope } = verified
    const safeToken = (token ?? '').trim()

    if (req.method === 'GET') {
      return respond(deps, format, 200, { kind: 'confirm', scope, token: safeToken }, { ok: true, scope, confirmed: false })
    }

    const source: SuppressionSource = oneClick ? 'one_click' : 'unsubscribe_link'
    try {
      await repo.addSuppression(emailHash, scope, source)
    } catch (err) {
      log('error', 'unsubscribe_failed', { scope, source, code: errorCode(err) })
      return respond(deps, format, 500, { kind: 'error', scope, token: safeToken }, { error: 'internal_error' })
    }
    // Só um prefixo do hash, para suporte (não identifica ninguém sem o segredo).
    log('info', 'unsubscribed', { scope, source, hash_prefix: emailHash.slice(0, 8) })
    return respond(deps, format, 200, { kind: 'done', scope }, { ok: true, scope, confirmed: true })
  }
}
