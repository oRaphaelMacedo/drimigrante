// Testes Deno do generate-explanation (DI-004 / DI-008 / DI-018 / DI-077).
// O fetch da OpenAI é SEMPRE mockado: nenhum teste chama api.openai.com de verdade.
// DI-077: esta function não envia mais e-mail (o welcome_free saiu para o compute-eligibility).

import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from '../_shared/test-asserts.ts'
import type { LogLevel } from '../_shared/http.ts'
import {
  type AssessmentWithResult,
  createGenerateExplanationHandler,
  type ExplanationMode,
  type ExplanationRepo,
  lockTokenAt,
  OPENAI_CHAT_URL,
  parseHourlyCap,
  parseMode,
} from './handler.ts'

const ASSESSMENT_ID = '11111111-2222-4333-8444-555555555555'
const SESSION_ID = 's_1760000000000_abc1234'
const OWNER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OTHER_ID = 'ffffffff-0000-4000-8000-000000000000'
const SERVICE_ROLE = 'service-role-de-teste'
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0)

// JWT de usuário só com o payload (a assinatura é validada pelo repo fake).
function fakeJwt(role: string, sub = OWNER_ID): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${enc({ alg: 'HS256' })}.${enc({ role, sub })}.assinatura`
}

const VALID_USERS: Record<string, string> = {
  [fakeJwt('authenticated')]: OWNER_ID,
  [fakeJwt('authenticated', OTHER_ID)]: OTHER_ID,
}

interface World {
  assessment: AssessmentWithResult | null
  hasAccess: boolean
  accessChecks: string[]
  aiGenerations: number
  claimResult: boolean
  claims: ExplanationMode[]
  cleared: ExplanationMode[]
  saved: Array<{ mode: ExplanationMode; text: string; model: string; tokens: number }>
  released: Array<{ lock: string; restore: string | null }>
  recorded: Array<{ model: string; mode: ExplanationMode }>
  openaiBodies: Array<Record<string, unknown>>
  openaiStatus: number
  openaiThrows: unknown
  logs: Array<{ level: LogLevel; event: string; data?: Record<string, unknown> }>
  aiConfig: Record<string, unknown> | null
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    assessment: {
      id: ASSESSMENT_ID,
      user_id: null,
      session_id: SESSION_ID,
      answers: {
        processo_tipo: 'nacionalidade',
        caso_tipo: 'A',
        a1_antepassado: 'pai_mae',
        a2_documento: 'sim',
        a4_lacos: 'sim',
      },
      result: {
        score_numeric: 85,
        score_category: 'alta',
        ia_explanation_short: null,
        ia_model_used: null,
        ia_tokens_used: null,
        full_status: 'missing',
      },
    },
    hasAccess: true,
    accessChecks: [],
    aiGenerations: 0,
    claimResult: true,
    claims: [],
    cleared: [],
    saved: [],
    released: [],
    recorded: [],
    openaiBodies: [],
    openaiStatus: 200,
    openaiThrows: null,
    logs: [],
    aiConfig: { model: 'gpt-4o-mini', temperature: 0.3, max_tokens: 2000, system_prompt: 'Tom acolhedor.' },
    ...overrides,
  }
}

/** Assessment já vinculado à conta do dono, com o resumo do quiz gravado (cenário do pagante). */
function paidWorld(overrides: Partial<World> = {}): World {
  const world = makeWorld(overrides)
  world.assessment!.user_id = OWNER_ID
  world.assessment!.result!.ia_explanation_short = 'Resumo salvo.'
  world.assessment!.result!.ia_model_used = 'gpt-4o-mini'
  world.assessment!.result!.ia_tokens_used = 80
  return world
}

function makeHandler(world: World, env: Partial<{ openaiKey: string; hourlyCap: number }> = {}) {
  const repo: ExplanationRepo = {
    getUserIdFromToken: (token) => Promise.resolve(VALID_USERS[token] ?? null),
    getAssessmentWithResult: () => Promise.resolve(world.assessment),
    hasFullAnalysisAccess: (userId) => {
      world.accessChecks.push(userId)
      return Promise.resolve(world.hasAccess)
    },
    countAiGenerationsSince: () => Promise.resolve(world.aiGenerations),
    clearBlank: (_id, mode) => {
      world.cleared.push(mode)
      return Promise.resolve()
    },
    claimGeneration: (_id, mode) => {
      world.claims.push(mode)
      return Promise.resolve(world.claimResult)
    },
    releaseGeneration: (_id, lock, restore) => {
      world.released.push({ lock, restore })
      return Promise.resolve()
    },
    recordAiGeneration: ({ model, mode }) => {
      world.recorded.push({ model, mode })
      return Promise.resolve()
    },
    getAiConfig: () => Promise.resolve(world.aiConfig),
    saveExplanation: (_id, _lock, mode, data) => {
      world.saved.push({ mode, ...data })
      return Promise.resolve(true)
    },
  }
  const fetchMock = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    assertEquals(url, OPENAI_CHAT_URL)
    assert(init?.signal instanceof AbortSignal, 'a chamada à OpenAI precisa de timeout')
    const body = JSON.parse(String(init?.body))
    world.openaiBodies.push(body)
    if (world.openaiThrows) return Promise.reject(world.openaiThrows)
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
    log: (level, event, data) => world.logs.push({ level, event, data }),
    now: () => NOW,
    env: {
      openaiKey: env.openaiKey ?? 'sk-test-nao-usada',
      serviceRoleKey: SERVICE_ROLE,
      hourlyCap: env.hourlyCap ?? 60,
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

const FULL = { assessment_id: ASSESSMENT_ID, mode: 'full' }

// ── Modo short (fim do quiz) ─────────────────────────────────────────────────

Deno.test('sem session_id nem JWT do dono → 404 e nenhuma chamada à OpenAI', async () => {
  const world = makeWorld()
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID }, fakeJwt('anon')))
  assertEquals(res.status, 404)
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('session_id errado ou assessment já vinculado a outra conta → 404', async () => {
  const wrong = makeWorld()
  assertEquals((await makeHandler(wrong)(post({ assessment_id: ASSESSMENT_ID, session_id: 's_outra_sessao_123' }))).status, 404)

  const linked = makeWorld()
  linked.assessment!.user_id = OTHER_ID
  const res = await makeHandler(linked)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 404)
  assertEquals(wrong.openaiBodies.length + linked.openaiBodies.length, 0)
})

Deno.test('DI-018: o quiz (sem mode) gera SÓ o resumo — uma chamada à OpenAI e nada de análise completa', async () => {
  const world = makeWorld()
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json, { status: 'ready', short: 'Resumo curto.' })
  assert(!('full' in json))
  assertEquals(world.openaiBodies.length, 1)
  assertEquals(world.openaiBodies[0].max_tokens, 150)
  assertNotIncludes(String((world.openaiBodies[0].messages as Array<{ content: string }>)[1].content), '## ')
  assertEquals(world.saved, [{ mode: 'short', text: 'Resumo curto.', model: 'gpt-4o-mini', tokens: 80 }])
  assertEquals(world.claims, ['short'])
  assertEquals(world.recorded, [{ model: 'gpt-4o-mini', mode: 'short' }])
  // Pagamento não é consultado no modo short.
  assertEquals(world.accessChecks.length, 0)
})

Deno.test('mode "short" explícito é igual ao padrão; mode desconhecido → 400', async () => {
  const world = makeWorld()
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID, mode: 'short' }))
  assertEquals(res.status, 200)
  assertEquals(world.saved[0].mode, 'short')

  const bad = makeWorld()
  const badRes = await makeHandler(bad)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID, mode: 'tudo' }))
  assertEquals(badRes.status, 400)
  assertEquals(bad.openaiBodies.length, 0)
})

Deno.test('JWT do dono (assessment vinculado) também gera o resumo', async () => {
  const world = makeWorld()
  world.assessment!.user_id = OWNER_ID
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID }, fakeJwt('authenticated')))
  assertEquals(res.status, 200)
  assertEquals(world.saved[0].mode, 'short')
})

Deno.test('prompt enviado à OpenAI não tem nome/e-mail e cita a via certa, sem D7', async () => {
  const short = makeWorld()
  await makeHandler(short)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  const full = paidWorld()
  await makeHandler(full)(post(FULL, fakeJwt('authenticated')))
  const bodies = [...short.openaiBodies, ...full.openaiBodies]
  assertEquals(bodies.length, 2)
  for (const body of bodies) {
    const text = JSON.stringify(body.messages)
    assertNotIncludes(text, 'Pessoa Teste')
    assertNotIncludes(text, 'pessoa@example.com')
    assertNotIncludes(text, /D7|lawyer|Sofia/)
    assertStringIncludes(text, 'Nacionalidade por Descendência (1.º grau)')
  }
  assertEquals(short.openaiBodies[0].max_tokens, 150)
  assertEquals(full.openaiBodies[0].max_tokens, 2000)
})

Deno.test('segunda chamada (resumo já existe) não chama OpenAI nem envia e-mail', async () => {
  const world = makeWorld()
  world.assessment!.result!.ia_explanation_short = 'Resumo salvo.'
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json, { status: 'ready', short: 'Resumo salvo.', cached: true })
  assertEquals(world.openaiBodies.length, 0)
  assertEquals(world.recorded.length, 0)
})

Deno.test('resumo vazio legado é limpo antes de gerar de novo', async () => {
  const world = makeWorld()
  world.assessment!.result!.ia_explanation_short = '   '
  await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(world.cleared, ['short'])
  assertEquals(world.saved.length, 1)
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
  assertEquals(world.released, [{ lock: lockTokenAt(NOW), restore: null }])
})

Deno.test('OpenAI sem resposta (timeout/rede) → 502 ai_unavailable, não 500', async () => {
  const world = makeWorld({ openaiThrows: new DOMException('Signal timed out.', 'TimeoutError') })
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 502)
  assertEquals(world.logs.find((l) => l.event === 'explanation_failed')?.data?.code, 'openai_timeout')
  assertEquals(world.released.length, 1)
})

Deno.test('DI-077: gerar o resumo não envia e-mail nem lê e-mail/nome (welcome_free saiu daqui)', async () => {
  const world = makeWorld()
  const logs: string[] = []
  const res = await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  for (const l of world.logs) logs.push(l.event)
  assert(!logs.some((e) => e.startsWith('welcome_email')), logs.join(','))
  // O contrato do repositório não tem mais e-mail nem nome do assessment.
  assert(!('email' in world.assessment!) && !('full_name' in world.assessment!))
})

Deno.test('modelo do banco fora da allowlist e max_tokens alto são corrigidos', async () => {
  const world = paidWorld({ aiConfig: { model: 'gpt-4o', temperature: 0.3, max_tokens: 9000, system_prompt: null } })
  await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(world.openaiBodies[0].model, 'gpt-4o-mini')
  assertEquals(world.openaiBodies[0].max_tokens, 2000)
})

Deno.test('sem resultado de elegibilidade → 409; id inválido → 400', async () => {
  const world = makeWorld()
  world.assessment!.result = null
  assertEquals((await makeHandler(world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))).status, 409)
  assertEquals((await makeHandler(world)(post({ assessment_id: 'nao-e-uuid', session_id: SESSION_ID }))).status, 400)
  assertEquals(world.openaiBodies.length, 0)
})

// ── Modo full (análise paga, sob demanda) ────────────────────────────────────

Deno.test('DI-018: pagante sem análise → gera só a completa, resposta sem o texto e sem e-mail', async () => {
  const world = paidWorld()
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json, { status: 'ready' })
  assertNotIncludes(JSON.stringify(json), 'Texto completo')
  assertEquals(world.accessChecks, [OWNER_ID])
  assertEquals(world.openaiBodies.length, 1)
  assertStringIncludes(String((world.openaiBodies[0].messages as Array<{ content: string }>)[1].content), '## ')
  // Tokens somados aos do resumo já gravado.
  assertEquals(world.saved, [{ mode: 'full', text: '## Avaliação geral\nTexto completo.', model: 'gpt-4o-mini', tokens: 980 }])
  assertEquals(world.claims, ['full'])
  assertEquals(world.recorded, [{ model: 'gpt-4o-mini', mode: 'full' }])
})

Deno.test('DI-018: sem acesso (nunca pagou ou expirou) → 403 payment_required, sem OpenAI', async () => {
  const world = paidWorld({ hasAccess: false })
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 403)
  assertEquals(await res.json(), { error: 'payment_required' })
  assertEquals(world.openaiBodies.length, 0)
  assertEquals(world.claims.length, 0)
  assertEquals(world.recorded.length, 0)
})

Deno.test('DI-018: modo full exige JWT — session_id do quiz não basta (401)', async () => {
  const anon = makeWorld()
  const res = await makeHandler(anon)(post({ ...FULL, session_id: SESSION_ID }))
  assertEquals(res.status, 401)
  assertEquals(await res.json(), { error: 'auth_required' })

  const anonKey = makeWorld()
  assertEquals((await makeHandler(anonKey)(post({ ...FULL, session_id: SESSION_ID }, fakeJwt('anon')))).status, 401)
  assertEquals(anon.openaiBodies.length + anonKey.openaiBodies.length, 0)
  assertEquals(anon.accessChecks.length + anonKey.accessChecks.length, 0)
})

Deno.test('DI-018: JWT de outra conta → 404 (não revela o assessment nem consulta pagamento)', async () => {
  const world = paidWorld()
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated', OTHER_ID)))
  assertEquals(res.status, 404)
  assertEquals(world.accessChecks.length, 0)
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('DI-018: assessment ainda anônimo não recebe a análise completa', async () => {
  const world = makeWorld()
  const res = await makeHandler(world)(post({ ...FULL, session_id: SESSION_ID }, SERVICE_ROLE))
  assertEquals(res.status, 403)
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('DI-018: service role também respeita o pagamento do dono', async () => {
  const denied = paidWorld({ hasAccess: false })
  assertEquals((await makeHandler(denied)(post(FULL, SERVICE_ROLE))).status, 403)
  assertEquals(denied.accessChecks, [OWNER_ID])

  const allowed = paidWorld()
  assertEquals((await makeHandler(allowed)(post(FULL, SERVICE_ROLE))).status, 200)
  assertEquals(allowed.saved[0].mode, 'full')
})

Deno.test('DI-018: análise já gravada → 200 cached, sem OpenAI (idempotente)', async () => {
  const world = paidWorld()
  world.assessment!.result!.full_status = 'ready'
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { status: 'ready', cached: true })
  assertEquals(world.openaiBodies.length, 0)
  assertEquals(world.claims.length, 0)
})

Deno.test('DI-018: geração em andamento (trava ocupada) → 202 in_progress', async () => {
  const world = paidWorld({ claimResult: false })
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 202)
  assertEquals(await res.json(), { status: 'in_progress' })
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('DI-018: disjuntor por hora também vale para o modo full', async () => {
  const world = paidWorld({ aiGenerations: 60 })
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 202)
  assertEquals((await res.json()).status, 'deferred')
  assertEquals(world.openaiBodies.length, 0)
})

Deno.test('DI-018: falha da OpenAI no modo full devolve o modelo anterior ao soltar a trava', async () => {
  const world = paidWorld({ openaiStatus: 500 })
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 502)
  assertEquals(world.released, [{ lock: lockTokenAt(NOW), restore: 'gpt-4o-mini' }])
  assertEquals(world.saved.length, 0)
})

Deno.test('DI-018: análise vazia legada é limpa e gerada de novo', async () => {
  const world = paidWorld()
  world.assessment!.result!.full_status = 'blank'
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 200)
  assertEquals(world.cleared, ['full'])
  assertEquals(world.saved[0].mode, 'full')
})

Deno.test('DI-018: sem resultado de elegibilidade no modo full → 409 (depois de conferir o pagamento)', async () => {
  const world = paidWorld()
  world.assessment!.result = null
  const res = await makeHandler(world)(post(FULL, fakeJwt('authenticated')))
  assertEquals(res.status, 409)
  assertEquals(world.accessChecks, [OWNER_ID])
})

Deno.test('parseHourlyCap, parseMode e lockTokenAt', () => {
  assertEquals(parseHourlyCap(undefined), 60)
  assertEquals(parseHourlyCap('abc'), 60)
  assertEquals(parseHourlyCap('0'), 60)
  assertEquals(parseHourlyCap('25'), 25)
  assertEquals(parseMode(undefined), 'short')
  assertEquals(parseMode(null), 'short')
  assertEquals(parseMode('full'), 'full')
  assertEquals(parseMode('FULL'), null)
  assertEquals(parseMode(1), null)
  assertEquals(lockTokenAt(NOW), `lock_${NOW}`)
  assert(lockTokenAt(NOW - 1) < lockTokenAt(NOW))
})
