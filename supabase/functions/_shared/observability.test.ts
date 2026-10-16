// Testes de _shared/observability.ts (DI-082). Rodam no Vitest (`npm test`) e no Deno
// (`deno test supabase/functions`), via _shared/testing/dual-runner.ts. Nenhuma rede:
// o fetch do Sentry é falso.

import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from './test-asserts.ts'
import { test } from './testing/dual-runner.ts'
import type { Logger } from './http.ts'
import {
  ALERT_INTERVAL_MS,
  createErrorReporter,
  createObservability,
  createObservedLogger,
  outcomeFor,
  parseSentryDsn,
  scrubContext,
  withObservability,
} from './observability.ts'

const DSN = 'https://abc123@o450.ingest.de.sentry.io/4500000000000001'

function fakeFetch(status = 200) {
  const sent: Array<{ url: string; init: RequestInit }> = []
  const fn = (url: string, init: RequestInit) => {
    sent.push({ url, init })
    return Promise.resolve(new Response('{}', { status }))
  }
  return { sent, fn }
}

/** Corpo do envelope → [cabeçalho, item, evento]. */
function parseEnvelope(body: unknown): Array<Record<string, unknown>> {
  return String(body).split('\n').map((line) => JSON.parse(line))
}

function collector() {
  const tasks: Promise<unknown>[] = []
  return { tasks, schedule: (t: Promise<unknown>) => void tasks.push(t), flush: () => Promise.all(tasks) }
}

function memoryLogger() {
  const lines: Array<{ level: string; event: string; data: Record<string, unknown> }> = []
  const log: Logger = (level, event, data = {}) => void lines.push({ level, event, data })
  return { lines, log }
}

test('parseSentryDsn monta o endpoint de envelopes; DSN inválido desliga o envio', () => {
  assertEquals(parseSentryDsn(DSN), {
    envelopeUrl: 'https://o450.ingest.de.sentry.io/api/4500000000000001/envelope/',
    publicKey: 'abc123',
  })
  assertEquals(parseSentryDsn('https://k@sentry.exemplo.pt/sub/7')?.envelopeUrl, 'https://sentry.exemplo.pt/sub/api/7/envelope/')
  assertEquals(parseSentryDsn(''), null)
  assertEquals(parseSentryDsn('https://sem-chave.sentry.io/1'), null)
  assertEquals(parseSentryDsn('nao e url'), null)
})

test('outcomeFor classifica o status', () => {
  assertEquals([outcomeFor(200), outcomeFor(302), outcomeFor(404), outcomeFor(500)], ['ok', 'ok', 'client_error', 'server_error'])
})

test('scrubContext filtra chaves sensíveis e e-mails no texto', () => {
  assertEquals(
    scrubContext({
      email: 'a@b.pt',
      full_name: 'Fulano',
      access_token: 'x',
      trigger_key: 'welcome_free',
      code: 'PGRST201',
      detail: 'duplicate key (email)=(maria@exemplo.com)',
      nested: { phone: '+351', status: 500 },
    }),
    {
      email: '[filtrado]',
      full_name: '[filtrado]',
      access_token: '[filtrado]',
      trigger_key: 'welcome_free',
      code: 'PGRST201',
      detail: 'duplicate key (email)=([email])',
      nested: { phone: '[filtrado]', status: 500 },
    },
  )
})

test('sem SENTRY_DSN_BACKEND nada é enviado', async () => {
  const { sent, fn } = fakeFetch()
  const reporter = createErrorReporter({ fn: 'x', dsn: undefined, fetch: fn })
  assertEquals(reporter.enabled, false)
  await reporter.captureException(new Error('boom'))
  await reporter.captureMessage('x: falhou')
  assertEquals(sent.length, 0)
})

test('captureException manda um envelope sem PII para o Sentry', async () => {
  const { sent, fn } = fakeFetch()
  const reporter = createErrorReporter({ fn: 'stripe-webhook', dsn: DSN, environment: 'production', fetch: fn })
  await reporter.captureException(new Error('falhou para maria@exemplo.com'), { method: 'POST', email: 'x@y.pt' })
  assertEquals(sent.length, 1)
  assertEquals(sent[0].url, 'https://o450.ingest.de.sentry.io/api/4500000000000001/envelope/')
  const headers = sent[0].init.headers as Record<string, string>
  assertStringIncludes(headers['X-Sentry-Auth'], 'sentry_key=abc123')
  const [header, item, event] = parseEnvelope(sent[0].init.body)
  assertEquals(item.type, 'event')
  assertEquals(header.event_id, event.event_id)
  assertEquals(event.environment, 'production')
  assertEquals((event.tags as Record<string, string>).fn, 'stripe-webhook')
  const body = String(sent[0].init.body)
  assertNotIncludes(body, 'maria@exemplo.com')
  assertNotIncludes(body, 'x@y.pt')
})

test('falha de rede no envio não lança e avisa uma vez só', async () => {
  const warnings: string[] = []
  const reporter = createErrorReporter({
    fn: 'x',
    dsn: DSN,
    fetch: () => Promise.reject(new TypeError('network down')),
    warn: (line) => warnings.push(line),
  })
  await reporter.captureMessage('x: a')
  await reporter.captureMessage('x: b')
  assertEquals(warnings.length, 1)
  assertStringIncludes(warnings[0], 'sentry_send_failed')
})

test('withObservability: linha JSON com fn/outcome e 5xx vai para o Sentry', async () => {
  const { sent, fn } = fakeFetch()
  const { lines, log } = memoryLogger()
  const { schedule, flush } = collector()
  const reporter = createErrorReporter({ fn: 'stripe-webhook', dsn: DSN, fetch: fn })
  let clock = 1000
  const wrapped = withObservability(
    'stripe-webhook',
    () => {
      clock += 25
      return new Response('{"error":"x"}', { status: 500 })
    },
    { reporter, requestLog: log, schedule, now: () => clock },
  )
  const res = await wrapped(new Request('http://localhost/', { method: 'POST' }))
  await flush()
  assertEquals(res.status, 500)
  assertEquals(lines, [
    { level: 'error', event: 'request', data: { outcome: 'server_error', status: 500, method: 'POST', duration_ms: 25 } },
  ])
  assertEquals(sent.length, 1)
  const [, , event] = parseEnvelope(sent[0].init.body)
  assertEquals((event.message as { formatted: string }).formatted, 'stripe-webhook: HTTP 500')
})

test('withObservability: exceção vira 500 genérico + captureException; 2xx só loga', async () => {
  const { sent, fn } = fakeFetch()
  const { lines, log } = memoryLogger()
  const { schedule, flush } = collector()
  const reporter = createErrorReporter({ fn: 'claim-session', dsn: DSN, fetch: fn })
  const boom = withObservability('claim-session', () => {
    throw new Error('stripe fora do ar')
  }, { reporter, requestLog: log, schedule })
  const res = await boom(new Request('http://localhost/', { method: 'POST' }))
  assertEquals(res.status, 500)
  assertEquals(await res.json(), { error: 'internal_error' })

  const ok = withObservability('claim-session', () => new Response('ok'), { reporter, requestLog: log, schedule })
  assertEquals((await ok(new Request('http://localhost/', { method: 'POST' }))).status, 200)
  await flush()

  assertEquals(lines.map((l) => [l.level, l.data.outcome]), [['error', 'exception'], ['info', 'ok']])
  assertEquals(sent.length, 1)
  const [, , event] = parseEnvelope(sent[0].init.body)
  assert(event.exception, 'evento de exceção')
})

test('reportServerErrors: false não duplica o 5xx já reportado pelo logger observado', async () => {
  const { sent, fn } = fakeFetch()
  const { schedule, flush } = collector()
  const reporter = createErrorReporter({ fn: 'compute-eligibility', dsn: DSN, fetch: fn })
  const { log: base } = memoryLogger()
  const log = createObservedLogger('compute-eligibility', reporter, { base, schedule })
  const wrapped = withObservability(
    'compute-eligibility',
    () => {
      log('error', 'eligibility_failed', { code: 'PGRST201' })
      log('warn', 'quiz_conditions_repaired', { keys: ['a1'] })
      return new Response('{}', { status: 500 })
    },
    { reporter, requestLog: memoryLogger().log, schedule },
    { reportServerErrors: false },
  )
  await wrapped(new Request('http://localhost/', { method: 'POST' }))
  await flush()
  assertEquals(sent.length, 1)
  const [, , event] = parseEnvelope(sent[0].init.body)
  assertEquals((event.message as { formatted: string }).formatted, 'compute-eligibility: eligibility_failed')
  assertEquals((event.tags as Record<string, string>).code, 'PGRST201')
})

test('alertOn: 400 de assinatura inválida vira erro no Sentry, no máximo 1 por minuto', async () => {
  const { sent, fn } = fakeFetch()
  const { lines, log } = memoryLogger()
  const { schedule, flush } = collector()
  const reporter = createErrorReporter({ fn: 'stripe-webhook', dsn: DSN, fetch: fn })
  let clock = 0
  const wrapped = withObservability(
    'stripe-webhook',
    (req) =>
      new Response('{}', { status: req.headers.has('x-ok') ? 200 : 400 }),
    { reporter, requestLog: log, schedule, now: () => clock },
    {
      alertOn: (req, res) =>
        res.status === 400 && req.headers.has('stripe-signature') ? 'webhook_signature_invalid' : null,
    },
  )
  const signed = (extra: Record<string, string> = {}) =>
    new Request('http://localhost/', { method: 'POST', headers: { 'stripe-signature': 't=1,v1=x', ...extra } })

  await wrapped(signed()) // alerta + Sentry
  clock += 10_000
  await wrapped(signed()) // alerta só no log (dentro do intervalo)
  await wrapped(new Request('http://localhost/', { method: 'POST' })) // sem assinatura: bot, sem alerta
  await wrapped(signed({ 'x-ok': '1' })) // 200: sem alerta
  clock += ALERT_INTERVAL_MS
  await wrapped(signed()) // passou o intervalo: Sentry de novo
  await flush()

  assertEquals(lines.filter((l) => l.event === 'webhook_signature_invalid').map((l) => l.level), ['error', 'error', 'error'])
  assertEquals(sent.length, 2)
  const [, , event] = parseEnvelope(sent[0].init.body)
  assertEquals((event.message as { formatted: string }).formatted, 'stripe-webhook: webhook_signature_invalid')
  assertEquals((event.tags as Record<string, string>).event, 'webhook_signature_invalid')
})

test('createObservability: ambiente padrão pelo SUPABASE_URL e preflight sem log', async () => {
  const { sent, fn } = fakeFetch()
  const { schedule, flush } = collector()
  const obs = createObservability('chat-completion', {
    getEnv: (key) =>
      ({ SENTRY_DSN_BACKEND: DSN, SUPABASE_URL: 'https://krjirhlmdnxqqrpzmowz.supabase.co' } as Record<string, string>)[key],
    fetch: fn,
    schedule,
  })
  const original = console.log
  const printed: string[] = []
  console.log = (line: string) => void printed.push(line)
  try {
    await obs.wrap(() => new Response(null, { status: 204 }))(new Request('http://localhost/', { method: 'OPTIONS' }))
  } finally {
    console.log = original
  }
  assertEquals(printed.length, 0)
  const originalError = console.error
  console.error = (line: string) => void printed.push(line)
  try {
    obs.log('error', 'openai_failed', { status: 401 })
  } finally {
    console.error = originalError
  }
  assertEquals(JSON.parse(printed[0]).event, 'openai_failed')
  await flush()
  const [, , event] = parseEnvelope(sent[0].init.body)
  assertEquals(event.environment, 'production')
})
