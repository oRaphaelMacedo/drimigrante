// Testes Deno do compute-eligibility: posse obrigatória e resposta sem análises de IA
// (DI-004); score igual ao do front, sem gravar nada quando uma query falha (DI-006).

import { assert, assertEquals } from '../_shared/test-asserts.ts'
import type { DbScoringQuestionRow } from '../_shared/quiz-engine.ts'
import {
  createComputeEligibilityHandler,
  type EligibilityAssessment,
  type EligibilityRepo,
  type SafeResult,
} from './handler.ts'

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
