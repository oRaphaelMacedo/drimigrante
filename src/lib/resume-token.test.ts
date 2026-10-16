// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mocks.rpc(...args) },
}))

import {
  buildResumeUrl,
  buildResumedRecord,
  fetchAssessmentByResumeToken,
  fetchOwnResumeToken,
  isValidResumeToken,
  parseResumeRow,
  readStoredResumeToken,
  rememberResumeToken,
  storeResumedResult,
  withoutParams,
} from './resume-token'
import { QUIZ_RESULT_KEY } from './quiz-submission'

const TOKEN = 'a'.repeat(32) + '0123456789abcdef0123456789abcdef'
const ANSWERS = {
  processo_tipo: 'nacionalidade',
  caso_tipo: 'B',
  b1_tempo_casamento: 'mais_3_anos',
}
const ROW = {
  answers: ANSWERS,
  full_name: 'Maria Souza',
  email: 'maria@gmail.com',
  completed_at: '2026-10-10T10:00:00.000Z',
  score_numeric: '72.50',
  score_category: 'alta',
}

beforeEach(() => {
  localStorage.clear()
  mocks.rpc.mockReset()
})

describe('token e URL', () => {
  it('aceita só 64 caracteres hexadecimais minúsculos', () => {
    expect(isValidResumeToken(TOKEN)).toBe(true)
    expect(isValidResumeToken(TOKEN.toUpperCase())).toBe(false)
    expect(isValidResumeToken(TOKEN.slice(1))).toBe(false)
    expect(isValidResumeToken(`${TOKEN.slice(1)}g`)).toBe(false)
    expect(isValidResumeToken(null)).toBe(false)
  })

  it('monta o link de retomada e limpa parâmetros da busca', () => {
    expect(buildResumeUrl(TOKEN, 'https://drimigrante.com/')).toBe(`https://drimigrante.com/results?r=${TOKEN}`)
    expect(withoutParams(`?r=${TOKEN}`, ['r'])).toBe('')
    expect(withoutParams(`?r=${TOKEN}&checkout=cancelled&utm_source=x`, ['r', 'checkout'])).toBe('?utm_source=x')
  })
})

describe('parseResumeRow', () => {
  it('normaliza a linha da RPC', () => {
    expect(parseResumeRow(ROW)).toEqual({
      answers: ANSWERS,
      fullName: 'Maria Souza',
      email: 'maria@gmail.com',
      completedAt: '2026-10-10T10:00:00.000Z',
      scorePercentage: 72.5,
      scoreCategory: 'alta',
    })
  })

  it('sem respostas não há resultado; categoria inválida vira null', () => {
    expect(parseResumeRow({ ...ROW, answers: null })).toBeNull()
    expect(parseResumeRow(null)).toBeNull()
    expect(parseResumeRow({ ...ROW, score_category: '?' })?.scoreCategory).toBeNull()
    expect(parseResumeRow({ ...ROW, email: 'sem-arroba' })?.email).toBeNull()
  })
})

describe('buildResumedRecord', () => {
  it('session_id novo, sem assessmentId e vias recalculadas das respostas', () => {
    const data = parseResumeRow(ROW)!
    const record = buildResumedRecord(data, TOKEN, { now: new Date('2026-10-16T12:00:00Z'), createId: () => 'novo-session-1234' })
    expect(record).toMatchObject({
      sessionId: 'novo-session-1234',
      assessmentId: null,
      answers: ANSWERS,
      score: { percentage: 73, category: 'alta' },
      leadInfo: { fullName: 'Maria Souza', email: 'maria@gmail.com' },
      resume: { token: TOKEN, assessmentId: null },
    })
    expect((record.visas as Array<{ code: string }>).map((v) => v.code)).toEqual(['nacionalidade_casamento'])
  })

  it('sem score do servidor (ou 0), recalcula das respostas', () => {
    const data = parseResumeRow({ ...ROW, score_numeric: 0, score_category: 'baixa' })!
    const record = buildResumedRecord(data, TOKEN, { createId: () => 'x'.repeat(10) })
    expect(record.score).toMatchObject({ percentage: 100, category: 'alta' })
  })
})

describe('fetchAssessmentByResumeToken', () => {
  it('ok: devolve o resultado da RPC', async () => {
    mocks.rpc.mockResolvedValue({ data: [ROW], error: null })
    const outcome = await fetchAssessmentByResumeToken(TOKEN)
    expect(mocks.rpc).toHaveBeenCalledWith('get_assessment_by_resume_token', { p_token: TOKEN })
    expect(outcome).toMatchObject({ kind: 'ok', data: { email: 'maria@gmail.com' } })
  })

  it('token inexistente ou RPC ausente → not_found; rede → error', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    expect(await fetchAssessmentByResumeToken(TOKEN)).toEqual({ kind: 'not_found' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect(await fetchAssessmentByResumeToken(TOKEN)).toEqual({ kind: 'not_found' })
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: Failed to fetch' } })
    expect(await fetchAssessmentByResumeToken(TOKEN)).toEqual({ kind: 'error' })
    mocks.rpc.mockRejectedValueOnce(new Error('offline'))
    expect(await fetchAssessmentByResumeToken(TOKEN)).toEqual({ kind: 'error' })
  })

  it('token malformado nem chama a RPC', async () => {
    expect(await fetchAssessmentByResumeToken('abc')).toEqual({ kind: 'not_found' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('token do aparelho do quiz', () => {
  it('vem de get_anon_assessment (posse pelo session_id)', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: 'a1', resume_token: TOKEN }], error: null })
    expect(await fetchOwnResumeToken('a1', 'sessao-12345678')).toBe(TOKEN)
    expect(mocks.rpc).toHaveBeenCalledWith('get_anon_assessment', { p_id: 'a1', p_session_id: 'sessao-12345678' })
  })

  it('sem a coluna (migration não aplicada) ou com erro → null', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ id: 'a1' }], error: null })
    expect(await fetchOwnResumeToken('a1', 'sessao-12345678')).toBeNull()
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect(await fetchOwnResumeToken('a1', 'sessao-12345678')).toBeNull()
  })

  it('guarda o token só para o mesmo assessment', () => {
    localStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify({ sessionId: 's', assessmentId: 'a1', score: {} }))
    rememberResumeToken(TOKEN, 'a1')
    expect(readStoredResumeToken()).toBe(TOKEN)

    rememberResumeToken('b'.repeat(64), 'outro')
    expect(readStoredResumeToken()).toBe(TOKEN)

    // Resultado novo (outro quiz) no mesmo aparelho: o token antigo não vale.
    const stored = JSON.parse(localStorage.getItem(QUIZ_RESULT_KEY)!)
    localStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify({ ...stored, assessmentId: 'a2' }))
    expect(readStoredResumeToken()).toBeNull()
  })

  it('resultado aberto pelo link guarda o próprio token', () => {
    storeResumedResult(parseResumeRow(ROW)!, TOKEN)
    expect(readStoredResumeToken()).toBe(TOKEN)
    expect(JSON.parse(localStorage.getItem(QUIZ_RESULT_KEY)!).assessmentId).toBeNull()
  })
})
