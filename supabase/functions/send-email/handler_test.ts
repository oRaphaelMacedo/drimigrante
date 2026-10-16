// Testes Deno do send-email (DI-014). O fetch do Resend é SEMPRE mockado.

import { assert, assertEquals, assertNotIncludes } from '../_shared/test-asserts.ts'
import type { LogLevel } from '../_shared/http.ts'
import { createSendEmailHandler, type EmailLogRow, RESEND_URL } from './handler.ts'

interface World {
  resendStatus: number
  resendBody: Record<string, unknown>
  logRows: EmailLogRow[]
  logs: Array<{ level: LogLevel; event: string; data?: Record<string, unknown> }>
  fetchCalls: number
}

function makeHandler(world: World, secret = 'segredo-interno') {
  return createSendEmailHandler({
    repo: {
      getTemplate: (key) =>
        Promise.resolve(
          key === 'welcome_free'
            ? { id: 'tpl-1', subject_pt: 'Olá {{name}}', body_html_pt: '<p>{{name}} — {{score_category}}</p>' }
            : null,
        ),
      getProfile: () => Promise.resolve(null),
      insertLog: (row) => {
        world.logRows.push(row)
        return Promise.resolve()
      },
    },
    fetch: ((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      assertEquals(url, RESEND_URL)
      world.fetchCalls++
      return Promise.resolve(new Response(JSON.stringify(world.resendBody), { status: world.resendStatus }))
    }) as typeof fetch,
    log: (level, event, data) => world.logs.push({ level, event, data }),
    now: () => Date.UTC(2026, 9, 16),
    env: { internalSecret: secret, resendKey: 're_test_nao_usada' },
  })
}

function post(body: Record<string, unknown>, secret: string | null = 'segredo-interno'): Request {
  return new Request('http://localhost/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(secret ? { 'x-internal-secret': secret } : {}) },
    body: JSON.stringify(body),
  })
}

const BODY = {
  trigger_key: 'welcome_free',
  recipient_email: 'pessoa@example.com',
  variables: { name: '<b>Pessoa</b>', score_category: 'alta' },
}

Deno.test('falha do Resend → log JSON com trigger_key, linha failed e 502 com code', async () => {
  const world: World = {
    resendStatus: 403,
    resendBody: {
      statusCode: 403,
      name: 'validation_error',
      message: 'The mail.drimigrante.com domain is not verified. Send to pessoa@example.com failed.',
    },
    logRows: [],
    logs: [],
    fetchCalls: 0,
  }
  const res = await makeHandler(world)(post(BODY))
  assertEquals(res.status, 502)
  assertEquals(await res.json(), { error: 'email_send_failed', code: 'validation_error' })

  const log = world.logs.find((l) => l.event === 'email_send')
  assert(log, JSON.stringify(world.logs))
  assertEquals(log.level, 'error')
  assertEquals(log.data?.trigger_key, 'welcome_free')
  assertEquals(log.data?.status, 'failed')
  assertEquals(log.data?.code, 'validation_error')
  assertEquals(log.data?.provider_status, 403)
  assertNotIncludes(JSON.stringify(world.logs), 'pessoa@example.com')

  assertEquals(world.logRows.length, 1)
  assertEquals(world.logRows[0].status, 'failed')
  assertEquals(world.logRows[0].sent_at, null)
  assertNotIncludes(world.logRows[0].error_message ?? '', 'pessoa@example.com')
})

Deno.test('sucesso → 200, linha sent e HTML com variáveis escapadas', async () => {
  const world: World = { resendStatus: 200, resendBody: { id: 'msg_1' }, logRows: [], logs: [], fetchCalls: 0 }
  const res = await makeHandler(world)(post(BODY))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { success: true, message_id: 'msg_1' })
  assertEquals(world.logRows[0].status, 'sent')
  assertEquals(world.logRows[0].body_html, '<p>&lt;b&gt;Pessoa&lt;/b&gt; — alta</p>')
  assertEquals(world.logs.find((l) => l.event === 'email_send')?.data?.status, 'sent')
})

Deno.test('sem segredo interno → 403 e nada é enviado', async () => {
  const world: World = { resendStatus: 200, resendBody: {}, logRows: [], logs: [], fetchCalls: 0 }
  assertEquals((await makeHandler(world)(post(BODY, null))).status, 403)
  assertEquals((await makeHandler(world)(post(BODY, 'errado'))).status, 403)
  assertEquals(world.fetchCalls, 0)
})

Deno.test('template inexistente → 404 com log estruturado', async () => {
  const world: World = { resendStatus: 200, resendBody: {}, logRows: [], logs: [], fetchCalls: 0 }
  const res = await makeHandler(world)(post({ ...BODY, trigger_key: 'nao_existe' }))
  assertEquals(res.status, 404)
  assertEquals(world.logs[0].data?.code, 'template_not_found')
  assertEquals(world.logs[0].data?.trigger_key, 'nao_existe')
  assertEquals(world.fetchCalls, 0)
})
