// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ persist: vi.fn() }))
vi.mock('@/hooks/useAssessment', () => ({
  persistAssessment: (...args: unknown[]) => mocks.persist(...args),
}))
vi.mock('@/lib/attribution', () => ({ getAttribution: () => ({ utm_source: 'instagram' }) }))

import { sameEmail, updateAccessEmail, validateAccessEmail } from './access-email'
import { QUIZ_RESULT_KEY } from './quiz-submission'

function seed(overrides: Record<string, unknown> = {}) {
  localStorage.setItem(
    QUIZ_RESULT_KEY,
    JSON.stringify({
      sessionId: 'sessao-0001-abcdef',
      assessmentId: '00000000-0000-0000-0000-000000000001',
      answers: { processo_tipo: 'nacionalidade', caso_tipo: 'B' },
      score: { percentage: 62, category: 'alta' },
      leadInfo: { fullName: 'Maria Souza', email: 'maria@gmial.com', phone: '+5511999999999' },
      ...overrides,
    }),
  )
}

function stored() {
  return JSON.parse(localStorage.getItem(QUIZ_RESULT_KEY) ?? 'null')
}

beforeEach(() => {
  localStorage.clear()
  mocks.persist.mockReset()
})

describe('validateAccessEmail', () => {
  it('aceita e-mail válido (sem espaços) e recusa o resto em português', () => {
    expect(validateAccessEmail('  maria@gmail.com ')).toEqual({ ok: true, email: 'maria@gmail.com' })
    expect(validateAccessEmail('')).toMatchObject({ ok: false, message: 'Informe o e-mail de acesso.' })
    expect(validateAccessEmail('maria@')).toMatchObject({ ok: false })
    expect(validateAccessEmail('maria.gmail.com')).toMatchObject({ ok: false })
  })

  it('sameEmail ignora maiúsculas e espaços', () => {
    expect(sameEmail(' Maria@Gmail.com', 'maria@gmail.com')).toBe(true)
    expect(sameEmail('a@b.com', 'c@b.com')).toBe(false)
  })
})

describe('updateAccessEmail (DI-031)', () => {
  it('atualiza o localStorage e salva o diagnóstico com o e-mail novo', async () => {
    seed()
    mocks.persist.mockResolvedValue({ assessment: { id: '00000000-0000-0000-0000-000000000001' }, error: null })

    await expect(updateAccessEmail('maria@gmail.com')).resolves.toBe('saved')

    expect(stored().leadInfo).toEqual({ fullName: 'Maria Souza', email: 'maria@gmail.com', phone: '+5511999999999' })
    expect(mocks.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sessao-0001-abcdef',
        email: 'maria@gmail.com',
        fullName: 'Maria Souza',
        phone: '+5511999999999',
        answers: { processo_tipo: 'nacionalidade', caso_tipo: 'B' },
        utmSource: 'instagram',
      }),
    )
  })

  it('grava o assessmentId que faltava', async () => {
    seed({ assessmentId: null })
    mocks.persist.mockResolvedValue({ assessment: { id: 'novo-id' }, error: null })
    await updateAccessEmail('maria@gmail.com')
    expect(stored().assessmentId).toBe('novo-id')
  })

  it('falha ao salvar o diagnóstico não desfaz a troca neste aparelho', async () => {
    seed()
    mocks.persist.mockResolvedValue({ assessment: null, error: 'network error' })
    await expect(updateAccessEmail('maria@gmail.com')).resolves.toBe('saved_locally')
    expect(stored().leadInfo.email).toBe('maria@gmail.com')

    mocks.persist.mockRejectedValue(new Error('offline'))
    await expect(updateAccessEmail('maria2@gmail.com')).resolves.toBe('saved_locally')
    expect(stored().leadInfo.email).toBe('maria2@gmail.com')
  })

  it('demora demais: segue com a troca local', async () => {
    seed()
    mocks.persist.mockReturnValue(new Promise(() => undefined))
    await expect(updateAccessEmail('maria@gmail.com', { timeoutMs: 10 })).resolves.toBe('saved_locally')
    expect(stored().leadInfo.email).toBe('maria@gmail.com')
  })

  it('diagnóstico já ligado a uma conta: volta ao e-mail anterior', async () => {
    seed()
    mocks.persist.mockResolvedValue({ assessment: null, error: 'Assessment already linked to a user' })
    await expect(updateAccessEmail('outra@gmail.com')).resolves.toBe('linked')
    expect(stored().leadInfo.email).toBe('maria@gmial.com')
  })

  it('sem session_id utilizável: só a troca local', async () => {
    seed({ sessionId: 'curto' })
    await expect(updateAccessEmail('maria@gmail.com')).resolves.toBe('saved_locally')
    expect(mocks.persist).not.toHaveBeenCalled()
    expect(stored().leadInfo.email).toBe('maria@gmail.com')
  })

  it('resultado aberto pelo link (sem assessmentId): troca só no aparelho, sem criar diagnóstico', async () => {
    seed({ assessmentId: null, resumedAt: '2026-10-16T10:00:00.000Z' })
    await expect(updateAccessEmail('maria@gmail.com')).resolves.toBe('saved_locally')
    expect(mocks.persist).not.toHaveBeenCalled()
    expect(stored().leadInfo.email).toBe('maria@gmail.com')
    expect(stored().assessmentId).toBeNull()
  })

  it('sem resultado no aparelho: unavailable', async () => {
    await expect(updateAccessEmail('maria@gmail.com')).resolves.toBe('unavailable')
  })
})
