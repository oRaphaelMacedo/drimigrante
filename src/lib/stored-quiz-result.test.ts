import { describe, expect, it } from 'vitest'
import {
  getLinkableAssessment,
  normalizeEmail,
  parseStoredQuizIdentity,
} from './stored-quiz-result'

const RAW = JSON.stringify({
  sessionId: 's_123_abc',
  assessmentId: 'a-1',
  leadInfo: { fullName: 'Ana', email: '  Ana.Souza@Example.com ', phone: '' },
  score: { percentage: 80 },
})

describe('parseStoredQuizIdentity', () => {
  it('extrai ids e e-mail normalizado', () => {
    expect(parseStoredQuizIdentity(RAW)).toEqual({
      assessmentId: 'a-1',
      sessionId: 's_123_abc',
      email: 'ana.souza@example.com',
    })
  })

  it('tolera JSON inválido, vazio ou sem leadInfo', () => {
    expect(parseStoredQuizIdentity(null)).toBeNull()
    expect(parseStoredQuizIdentity('')).toBeNull()
    expect(parseStoredQuizIdentity('{nope')).toBeNull()
    expect(parseStoredQuizIdentity('"texto"')).toBeNull()
    expect(parseStoredQuizIdentity(JSON.stringify({ assessmentId: 'a', sessionId: 's' }))).toEqual({
      assessmentId: 'a',
      sessionId: 's',
      email: null,
    })
  })
})

describe('getLinkableAssessment', () => {
  const stored = parseStoredQuizIdentity(RAW)

  it('vincula quando o e-mail do quiz é o da conta (sem diferenciar maiúsculas)', () => {
    expect(getLinkableAssessment(stored, 'ANA.SOUZA@example.com')).toEqual({
      assessmentId: 'a-1',
      sessionId: 's_123_abc',
    })
  })

  it('não vincula com e-mail diferente', () => {
    expect(getLinkableAssessment(stored, 'outra.pessoa@example.com')).toBeNull()
  })

  it('não vincula sem e-mail em algum dos lados', () => {
    expect(getLinkableAssessment(stored, null)).toBeNull()
    expect(getLinkableAssessment(stored, '')).toBeNull()
    expect(
      getLinkableAssessment({ assessmentId: 'a', sessionId: 's', email: null }, 'ana@example.com'),
    ).toBeNull()
  })

  it('não vincula sem assessmentId ou sessionId', () => {
    expect(
      getLinkableAssessment(
        { assessmentId: null, sessionId: 's', email: 'ana@example.com' },
        'ana@example.com',
      ),
    ).toBeNull()
    expect(getLinkableAssessment(null, 'ana@example.com')).toBeNull()
  })
})

describe('normalizeEmail', () => {
  it('apara e põe em minúsculas', () => {
    expect(normalizeEmail(' A@B.COM ')).toBe('a@b.com')
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})
