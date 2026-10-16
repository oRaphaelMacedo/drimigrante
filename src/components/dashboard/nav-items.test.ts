import { describe, expect, it } from 'vitest'
import { getAccessState, hasFeatureAccess, type AccessSubscription } from '@/lib/access'
import { resolveNavItems } from './nav-items'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 16, 12)

function sub(daysLeft: number | null, extra: Partial<AccessSubscription> = {}): AccessSubscription | null {
  if (daysLeft === null) return null
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

function resolve(pathname: string, subscription: AccessSubscription | null) {
  const access = getAccessState(subscription, { now: NOW })
  return resolveNavItems(pathname, access, (feature) => hasFeatureAccess(subscription, feature, { now: NOW }))
}

describe('resolveNavItems', () => {
  it('tem as 5 seções na ordem da barra inferior', () => {
    expect(resolve('/dashboard', sub(20)).map((item) => item.shortLabel)).toEqual([
      'Início',
      'Análise',
      'Chat',
      'Documentos',
      'Conta',
    ])
  })

  it('marca só o item da rota atual (Início é exato)', () => {
    const items = resolve('/dashboard/documents', sub(20))
    expect(items.filter((item) => item.active).map((item) => item.to)).toEqual(['/dashboard/documents'])
    expect(resolve('/dashboard', sub(20)).find((item) => item.to === '/dashboard')?.active).toBe(true)
  })

  it('pagante ativo: nada bloqueado, links diretos', () => {
    const items = resolve('/dashboard', sub(20))
    expect(items.every((item) => !item.locked)).toBe(true)
    expect(items.map((item) => item.href)).toEqual(items.map((item) => item.to))
  })

  it('não pagante: análise, chat e documentos com cadeado levando à oferta', () => {
    const items = resolve('/dashboard', null)
    const byTo = Object.fromEntries(items.map((item) => [item.to, item]))
    expect(byTo['/dashboard/analysis']).toMatchObject({ locked: true, href: '/dashboard?upsell=analise' })
    expect(byTo['/dashboard/chat']).toMatchObject({ locked: true, href: '/dashboard?upsell=chat' })
    expect(byTo['/dashboard/documents']).toMatchObject({ locked: true, href: '/dashboard?upsell=documentos' })
    expect(byTo['/dashboard/settings']).toMatchObject({ locked: false, href: '/dashboard/settings' })
  })

  it('pagante sem chat liberado: só o chat com cadeado', () => {
    const items = resolve('/dashboard', sub(20, { has_chat_access: false }))
    expect(items.filter((item) => item.locked).map((item) => item.to)).toEqual(['/dashboard/chat'])
  })

  it('expirado: documentos continuam abertos; análise e chat abrem a oferta no Início', () => {
    const items = resolve('/dashboard', sub(-1))
    const byTo = Object.fromEntries(items.map((item) => [item.to, item]))
    expect(byTo['/dashboard/documents'].locked).toBe(false)
    expect(byTo['/dashboard/analysis']).toMatchObject({ locked: true, href: '/dashboard?upsell=analise' })
    expect(byTo['/dashboard/chat']).toMatchObject({ locked: true, href: '/dashboard?upsell=chat' })
  })
})
