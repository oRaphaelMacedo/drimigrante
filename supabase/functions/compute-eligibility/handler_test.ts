// Testes Deno do compute-eligibility (DI-004): posse obrigatória e resposta sem análises de IA.

import { assert, assertEquals } from '../_shared/test-asserts.ts'
import {
  createComputeEligibilityHandler,
  type EligibilityAssessment,
  type EligibilityRepo,
  type SafeResult,
} from './handler.ts'

const ASSESSMENT_ID = '11111111-2222-4333-8444-555555555555'
const SESSION_ID = 's_1760000000000_abc1234'

function makeRepo(state: {
  assessment: EligibilityAssessment | null
  existing?: { result: SafeResult; hasAnalysis: boolean } | null
  upserts: unknown[]
}): EligibilityRepo {
  return {
    getUserIdFromToken: () => Promise.resolve(null),
    getAssessment: () => Promise.resolve(state.assessment),
    getResult: () => Promise.resolve(state.existing ?? null),
    getScoringOptions: () =>
      Promise.resolve([
        { question_key: 'b1_tempo_casamento', option_key: 'mais_3_anos', score: 60 },
        { question_key: 'b1_tempo_casamento', option_key: 'menos_3_anos', score: 15 },
      ]),
    getActiveVisaRules: () =>
      Promise.resolve([
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
    markCompleted: () => Promise.resolve(),
  }
}

function handlerFor(state: Parameters<typeof makeRepo>[0]) {
  return createComputeEligibilityHandler({
    repo: makeRepo(state),
    log: () => {},
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
