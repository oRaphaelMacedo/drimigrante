// Testes Deno do chat-completion (DI-017). O fetch da OpenAI é SEMPRE mockado.

import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from '../_shared/test-asserts.ts'
import { type ChatRepo, createChatHandler, OPENAI_CHAT_URL } from './handler.ts'
import {
  buildChatHistory,
  CHAT_LIMIT_PER_DAY,
  CHAT_LIMIT_PER_HOUR,
  type ChatSubscription,
  hasChatAccess,
  type StoredMessage,
  validateChatMessage,
} from './history.ts'

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const ASSESSMENT_ID = '11111111-2222-4333-8444-555555555555'
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)
const DAY = 24 * 60 * 60 * 1000

// ─── histórico ────────────────────────────────────────────────────────────────

Deno.test('histórico: últimas 20 mensagens em ordem cronológica, só user/assistant', () => {
  const rows: StoredMessage[] = []
  for (let i = 0; i < 30; i++) {
    rows.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
      created_at: new Date(NOW + i * 1000).toISOString(),
    })
  }
  rows.push({ role: 'system', content: 'injetada', created_at: new Date(NOW + 99_000).toISOString() })
  rows.push({ role: 'assistant', content: '   ', created_at: new Date(NOW + 98_000).toISOString() })
  // O banco devolve as mais recentes primeiro.
  const history = buildChatHistory([...rows].reverse())
  assertEquals(history.length, 20)
  assertEquals(history.map((m) => m.content), Array.from({ length: 20 }, (_, i) => `m${i + 10}`))
  assert(history.every((m) => m.role === 'user' || m.role === 'assistant'))
})

Deno.test('validação da mensagem: 1 a 2000 caracteres', () => {
  assertEquals(validateChatMessage('  oi  '), { ok: true, message: 'oi' })
  assertEquals(validateChatMessage('   '), { ok: false, error: 'empty_message' })
  assertEquals(validateChatMessage(42), { ok: false, error: 'empty_message' })
  assertEquals(validateChatMessage('a'.repeat(2001)), { ok: false, error: 'message_too_long' })
  assertEquals(validateChatMessage('a'.repeat(2000)).ok, true)
})

Deno.test('gate de acesso: recorrente, one-time válido, expirado e staff', () => {
  const sub = (s: Partial<ChatSubscription>): ChatSubscription => ({
    recurring_active: false,
    has_chat_access: false,
    one_time_access_expires_at: null,
    ...s,
  })
  const expires = new Date(NOW).toISOString()
  assertEquals(hasChatAccess(null, NOW, false), false)
  assertEquals(hasChatAccess(sub({}), NOW, false), false)
  assertEquals(hasChatAccess(sub({ recurring_active: true }), NOW, false), true)
  assertEquals(hasChatAccess(sub({ has_chat_access: true, one_time_access_expires_at: expires }), NOW, false), true)
  assertEquals(hasChatAccess(sub({ has_chat_access: true, one_time_access_expires_at: expires }), NOW + 1, false), false)
  assertEquals(hasChatAccess(sub({ has_chat_access: true }), NOW, false), true)
  assertEquals(hasChatAccess(null, NOW, true), true)
})

// ─── handler ──────────────────────────────────────────────────────────────────

interface World {
  subscription: ChatSubscription | null
  staff: boolean
  hourCount: number
  dayCount: number
  inserted: Array<{ id: string; role: string; content: string }>
  deleted: string[]
  openaiBodies: Array<Record<string, unknown>>
  openaiChunks: string[]
  /** HTTP da OpenAI (200 = stream normal); 'network' = fetch lança; 'stream_error' = cai no meio. */
  openaiMode: number | 'network' | 'stream_error'
  aiConfig: Record<string, unknown> | null
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    subscription: {
      recurring_active: false,
      has_chat_access: true,
      one_time_access_expires_at: new Date(NOW + 10 * DAY).toISOString(),
    },
    staff: false,
    hourCount: 0,
    dayCount: 0,
    inserted: [],
    deleted: [],
    openaiBodies: [],
    openaiChunks: ['Olá', ', tudo bem?'],
    openaiMode: 200,
    aiConfig: { model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1500, system_prompt: 'Tom acolhedor.' },
    ...overrides,
  }
}

function sse(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const lines = chunks.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
  lines.push('data: [DONE]\n\n')
  return new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l))
      controller.close()
    },
  })
}

function brokenSse(firstChunk: string): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: firstChunk } }] })}\n\n`))
      controller.error(new Error('upstream_reset'))
    },
  })
}

/** Só as mensagens que continuam gravadas (sem o id gerado pelo fake). */
function persisted(world: World) {
  return world.inserted.map(({ role, content }) => ({ role, content }))
}

function makeHandler(world: World) {
  const repo: ChatRepo = {
    getUserIdFromToken: (t) => Promise.resolve(t === 'jwt-valido' ? USER_ID : null),
    getOwnedAssessment: (id, uid) =>
      Promise.resolve(
        id === ASSESSMENT_ID && uid === USER_ID
          ? { id, answers: { processo_tipo: 'nacionalidade', caso_tipo: 'A', a1_antepassado: 'pai_mae' } }
          : null,
      ),
    getResultSummary: () => Promise.resolve({ score_numeric: 70, score_category: 'alta' }),
    getSubscription: () => Promise.resolve(world.subscription),
    isStaff: () => Promise.resolve(world.staff),
    countUserMessagesSince: (_uid, since) =>
      Promise.resolve(Date.parse(since) <= NOW - DAY ? world.dayCount : world.hourCount),
    getRecentMessages: () =>
      Promise.resolve([
        { role: 'assistant', content: 'resposta antiga', created_at: new Date(NOW - 1000).toISOString() },
        { role: 'user', content: 'pergunta antiga', created_at: new Date(NOW - 2000).toISOString() },
      ]),
    insertMessage: (row) => {
      const id = `msg-${world.inserted.length + world.deleted.length + 1}`
      world.inserted.push({ id, role: row.role, content: row.content })
      return Promise.resolve(id)
    },
    deleteMessage: (id) => {
      world.deleted.push(id)
      world.inserted = world.inserted.filter((m) => m.id !== id)
      return Promise.resolve()
    },
    getAiConfig: () => Promise.resolve(world.aiConfig),
  }
  const fetchMock = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    assertEquals(url, OPENAI_CHAT_URL)
    world.openaiBodies.push(JSON.parse(String(init?.body)))
    if (world.openaiMode === 'network') return Promise.reject(new TypeError('network'))
    if (world.openaiMode === 'stream_error') {
      return Promise.resolve(new Response(brokenSse(world.openaiChunks[0] ?? 'Olá'), { status: 200 }))
    }
    if (world.openaiMode !== 200) {
      return Promise.resolve(new Response('{"error":"x"}', { status: world.openaiMode }))
    }
    return Promise.resolve(new Response(sse(world.openaiChunks), { status: 200 }))
  }
  return createChatHandler({
    repo,
    fetch: fetchMock as typeof fetch,
    log: () => {},
    now: () => NOW,
    env: { openaiKey: 'sk-test-nao-usada' },
  })
}

function post(body: Record<string, unknown>, token: string | null = 'jwt-valido'): Request {
  return new Request('http://localhost/chat-completion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

Deno.test('sem JWT válido → 401 sem OpenAI', async () => {
  const world = makeWorld()
  assertEquals((await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }, null))).status, 401)
  assertEquals((await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }, 'outro'))).status, 401)
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('usuário sem acesso → 403 no_access, sem OpenAI e sem gravar mensagem', async () => {
  const world = makeWorld({ subscription: { recurring_active: false, has_chat_access: false, one_time_access_expires_at: null } })
  const res = await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))
  assertEquals(res.status, 403)
  assertEquals(await res.json(), { error: 'no_access' })
  assertEquals(world.openaiBodies.length, 0)
  assertEquals(world.inserted.length, 0)
})

Deno.test('acesso de 30 dias expirado → 403', async () => {
  const world = makeWorld({
    subscription: {
      recurring_active: false,
      has_chat_access: true,
      one_time_access_expires_at: new Date(NOW - 1).toISOString(),
    },
  })
  assertEquals((await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))).status, 403)
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('limites de uso: 30/hora e 200/dia → 429', async () => {
  const hour = makeWorld({ hourCount: CHAT_LIMIT_PER_HOUR })
  const resHour = await makeHandler(hour)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))
  assertEquals(resHour.status, 429)
  assertEquals((await resHour.json()).window, 'hour')

  const day = makeWorld({ hourCount: 1, dayCount: CHAT_LIMIT_PER_DAY })
  const resDay = await makeHandler(day)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))
  assertEquals(resDay.status, 429)
  assertEquals((await resDay.json()).window, 'day')
  assertEquals(hour.openaiBodies.length + day.openaiBodies.length, 0)
})

Deno.test('mensagem vazia ou longa → 400; assessment de outra pessoa → 404', async () => {
  const world = makeWorld()
  assertEquals((await makeHandler(world)(post({ message: '', assessmentId: ASSESSMENT_ID }))).status, 400)
  assertEquals((await makeHandler(world)(post({ message: 'a'.repeat(2001), assessmentId: ASSESSMENT_ID }))).status, 400)
  assertEquals(
    (await makeHandler(world)(post({ message: 'oi', assessmentId: '99999999-2222-4333-8444-555555555555' }))).status,
    404,
  )
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('sucesso: stream SSE, histórico em ordem, max_tokens ≤ 1000 e resposta gravada pelo servidor', async () => {
  const world = makeWorld()
  const res = await makeHandler(world)(post({ message: '  Quais documentos preciso?  ', assessmentId: ASSESSMENT_ID }))
  assertEquals(res.status, 200)
  assertEquals(res.headers.get('Content-Type'), 'text/event-stream')
  const text = await res.text()
  assertStringIncludes(text, `data: ${JSON.stringify({ delta: 'Olá' })}`)
  assertStringIncludes(text, 'event: done')

  const body = world.openaiBodies[0]
  assertEquals(body.max_tokens, 1000)
  assertEquals(body.stream, true)
  const messages = body.messages as Array<{ role: string; content: string }>
  assertEquals(messages.map((m) => m.role), ['system', 'user', 'assistant', 'user'])
  assertEquals(messages[1].content, 'pergunta antiga')
  assertEquals(messages[3].content, 'Quais documentos preciso?')
  assertNotIncludes(messages[0].content, /lawyer|pt-PT|D7/)
  assertStringIncludes(messages[0].content, 'Nacionalidade por Descendência (1.º grau)')

  assertEquals(persisted(world), [
    { role: 'user', content: 'Quais documentos preciso?' },
    { role: 'assistant', content: 'Olá, tudo bem?' },
  ])
  assertEquals(world.deleted, [])
})

// Mensagem sem resposta não pode ficar gravada: ela contaria nos limites de 30/h e
// 200/dia e apareceria sem resposta no histórico.
Deno.test('resposta vazia da IA não é gravada e a pergunta não fica órfã', async () => {
  const world = makeWorld({ openaiChunks: [] })
  const res = await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))
  await res.text()
  assertEquals(persisted(world), [])
  assertEquals(world.deleted.length, 1)
})

Deno.test('OpenAI com erro HTTP → 502 e a mensagem do usuário não fica gravada', async () => {
  const world = makeWorld({ openaiMode: 500 })
  const res = await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))
  assertEquals(res.status, 502)
  assertEquals(await res.json(), { error: 'ai_unavailable' })
  assertEquals(persisted(world), [])
})

Deno.test('falha de rede na OpenAI → 502 (não 500) e a mensagem do usuário não fica gravada', async () => {
  const world = makeWorld({ openaiMode: 'network' })
  const res = await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))
  assertEquals(res.status, 502)
  assertEquals(persisted(world), [])
})

Deno.test('stream interrompido no meio → nada gravado (nem pergunta nem resposta parcial)', async () => {
  const world = makeWorld({ openaiMode: 'stream_error' })
  const res = await makeHandler(world)(post({ message: 'oi', assessmentId: ASSESSMENT_ID }))
  assertEquals(res.status, 200)
  try {
    await res.text()
  } catch {
    // o stream do cliente termina com erro
  }
  assertEquals(persisted(world), [])
  assertEquals(world.deleted.length, 1)
})
