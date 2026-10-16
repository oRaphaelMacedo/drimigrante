/**
 * DI-053 — o /results nunca mostra o checkout para quem já pagou, nem enquanto
 * a conta ainda não foi confirmada.
 */
import { describe, expect, it } from 'vitest'
import { getAccessState, type AccessState } from '@/lib/access'
import { getResultsAccessView, showsCheckout, type ResultsAccessInput } from './results-access'

const NOW = Date.UTC(2026, 9, 16, 12)
const DAY = 24 * 60 * 60 * 1000

function sub(overrides: Partial<Parameters<typeof getAccessState>[0] & object> = {}) {
  return {
    one_time_paid: true,
    one_time_access_expires_at: new Date(NOW + 20 * DAY).toISOString(),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
    ...overrides,
  }
}

const NONE: AccessState = getAccessState(null, { now: NOW })

function input(overrides: Partial<ResultsAccessInput> = {}): ResultsAccessInput {
  return {
    loading: false,
    hasSession: false,
    mayHaveSession: false,
    userDataError: null,
    access: NONE,
    canOpenDashboard: false,
    ...overrides,
  }
}

describe('getResultsAccessView', () => {
  it('visitante sem login: oferta', () => {
    expect(getResultsAccessView(input())).toBe('none')
    expect(showsCheckout('none')).toBe(true)
  })

  it('logado sem compra: oferta', () => {
    expect(getResultsAccessView(input({ hasSession: true, mayHaveSession: true }))).toBe('none')
  })

  it.each([
    ['active', sub()],
    ['expiring', sub({ one_time_access_expires_at: new Date(NOW + 2 * DAY).toISOString() })],
    ['recurring', sub({ recurring_active: true, one_time_access_expires_at: new Date(NOW - DAY).toISOString() })],
  ])('acesso %s: painel, sem checkout', (_, subscription) => {
    const access = getAccessState(subscription, { now: NOW })
    const view = getResultsAccessView(input({ hasSession: true, access, canOpenDashboard: true }))
    expect(view).toBe('active')
    expect(showsCheckout(view)).toBe(false)
  })

  it('equipe (sem compra): painel', () => {
    const access = getAccessState(null, { isStaff: true, now: NOW })
    expect(getResultsAccessView(input({ hasSession: true, access }))).toBe('active')
  })

  it('pagou e o prazo acabou: painel com as opções (nunca a oferta de €30 de novo)', () => {
    const access = getAccessState(sub({ one_time_access_expires_at: new Date(NOW - DAY).toISOString() }), { now: NOW })
    const view = getResultsAccessView(input({ hasSession: true, access }))
    expect(view).toBe('expired')
    expect(showsCheckout(view)).toBe(false)
  })

  it('falha ao carregar a assinatura não vira "sem compra"', () => {
    const view = getResultsAccessView(input({ hasSession: true, userDataError: new Error('timeout') }))
    expect(view).toBe('unknown')
    expect(showsCheckout(view)).toBe(false)
  })

  it('carregando com sessão (ou sessão guardada): espera, sem checkout', () => {
    expect(getResultsAccessView(input({ loading: true, hasSession: true }))).toBe('checking')
    expect(getResultsAccessView(input({ loading: true, mayHaveSession: true }))).toBe('checking')
    expect(showsCheckout('checking')).toBe(false)
  })

  it('carregando sem nenhuma sessão no navegador: oferta já na primeira pintura', () => {
    expect(getResultsAccessView(input({ loading: true }))).toBe('none')
  })

  it('dados conhecidos vencem o loading de um refresh', () => {
    expect(getResultsAccessView(input({ loading: true, hasSession: true, canOpenDashboard: true }))).toBe('active')
  })

  it('aceita access ausente (mock parcial do AuthContext)', () => {
    expect(getResultsAccessView(input({ access: undefined }))).toBe('none')
  })
})
