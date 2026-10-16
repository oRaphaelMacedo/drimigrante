// Testes do handler do e2e-login (DI-003). Sem rede nem Supabase:
//   deno test supabase/functions/e2e-login/handler.test.ts
import {
  createHandler,
  E2E_EMAIL_PATTERN,
  type E2ESession,
  isProductionUrl,
  SECRET_HEADER,
  timingSafeEqual,
} from './handler.ts'

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres'
const VALID_EMAIL = 'e2e+1792108793529-k3j9x1@drimigrante.test'
const LOCAL_URL = 'http://kong:8000'
const PROD_URL = 'https://krjirhlmdnxqqrpzmowz.supabase.co'

const SESSION: E2ESession = {
  access_token: 'access',
  refresh_token: 'refresh',
  user: { id: 'u1', email: VALID_EMAIL },
}

function assertEquals<T>(actual: T, expected: T, msg = ''): void {
  if (actual !== expected) {
    throw new Error(`${msg} esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`)
  }
}

function setup(envOverrides: Record<string, string | undefined> = {}, failWith?: Error) {
  const env: Record<string, string | undefined> = {
    E2E_MODE: 'true',
    SUPABASE_URL: LOCAL_URL,
    E2E_LOGIN_SECRET: SECRET,
    ...envOverrides,
  }
  const calls: string[] = []
  const logs: string[] = []
  const handler = createHandler({
    env: (name) => env[name],
    createSession: (email) => {
      calls.push(email)
      return failWith ? Promise.reject(failWith) : Promise.resolve(SESSION)
    },
    logError: (message) => logs.push(message),
  })
  return { handler, calls, logs }
}

function request(
  body: unknown = { email: VALID_EMAIL },
  { secret = SECRET, method = 'POST' }: { secret?: string | null; method?: string } = {},
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (secret !== null) headers.set(SECRET_HEADER, secret)
  return new Request('http://localhost/functions/v1/e2e-login', {
    method,
    headers,
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

Deno.test('caminho feliz: devolve a sessão para e-mail da allowlist', async () => {
  const { handler, calls } = setup()
  const res = await handler(request())
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.access_token, 'access')
  assertEquals(calls.length, 1)
  assertEquals(calls[0], VALID_EMAIL)
})

Deno.test('ref de produção no SUPABASE_URL → 403, mesmo com tudo válido', async () => {
  const { handler, calls } = setup({ SUPABASE_URL: PROD_URL })
  const res = await handler(request())
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Forbidden')
  assertEquals(calls.length, 0, 'createSession não pode ser chamado')
})

Deno.test('ref de produção em maiúsculas também é recusado', async () => {
  const { handler } = setup({ SUPABASE_URL: PROD_URL.toUpperCase() })
  assertEquals((await handler(request())).status, 403)
})

Deno.test('E2E_MODE desligado → 403', async () => {
  for (const mode of [undefined, 'false', 'TRUE', '1']) {
    const { handler, calls } = setup({ E2E_MODE: mode })
    assertEquals((await handler(request())).status, 403, `E2E_MODE=${mode}`)
    assertEquals(calls.length, 0)
  }
})

Deno.test('SUPABASE_URL ausente → 403', async () => {
  const { handler } = setup({ SUPABASE_URL: undefined })
  assertEquals((await handler(request())).status, 403)
})

Deno.test('segredo ausente, curto ou errado → 403', async () => {
  let ctx = setup({ E2E_LOGIN_SECRET: undefined })
  assertEquals((await ctx.handler(request())).status, 403, 'sem secret no servidor')

  ctx = setup({ E2E_LOGIN_SECRET: 'curto' })
  assertEquals((await ctx.handler(request(undefined, { secret: 'curto' }))).status, 403, 'secret curto')

  ctx = setup()
  assertEquals((await ctx.handler(request(undefined, { secret: null }))).status, 403, 'sem cabeçalho')
  assertEquals((await ctx.handler(request(undefined, { secret: `${SECRET}x` }))).status, 403, 'secret errado')
  assertEquals(ctx.calls.length, 0)
})

Deno.test('o INTERNAL_SECRET não serve como segredo do e2e-login', async () => {
  const { handler } = setup({ E2E_LOGIN_SECRET: undefined, INTERNAL_SECRET: SECRET })
  assertEquals((await handler(request())).status, 403)
})

Deno.test('e-mail fora da allowlist → 400', async () => {
  const invalid = [
    'dev@drimigrante.test',
    'e2e+1-abc@drimigrante.com',
    'E2E+1-abc@drimigrante.test',
    'e2e+1-abc@drimigrante.test.evil.com',
    'e2e+abc-1@drimigrante.test',
    'e2e+1-ABC@drimigrante.test',
    ' e2e+1-abc@drimigrante.test',
    'x e2e+1-abc@drimigrante.test',
  ]
  for (const email of invalid) {
    const { handler, calls } = setup()
    const res = await handler(request({ email }))
    assertEquals(res.status, 400, email)
    assertEquals((await res.json()).error, 'Bad request')
    assertEquals(calls.length, 0, email)
  }
})

Deno.test('corpo inválido ou sem e-mail → 400', async () => {
  for (const body of ['{nope', '[]', 'null', '{}', JSON.stringify({ email: 42 })]) {
    const { handler } = setup()
    assertEquals((await handler(request(body))).status, 400, body)
  }
})

Deno.test('método diferente de POST → 405', async () => {
  const { handler } = setup()
  assertEquals((await handler(request(undefined, { method: 'GET' }))).status, 405)
})

Deno.test('erro interno → 500 genérico, detalhe só no log', async () => {
  const { handler, logs } = setup({}, new Error('detalhe interno do GoTrue'))
  const res = await handler(request())
  assertEquals(res.status, 500)
  const text = await res.text()
  assertEquals(text.includes('GoTrue'), false, 'não pode vazar o detalhe')
  assertEquals(logs.length, 1)
})

Deno.test('allowlist casa com o formato gerado pelo fixture', () => {
  const generated = `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@drimigrante.test`
  assertEquals(E2E_EMAIL_PATTERN.test(generated), true, generated)
})

Deno.test('isProductionUrl e timingSafeEqual', async () => {
  assertEquals(isProductionUrl(PROD_URL), true)
  assertEquals(isProductionUrl('http://127.0.0.1:54321'), false)
  assertEquals(await timingSafeEqual('abc', 'abc'), true)
  assertEquals(await timingSafeEqual('abc', 'abd'), false)
  assertEquals(await timingSafeEqual('', 'abc'), false)
})
