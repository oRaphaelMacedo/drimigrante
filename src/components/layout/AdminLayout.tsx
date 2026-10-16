/**
 * Layout do admin (DI-073), no mesmo padrão visual do DashboardLayout.
 *
 * - Desktop (≥768px): barra lateral com as 7 seções.
 * - Celular: cabeçalho fixo com o botão de menu (44px) que abre um painel
 *   lateral (Radix Dialog) com as mesmas seções, a conta e o "Sair".
 * - `min-w-0` na coluna do conteúdo: tabelas e o kanban rolam dentro do próprio
 *   card, sem alargar a página no celular.
 * - ScrollRestoration: cada página nova começa no topo; o "voltar" restaura a rolagem.
 */
import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import {
  Brain,
  Building2,
  ChevronRight,
  Kanban,
  LayoutDashboard,
  ListChecks,
  Menu,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { BrandMark } from '@/components/layout/BrandLogo'
import { useAuth } from '@/hooks/useAuth'
import { cn, getInitials } from '@/lib/utils'

interface AdminNavItem {
  to: string
  icon: LucideIcon
  label: string
  /** Só ativo na rota exata (a visão geral é prefixo de todas). */
  exact?: boolean
}

// O layout faz parte do chunk de entrada (router): o painel (Radix Dialog) só é
// baixado no primeiro toque no menu, para não pesar no funil público.
const loadDrawer = () => import('@/components/admin/AdminDrawer')
const AdminDrawer = lazy(() => loadDrawer().then((m) => ({ default: m.AdminDrawer })))

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Visão geral', exact: true },
  { to: '/admin/leads', icon: Users, label: 'Leads' },
  { to: '/admin/pipeline', icon: Kanban, label: 'Pipeline' },
  { to: '/admin/quiz', icon: ListChecks, label: 'Quiz' },
  { to: '/admin/tenants', icon: Building2, label: 'Escritórios' },
  { to: '/admin/ai-config', icon: Brain, label: 'Configuração de IA' },
  { to: '/admin/settings', icon: Settings, label: 'Configurações' },
]

function isItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.to || pathname === `${item.to}/`
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Superadmin',
  hub_admin: 'Admin do hub',
}

function AdminNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {ADMIN_NAV_ITEMS.map((item) => {
        const active = isItemActive(item, pathname)
        const Icon = item.icon
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'bg-primary/[.08] text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {item.label}
              {active && <ChevronRight aria-hidden="true" className="ml-auto h-3.5 w-3.5" />}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function AdminLayout() {
  const { authUser } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [drawerMounted, setDrawerMounted] = useState(false)

  const openMenu = () => {
    setDrawerMounted(true)
    setMenuOpen(true)
  }
  // Adianta o download quando o dedo/mouse chega no botão.
  const preloadDrawer = () => {
    void loadDrawer().catch(() => undefined)
  }

  // Mudou de rota (link do menu, "voltar"): o painel fecha.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const displayName = authUser?.profile?.full_name?.trim() || 'Admin'
  const role = authUser?.roles[0]
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : null
  const sectionLabel = ADMIN_NAV_ITEMS.find((item) => isItemActive(item, pathname))?.label ?? 'Admin'

  const account = (
    <div className="flex items-center gap-3 rounded-xl px-2 py-1">
      <div
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/[.08] text-xs font-semibold text-primary"
      >
        {getInitials(authUser?.profile?.full_name || authUser?.user.email || 'A')}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{roleLabel ?? authUser?.user.email}</p>
      </div>
      <SignOutButton variant="icon" />
    </div>
  )

  return (
    <div className="flex min-h-dvh bg-background">
      <ScrollRestoration />

      {/* Barra lateral (desktop) */}
      <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <Link
            to="/admin"
            className="inline-flex min-h-11 items-center gap-2 rounded-md text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark className="h-7 w-7" />
            <span>
              Doutor Imigrante <span className="ml-0.5 text-xs font-medium text-muted-foreground">Admin</span>
            </span>
          </Link>
        </div>

        <nav aria-label="Navegação do admin" className="flex-1 px-3 py-4">
          <AdminNav pathname={pathname} />
        </nav>

        <div className="border-t p-3">{account}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho (celular) */}
        <header className="sticky top-0 z-40 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <div className="flex h-16 items-center gap-2 px-2">
            <button
              type="button"
              onClick={openMenu}
              onPointerEnter={preloadDrawer}
              onFocus={preloadDrawer}
              aria-label="Abrir menu do admin"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              aria-controls="admin-menu"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </button>
            <p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">{sectionLabel}</p>
            <Link
              to="/admin"
              aria-label="Doutor Imigrante — visão geral do admin"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandMark className="h-7 w-7" />
            </Link>
          </div>
        </header>

        {/* Cabeçalho (desktop): seção atual. O título da página (h1) fica no conteúdo. */}
        <header className="hidden h-16 items-center border-b bg-card px-6 md:flex">
          <p className="text-sm font-medium text-muted-foreground">{sectionLabel}</p>
        </header>

        <main className="min-w-0 flex-1 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom)+var(--cookie-banner-h,0px))] md:p-6">
          <Outlet />
        </main>
      </div>

      {drawerMounted && (
        <Suspense fallback={null}>
          <AdminDrawer
            id="admin-menu"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            side="left"
            title="Menu do admin"
            className="max-w-[20rem]"
            footer={account}
          >
            <nav aria-label="Navegação do admin" className="px-3 py-4">
              <AdminNav pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </nav>
          </AdminDrawer>
        </Suspense>
      )}
    </div>
  )
}
