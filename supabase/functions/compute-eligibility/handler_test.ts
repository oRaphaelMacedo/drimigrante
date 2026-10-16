// Testes Deno do compute-eligibility: posse obrigatória e resposta sem análises de IA
// (DI-004); score igual ao do front, sem gravar nada quando uma query falha (DI-006);
// boas-vindas (welcome_free_v2) daqui, sem depender da OpenAI, idempotentes, com trava
// contra chamadas simultâneas e em dry-run por padrão (DI-077).
// Nenhum teste envia e-mail: o send-email é uma função falsa.

import { assert, assertEquals, assertNotIncludes } from '../_shared/test-asserts.ts'
import { emailHash, verifyUnsubscribeToken } from '../_shared/email-lifecycle.ts'
import type { DbScoringQuestionRow } from '../_shared/quiz-engine.ts'
import {
  createComputeEligibilityHandler,
  type EligibilityAssessment,
  type EligibilityRepo,
  type SafeResult,
  type WelcomeClaimRow,
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
  /** Boas-vindas (DI-077). */
  resumeToken?: string | null
  resumeTokenError?: Error
  welcomeLogged?: boolean
  recentWelcome?: boolean
  suppressedScopes?: Record<string, string[]>
  /** id do welcome_free_v2 ativo; null = modelo ausente (padrão: 'tpl-welcome-v2'). */
  templateId?: string | null
  /** Outra chamada já tem a trava (claimWelcome devolve null). */
  claimTaken?: boolean
  /** Outra chamada terminou o envio entre a 1ª conferência e a trava. */
  loggedAfterClaim?: boolean
  releaseError?: Error
  claims?: WelcomeClaimRow[]
  releases?: string[]
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
    hasWelcomeEmail: () =>
      Promise.resolve(state.welcomeLogged === true || (state.loggedAfterClaim === true && (state.claims?.length ?? 0) > 0)),
    hasRecentWelcomeTo: () => Promise.resolve(state.recentWelcome === true),
    getSuppressionScopes: (hash) => Promise.resolve(new Set(state.suppressedScopes?.[hash] ?? [])),
    getActiveTemplateId: (key) => {
      assertEquals(key, 'welcome_free_v2')
      return Promise.resolve(state.templateId === undefined ? 'tpl-welcome-v2' : state.templateId)
    },
    claimWelcome: (row) => {
      if (state.claimTaken) return Promise.resolve(null)
      ;(state.claims ??= []).push(row)
      return Promise.resolve({ id: `claim-${state.claims.length}` })
    },
    releaseWelcomeClaim: (id) => {
      ;(state.releases ??= []).push(id)
      return state.releaseError ? Promise.reject(state.releaseError) : Promise.resolve()
    },
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

// ── Boas-vindas: welcome_free_v2 (DI-077) ───────────────────────────────────

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

Deno.test('boas-vindas (welcome_free_v2): categoria certa, link ?r= e descadastro, depois da resposta', async () => {
  const world = newWorld()
  const state: RepoState = { assessment: withContact, upserts: [], completed: [], resumeToken: RESUME }
  const res = await welcomeHandler(state, world)(post({ assessment_id: ASSESSMENT_ID, session_id: SESSION_ID }))
  assertEquals(res.status, 200)
  // A resposta não espera o e-mail: a tarefa foi entregue ao defer (EdgeRuntime.waitUntil).
  assertEquals(world.deferred.length, 1)
  await Promise.all(world.deferred)

  assertEquals(world.sends.length, 1)
  const sent = world.sends[0] as { trigger_key: string; recipient_email: string; variables: Record<string, string> }
  // Modelo novo: o 'welcome_free' antigo (outras variáveis) nunca é usado por aqui.
  assertEquals(sent.trigger_key, 'welcome_free_v2')
  assertEquals(sent.recipient_email, 'pessoa@example.com')
  assertEquals(Object.keys(sent.variables).sort(), [
    'assessment_id',
    'category_label',
    'greeting',
    'result_link',
    'unsubscribe_link',
  ])
  assertEquals(sent.variables.category_label, 'Alta elegibilidade')
  assertEquals(sent.variables.greeting, 'Olá, Ana.')
  assertEquals(sent.variables.result_link, `https://app.test/results?r=${RESUME}`)
  assertEquals(sent.variables.assessment_id, ASSESSMENT_ID)
  const link = new URL(sent.variables.unsubscribe_link)
  assertEquals(`${link.origin}${link.pathname}`, UNSUB_URL)
  const verified = await verifyUnsubscribeToken(UNSUB_SECRET, link.searchParams.get('t'))
  assertEquals(verified, { emailHash: await emailHash(UNSUB_SECRET, 'pessoa@example.com'), scope: 'all' })
  assertNotIncludes(JSON.stringify(world.logs), 'pessoa@example.com')

  // Trava 'pending' por assessment antes do envio, apagada no fim.
  assertEquals(state.claims, [{
    template_id: 'tpl-welcome-v2',
    user_id: null,
    recipient_email: 'pessoa@example.com',
    provider: 'resend',
    status: 'pending',
    variables_used: { dedupe_key: `welcome_free_v2:${ASSESSMENT_ID}`, assessment_id: ASSESSMENT_ID },
  }])
  assertEquals(state.releases, ['claim-1'])
})

Deno.test('boas-vindas: trava de outra chamada ou envio terminado depois da 1ª conferência → não manda de novo', async () => {
  const raced = newWorld()
  const racedState: RepoState = { assessment: withContact, upserts: [], resumeToken: RESUME, claimTaken: true }
  assertEquals((await runQuiz(racedState, raced)).status, 200)
  assertEquals(raced.sends.length, 0)
  assertEquals(raced.logs.find((l) => l.event === 'welcome_email_skipped')?.data?.reason, 'concurrent')
  assertEquals(racedState.releases, undefined)

  // Fim do quiz e início do checkout ao mesmo tempo: o outro terminou antes desta trava.
  const late = newWorld()
  const lateState: RepoState = { assessment: withContact, upserts: [], resumeToken: RESUME, loggedAfterClaim: true }
  await runQuiz(lateState, late)
  assertEquals(late.sends.length, 0)
  assertEquals(late.logs.find((l) => l.event === 'welcome_email_skipped')?.data?.reason, 'already_logged')
  assertEquals(lateState.releases, ['claim-1'])
})

Deno.test('boas-vindas: sem o modelo welcome_free_v2 (migration ausente) nada sai nem trava', async () => {
  const world = newWorld()
  const state: RepoState = { assessment: withContact, upserts: [], resumeToken: RESUME, templateId: null }
  assertEquals((await runQuiz(state, world)).status, 200)
  assertEquals(world.sends.length, 0)
  assertEquals(world.logs.find((l) => l.event === 'welcome_email_skipped')?.data?.reason, 'template_missing')
  assertEquals(state.claims, undefined)
})

Deno.test('boas-vindas: assessment com resultado antigo (ex.: checkout dias depois) não recebe boas-vindas atrasadas', async () => {
  const previous = (computed_at: string | null) => ({
    result: {
      id: 'res-1',
      assessment_id: ASSESSMENT_ID,
      score_numeric: 100,
      score_category: 'alta',
      suggested_visa_types: [],
      computed_at,
    },
    hasAnalysis: false,
  })
  const now = Date.UTC(2026, 9, 16)
  for (const computedAt of [new Date(now - 3 * 24 * 3600 * 1000).toISOString(), null]) {
    const world = newWorld()
    const state: RepoState = { assessment: withContact, upserts: [], resumeToken: RESUME, existing: previous(computedAt) }
    assertEquals((await runQuiz(state, world)).status, 200)
    assertEquals(world.sends.length, 0, String(computedAt))
    assertEquals(world.logs.find((l) => l.event === 'welcome_email_skipped')?.data?.reason, 'stale_assessment')
    // O resultado é recalculado normalmente.
    assertEquals(state.upserts.length, 1)
  }

  // Recalculado há pouco (o quiz chamou duas vezes): segue as regras normais e envia.
  const recent = newWorld()
  await runQuiz(
    { assessment: withContact, upserts: [], resumeToken: RESUME, existing: previous(new Date(now - 60_000).toISOString()) },
    recent,
  )
  assertEquals(recent.sends.length, 1)
})

Deno.test('boas-vindas saem mesmo com a OpenAI falhando (e o generate-explanation não manda outro)', async () => {
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
  // Continua exatamente um e-mail de boas-vindas: o do compute-eligibility.
  assertEquals(world.sends.length, 1)
})

Deno.test('boas-vindas em dry-run (padrão): só loga, sem chamar o send-email nem gravar a trava', async () => {
  const world = newWorld()
  const state: RepoState = { assessment: withContact, upserts: [], resumeToken: RESUME }
  assertEquals((await runQuiz(state, world, { dryRun: true })).status, 200)
  assertEquals(world.sends.length, 0)
  assertEquals(state.claims, undefined)
  const log = world.logs.find((l) => l.event === 'welcome_email_dry_run')
  assertEquals(log?.data, { assessment_id: ASSESSMENT_ID, category: 'alta', suppression_checked: true, template_ready: true })

  // Dry-run sem o segredo também funciona (só não confere o descadastro).
  const noSecret = newWorld()
  await runQuiz({ assessment: withContact, upserts: [], resumeToken: RESUME }, noSecret, {
    dryRun: true,
    unsubscribeSecret: undefined,
  })
  assertEquals(noSecret.logs.find((l) => l.event === 'welcome_email_dry_run')?.data?.suppression_checked, false)
  assertEquals(noSecret.sends.length, 0)
})

Deno.test('boas-vindas: no máximo uma por assessment e uma por destinatário em 24 h (modelo antigo ou novo)', async () => {
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

Deno.test('boas-vindas: descadastro geral bloqueia; descadastro só de marketing não', async () => {
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

Deno.test('boas-vindas não saem para a service role, sem e-mail, na lista de espera ou sem token de retomada', async () => {
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

Deno.test('falha nas boas-vindas (send-email ou banco) não derruba o resultado e não loga e-mail', async () => {
  const failing = newWorld({ sendError: { name: 'FunctionsHttpError' } })
  const failingState: RepoState = { assessment: withContact, upserts: [], completed: [], resumeToken: RESUME }
  const res = await runQuiz(failingState, failing)
  assertEquals(res.status, 200)
  const log = failing.logs.find((l) => l.event === 'welcome_email_failed')
  assertEquals(log?.data, { trigger_key: 'welcome_free_v2', assessment_id: ASSESSMENT_ID, code: 'FunctionsHttpError' })
  // A trava é apagada mesmo com falha (o send-email registra a tentativa no log).
  assertEquals(failingState.releases, ['claim-1'])

  // Falha ao apagar a trava: só um aviso; a trava fica e bloqueia novo envio (conservador).
  const stuck = newWorld()
  const stuckState: RepoState = {
    assessment: withContact,
    upserts: [],
    resumeToken: RESUME,
    releaseError: Object.assign(new Error('timeout'), { code: '57014' }),
  }
  assertEquals((await runQuiz(stuckState, stuck)).status, 200)
  assertEquals(stuck.sends.length, 1)
  assertEquals(stuck.logs.find((l) => l.event === 'welcome_claim_release_failed')?.level, 'warn')

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

Deno.test('boas-vindas com envio ligado e sem EMAIL_UNSUBSCRIBE_SECRET não saem (config_missing)', async () => {
  const world = newWorld()
  await runQuiz({ assessment: withContact, upserts: [], resumeToken: RESUME }, world, { unsubscribeSecret: 'curto' })
  assertEquals(world.sends.length, 0)
  const log = world.logs.find((l) => l.event === 'config_missing')
  assertEquals([log?.level, log?.data?.key], ['error', 'EMAIL_UNSUBSCRIBE_SECRET'])
})
