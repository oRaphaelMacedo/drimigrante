// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasOpenedAnalysis, hasSeenWelcome, markAnalysisOpened, markWelcomeSeen } from './dashboard-storage'

afterEach(() => {
  window.localStorage.clear()
})

describe('dashboard-storage', () => {
  it('boas-vindas: não vistas até marcar, por conta', () => {
    expect(hasSeenWelcome('user-a')).toBe(false)
    markWelcomeSeen('user-a')
    expect(hasSeenWelcome('user-a')).toBe(true)
    expect(hasSeenWelcome('user-b')).toBe(false)
  })

  it('análise aberta: por conta', () => {
    expect(hasOpenedAnalysis('user-a')).toBe(false)
    markAnalysisOpened('user-a')
    expect(hasOpenedAnalysis('user-a')).toBe(true)
    expect(hasOpenedAnalysis('user-b')).toBe(false)
  })

  it('storage indisponível: não quebra e não repete as boas-vindas', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => markWelcomeSeen('user-a')).not.toThrow()
    expect(() => markAnalysisOpened('user-a')).not.toThrow()
    expect(hasSeenWelcome('user-a')).toBe(true)
    expect(hasOpenedAnalysis('user-a')).toBe(false)
  })
})
