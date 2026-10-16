/**
 * Sanitização de URLs e textos antes de qualquer envio a terceiros
 * (PostHog, Google Analytics, Meta Pixel e Sentry).
 *
 * Tokens que chegam pela URL nunca podem sair do navegador:
 *  - fragmento do magic link do Supabase (#access_token=…&refresh_token=…)
 *  - ?token_hash / ?code / ?token do fluxo de autenticação
 *  - ?session_id=cs_… do retorno do Stripe (hoje gera login no claim-session)
 *  - ?r=<token> do link de retomada do resultado
 *
 * O módulo é puro (sem dependências nem acesso a window) para poder ser
 * testado isoladamente e reaproveitado no Sentry, no analytics e no Pixel.
 */

/** Parâmetros de query removidos de qualquer URL enviada a terceiros. */
export const SENSITIVE_QUERY_PARAMS = [
  'r',
  'session_id',
  'code',
  'token',
  'token_hash',
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'email',
  'phone',
] as const

/** Se o fragmento (#...) contiver qualquer uma destas chaves, ele é descartado inteiro. */
const SENSITIVE_FRAGMENT_KEYS = [
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'token_hash',
  'token',
  'code',
  'session_id',
  'error_description',
] as const

const SENSITIVE_PARAM_SET = new Set<string>(SENSITIVE_QUERY_PARAMS)

const PLACEHOLDER_ORIGIN = 'https://sanitize.invalid'

const PARAM_NAMES =
  'access_token|refresh_token|provider_token|provider_refresh_token|token_hash|token|code|session_id|r|email|phone'

// `[?&#]chave=valor` em qualquer texto (mensagens de erro, breadcrumbs, spans…)
const PARAM_IN_TEXT_RE = new RegExp(`([?&#;](?:${PARAM_NAMES})=)[^&#\\s"'<>]*`, 'gi')
// e-mails, inclusive codificados em URL (%40)
const EMAIL_RE = /[A-Za-z0-9._%+-]+(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// JWTs (access tokens do Supabase, tokens de magic link)
const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g
// IDs de Checkout Session do Stripe
const STRIPE_SESSION_RE = /\bcs_(?:test|live)_[A-Za-z0-9]+/g

// Teste barato antes de rodar todas as substituições
const QUICK_CHECK_RE = new RegExp(`[?&#;](?:${PARAM_NAMES})=|@|%40|eyJ|cs_(?:test|live)_`, 'i')

function fragmentIsSensitive(hash: string): boolean {
  if (!hash || hash === '#') return false
  const lower = hash.toLowerCase()
  return SENSITIVE_FRAGMENT_KEYS.some((key) => lower.includes(`${key}=`))
}

/**
 * Remove parâmetros sensíveis da query e descarta o fragmento quando ele traz
 * tokens. Devolve a string ORIGINAL quando não há nada a remover, para que
 * `sanitizeUrl(url) === url` sirva como teste de "URL limpa".
 *
 * Aceita URLs absolutas e relativas (devolve no mesmo formato).
 */
export function sanitizeUrl(input: string): string {
  if (!input) return input
  if (!QUICK_CHECK_RE.test(input) && !input.includes('#')) return input

  let url: URL
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
  try {
    url = new URL(input, PLACEHOLDER_ORIGIN)
  } catch {
    return scrubText(input)
  }

  let changed = false

  const keys = Array.from(url.searchParams.keys())
  for (const key of keys) {
    if (SENSITIVE_PARAM_SET.has(key.toLowerCase())) {
      url.searchParams.delete(key)
      changed = true
    }
  }

  if (fragmentIsSensitive(url.hash)) {
    url.hash = ''
    changed = true
  }

  if (!changed) {
    // Nada estrutural a remover; ainda assim, nenhum e-mail/JWT pode passar.
    return scrubText(input)
  }

  const serialized = isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`
  return scrubText(serialized)
}

/** `true` quando a URL não carrega nenhum dado sensível. */
export function isUrlClean(input: string): boolean {
  return sanitizeUrl(input) === input
}

/**
 * Substitui, em qualquer texto, valores de parâmetros sensíveis, e-mails,
 * JWTs e IDs de sessão do Stripe por marcadores.
 */
export function scrubText(input: string): string {
  if (!input || !QUICK_CHECK_RE.test(input)) return input
  return input
    .replace(PARAM_IN_TEXT_RE, (_match, prefix: string) => `${prefix}[filtrado]`)
    .replace(JWT_RE, '[jwt]')
    .replace(STRIPE_SESSION_RE, '[stripe_session]')
    .replace(EMAIL_RE, '[email]')
}

const URL_KEY_RE = /(url|uri|href|referrer|referer|location|pathname|^from$|^to$)/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Percorre objetos e arrays simples e sanitiza, NO PRÓPRIO OBJETO, todas as
 * strings: chaves com cara de URL passam por `sanitizeUrl`, o resto por
 * `scrubText`. Instâncias de classe (Error, Date…) não são tocadas.
 * Devolve o mesmo valor (ou a string sanitizada).
 */
export function scrubDeep<T>(value: T, depth = 0, seen: WeakSet<object> = new WeakSet()): T {
  if (typeof value === 'string') return scrubText(value) as unknown as T
  if (depth > 100 || value === null || typeof value !== 'object') return value
  if (seen.has(value as object)) return value
  seen.add(value as object)

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      value[i] = typeof item === 'string' ? scrubText(item) : scrubDeep(item, depth + 1, seen)
    }
    return value
  }

  if (!isPlainObject(value)) return value

  const record: Record<string, unknown> = value
  for (const key of Object.keys(record)) {
    const item = record[key]
    if (typeof item === 'string') {
      record[key] = URL_KEY_RE.test(key) ? sanitizeUrl(item) : scrubText(item)
    } else if (item !== null && typeof item === 'object') {
      record[key] = scrubDeep(item, depth + 1, seen)
    }
  }
  return value
}
