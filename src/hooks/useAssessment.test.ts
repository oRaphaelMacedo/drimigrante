/**
 * useAssessment — gravações anônimas pela RPC upsert_anon_assessment (Supabase
 * mockado; nada sai da máquina):
 *  - DI-037: lista de espera "Em breve" com session_id próprio (`${sid}-wl`),
 *    nunca com insert direto em `assessments` (barrado pela RLS);
 *  - DI-043: opt-in de novidades em p_answers.marketing_opt_in, sem mudar a
 *    assinatura do RPC.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }))

import { WAITLIST_SESSION_SUFFIX, joinWaitlist, persistAssessment, waitlistSessionId } from './useAssessment'

const SID = '0b6c3f4e-8a51-4c2b-9d7e-1f2a3b4c5d6e'

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { id: 'a-1' }, error: null })
  mocks.from.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('waitlistSessionId', () => {
  it('acrescenta -wl ao session_id do quiz', () => {
    expect(waitlistSessionId(SID)).toBe(`${SID}-wl`)
    expect(waitlistSessionId('s_1715000000000_abc1234')).toBe('s_1715000000000_abc1234-wl')
  })

  it('nunca passa de 64 caracteres (limite do RPC) e termina sempre em -wl', () => {
    const long = 'x'.repeat(64)
    const id = waitlistSessionId(long)
    expect(id).toHaveLength(64)
    expect(id.endsWith(WAITLIST_SESSION_SUFFIX)).toBe(true)
    expect(id).not.toBe(long)
  })
})

describe('joinWaitlist (DI-037)', () => {
  it('grava pela RPC anônima com session_id próprio e answers de lista de espera', async () => {
    const result = await joinWaitlist({
      quizSessionId: SID,
      email: '  ana@example.com ',
      processoTipo: 'visto',
      utmSource: 'instagram',
    })

    expect(result).toEqual({ ok: true, error: null })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = mocks.rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(fn).toBe('upsert_anon_assessment')
    expect(args).toMatchObject({
      p_session_id: `${SID}-wl`,
      p_answers: { processo_tipo: 'visto', waitlist: true },
      p_email: 'ana@example.com',
      p_status: 'incomplete',
      p_utm_source: 'instagram',
    })
    // Nada de insert direto em assessments (a RLS barra visitantes).
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('erro do servidor devolve ok=false (a tela não confirma)', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    const result = await joinWaitlist({ quizSessionId: SID, email: 'ana@example.com', processoTipo: 'nao_sei' })
    expect(result).toEqual({ ok: false, error: 'permission denied' })
  })
})

describe('persistAssessment — opt-in (DI-043)', () => {
  const base = {
    sessionId: SID,
    answers: { processo_tipo: 'nacionalidade', caso_tipo: 'B' },
    fullName: 'Ana',
    email: 'ana@example.com',
    questionsAnswered: 2,
    totalQuestions: 2,
  }

  it('opt-in desmarcado chega em p_answers como false', async () => {
    await persistAssessment({ ...base, marketingOptIn: false })
    const args = mocks.rpc.mock.calls[0][1] as { p_answers: Record<string, unknown> }
    expect(args.p_answers).toEqual({ processo_tipo: 'nacionalidade', caso_tipo: 'B', marketing_opt_in: false })
  })

  it('opt-in marcado chega como true; sem a informação, p_answers fica igual às respostas', async () => {
    await persistAssessment({ ...base, marketingOptIn: true })
    expect((mocks.rpc.mock.calls[0][1] as { p_answers: Record<string, unknown> }).p_answers.marketing_opt_in).toBe(true)

    await persistAssessment(base)
    expect((mocks.rpc.mock.calls[1][1] as { p_answers: Record<string, unknown> }).p_answers).toEqual(base.answers)
  })
})
