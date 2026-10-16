// Testes Deno do generate-explanation (DI-004 / DI-008 / DI-014).
// O fetch da OpenAI é SEMPRE mockado: nenhum teste chama api.openai.com de verdade.

import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from '../_shared/test-asserts.ts'
import type { LogLevel } from '../_shared/http.ts'
import {
  type AssessmentWithResult,
  createGenerateExplanationHandler,
  type ExplanationRepo,
  lockTokenAt,
  OPENAI_CHAT_URL,
  parseHourlyCap,
} from './handler.ts'

const ASSESSMENT_ID = '11111111-2222-4333-8444-555555555555'
const SESSION_ID = 's_1760000000000_abc1234'
const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)

// JWT de usuário só com o payload (a assinatura é validada pelo repo fake).
function fakeJwt(role: string, sub = OWNER_ID): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${enc({ alg: 'HS256' })}.${enc({ role, sub })}.assinatura`
}

interface World {
  assessment: AssessmentWithResult | null
  aiGenerations: number
  claimResult: boolean
  welcomeLogged: boolean
  saved: Array<{ short: string; full: string; model: string; tokens: number }>
  released: string[]
  recorded: number
  openaiBodies: Array<Record<string, unknown>>
  openaiStatus: number
  emails: Array<Record<string, unknown>>
  emailError: unknown | null
  logs: Array<{ level: LogLevel; event: string; data?: Record<string, unknown> }>
  aiConfig: Record<string, unknown> | null
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    assessment: {
      id: ASSESSMENT_ID,
      user_id: null,
      session_id: SESSION_ID,
      email: 'pessoa@example.com',
      full_name: 'Pessoa Teste',
      answers: {
        processo_tipo: 'nacionalidade',
        caso_tipo: 'A',
        a1_antepassado: 'pai_mae',
        a2_documento: 'sim',
        a4_lacos: 'sim',
      },
      result: { score_numeric: 85, score_category: 'alta', ia_explanation_short: null, ia_model_used: null },
    },
    aiGenerations: 0,
    claimResult: true,
    welcomeLogged: false,
    saved: [],
    released: [],
    recorded: 0,
    openaiBodies: [],
    openaiStatus: 200,
    emails: [],
    emailError: null,
    logs: [],
    aiConfig: { model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 2000, system_prompt: 'Tom acolhedor.' },
    ...overrides,
  }
}

function makeHandler(world: World, env: Partial<{ openaiKey: string; hourlyCap: number }> = {}) {
  const repo: ExplanationRepo = {
    getUserIdFromToken: (token) => Promise.resolve(token === fakeJwt('authenticated') ? OWNER_ID : null),
    getAssessmentWithResult: () => Promise.resolve(world.assessment),
    countAiGenerationsSince: () => Promise.resolve(world.aiGenerations),
    clearEmptyShort: () => Promise.resolve(),
    claimGeneration: () => Promise.resolve(world.claimResult),
    releaseGeneration: (_id, lock) => {
      world.released.push(lock)
      return Promise.resolve()
    },
    recordAiGeneration: () => {
      world.recorded++
      return Promise.resolve()
    },
    getAiConfig: () => Promise.resolve(world.aiConfig),
    saveExplanation: (_id, _lock, data) => {
      world.saved.push(data)
      return Promise.resolve(true)
    },
    hasWelcomeEmail: () => Promise.resolve(world.welcomeLogged),
  }
  const fetchMock = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    assertEquals(url, OPENAI_CHAT_URL)
    const body = JSON.parse(String(init?.body))
    world.openaiBodies.push(body)
    const isFull = String(body.messages[1].content).includes('## ')
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: isFull ? '## Avaliação geral\nTexto completo.' : 'Resumo curto.' } }],
          usage: { total_tokens: isFull ? 900 : 80 },
        }),
        { status: world.openaiStatus },
      ),
    )
  }
  return createGenerateExplanationHandler({
    repo,
    fetch: fetchMock as typeof fetch,
    sendWelcomeEmail: (body) => {
      world.emails.push(body)
      return Promise.resolve({ error: world.emailError })
    },
    log: (level, event, data) => world.logs.push({ level, event, data }),
    now: () => NOW,
    env: {
      openaiKey: env.openaiKey ?? 'sk-test-nao-usada',
      serviceRoleKey: 'service-role-de-teste',
      hourlyCap: env.hourlyCap ?? 60,
      appUrl: 'https://app.test',
    },
  })
}

function post(body: Record<string, unknown>, token?: string): Request {
  return new Request('http://localhost/generate-explanation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

Deno.test('sem session_id nem JWT do dono → 404 e nenhuma chamada à OpenAI', async () => {
  const world = makeWorld()
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID }, fakeJwt('anon')))
  assertEquals(res.status, 404)
  assertEquals(world.openaiBodies.length, 0)
  assertEquals(world.emails.length, 0)
})

Deno.test('session_id errado ou assessment já vinculado a outra conta → 404', async () => {
  const wrong = makeWorld()
  assertEquals((await makeHandler(wrong)(post({ assessment_id: ASSESSMENT_ID, session_id: 's_outra_sessao_123' }))).status, 404)

  const linked = makeWorld()
  linked.assessment!.user_id = 'ffffffff-0000-4000-8000-000000000000'
  const res = await makeHandler(linked)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 404)
  assertEquals(wrong.openaiBodies.length + linked.openaiBodies.length, 0)
})

Deno.test('dono com session_id: gera resumo e análise, mas a resposta nunca traz `full`', async () => {
  const world = makeWorld()
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json, { status: 'ready', short: 'Resumo curto.' })
  assert(!('full' in json))
  assertEquals(world.openaiBodies.length, 2)
  assertEquals(world.saved.length, 1)
  assertEquals(world.saved[0].full, '## Avaliação geral\nTexto completo.')
  assertEquals(world.saved[0].tokens, 980)
  assertEquals(world.recorded, 1)
})

Deno.test('JWT do dono (assessment vinculado) também tem acesso', async () => {
  const world = makeWorld()
  world.assessment!.user_id = OWNER_ID
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID }, fakeJwt('authenticated')))
  assertEquals(res.status, 200)
})

Deno.test('prompt enviado à OpenAI não tem nome/e-mail e cita a via certa, sem D7', async () => {
  const world = makeWorld()
  await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  for (const body of world.openaiBodies) {
    const text = JSON.stringify(body.messages)
    assertNotIncludes(text, 'Pessoa Teste')
    assertNotIncludes(text, 'pessoa@example.com')
    assertNotIncludes(text, /D7|lawyer|Sofia/)
    assertStringIncludes(text, 'Nacionalidade por Descendência (1.º grau)')
  }
  assertEquals(world.openaiBodies[0].max_tokens, 150)
  assertEquals(world.openaiBodies[1].max_tokens, 2000)
})

Deno.test('segunda chamada (resumo já existe) não chama OpenAI nem envia e-mail', async () => {
  const world = makeWorld()
  world.assessment!.result!.ia_explanation_short = 'Resumo salvo.'
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json, { status: 'ready', short: 'Resumo salvo.', cached: true })
  assertEquals(world.openaiBodies.length, 0)
  assertEquals(world.emails.length, 0)
  assertEquals(world.recorded, 0)
})

Deno.test('disjuntor AI_HOURLY_CAP → 202 sem OpenAI', async () => {
  const world = makeWorld({ aiGenerations: 5 })
  const res = await makeHandler(world, { hourlyCap: 5 })(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 202)
  assertEquals((await res.json()).status, 'deferred')
  assertEquals(world.openaiBodies.length, 0)
  assert(world.logs.some((l) => l.event === 'ai_hourly_cap_reached'))
})

Deno.test('geração concorrente (trava ocupada) → 202 sem OpenAI', async () => {
  const world = makeWorld({ claimResult: false })
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 202)
  assertEquals((await res.json()).status, 'in_progress')
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('erro da OpenAI → 502, trava liberada e nada salvo', async () => {
  const world = makeWorld({ openaiStatus: 429 })
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 502)
  assertEquals(await res.json(), { error: 'ai_unavailable' })
  assertEquals(world.saved.length, 0)
  assertEquals(world.released, [lockTokenAt(NOW)])
  assertEquals(world.emails.length, 0)
})

Deno.test('welcome_free: no máximo um por assessment', async () => {
  const first = makeWorld()
  await makeHandler(first)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(first.emails.length, 1)
  assertEquals((first.emails[0].variables as Record<string, string>).assessment_id, ASSESSMENT_ID)

  const already = makeWorld({ welcomeLogged: true })
  await makeHandler(already)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(already.emails.length, 0)
})

Deno.test('falha no envio do welcome_free é lida do { error } e registrada sem derrubar a resposta', async () => {
  const world = makeWorld({ emailError: { name: 'FunctionsHttpError' } })
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  const log = world.logs.find((l) => l.event === 'welcome_email_failed')
  assert(log, JSON.stringify(world.logs))
  assertEquals(log.data?.trigger_key, 'welcome_free')
  assertEquals(log.data?.code, 'FunctionsHttpError')
  assertNotIncludes(JSON.stringify(world.logs), 'pessoa@example.com')
})

Deno.test('modelo do banco fora da allowlist e max_tokens alto são corrigidos', async () => {
  const world = makeWorld({ aiConfig: { model: 'gpt-4o', temperature: 0.3, max_tokens: 9000, system_prompt: null } })
  await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(world.openaiBodies[1].model, 'gpt-4o-mini')
  assertEquals(world.openaiBodies[1].max_tokens, 2000)
})

Deno.test('sem resultado de elegibilidade → 409; id inválido → 400', async () => {
  const world = makeWorld()
  world.assessment!.result = null
  assertEquals((await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))).status, 409)
  assertEquals((await makeHandler(world)(post({ assessment_id: 'nao-e-uuid', session_id: SESSION_ID }))).status, 400)
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('parseHourlyCap e lockTokenAt', () => {
  assertEquals(parseHourlyCap(undefined), 60)
  assertEquals(parseHourlyCap('abc'), 60)
  assertEquals(parseHourlyCap('0'), 60)
  assertEquals(parseHourlyCap('25'), 25)
  assertEquals(lockTokenAt(NOW), `lock_${NOW}`)
  assert(lockTokenAt(NOW - 1) < lockTokenAt(NOW))
})
