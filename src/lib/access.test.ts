import { describe, expect, it } from 'vitest'
import {
  accessDeniedRedirect,
  canOfferRecurring,
  EXPIRING_SOON_DAYS,
  getAccessState,
  hasActiveAccess,
  hasFeatureAccess,
  nextAccessChangeAt,
  routeFeature,
  type AccessFeature,
  type AccessSubscription,
} from './access'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-10-16T12:00:00.000Z')

function iso(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString()
}

/** Linha típica gravada pelo stripe-webhook depois do €30. */
function oneTime(overrides: Partial<AccessSubscription> = {}): AccessSubscription {
  return {
    one_time_paid: true,
    one_time_access_expires_at: iso(20 * DAY),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
    ...overrides,
  }
}

const ALL_FEATURES: AccessFeature[] = [
  'dashboard',
  'full_analysis',
  'chat',
  'documents_read',
  'documents_upload',
]

describe('getAccessState', () => {
  it('none: sem linha de assinatura', () => {
    expect(getAccessState(null, { now: NOW })).toEqual({
      state: 'none',
      expiresAt: null,
      daysLeft: null,
      hasPaidOnce: false,
      isStaff: false,
    })
    expect(getAccessState(undefined, { now: NOW }).state).toBe('none')
  })

  it('none: linha criada sem pagamento nem flags', () => {
    const sub = oneTime({
      one_time_paid: false,
      one_time_access_expires_at: null,
      has_dashboard_access: false,
      has_full_analysis: false,
      has_chat_access: false,
    })
    expect(getAccessState(sub, { now: NOW }).state).toBe('none')
  })

  it('active: €30 com mais de 7 dias restantes', () => {
    const access = getAccessState(oneTime(), { now: NOW })
    expect(access.state).toBe('active')
    expect(access.daysLeft).toBe(20)
    expect(access.expiresAt?.toISOString()).toBe(iso(20 * DAY))
    expect(access.hasPaidOnce).toBe(true)
  })

  it('active: arredonda dias para cima', () => {
    const access = getAccessState(oneTime({ one_time_access_expires_at: iso(29.5 * DAY) }), {
      now: NOW,
    })
    expect(access.daysLeft).toBe(30)
  })

  it('active: registro legado sem data de fim', () => {
    const access = getAccessState(oneTime({ one_time_access_expires_at: null }), { now: NOW })
    expect(access).toMatchObject({ state: 'active', expiresAt: null, daysLeft: null })
  })

  it('active: data inválida no banco não tira o acesso', () => {
    const access = getAccessState(oneTime({ one_time_access_expires_at: 'not-a-date' }), {
      now: NOW,
    })
    expect(access).toMatchObject({ state: 'active', expiresAt: null })
  })

  it(`expiring: ${EXPIRING_SOON_DAYS} dias ou menos`, () => {
    expect(
      getAccessState(oneTime({ one_time_access_expires_at: iso(3 * DAY) }), { now: NOW }),
    ).toMatchObject({ state: 'expiring', daysLeft: 3 })
    expect(
      getAccessState(oneTime({ one_time_access_expires_at: iso(EXPIRING_SOON_DAYS * DAY) }), {
        now: NOW,
      }),
    ).toMatchObject({ state: 'expiring', daysLeft: EXPIRING_SOON_DAYS })
    expect(
      getAccessState(
        oneTime({ one_time_access_expires_at: iso(EXPIRING_SOON_DAYS * DAY + 1) }),
        { now: NOW },
      ),
    ).toMatchObject({ state: 'active', daysLeft: EXPIRING_SOON_DAYS + 1 })
  })

  it('expiring: now == expires_at ainda tem acesso', () => {
    const sub = oneTime({ one_time_access_expires_at: NOW.toISOString() })
    expect(getAccessState(sub, { now: NOW })).toMatchObject({ state: 'expiring', daysLeft: 0 })
    expect(hasFeatureAccess(sub, 'dashboard', { now: NOW })).toBe(true)
    expect(hasFeatureAccess(sub, 'full_analysis', { now: NOW })).toBe(true)
  })

  it('expired: 1 ms depois de expires_at', () => {
    const sub = oneTime({ one_time_access_expires_at: NOW.toISOString() })
    const access = getAccessState(sub, { now: NOW.getTime() + 1 })
    expect(access).toMatchObject({ state: 'expired', daysLeft: 0, hasPaidOnce: true })
    expect(access.expiresAt?.toISOString()).toBe(NOW.toISOString())
  })

  it('expired: mesmo se as flags tiverem sido desligadas depois do prazo', () => {
    const sub = oneTime({
      one_time_access_expires_at: iso(-2 * DAY),
      has_dashboard_access: false,
      has_full_analysis: false,
      has_chat_access: false,
    })
    expect(getAccessState(sub, { now: NOW }).state).toBe('expired')
  })

  it('none: pagamento revogado dentro do prazo (reembolso)', () => {
    const sub = oneTime({
      has_dashboard_access: false,
      has_full_analysis: false,
      has_chat_access: false,
    })
    expect(getAccessState(sub, { now: NOW }).state).toBe('none')
  })

  it('recurring: assinatura ativa ignora o prazo do €30', () => {
    const sub = oneTime({ recurring_active: true, one_time_access_expires_at: iso(-40 * DAY) })
    expect(getAccessState(sub, { now: NOW })).toMatchObject({
      state: 'recurring',
      expiresAt: null,
      daysLeft: null,
    })
  })

  it('staff: sempre active, sem prazo, mesmo sem assinatura', () => {
    expect(getAccessState(null, { isStaff: true, now: NOW })).toEqual({
      state: 'active',
      expiresAt: null,
      daysLeft: null,
      hasPaidOnce: false,
      isStaff: true,
    })
    const expired = oneTime({ one_time_access_expires_at: iso(-10 * DAY) })
    expect(getAccessState(expired, { isStaff: true, now: NOW }).state).toBe('active')
  })

  it('usa o relógio atual quando now não é informado', () => {
    const sub = oneTime({ one_time_access_expires_at: new Date(Date.now() + 15 * DAY).toISOString() })
    expect(getAccessState(sub).state).toBe('active')
  })
})

describe('hasFeatureAccess', () => {
  it('none: nada liberado', () => {
    for (const feature of ALL_FEATURES) {
      expect(hasFeatureAccess(null, feature, { now: NOW })).toBe(false)
    }
  })

  it('active: segue as flags do banco (chat depende de has_chat_access)', () => {
    const withChat = oneTime()
    for (const feature of ALL_FEATURES) {
      expect(hasFeatureAccess(withChat, feature, { now: NOW })).toBe(true)
    }
    const withoutChat = oneTime({ has_chat_access: false })
    expect(hasFeatureAccess(withoutChat, 'chat', { now: NOW })).toBe(false)
    expect(hasFeatureAccess(withoutChat, 'full_analysis', { now: NOW })).toBe(true)
  })

  it('expired: só documents_read continua (baixar/apagar os próprios arquivos)', () => {
    const sub = oneTime({ one_time_access_expires_at: iso(-1 * DAY) })
    expect(hasFeatureAccess(sub, 'documents_read', { now: NOW })).toBe(true)
    expect(hasFeatureAccess(sub, 'documents_upload', { now: NOW })).toBe(false)
    expect(hasFeatureAccess(sub, 'dashboard', { now: NOW })).toBe(false)
    expect(hasFeatureAccess(sub, 'full_analysis', { now: NOW })).toBe(false)
    expect(hasFeatureAccess(sub, 'chat', { now: NOW })).toBe(false)
  })

  it('não pagante continua sem documents_read', () => {
    expect(hasFeatureAccess(null, 'documents_read', { now: NOW })).toBe(false)
  })

  it('recurring: tudo liberado', () => {
    const sub = oneTime({ recurring_active: true, one_time_access_expires_at: iso(-40 * DAY) })
    for (const feature of ALL_FEATURES) {
      expect(hasFeatureAccess(sub, feature, { now: NOW })).toBe(true)
    }
  })

  it('staff: tudo liberado, mesmo sem assinatura', () => {
    for (const feature of ALL_FEATURES) {
      expect(hasFeatureAccess(null, feature, { isStaff: true, now: NOW })).toBe(true)
    }
  })
})

describe('hasActiveAccess e canOfferRecurring', () => {
  it('€4,90 só para quem já pagou o €30 e não assina', () => {
    const active = getAccessState(oneTime(), { now: NOW })
    const expiring = getAccessState(oneTime({ one_time_access_expires_at: iso(2 * DAY) }), {
      now: NOW,
    })
    const expired = getAccessState(oneTime({ one_time_access_expires_at: iso(-2 * DAY) }), {
      now: NOW,
    })
    const recurring = getAccessState(oneTime({ recurring_active: true }), { now: NOW })
    const none = getAccessState(null, { now: NOW })
    const staff = getAccessState(null, { isStaff: true, now: NOW })

    expect(canOfferRecurring(active)).toBe(true)
    expect(canOfferRecurring(expiring)).toBe(true)
    expect(canOfferRecurring(expired)).toBe(true)
    expect(canOfferRecurring(recurring)).toBe(false)
    expect(canOfferRecurring(none)).toBe(false)
    expect(canOfferRecurring(staff)).toBe(false)

    expect(hasActiveAccess(active)).toBe(true)
    expect(hasActiveAccess(expiring)).toBe(true)
    expect(hasActiveAccess(recurring)).toBe(true)
    expect(hasActiveAccess(staff)).toBe(true)
    expect(hasActiveAccess(expired)).toBe(false)
    expect(hasActiveAccess(none)).toBe(false)
  })

  it('flags legadas sem one_time_paid não recebem a oferta de €4,90', () => {
    const legacy = getAccessState(
      oneTime({ one_time_paid: false, one_time_access_expires_at: null }),
      { now: NOW },
    )
    expect(legacy.state).toBe('active')
    expect(canOfferRecurring(legacy)).toBe(false)
  })
})

describe('routeFeature', () => {
  it('/dashboard/documents com requireFeature="dashboard" vira documents_read', () => {
    expect(routeFeature('dashboard', '/dashboard/documents')).toBe('documents_read')
    expect(routeFeature('dashboard', '/dashboard/documents/123')).toBe('documents_read')
  })

  it('outras rotas e funcionalidades ficam como estão', () => {
    expect(routeFeature('dashboard', '/dashboard')).toBe('dashboard')
    expect(routeFeature('dashboard', '/dashboard/documentsx')).toBe('dashboard')
    expect(routeFeature('chat', '/dashboard/documents')).toBe('chat')
    expect(routeFeature('full_analysis', '/dashboard/analysis')).toBe('full_analysis')
  })

  it('pagante expirado abre documentos; não pagante continua sem acesso', () => {
    const expired = oneTime({ one_time_access_expires_at: iso(-3 * DAY) })
    const feature = routeFeature('dashboard', '/dashboard/documents')
    expect(hasFeatureAccess(expired, feature, { now: NOW })).toBe(true)
    expect(hasFeatureAccess(null, feature, { now: NOW })).toBe(false)
  })
})

describe('accessDeniedRedirect', () => {
  const none = getAccessState(null, { now: NOW })
  const activeNoChat = getAccessState(oneTime({ has_chat_access: false }), { now: NOW })
  const expired = getAccessState(oneTime({ one_time_access_expires_at: iso(-1 * DAY) }), {
    now: NOW,
  })

  it('chat sem acesso → /dashboard?upsell=chat', () => {
    expect(accessDeniedRedirect('chat', none)).toBe('/dashboard?upsell=chat')
    expect(accessDeniedRedirect('chat', activeNoChat)).toBe('/dashboard?upsell=chat')
  })

  it('acesso expirado → /dashboard?acesso=expirado (inclusive no chat)', () => {
    expect(accessDeniedRedirect('full_analysis', expired)).toBe('/dashboard?acesso=expirado')
    expect(accessDeniedRedirect('chat', expired)).toBe('/dashboard?acesso=expirado')
  })

  it('nunca manda para /checkout nem /results', () => {
    for (const access of [none, activeNoChat, expired]) {
      for (const feature of ALL_FEATURES) {
        const target = accessDeniedRedirect(feature, access)
        expect(target.startsWith('/dashboard')).toBe(true)
        expect(target).not.toMatch(/checkout|results/)
      }
    }
  })
})

describe('nextAccessChangeAt', () => {
  const at = (sub: AccessSubscription | null, now: number) =>
    nextAccessChangeAt(sub, { now })?.getTime() ?? null

  it('próximo dia a menos em daysLeft (o estado na data devolvida já mudou)', () => {
    const sub = oneTime({ one_time_access_expires_at: iso(20 * DAY + 6 * 60 * 60 * 1000) })
    const next = at(sub, NOW.getTime())
    expect(next).toBe(NOW.getTime() + 6 * 60 * 60 * 1000)
    expect(getAccessState(sub, { now: NOW.getTime() }).daysLeft).toBe(21)
    expect(getAccessState(sub, { now: (next as number) - 1 }).daysLeft).toBe(21)
    expect(getAccessState(sub, { now: next as number }).daysLeft).toBe(20)
  })

  it('com dias exatos, a mudança é 1 dia depois (nunca o próprio instante)', () => {
    const sub = oneTime({ one_time_access_expires_at: iso(20 * DAY) })
    expect(at(sub, NOW.getTime())).toBe(NOW.getTime() + DAY)
  })

  it(`entrada em 'expiring' quando faltam ${EXPIRING_SOON_DAYS} dias`, () => {
    const sub = oneTime({ one_time_access_expires_at: iso(EXPIRING_SOON_DAYS * DAY + 1000) })
    const next = at(sub, NOW.getTime()) as number
    expect(getAccessState(sub, { now: NOW.getTime() }).state).toBe('active')
    expect(getAccessState(sub, { now: next }).state).toBe('expiring')
  })

  it("fim do acesso: em expires_at ainda tem acesso; 1 ms depois vira 'expired'", () => {
    const sub = oneTime({ one_time_access_expires_at: iso(1000) })
    const end = NOW.getTime() + 1000
    expect(at(sub, NOW.getTime())).toBe(end)
    expect(at(sub, end)).toBe(end + 1)
    expect(getAccessState(sub, { now: end + 1 }).state).toBe('expired')
  })

  it('pagou com flags revogadas: muda só ao passar o prazo', () => {
    const sub = oneTime({
      has_dashboard_access: false,
      has_full_analysis: false,
      has_chat_access: false,
    })
    const end = NOW.getTime() + 20 * DAY
    expect(at(sub, NOW.getTime())).toBe(end + 1)
    expect(getAccessState(sub, { now: end + 1 }).state).toBe('expired')
  })

  it('null quando o estado não muda com o tempo', () => {
    expect(at(null, NOW.getTime())).toBeNull()
    expect(at(oneTime({ one_time_access_expires_at: iso(-DAY) }), NOW.getTime())).toBeNull()
    expect(at(oneTime({ one_time_access_expires_at: null }), NOW.getTime())).toBeNull()
    expect(at(oneTime({ recurring_active: true }), NOW.getTime())).toBeNull()
    expect(
      nextAccessChangeAt(oneTime(), { now: NOW.getTime(), isStaff: true }),
    ).toBeNull()
    expect(
      at(
        oneTime({
          one_time_paid: false,
          has_dashboard_access: false,
          has_full_analysis: false,
          has_chat_access: false,
        }),
        NOW.getTime(),
      ),
    ).toBeNull()
  })
})
