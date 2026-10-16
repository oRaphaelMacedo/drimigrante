// _shared/cors.ts — CORS com allowlist para as Edge Functions (DI-082).
//
// Antes: 'Access-Control-Allow-Origin: *' em todas as functions. Agora o index.ts de
// cada function decide o CORS aqui, por requisição:
//
//   · withCors(handler)    — functions chamadas pelo navegador (compute-eligibility,
//     generate-explanation, chat-completion, create-checkout-session, claim-session).
//     Só devolve Access-Control-Allow-Origin para origens permitidas, sempre com
//     Vary: Origin. Preflight de origem não permitida → 403 sem cabeçalhos CORS;
//     requisição com Origin não permitida → 403 antes de chegar ao handler.
//     Chamadas sem Origin (servidor, curl) passam, sem cabeçalhos CORS.
//   · withoutCors(handler) — functions que o navegador nunca chama (stripe-webhook,
//     send-email, e2e-login): remove qualquer Access-Control-* e recusa OPTIONS.
//
// Os cabeçalhos CORS que um handler ainda devolva são sempre substituídos aqui.
//
// Origens permitidas:
//   1. produção: https://www.drimigrante.com e https://drimigrante.com (fixas, para o
//      funil não depender de um secret);
//   2. a origem exata de APP_URL, os previews deste projeto na Vercel e
//      http://localhost / http://127.0.0.1 com porta (mesmas regras de _shared/origin.ts);
//   3. CORS_ALLOWED_ORIGINS (opcional): lista separada por vírgula de origens exatas,
//      ex.: "https://staging.drimigrante.com". Valor que não seja origem pura é ignorado.

import { isAllowedOrigin, toOrigin } from './origin.ts'

export type Handler = (req: Request) => Response | Promise<Response>
type EnvGetter = (key: string) => string | undefined

export const PRODUCTION_ORIGINS: readonly string[] = ['https://www.drimigrante.com', 'https://drimigrante.com']

/** Mesmos cabeçalhos que o supabase-js envia hoje em functions.invoke e no chat. */
export const CORS_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'
export const CORS_ALLOW_METHODS = 'POST, OPTIONS'
export const CORS_MAX_AGE_SECONDS = '7200'

const denoEnv: EnvGetter = (key) =>
  (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(key)

/** Lê CORS_ALLOWED_ORIGINS; só aceita origens puras (scheme://host[:porta]). */
export function parseExtraOrigins(raw: string | undefined): Set<string> {
  const out = new Set<string>()
  for (const part of (raw ?? '').split(',')) {
    const value = part.trim()
    if (value && toOrigin(value) === value) out.add(value)
  }
  return out
}

export interface CorsPolicy {
  isAllowed(origin: string | null | undefined): boolean
}

export function createCorsPolicy(getEnv: EnvGetter = denoEnv): CorsPolicy {
  const appUrl = getEnv('APP_URL')?.trim()
  const extra = parseExtraOrigins(getEnv('CORS_ALLOWED_ORIGINS'))
  return {
    isAllowed(origin) {
      if (!origin) return false
      return PRODUCTION_ORIGINS.includes(origin) || extra.has(origin) || isAllowedOrigin(origin, appUrl)
    },
  }
}

/** Cabeçalhos CORS para uma origem: ACAO só se permitida; Vary: Origin sempre. */
export function corsHeadersFor(origin: string | null, allowed: boolean): Record<string, string> {
  if (!allowed || !origin) return { Vary: 'Origin' }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
    'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
    'Access-Control-Max-Age': CORS_MAX_AGE_SECONDS,
    Vary: 'Origin',
  }
}

function withoutCorsHeaders(source: Headers): Headers {
  const headers = new Headers(source)
  for (const name of [...headers.keys()]) {
    if (name.toLowerCase().startsWith('access-control-')) headers.delete(name)
  }
  return headers
}

function addVaryOrigin(headers: Headers): void {
  const current = headers.get('Vary')
  if (!current) headers.set('Vary', 'Origin')
  else if (!current.split(',').some((v) => v.trim().toLowerCase() === 'origin')) headers.set('Vary', `${current}, Origin`)
}

/** Troca os cabeçalhos CORS da resposta pelos da política (corpo/stream intactos). */
export function applyCors(res: Response, origin: string | null, allowed: boolean): Response {
  const headers = withoutCorsHeaders(res.headers)
  for (const [name, value] of Object.entries(corsHeadersFor(origin, allowed))) {
    if (name === 'Vary') addVaryOrigin(headers)
    else headers.set(name, value)
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export interface WithCorsOptions {
  policy?: CorsPolicy
  getEnv?: EnvGetter
  /**
   * Chamado quando uma origem é recusada (ex.: log 'cors_rejected'). A origem chega
   * cortada em 200 caracteres: o valor vem do cliente e não pode inflar os logs.
   */
  onRejected?: (origin: string | null, method: string) => void
}

const MAX_LOGGED_ORIGIN = 200
const forLog = (origin: string | null) => (origin === null ? null : origin.slice(0, MAX_LOGGED_ORIGIN))

function forbiddenOrigin(): Response {
  return new Response(JSON.stringify({ error: 'origin_not_allowed' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json', Vary: 'Origin' },
  })
}

/** Para functions chamadas pelo navegador. */
export function withCors(handler: Handler, opts: WithCorsOptions = {}): (req: Request) => Promise<Response> {
  const policy = opts.policy ?? createCorsPolicy(opts.getEnv)
  return async (req) => {
    const origin = req.headers.get('Origin')
    const allowed = policy.isAllowed(origin)

    if (req.method === 'OPTIONS') {
      if (!allowed) {
        opts.onRejected?.(forLog(origin), req.method)
        return new Response(null, { status: 403, headers: { Vary: 'Origin' } })
      }
      return new Response(null, { status: 204, headers: corsHeadersFor(origin, true) })
    }

    if (origin && !allowed) {
      opts.onRejected?.(forLog(origin), req.method)
      return forbiddenOrigin()
    }

    return applyCors(await handler(req), origin, allowed)
  }
}

/** Para functions que o navegador nunca chama (webhook do Stripe, chamadas internas). */
export function withoutCors(handler: Handler): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      })
    }
    const res = await handler(req)
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: withoutCorsHeaders(res.headers) })
  }
}
