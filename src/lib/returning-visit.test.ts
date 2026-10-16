/**
 * DI-053 — regras do banner de visitante que voltou.
 */
import { describe, expect, it } from 'vitest'
import {
  RETURNING_BANNER_DISMISS_KEY,
  dayStamp,
  dismissReturningBanner,
  formatVisitDate,
  isReturningBannerDismissed,
  isReturningBannerRoute,
  parseReturningVisit,
  readReturningVisit,
  returningBannerText,
} from './returning-visit'
import { QUIZ_RESULT_STORAGE_KEY } from './stored-quiz-result'

const DAY = 24 * 60 * 60 * 1000

function stored(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    sessionId: 'sessao-0001',
    assessmentId: '00000000-0000-0000-0000-000000000001',
    score: { total: 80, max: 100, percentage: 80, category: 'alta' },
    leadInfo: { fullName: '  Maria   Souza ', email: 'maria@example.com' },
    completedAt: '2026-10-16T10:00:00.000Z',
    ...overrides,
  })
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    data,
  }
}

describe('parseReturningVisit', () => {
  it('lê primeiro nome, data e a chave do envio', () => {
    const visit = parseReturningVisit(stored())
    expect(visit).toEqual({
      key: 'sessao-0001',
      firstName: 'Maria',
      completedAt: new Date('2026-10-16T10:00:00.000Z'),
    })
  })

  it('sem resultado válido (o /results não abriria): null', () => {
    expect(parseReturningVisit(null)).toBeNull()
    expect(parseReturningVisit('{')).toBeNull()
    expect(parseReturningVisit('[]')).toBeNull()
    expect(parseReturningVisit(stored({ score: null }))).toBeNull()
    expect(parseReturningVisit(stored({ score: { percentage: 'oitenta' } }))).toBeNull()
    expect(parseReturningVisit(stored({ score: { percentage: Number.NaN } }))).toBeNull()
  })

  it('sem nome, nome enorme ou data inválida: campos nulos, banner neutro', () => {
    expect(parseReturningVisit(stored({ leadInfo: null }))?.firstName).toBeNull()
    expect(parseReturningVisit(stored({ leadInfo: { fullName: 'A'.repeat(40) } }))?.firstName).toBeNull()
    expect(parseReturningVisit(stored({ completedAt: 'ontem' }))?.completedAt).toBeNull()
  })

  it('chave cai para assessmentId e depois para a data', () => {
    expect(parseReturningVisit(stored({ sessionId: null }))?.key).toBe('00000000-0000-0000-0000-000000000001')
    expect(parseReturningVisit(stored({ sessionId: null, assessmentId: null }))?.key).toBe('2026-10-16T10:00:00.000Z')
  })

  it('readReturningVisit lê a chave do quiz e não lança com storage quebrado', () => {
    expect(readReturningVisit(memoryStorage({ [QUIZ_RESULT_STORAGE_KEY]: stored() }))?.firstName).toBe('Maria')
    expect(
      readReturningVisit({
        getItem: () => {
          throw new Error('SecurityError')
        },
      }),
    ).toBeNull()
    expect(readReturningVisit(null)).toBeNull()
  })
})

describe('rotas', () => {
  it.each(['/', '/termos', '/privacidade', '/cookies', '/qualquer-coisa'])('%s mostra', (path) => {
    expect(isReturningBannerRoute(path)).toBe(true)
  })
  it.each(['/quiz', '/results', '/checkout', '/checkout/success', '/login', '/auth/callback'])('%s esconde', (path) => {
    expect(isReturningBannerRoute(path)).toBe(false)
  })
  it('não confunde prefixos parecidos', () => {
    expect(isReturningBannerRoute('/quizzes')).toBe(true)
  })
})

describe('dispensar por 7 dias', () => {
  const now = Date.UTC(2026, 9, 16, 12)

  it('some por 7 dias e volta depois', () => {
    const storage = memoryStorage()
    const visit = { key: 'sessao-0001' }
    expect(isReturningBannerDismissed(visit, storage, now)).toBe(false)
    dismissReturningBanner(visit, storage, now)
    expect(JSON.parse(storage.data.get(RETURNING_BANNER_DISMISS_KEY) ?? '{}')).toEqual({ key: 'sessao-0001', at: now })
    expect(isReturningBannerDismissed(visit, storage, now + 6 * DAY)).toBe(true)
    expect(isReturningBannerDismissed(visit, storage, now + 7 * DAY)).toBe(false)
  })

  it('um resultado novo (outro envio do quiz) volta a mostrar', () => {
    const storage = memoryStorage()
    dismissReturningBanner({ key: 'sessao-0001' }, storage, now)
    expect(isReturningBannerDismissed({ key: 'sessao-0002' }, storage, now + DAY)).toBe(false)
  })

  it('registro corrompido conta como não dispensado', () => {
    const storage = memoryStorage({ [RETURNING_BANNER_DISMISS_KEY]: '{"key":1}' })
    expect(isReturningBannerDismissed({ key: 'sessao-0001' }, storage, now)).toBe(false)
  })
})

describe('textos', () => {
  const now = new Date(2026, 9, 20)

  it('data dd/mm no ano corrente e dd/mm/aaaa em outro ano', () => {
    expect(formatVisitDate(new Date(2026, 9, 16, 10), now)).toBe('16/10')
    expect(formatVisitDate(new Date(2025, 11, 3, 10), now)).toBe('03/12/2025')
  })

  it('com nome (o nome entra antes, em destaque) e sem nome', () => {
    expect(returningBannerText({ firstName: 'Maria', completedAt: new Date(2026, 9, 16) }, now)).toBe(
      'seu pré-diagnóstico de 16/10 está guardado neste aparelho.',
    )
    expect(returningBannerText({ firstName: null, completedAt: null }, now)).toBe(
      'Seu pré-diagnóstico está guardado neste aparelho.',
    )
  })

  it('não promete e-mail (o aviso de e-mail só vem com envio confirmado)', () => {
    expect(returningBannerText({ firstName: 'Maria', completedAt: new Date(2026, 9, 16) }, now)).not.toMatch(/e-?mail/i)
  })

  it('dayStamp no dia local', () => {
    expect(dayStamp(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})
