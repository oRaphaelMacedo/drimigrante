// _shared/observability.ts — logs JSON por requisição e erros no Sentry (DI-082).
//
// · Toda requisição (menos preflight) gera uma linha JSON:
//     {"fn":"stripe-webhook","event":"request","level":"error","outcome":"server_error",
//      "status":500,"method":"POST","duration_ms":812,"ts":"…"}
//   outcome: ok (2xx/3xx) · client_error (4xx) · server_error (5xx) · exception (lançou).
// · Com o secret SENTRY_DSN_BACKEND definido, também vão para o Sentry: exceções não
//   tratadas, respostas 5xx, logs de nível 'error' do logger estruturado e os alertas
//   de `alertOn` (ex.: assinatura do webhook inválida). Sem o DSN, nada sai da
//   function (só os logs do Supabase).
// · O envio usa a API de envelopes do Sentry via fetch (sem SDK: nada a mais no cold
//   start) e nunca lança nem atrasa a resposta: roda em EdgeRuntime.waitUntil quando
//   disponível e desiste em 2,5 s.
// · Privacidade: só vão nome da function, evento, status, método, códigos de erro e
//   os campos que o handler já loga (que, por contrato, não têm PII). Mesmo assim,
//   chaves sensíveis viram '[filtrado]' e e-mails no texto viram '[email]'.
//
// Env: SENTRY_DSN_BACKEND (opcional), SENTRY_ENVIRONMENT (opcional; padrão: production
// no projeto de produção, development fora dele), SENTRY_RELEASE (opcional).
// Módulo sem imports remotos: roda no Deno e no Vitest.

import { createLogger, errorCode, type Logger } from './http.ts'

export type Outcome = 'ok' | 'client_error' | 'server_error' | 'exception'
export type Handler = (req: Request) => Response | Promise<Response>
type EnvGetter = (key: string) => string | undefined
type FetchLike = (input: string, init: RequestInit) => Promise<Response>
type Schedule = (task: Promise<unknown>) => void

/** Ref do projeto Supabase de produção (para o ambiente padrão do Sentry). */
const PRODUCTION_PROJECT_REF = 'krjirhlmdnxqqrpzmowz'
const SEND_TIMEOUT_MS = 2500
const MAX_STRING = 500
/** Chaves (ou trechos snake_case delas) cujo valor nunca sai da function. */
const SENSITIVE_KEY =
  /(^|[_-])(e-?mail|name|nome|phone|telefone|token|secret|password|senha|authorization|cookie|api_?key|apikey|message|content|body|answers?)($|[_-])/i
const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

const denoEnv: EnvGetter = (key) =>
  (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(key)

export function outcomeFor(status: number): Exclude<Outcome, 'exception'> {
  if (status >= 500) return 'server_error'
  if (status >= 400) return 'client_error'
  return 'ok'
}

// ─── Sentry (API de envelopes) ───────────────────────────────────────────────

export interface SentryTarget {
  envelopeUrl: string
  publicKey: string
}

/** DSN https://<chave>@<host>[/<caminho>]/<projeto> → endpoint de envelopes. */
export function parseSentryDsn(dsn: string | null | undefined): SentryTarget | null {
  if (!dsn?.trim()) return null
  try {
    const url = new URL(dsn.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const segments = url.pathname.split('/').filter(Boolean)
    const projectId = segments.pop()
    if (!url.username || !projectId || !/^\d+$/.test(projectId)) return null
    const prefix = segments.length ? `/${segments.join('/')}` : ''
    return { envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`, publicKey: url.username }
  } catch {
    return null
  }
}

function scrubString(value: string): string {
  const clean = value.replace(EMAIL_IN_TEXT, '[email]')
  return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}…` : clean
}

function scrubValue(key: string, value: unknown, depth: number): unknown {
  if (SENSITIVE_KEY.test(key)) return '[filtrado]'
  if (typeof value === 'string') return scrubString(value)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return depth > 0 ? value.slice(0, 20).map((v) => scrubValue('', v, depth - 1)) : '[lista]'
  if (typeof value === 'object' && value) return depth > 0 ? scrubContext(value as Record<string, unknown>, depth - 1) : '[objeto]'
  return undefined
}

/** Remove chaves sensíveis, e-mails no texto e strings longas antes de enviar. */
export function scrubContext(data: Record<string, unknown>, depth = 2): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const clean = scrubValue(key, value, depth)
    if (clean !== undefined) out[key] = clean
  }
  return out
}

export interface ErrorReporter {
  readonly enabled: boolean
  captureException(err: unknown, context?: Record<string, unknown>): Promise<void>
  captureMessage(message: string, context?: Record<string, unknown>): Promise<void>
}

export interface ReporterOptions {
  fn: string
  dsn?: string | null
  environment?: string
  release?: string
  fetch?: FetchLike
  /** Para avisar (uma vez) que o envio falhou. Padrão: console.warn. */
  warn?: (line: string) => void
}

const TAG_KEYS = ['event', 'code', 'status', 'method', 'outcome', 'trigger_key', 'use_case']

function newEventId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

function runtimeVersion(): string | undefined {
  return (globalThis as { Deno?: { version?: { deno?: string } } }).Deno?.version?.deno
}

export function createErrorReporter(opts: ReporterOptions): ErrorReporter {
  const target = parseSentryDsn(opts.dsn)
  const doFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init))
  const warn = opts.warn ?? ((line: string) => console.warn(line))
  let warned = false

  async function send(event: Record<string, unknown>): Promise<void> {
    if (!target) return
    const eventId = newEventId()
    const payload = JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      logger: opts.fn,
      server_name: 'supabase-edge-functions',
      environment: opts.environment ?? 'production',
      ...(opts.release ? { release: opts.release } : {}),
      contexts: { runtime: { name: 'deno', version: runtimeVersion() } },
      ...event,
    })
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event', content_type: 'application/json' }),
      payload,
    ].join('\n')

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
    try {
      const res = await doFetch(target.envelopeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=drimigrante-edge/1.0, sentry_key=${target.publicKey}`,
        },
        body,
        signal: controller.signal,
      })
      await res.body?.cancel()
      if (!res.ok && !warned) {
        warned = true
        warn(JSON.stringify({ fn: opts.fn, event: 'sentry_send_failed', level: 'warn', status: res.status }))
      }
    } catch (err) {
      if (!warned) {
        warned = true
        warn(JSON.stringify({ fn: opts.fn, event: 'sentry_send_failed', level: 'warn', code: errorCode(err) }))
      }
    } finally {
      clearTimeout(timer)
    }
  }

  function tagsFrom(context: Record<string, unknown>): Record<string, string> {
    const tags: Record<string, string> = { fn: opts.fn }
    for (const key of TAG_KEYS) {
      const value = context[key]
      if (typeof value === 'string' || typeof value === 'number') tags[key] = String(value).slice(0, 200)
    }
    return tags
  }

  return {
    enabled: !!target,
    async captureException(err, context = {}) {
      if (!target) return
      const clean = scrubContext(context)
      const e = err instanceof Error ? err : null
      await send({
        level: 'error',
        tags: tagsFrom({ ...clean, code: errorCode(err) }),
        extra: { ...clean, ...(e?.stack ? { stack: scrubString(e.stack).slice(0, 2000) } : {}) },
        exception: {
          values: [{ type: e?.name ?? 'Error', value: scrubString(e?.message ?? String(err)) }],
        },
      })
    },
    async captureMessage(message, context = {}) {
      if (!target) return
      const clean = scrubContext(context)
      await send({ level: 'error', tags: tagsFrom(clean), extra: clean, message: { formatted: scrubString(message) } })
    },
  }
}

// ─── Integração com as functions ─────────────────────────────────────────────

/** Mantém a tarefa viva depois da resposta (EdgeRuntime.waitUntil), se existir. */
export const defaultSchedule: Schedule = (task) => {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?(p: Promise<unknown>): void } }).EdgeRuntime
  if (typeof runtime?.waitUntil === 'function') runtime.waitUntil(task)
}

/**
 * Logger estruturado (mesmo formato do createLogger) que também manda os eventos de
 * nível 'error' para o Sentry, com o nome do evento e os campos já logados.
 */
export function createObservedLogger(
  fn: string,
  reporter: ErrorReporter,
  { base = createLogger(fn), schedule = defaultSchedule }: { base?: Logger; schedule?: Schedule } = {},
): Logger {
  return (level, event, data = {}) => {
    base(level, event, data)
    if (level === 'error' && reporter.enabled) {
      schedule(reporter.captureMessage(`${fn}: ${event}`, { event, ...data }))
    }
  }
}

export interface WrapOptions {
  /**
   * Manda as respostas 5xx para o Sentry. Desligue quando o handler já reporta os
   * próprios erros pelo logger observado (evita evento duplicado).
   */
  reportServerErrors?: boolean
  /**
   * Respostas fora do 5xx que também são incidente (ex.: 400 por assinatura inválida
   * no webhook = STRIPE_WEBHOOK_SECRET errado). Devolve o nome do evento ou null.
   * Gera log 'error' e, no Sentry, no máximo 1 evento por minuto por nome e instância.
   */
  alertOn?: (req: Request, res: Response) => string | null
}

/** Intervalo mínimo entre dois envios do mesmo alerta (alertOn) ao Sentry. */
export const ALERT_INTERVAL_MS = 60_000

export interface ObservabilityDeps {
  reporter: ErrorReporter
  /** Logger das linhas de requisição (não observado, para não duplicar no Sentry). */
  requestLog?: Logger
  schedule?: Schedule
  now?: () => number
}

const INTERNAL_ERROR_BODY = JSON.stringify({ error: 'internal_error' })

/** Envolve o handler: linha JSON por requisição, exceção → 500 + Sentry, 5xx → Sentry. */
export function withObservability(
  fn: string,
  handler: Handler,
  deps: ObservabilityDeps,
  { reportServerErrors = true, alertOn }: WrapOptions = {},
): (req: Request) => Promise<Response> {
  const log = deps.requestLog ?? createLogger(fn)
  const schedule = deps.schedule ?? defaultSchedule
  const now = deps.now ?? (() => Date.now())
  const lastAlertAt = new Map<string, number>()

  return async (req) => {
    const started = now()
    const method = req.method
    let res: Response
    try {
      res = await handler(req)
    } catch (err) {
      log('error', 'request', { outcome: 'exception', status: 500, method, duration_ms: now() - started, code: errorCode(err) })
      if (deps.reporter.enabled) schedule(deps.reporter.captureException(err, { method, outcome: 'exception' }))
      return new Response(INTERNAL_ERROR_BODY, { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    const outcome = outcomeFor(res.status)
    if (!(method === 'OPTIONS' && outcome === 'ok')) {
      const level = outcome === 'server_error' ? 'error' : outcome === 'client_error' ? 'warn' : 'info'
      log(level, 'request', { outcome, status: res.status, method, duration_ms: now() - started })
    }
    if (outcome === 'server_error' && reportServerErrors && deps.reporter.enabled) {
      schedule(deps.reporter.captureMessage(`${fn}: HTTP ${res.status}`, { status: res.status, method, outcome }))
    }

    const alert = alertOn?.(req, res)
    if (alert) {
      log('error', alert, { status: res.status, method })
      const at = now()
      const last = lastAlertAt.get(alert)
      if (deps.reporter.enabled && (last === undefined || at - last >= ALERT_INTERVAL_MS)) {
        lastAlertAt.set(alert, at)
        schedule(deps.reporter.captureMessage(`${fn}: ${alert}`, { event: alert, status: res.status, method }))
      }
    }
    return res
  }
}

export interface Observability {
  /** Logger para injetar no handler: 'error' também vai para o Sentry. */
  log: Logger
  reporter: ErrorReporter
  wrap(handler: Handler, opts?: WrapOptions): (req: Request) => Promise<Response>
}

/** Monta logger, reporter e wrapper de uma function a partir do ambiente. */
export function createObservability(
  fn: string,
  { getEnv = denoEnv, fetch: fetchImpl, schedule }: { getEnv?: EnvGetter; fetch?: FetchLike; schedule?: Schedule } = {},
): Observability {
  const supabaseUrl = getEnv('SUPABASE_URL') ?? ''
  const reporter = createErrorReporter({
    fn,
    dsn: getEnv('SENTRY_DSN_BACKEND'),
    environment: getEnv('SENTRY_ENVIRONMENT')?.trim() ||
      (supabaseUrl.includes(PRODUCTION_PROJECT_REF) ? 'production' : 'development'),
    release: getEnv('SENTRY_RELEASE')?.trim() || undefined,
    fetch: fetchImpl,
  })
  const base = createLogger(fn)
  return {
    log: createObservedLogger(fn, reporter, { base, schedule }),
    reporter,
    wrap: (handler, opts) => withObservability(fn, handler, { reporter, requestLog: base, schedule }, opts),
  }
}
