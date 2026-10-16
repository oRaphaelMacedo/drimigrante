import { describe, expect, it } from 'vitest'
import { getAccessState, type AccessSubscription } from '@/lib/access'
import { OFFER } from '@/lib/offer'
import {
  RECURRING_TERMS,
  accessUntilLabel,
  daysCountLabel,
  daysRemainingLabel,
  formatDayMonth,
  lockedFeatureHref,
  lowerFirst,
  parseUpsellParam,
  upsellHref,
  upsellOfferFor,
} from './dashboard-access'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0) // 16/10/2026 12:00 UTC

function oneTime(daysLeft: number, extra: Partial<AccessSubscription> = {}): AccessSubscription {
  return {
    one_time_paid: true,
    one_time_access_expires_at: new Date(NOW + daysLeft * DAY).toISOString(),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
    ...extra,
  }
}

const none = getAccessState(null, { now: NOW })
const active = getAccessState(oneTime(25), { now: NOW })
const expiring = getAccessState(oneTime(5), { now: NOW })
const expired = getAccessState(oneTime(-2), { now: NOW })
const recurring = getAccessState(oneTime(-40, { recurring_active: true }), { now: NOW })
const staff = getAccessState(null, { now: NOW, isStaff: true })

describe('formatação de datas e prazos', () => {
  it('formata dd/mm em pt-BR', () => {
    expect(formatDayMonth(new Date(Date.UTC(2026, 10, 10, 12)), 'UTC')).toBe('10/11')
  })

  it('rótulos de dias no singular, plural e último dia', () => {
    expect(daysCountLabel(25)).toBe('25 dias')
    expect(daysCountLabel(1)).toBe('1 dia')
    expect(daysCountLabel(0)).toBe('último dia')
    expect(daysRemainingLabel(5)).toBe('faltam 5 dias')
    expect(daysRemainingLabel(1)).toBe('falta 1 dia')
    expect(daysRemainingLabel(0)).toBe('último dia')
  })

  it('chip do acesso ativo: "Acesso até dd/mm (N dias)"', () => {
    expect(accessUntilLabel(active, 'UTC')).toBe('Acesso até 10/11 (25 dias)')
  })

  it('acesso sem data de fim (legado) não inventa prazo', () => {
    const legacy = getAccessState(oneTime(0, { one_time_access_expires_at: null }), { now: NOW })
    expect(accessUntilLabel(legacy)).toBe('Acesso ativo')
  })

  it('lowerFirst encaixa um item do OFFER no meio da frase', () => {
    expect(lowerFirst('Manter o painel')).toBe('manter o painel')
    expect(lowerFirst('')).toBe('')
  })
})

describe('oferta certa por estado', () => {
  it('quem não pagou recebe só o €30', () => {
    expect(upsellOfferFor(none)).toBe('one_time')
  })

  it('quem já pagou e não assina recebe o €4,90', () => {
    expect(upsellOfferFor(active)).toBe('recurring')
    expect(upsellOfferFor(expiring)).toBe('recurring')
    expect(upsellOfferFor(expired)).toBe('recurring')
  })

  it('assinante e equipe não recebem oferta', () => {
    expect(upsellOfferFor(recurring)).toBeNull()
    expect(upsellOfferFor(staff)).toBeNull()
  })

  it('condições do plano mensal vêm do OFFER.recurring, com cancelamento pelo suporte', () => {
    expect(RECURRING_TERMS).toBe(
      `${OFFER.recurring.priceLabel} · até ${OFFER.recurring.maxCycles} meses · cancelamento pelo suporte`,
    )
    expect(RECURRING_TERMS).toContain('€4,90/mês · até 12 meses')
    expect(RECURRING_TERMS).not.toMatch(/qualquer momento|ilimitad/i)
  })
})

describe('parâmetro ?upsell= e destinos bloqueados', () => {
  it('lê os valores conhecidos e ignora o resto', () => {
    expect(parseUpsellParam('chat')).toBe('chat')
    expect(parseUpsellParam('analise')).toBe('analysis')
    expect(parseUpsellParam('documentos')).toBe('documents')
    expect(parseUpsellParam('xpto')).toBeNull()
    expect(parseUpsellParam(null)).toBeNull()
  })

  it('upsellHref e parseUpsellParam são inversos', () => {
    for (const reason of ['chat', 'analysis', 'documents', 'plan'] as const) {
      const param = new URL(upsellHref(reason), 'https://x.test').searchParams.get('upsell')
      expect(parseUpsellParam(param)).toBe(reason)
    }
  })

  it('chat bloqueado leva a /dashboard?upsell=chat (nunca /checkout ou /results)', () => {
    expect(lockedFeatureHref('chat', none)).toBe('/dashboard?upsell=chat')
    expect(lockedFeatureHref('chat', active)).toBe('/dashboard?upsell=chat')
  })

  it('acesso expirado também abre o sheet (nunca um toque sem resposta no Início)', () => {
    expect(lockedFeatureHref('chat', expired)).toBe('/dashboard?upsell=chat')
    expect(lockedFeatureHref('full_analysis', expired)).toBe('/dashboard?upsell=analise')
  })

  it('análise e documentos bloqueados abrem a oferta no Início', () => {
    expect(lockedFeatureHref('full_analysis', none)).toBe('/dashboard?upsell=analise')
    expect(lockedFeatureHref('documents_read', none)).toBe('/dashboard?upsell=documentos')
  })
})
