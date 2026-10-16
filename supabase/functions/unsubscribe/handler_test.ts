// Testes Deno do unsubscribe (DI-077): GET só confirma, POST descadastra (formulário,
// one-click e JSON), token adulterado é recusado e nada de e-mail aparece em logs/HTML.

import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from '../_shared/test-asserts.ts'
import { createUnsubscribeToken, emailHash, type UnsubscribeScope } from '../_shared/email-lifecycle.ts'
import type { LogLevel } from '../_shared/http.ts'
import { createUnsubscribeHandler, type SuppressionSource } from './handler.ts'

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789'
const EMAIL = 'pessoa@example.com'
const BASE = 'http://localhost/functions/v1/unsubscribe'

interface World {
  rows: Array<{ hash: string; scope: UnsubscribeScope; source: SuppressionSource }>
  fail: boolean
  logs: Array<{ level: LogLevel; event: string; data?: Record<string, unknown> }>
}

function setup(env: { secret?: string } = { secret: SECRET }) {
  const world: World = { rows: [], fail: false, logs: [] }
  const handler = createUnsubscribeHandler({
    repo: {
      addSuppression: (hash, scope, source) => {
        if (world.fail) return Promise.reject(Object.assign(new Error('db down'), { code: 'XX000' }))
        if (!world.rows.some((r) => r.hash === hash && r.scope === scope)) world.rows.push({ hash, scope, source })
        return Promise.resolve()
      },
    },
    log: (level, event, data) => world.logs.push({ level, event, data }),
    env: { secret: env.secret, appUrl: 'https://app.test' },
  })
  return { world, handler }
}

const tokenFor = async (scope: UnsubscribeScope = 'marketing') => (await createUnsubscribeToken(SECRET, EMAIL, scope))!

Deno.test('GET mostra a confirmação e NÃO descadastra (leitores de link não tiram ninguém da lista)', async () => {
  const { world, handler } = setup()
  const token = await tokenFor()
  const res = await handler(new Request(`${BASE}?t=${token}`))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Content-Type'), 'text/html; charset=utf-8')
  assertStringIncludes(res.headers.get('Content-Security-Policy') ?? '', "default-src 'none'")
  assertEquals(res.headers.get('Referrer-Policy'), 'no-referrer')
  const html = await res.text()
  assertStringIncludes(html, '<html lang="pt-BR">')
  assertStringIncludes(html, 'Confirmar descadastro')
  assertStringIncludes(html, 'method="post"')
  assertNotIncludes(html, EMAIL)
  assertNotIncludes(html, '<script')
  assertEquals(world.rows.length, 0)
})

Deno.test('POST do formulário descadastra uma vez (idempotente) e grava só o hash', async () => {
  const { world, handler } = setup()
  const token = await tokenFor('all')
  for (let i = 0; i < 2; i++) {
    const res = await handler(
      new Request(`${BASE}?t=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ t: token }).toString(),
      }),
    )
    assertEquals(res.status, 200)
    assertStringIncludes(await res.text(), 'Pronto, descadastro feito')
  }
  assertEquals(world.rows, [{ hash: (await emailHash(SECRET, EMAIL))!, scope: 'all', source: 'unsubscribe_link' }])
  const serialized = JSON.stringify(world.logs)
  assertNotIncludes(serialized, EMAIL)
  assertNotIncludes(serialized, token)
  assert(world.logs.some((l) => l.event === 'unsubscribed' && l.data?.scope === 'all'))
})

Deno.test('one-click do cliente de e-mail (RFC 8058) descadastra com resposta em texto', async () => {
  const { world, handler } = setup()
  const token = await tokenFor()
  const res = await handler(
    new Request(`${BASE}?t=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
  )
  assertEquals(res.status, 200)
  assertEquals(await res.text(), 'Descadastro feito.')
  assertEquals(world.rows[0].source, 'one_click')
  assertEquals(world.rows[0].scope, 'marketing')
})

Deno.test('POST JSON (página futura do front) responde JSON', async () => {
  const { world, handler } = setup()
  const token = await tokenFor()
  const res = await handler(
    new Request(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }),
  )
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { ok: true, scope: 'marketing', confirmed: true })
  assertEquals(world.rows.length, 1)

  const bad = await handler(
    new Request(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"token":"x"}' }),
  )
  assertEquals(bad.status, 400)
  assertEquals(await bad.json(), { error: 'invalid_token' })
})

Deno.test('token adulterado, ausente ou de outro segredo → 400 e nada gravado', async () => {
  const { world, handler } = setup()
  const token = await tokenFor()
  const [hash, , sig] = token.split('.')
  const forged = [`${hash}.a.${sig}`, '', 'abc', (await createUnsubscribeToken('outro-segredo-tambem-com-32-caracteres-xx', EMAIL, 'all'))!]
  for (const t of forged) {
    const res = await handler(new Request(`${BASE}?t=${encodeURIComponent(t)}`, { method: 'POST' }))
    assertEquals(res.status, 400, t)
    assertStringIncludes(await res.text(), 'Link inválido')
  }
  assertEquals(world.rows.length, 0)
})

Deno.test('falha ao gravar → 500 com "tentar de novo"; sem segredo → 503', async () => {
  const { world, handler } = setup()
  world.fail = true
  const token = await tokenFor()
  const res = await handler(new Request(`${BASE}?t=${token}`, { method: 'POST' }))
  assertEquals(res.status, 500)
  assertStringIncludes(await res.text(), 'Tentar de novo')
  assert(world.logs.some((l) => l.level === 'error' && l.event === 'unsubscribe_failed'))

  const noSecret = setup({ secret: undefined })
  const unavailable = await noSecret.handler(new Request(`${BASE}?t=${token}`))
  assertEquals(unavailable.status, 503)
  assertEquals(noSecret.world.logs[0].event, 'config_missing')
})

Deno.test('HEAD não tem efeito; outros métodos → 405', async () => {
  const { world, handler } = setup()
  const token = await tokenFor()
  assertEquals((await handler(new Request(`${BASE}?t=${token}`, { method: 'HEAD' }))).status, 200)
  assertEquals((await handler(new Request(`${BASE}?t=${token}`, { method: 'DELETE' }))).status, 405)
  assertEquals(world.rows.length, 0)
})
