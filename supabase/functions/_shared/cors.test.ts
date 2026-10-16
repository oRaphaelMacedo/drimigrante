// Testes de _shared/cors.ts (DI-082). Rodam no Vitest (`npm test`) e no Deno
// (`deno test supabase/functions`), via _shared/testing/dual-runner.ts.

import { assert, assertEquals } from './test-asserts.ts'
import { test } from './testing/dual-runner.ts'
import { applyCors, createCorsPolicy, parseExtraOrigins, PRODUCTION_ORIGINS, withCors, withoutCors } from './cors.ts'

const env = (values: Record<string, string>) => (key: string) => values[key]
const PREVIEW = 'https://dr-imigrante-git-feat-x-oraphaelmacedo-3991s-projects.vercel.app'

function request(method: string, origin?: string, body?: string): Request {
  const headers: Record<string, string> = {}
  if (origin) headers.Origin = origin
  if (method === 'OPTIONS') {
    headers['Access-Control-Request-Method'] = 'POST'
    headers['Access-Control-Request-Headers'] = 'authorization, content-type'
  }
  return new Request('http://localhost/functions/v1/x', { method, headers, body })
}

/** Handler que imita os handlers antigos: devolve '*' e conta as chamadas. */
function legacyHandler() {
  const calls: string[] = []
  const handler = (req: Request) => {
    calls.push(req.method)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    })
  }
  return { calls, handler }
}

test('OPTIONS com Origin de terceiro → 403 sem Access-Control-Allow-Origin', async () => {
  const { calls, handler } = legacyHandler()
  const rejected: Array<string | null> = []
  const wrapped = withCors(handler, {
    getEnv: env({ APP_URL: 'https://www.drimigrante.com' }),
    onRejected: (origin) => rejected.push(origin),
  })
  for (const origin of ['https://evil.com', 'http://localhost.evil.com', `${PREVIEW}.evil.com`, 'null']) {
    const res = await wrapped(request('OPTIONS', origin))
    assertEquals(res.status, 403, origin)
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), null, origin)
    assertEquals(res.headers.get('Access-Control-Allow-Headers'), null, origin)
    assertEquals(res.headers.get('Vary'), 'Origin', origin)
  }
  assertEquals(calls.length, 0)
  assertEquals(rejected.length, 4)
})

test('origem recusada chega ao onRejected cortada em 200 caracteres', async () => {
  const rejected: Array<string | null> = []
  const wrapped = withCors(legacyHandler().handler, { getEnv: env({}), onRejected: (origin) => rejected.push(origin) })
  const longOrigin = `https://${'a'.repeat(300)}.evil.com`
  assertEquals((await wrapped(request('POST', longOrigin, '{}'))).status, 403)
  assertEquals(rejected[0]?.length, 200)
})

test('OPTIONS das origens permitidas → 204 com a origem exata e Vary: Origin', async () => {
  const wrapped = withCors(legacyHandler().handler, { getEnv: env({}) })
  for (const origin of [...PRODUCTION_ORIGINS, PREVIEW, 'http://localhost:33401', 'http://127.0.0.1:5173']) {
    const res = await wrapped(request('OPTIONS', origin))
    assertEquals(res.status, 204, origin)
    assertEquals(res.headers.get('Access-Control-Allow-Origin'), origin)
    assertEquals(res.headers.get('Access-Control-Allow-Headers'), 'authorization, x-client-info, apikey, content-type')
    assertEquals(res.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
    assertEquals(res.headers.get('Vary'), 'Origin')
  }
})

test('POST de origem permitida troca o "*" do handler pela origem exata', async () => {
  const wrapped = withCors(legacyHandler().handler, { getEnv: env({}) })
  const res = await wrapped(request('POST', 'https://www.drimigrante.com', '{}'))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://www.drimigrante.com')
  assertEquals(res.headers.get('Content-Type'), 'application/json')
  assertEquals(await res.json(), { ok: true })
})

test('POST com Origin de terceiro → 403 sem chegar ao handler', async () => {
  const { calls, handler } = legacyHandler()
  const res = await withCors(handler, { getEnv: env({}) })(request('POST', 'https://evil.com', '{}'))
  assertEquals(res.status, 403)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), null)
  assertEquals(await res.json(), { error: 'origin_not_allowed' })
  assertEquals(calls.length, 0)
})

test('POST sem Origin (servidor, curl) chega ao handler e sai sem cabeçalhos CORS', async () => {
  const { calls, handler } = legacyHandler()
  const res = await withCors(handler, { getEnv: env({}) })(request('POST', undefined, '{}'))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), null)
  assertEquals(calls, ['POST'])
})

test('APP_URL e CORS_ALLOWED_ORIGINS ampliam a allowlist só com origens exatas', () => {
  const policy = createCorsPolicy(
    env({
      APP_URL: 'https://app.exemplo.pt',
      CORS_ALLOWED_ORIGINS: 'https://staging.drimigrante.com, https://x.com/caminho ,nada, ',
    }),
  )
  assert(policy.isAllowed('https://app.exemplo.pt'))
  assert(policy.isAllowed('https://staging.drimigrante.com'))
  assert(!policy.isAllowed('https://x.com'))
  assert(!policy.isAllowed('https://www.drimigrante.com.evil.com'))
  assert(!policy.isAllowed('HTTPS://WWW.DRIMIGRANTE.COM'))
  assert(!policy.isAllowed(null))
  assertEquals([...parseExtraOrigins(' https://a.pt ,https://b.pt/ ')], ['https://a.pt'])
})

test('applyCors mantém o stream do corpo e acrescenta Origin a um Vary existente', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: oi\n\n'))
      controller.close()
    },
  })
  const res = applyCors(
    new Response(stream, { headers: { 'Content-Type': 'text/event-stream', Vary: 'Accept-Encoding' } }),
    'https://www.drimigrante.com',
    true,
  )
  assertEquals(res.headers.get('Vary'), 'Accept-Encoding, Origin')
  assertEquals(res.headers.get('Content-Type'), 'text/event-stream')
  assertEquals(await res.text(), 'data: oi\n\n')
})

test('withoutCors: webhook recusa OPTIONS e nunca devolve cabeçalhos CORS', async () => {
  const { calls, handler } = legacyHandler()
  const wrapped = withoutCors(handler)
  const preflight = await wrapped(request('OPTIONS', 'https://www.drimigrante.com'))
  assertEquals(preflight.status, 405)
  assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), null)
  const res = await wrapped(request('POST', undefined, '{}'))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), null)
  assertEquals(calls, ['POST'])
})
