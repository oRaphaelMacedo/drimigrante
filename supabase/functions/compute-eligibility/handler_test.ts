// Testes Deno do compute-eligibility: posse obrigatória e resposta sem análises de IA
// (DI-004); score igual ao do front, sem gravar nada quando uma query falha (DI-006);
// welcome_free daqui, sem depender da OpenAI, idempotente e em dry-run por padrão (DI-077).
// Nenhum teste envia e-mail: o send-email é uma função falsa.

import { assert, assertEquals, assertNotIncludes } from '../_shared/test-asserts.ts'
import { emailHash, verifyUnsubscribeToken } from '../_shared/email-lifecycle.ts'
import type { DbScoringQuestionRow } from '../_shared/quiz-engine.ts'
import {
  createComputeEligibilityHandler,
  type EligibilityAssessment,
  type EligibilityRepo,
  type SafeResult,
  type WelcomeEmailConfig,
} from './handler.ts'
import { createGenerateExplanationHandler } from '../generate-explanation/handler.ts'

const ASSESSMENT_ID = '11111111-2222-4333-8444-555555555555'
const SESSION_ID = 's_1760000000000_abc1234'

const opts = (scores: Record<string, number>) =>
  Object.entries(scores).map(([option_key, score]) => ({ option_key, score, is_active: true }))

/**
 * Recorte das perguntas como estão em produção (GET somente leitura, 16/10/2026):
 * a condição de b1 e a de a1 estão incompletas ({question_key} sem resposta).
 */
const QUESTION_ROWS: DbScoringQuestionRow[] = [
  { question_key: 'processo_tipo', field_type: 'radio', display_conditions: null, form_question_options: opts({ nacionalidade: 0, visto: 0 }) },
  {
    question_key: 'caso_tipo',
    field_type: 'multiselect',
    display_conditions: { question_key: 'processo_tipo', answer_key: 'nacionalidade' },
    form_question_options: opts({ A: 0, B: 0 }),
  },
  {
    question_key: 'a1_antepassado',
    field_type: 'radio',
    display_conditions: { question_key: 'caso_tipo' },
    form_question_options: opts({ pai_mae: 40, avo: 30, nao_sei: 0 }),
  },
  {
    question_key: 'b1_tempo_casamento',
    field_type: 'radio',
    display_conditions: { question_key: 'caso_tipo' },
    form_question_options: opts({ mais_3_anos: 60, menos_3_anos: 15 }),
  },
  {
    question_key: 'c3_tempo_portugal',
    field_type: 'radio',
    display_conditions: { question_key: 'c2_mora_portugal', answer_key: 'sim' },
    form_question_options: opts({ menos_2: 30, '5_ou_mais': 75 }),
  },
]

interface RepoState {
  assessment: EligibilityAssessment | null
  existing?: { result: SafeResult; hasAnalysis: boolean } | null
  upserts: unknown[]
  completed?: string[]
  questionsError?: Error
  visaError?: Error
  /** welcome_free (DI-077). */
  resumeToken?: string | null
  resumeTokenError?: Error
  welcomeLogged?: boolean
  recentWelcome?: boolean
  suppressedScopes?: Record<string, string[]>
}

function makeRepo(state: RepoState): EligibilityRepo {
  return {
    getUserIdFromToken: () => Promise.resolve(null),
    getAssessment: () => Promise.resolve(state.assessment),
    getResult: () => Promise.resolve(state.existing ?? null),
    getScoringQuestions: () =>
      state.questionsError ? Promise.reject(state.questionsError) : Promise.resolve(QUESTION_ROWS),
    getActiveVisaRules: () =>
      state.visaError ? Promise.reject(state.visaError) : Promise.resolve([
        { id: 'v1', code: 'D7', name_pt: 'Visto D7', ruleVersionId: 'r1', rules: { '==': [{ var: 'x' }, 'y'] } },
      ]),
    upsertResult: (row) => {
      state.upserts.push(row)
      return Promise.resolve({
        id: 'res-1',
        assessment_id: row.assessment_id,
        score_numeric: row.score_numeric,
        score_category: row.score_category,
        suggested_visa_types: row.suggested_visa_types,
        computed_at: row.computed_at,
      })
    },
    markCompleted: (id) => {
      state.completed?.push(id)
      return Promise.resolve()
    },
    getResumeToken: () =>
      state.resumeTokenError ? Promise.reject(state.resumeTokenError) : Promise.resolve(state.resumeToken ?? null),
    hasWelcomeEmail: () => Promise.resolve(state.welcomeLogged === true),
    hasRecentWelcomeTo: () => Promise.resolve(state.recentWelcome === true),
    getSuppressionScopes: (hash) => Promise.resolve(new Set(state.suppressedScopes?.[hash] ?? [])),
  }
}

function handlerFor(state: RepoState, logs: Array<{ level: string; event: string; data?: Record<string, unknown> }> = []) {
  return createComputeEligibilityHandler({
    repo: makeRepo(state),
    log: (level, event, data) => void logs.push({ level, event, data }),
    now: () => Date.UTC(2026, 9, 16),
    env: { serviceRoleKey: 'service-role-de-teste' },
  })
}

function post(body: Record<string, unknown>, token?: string): Request {
  return new Request('http://localhost/compute-eligibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

const anonAssessment: EligibilityAssessment = {
  id: ASSESSMENT_ID,
  user_id: null,
  session_id: SESSION_ID,
  answers: { processo_tipo: 'nacionalidade', caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' },
}

Deno.test('sem session_id/JWT do dono → 404 e nada é reescrito', async () => {
  const state = { assessment: anonAssessment, upserts: [] as unknown[] }
  assertEquals((await handlerFor(state)(post({ assessment_id: ASSESSMENT_ID }))).status, 404)
  assertEquals((await handlerFor(state)(post({ assessment_id: ASSESSMENT_ID, session_id: 's_outra_123456' }))).status, 404)
  assertEquals(state.upserts.length, 0)
})

Deno.test('dono com session_id calcula e a resposta só traz colunas de score', async () => {
  const state = { assessment: anonAssessment, upserts: [] as unknown[] }
  const res = await handlerFor(state)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  const { result } = await res.json()
  assertEquals(result.score_numeric, 100)
  assertEquals(result.score_category, 'alta')
  assert(!('ia_explanation_full' in result) && !('ia_explanation_short' in result))
  assertEquals(state.upserts.length, 1)
})

Deno.test('service role (uso interno) passa na posse', async () => {
  const state = { assessment: { ...anonAssessment, user_id: 'outro-dono' }, upserts: [] as unknown[] }
  const res = await handlerFor(state)(post({ assessment_id: ASSESSMENT_ID }, 'service-role-de-teste'))
  assertEquals(res.status, 200)
})

Deno.test('com análise de IA já gerada, devolve o resultado existente sem reescrever', async () => {
  const existing = {
    result: {
      id: 'res-1',
      assessment_id: ASSESSMENT_ID,
      score_numeric: 40,
      score_category: 'media',
      suggested_visa_types: [],
      computed_at: '2026-10-01T00:00:00Z',
    },
    hasAnalysis: true,
  }
  const state = { assessment: anonAssessment, existing, upserts: [] as unknown[] }
  const res = await handlerFor(state)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { result: existing.result, cached: true })
  assertEquals(state.upserts.length, 0)
})

Deno.test('casado há mais de 3 anos grava "alta" com score ≥ 60 (mesmo cálculo do front)', async () => {
  const logs: Array<{ level: string; event: string; data?: Record<string, unknown> }> = []
  const state: RepoState = { assessment: anonAssessment, upserts: [], completed: [] }
  const res = await handlerFor(state, logs)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  const row = state.upserts[0] as { score_numeric: number; score_category: string }
  assertEquals(row.score_category, 'alta')
  assert(row.score_numeric >= 60, `score ${row.score_numeric}`)
  // O denominador só soma perguntas visíveis (antes: soma de todas, 428 pontos → 14%).
  assertEquals(row.score_numeric, 100)
  assertEquals(state.completed, [ASSESSMENT_ID])
  // As condições incompletas do banco foram reparadas com a regra do código.
  const repaired = logs.find((l) => l.event === 'quiz_conditions_repaired')
  assertEquals(repaired?.data?.question_keys, ['a1_antepassado', 'b1_tempo_casamento'])
})

Deno.test('respostas de ramos ocultos não pontuam no servidor', async () => {
  const state: RepoState = {
    assessment: {
      ...anonAssessment,
      // Marcou A (pai/mãe) e depois trocou para só B com menos de 3 anos.
      answers: { processo_tipo: 'nacionalidade', caso_tipo: 'B', a1_antepassado: 'pai_mae', b1_tempo_casamento: 'menos_3_anos' },
    },
    upserts: [],
  }
  await handlerFor(state)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  const row = state.upserts[0] as { score_numeric: number; score_category: string }
  assertEquals([row.score_numeric, row.score_category], [25, 'baixa'])
})

Deno.test('erro na query das perguntas ou das regras → 500 e nada é gravado', async () => {
  const pgrst201 = Object.assign(new Error('Could not embed because more than one relationship was found'), {
    code: 'PGRST201',
  })
  for (const failure of [{ questionsError: pgrst201 }, { visaError: new Error('timeout') }]) {
    const logs: Array<{ level: string; event: string; data?: Record<string, unknown> }> = []
    const state: RepoState = { assessment: anonAssessment, upserts: [], completed: [], ...failure }
    const res = await handlerFor(state, logs)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
    assertEquals(res.status, 500)
    assertEquals(await res.json(), { error: 'internal_error' })
    assertEquals(state.upserts.length, 0)
    assertEquals(state.completed, [])
    assertEquals(logs.at(-1)?.event, 'eligibility_failed')
  }
})

// ── welcome_free (DI-077) ────────────────────────────────────────────────────

const UNSUB_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789'
const RESUME = 'c'.repeat(64)
const UNSUB_URL = 'https://proj.test/functions/v1/unsubscribe'
type Log = { level: string; event: string; data?: Record<string, unknown> }

interface WelcomeWorld {
  sends: Array<Record<string, unknown>>
  sendError: unknown | null
  deferred: Promise<unknown>[]
  logs: Log[]
}

const withContact: EligibilityAssessment = {
  ...anonAssessment,
  email: ' Pessoa@Example.com ',
  full_name: 'Ana Souza',
}

function newWorld(overrides: Partial<WelcomeWorld> = {}): WelcomeWorld {
  return { sends: [], sendError: null, deferred: [], logs: [], ...overrides }
}

function welcomeHandler(state: RepoState, world: WelcomeWorld, welcome: Partial<WelcomeEmailConfig> = {}) {
  return createComputeEligibilityHandler({
    repo: makeRepo(state),
    log: (level, event, data) => void world.logs.push({ level, event, data }),
    now: () => Date.UTC(2026, 9, 16),
    env: { serviceRoleKey: 'service-role-de-teste' },
    welcome: {
      dryRun: false,
      appUrl: 'https://app.test',
      unsubscribeSecret: UNSUB_SECRET,
      unsubscribeUrl: UNSUB_URL,
      send: (body) => {
        world.sends.push(body)
        return Promise.resolve({ error: world.sendError })
      },
      ...welcome,
    },
    defer: (task) => void world.deferred.push(task),
  })
}

/** Fim do quiz (session_id do dono, ou o token indicado) e espera o e-mail em segundo plano. */
async function runQuiz(state: RepoState, world: WelcomeWorld, welcome?: Partial<WelcomeEmailConfig>, token?: string) {
  const body = token ? { assessment_id: ASSESSMENT_ID } : { assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }
  const res = await welcomeHandler(state, world, welcome)(post(body, token))
  await Promise.all(world.deferred)
  return res
}

Deno.test('welcome_free: categoria certa, link ?r= e descadastro, depois da resposta', async () => {
  const world = newWorld()
  const state: RepoState = { assessment: withContact, upserts: [], completed: [], resumeToken: RESUME }
  const res = await welcomeHandler(state, world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  // A resposta não espera o e-mail: a tarefa foi entregue ao defer (EdgeRuntime.waitUntil).
  assertEquals(world.deferred.length, 1)
  await Promise.all(world.deferred)

  assertEquals(world.sends.length, 1)
  const sent = world.sends[0] as { trigger_key: string; recipient_email: string; variables: Record<string, string> }
  assertEquals(sent.trigger_key, 'welcome_free')
  assertEquals(sent.recipient_email, 'pessoa@example.com')
  assertEquals(sent.variables.category_label, 'Alta elegibilidade')
  assertEquals(sent.variables.greeting, 'Olá, Ana.')
  assertEquals(sent.variables.result_link, `https://app.test/results?r=${RESUME}`)
  assertEquals(sent.variables.dedupe_key, `welcome_free:${ASSESSMENT_ID}`)
  assertEquals(sent.variables.assessment_id, ASSESSMENT_ID)
  const link = new URL(sent.variables.unsubscribe_link)
  assertEquals(`${link.origin}${link.pathname}`, UNSUB_URL)
  const verified = await verifyUnsubscribeToken(UNSUB_SECRET, link.searchParams.get('t'))
  assertEquals(verified, { emailHash: await emailHash(UNSUB_SECRET, 'pessoa@example.com'), scope: 'all' })
  assertNotIncludes(JSON.stringify(world.logs), 'pessoa@example.com')
})

Deno.test('welcome_free sai mesmo com a OpenAI falhando (e o generate-explanation não manda outro)', async () => {
  const world = newWorld()
  const state: RepoState = { assessment: withContact, upserts: [], completed: [], resumeToken: RESUME }
  assertEquals((await runQuiz(state, world)).status, 200)
  assertEquals(world.sends.length, 1)

  // Em seguida o quiz chama o generate-explanation e a OpenAI (mock) responde 500.
  let openaiCalls = 0
  const explain = createGenerateExplanationHandler({
    repo: {
      getUserIdFromToken: () => Promise.resolve(null),
      getAssessmentWithResult: () =>
        Promise.resolve({
          id: ASSESSMENT_ID,
          user_id: null,
          session_id: SESSION_ID,
          email: 'pessoa@example.com',
          full_name: 'Ana Souza',
          answers: withContact.answers,
          result: {
            score_numeric: 100,
            score_category: 'alta',
            ia_explanation_short: null,
            ia_model_used: null,
            ia_tokens_used: null,
            full_status: 'missing',
          },
        }),
      hasFullAnalysisAccess: () => Promise.resolve(false),
      countAiGenerationsSince: () => Promise.resolve(0),
      clearBlank: () => Promise.resolve(),
      claimGeneration: () => Promise.resolve(true),
      releaseGeneration: () => Promise.resolve(),
      recordAiGeneration: () => Promise.resolve(),
      getAiConfig: () => Promise.resolve(null),
      saveExplanation: () => Promise.resolve(true),
    },
    fetch: (() => {
      openaiCalls++
      return Promise.resolve(new Response('{"error":"boom"}', { status: 500 }))
    }) as typeof fetch,
    log: () => {},
    now: () => Date.UTC(2026, 9, 16),
    env: { openaiKey: 'sk-test-nao-usada', serviceRoleKey: 'x', hourlyCap: 60 },
  })
  const res = await explain(
    new Request('http://localhost/generate-explanation', {
      method: 'POST',
      body: JSON.stringify({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }),
    }),
  )
  assertEquals(res.status, 502)
  assertEquals(openaiCalls, 1)
  // Continua exatamente um welcome_free: o do compute-eligibility.
  assertEquals(world.sends.length, 1)
})

Deno.test('welcome_free em dry-run (padrão): só loga, sem chamar o send-email', async () => {
  const world = newWorld()
  const state: RepoState = { assessment: withContact, upserts: [], resumeToken: RESUME }
  assertEquals((await runQuiz(state, world, { dryRun: true })).status, 200)
  assertEquals(world.sends.length, 0)
  const log = world.logs.find((l) => l.event === 'welcome_email_dry_run')
  assertEquals(log?.data, { assessment_id: ASSESSMENT_ID, category: 'alta', suppression_checked: true })

  // Dry-run sem o segredo também funciona (só não confere o descadastro).
  const noSecret = newWorld()
  await runQuiz({ assessment: withContact, upserts: [], resumeToken: RESUME }, noSecret, {
    dryRun: true,
    unsubscribeSecret: undefined,
  })
  assertEquals(noSecret.logs.find((l) => l.event === 'welcome_email_dry_run')?.data?.suppression_checked, false)
  assertEquals(noSecret.sends.length, 0)
})

Deno.test('welcome_free: no máximo um por assessment e um por destinatário em 24 h', async () => {
  const cases: Array<[Partial<RepoState>, string]> = [
    [{ welcomeLogged: true }, 'already_logged'],
    [{ recentWelcome: true }, 'recent_for_recipient'],
  ]
  for (const [flags, reason] of cases) {
    const world = newWorld()
    await runQuiz({ assessment: withContact, upserts: [], resumeToken: RESUME, ...flags }, world)
    assertEquals(world.sends.length, 0, reason)
    assertEquals(world.logs.find((l) => l.event === 'welcome_email_skipped')?.data?.reason, reason)
  }
})

Deno.test('welcome_free: descadastro geral bloqueia; descadastro só de marketing não', async () => {
  const hash = (await emailHash(UNSUB_SECRET, 'pessoa@example.com'))!
  const blocked = newWorld()
  await runQuiz(
    { assessment: withContact, upserts: [], resumeToken: RESUME, suppressedScopes: { [hash]: ['all'] } },
    blocked,
  )
  assertEquals(blocked.sends.length, 0)

  const marketingOnly = newWorld()
  await runQuiz(
    { assessment: withContact, upserts: [], resumeToken: RESUME, suppressedScopes: { [hash]: ['marketing'] } },
    marketingOnly,
  )
  assertEquals(marketingOnly.sends.length, 1)
})

Deno.test('welcome_free não sai para a service role, sem e-mail, na lista de espera ou sem token de retomada', async () => {
  const service = newWorld()
  const serviceState: RepoState = { assessment: { ...withContact, user_id: 'outro' }, upserts: [], resumeToken: RESUME }
  assertEquals((await runQuiz(serviceState, service, {}, 'service-role-de-teste')).status, 200)
  assertEquals([service.sends.length, service.deferred.length], [0, 0])

  const missingColumn = Object.assign(new Error('column assessments.resume_token does not exist'), { code: '42703' })
  const cases: Array<[RepoState, string]> = [
    [{ assessment: { ...withContact, email: null }, upserts: [], resumeToken: RESUME }, 'no_email'],
    [{ assessment: { ...withContact, answers: { waitlist: true } }, upserts: [], resumeToken: RESUME }, 'waitlist'],
    [{ assessment: withContact, upserts: [], resumeToken: null }, 'no_resume_token'],
    [{ assessment: withContact, upserts: [], resumeTokenError: missingColumn }, 'no_resume_token'],
  ]
  for (const [state, reason] of cases) {
    const world = newWorld()
    assertEquals((await runQuiz(state, world)).status, 200)
    assertEquals(world.sends.length, 0, reason)
    assertEquals(world.logs.find((l) => l.event === 'welcome_email_skipped')?.data?.reason, reason)
  }
})

Deno.test('falha no welcome_free (send-email ou banco) não derruba o resultado e não loga e-mail', async () => {
  const failing = newWorld({ sendError: { name: 'FunctionsHttpError' } })
  const res = await runQuiz({ assessment: withContact, upserts: [], completed: [], resumeToken: RESUME }, failing)
  assertEquals(res.status, 200)
  const log = failing.logs.find((l) => l.event === 'welcome_email_failed')
  assertEquals(log?.data, { trigger_key: 'welcome_free', assessment_id: ASSESSMENT_ID, code: 'FunctionsHttpError' })

  // Sem defer, o handler espera o e-mail — e mesmo assim um erro do banco vira só log.
  const broken = newWorld()
  const repo = makeRepo({ assessment: withContact, upserts: [], resumeToken: RESUME })
  repo.hasWelcomeEmail = () => Promise.reject(Object.assign(new Error('relation does not exist'), { code: '42P01' }))
  const handler = createComputeEligibilityHandler({
    repo,
    log: (level, event, data) => void broken.logs.push({ level, event, data }),
    now: () => Date.UTC(2026, 9, 16),
    env: { serviceRoleKey: 'service-role-de-teste' },
    welcome: {
      dryRun: false,
      appUrl: 'https://app.test',
      unsubscribeSecret: UNSUB_SECRET,
      unsubscribeUrl: UNSUB_URL,
      send: () => Promise.resolve({ error: null }),
    },
  })
  assertEquals((await handler(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))).status, 200)
  assertEquals(broken.logs.find((l) => l.event === 'welcome_email_failed')?.data?.code, '42P01')
  assertNotIncludes(JSON.stringify([...failing.logs, ...broken.logs]), 'pessoa@example.com')
})

Deno.test('welcome_free com envio ligado e sem EMAIL_UNSUBSCRIBE_SECRET não sai (config_missing)', async () => {
  const world = newWorld()
  await runQuiz({ assessment: withContact, upserts: [], resumeToken: RESUME }, world, { unsubscribeSecret: 'curto' })
  assertEquals(world.sends.length, 0)
  const log = world.logs.find((l) => l.event === 'config_missing')
  assertEquals([log?.level, log?.data?.key], ['error', 'EMAIL_UNSUBSCRIBE_SECRET'])
})
