/**
 * Itens de navegação do dashboard, compartilhados pela barra inferior (celular)
 * e pela barra lateral (desktop). DI-045.
 */
import { FileText, FolderUp, LayoutDashboard, MessageSquare, UserRound, type LucideIcon } from 'lucide-react'
import type { AccessFeature, AccessState } from '@/lib/access'
import { lockedFeatureHref } from './dashboard-access'

export interface DashboardNavItem {
  to: string
  icon: LucideIcon
  /** Rótulo da barra lateral. */
  label: string
  /** Rótulo curto da barra inferior (cabe em 5 colunas a 360px). */
  shortLabel: string
  /** Só marca como ativo no caminho exato (Início). */
  exact?: boolean
  /** Funcionalidade exigida; sem ela o item aparece com cadeado. */
  feature?: AccessFeature
}

export const DASHBOARD_NAV_ITEMS: readonly DashboardNavItem[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Início', shortLabel: 'Início', exact: true },
  { to: '/dashboard/analysis', icon: FileText, label: 'Minha análise', shortLabel: 'Análise', feature: 'full_analysis' },
  { to: '/dashboard/chat', icon: MessageSquare, label: 'Chat IA', shortLabel: 'Chat', feature: 'chat' },
  { to: '/dashboard/documents', icon: FolderUp, label: 'Documentos', shortLabel: 'Documentos', feature: 'documents_read' },
  { to: '/dashboard/settings', icon: UserRound, label: 'Conta', shortLabel: 'Conta' },
]

export interface ResolvedNavItem extends DashboardNavItem {
  href: string
  locked: boolean
  active: boolean
}

/**
 * Calcula destino, cadeado e estado ativo de cada item. Item bloqueado não
 * leva à rota (que redirecionaria): abre direto a oferta certa no Início.
 */
export function resolveNavItems(
  pathname: string,
  access: AccessState,
  hasAccess: (feature: AccessFeature) => boolean,
): ResolvedNavItem[] {
  return DASHBOARD_NAV_ITEMS.map((item) => {
    const locked = item.feature ? !hasAccess(item.feature) : false
    const matches = item.exact
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(`${item.to}/`)
    return {
      ...item,
      locked,
      href: locked && item.feature ? lockedFeatureHref(item.feature, access) : item.to,
      active: matches && !locked,
    }
  })
}
