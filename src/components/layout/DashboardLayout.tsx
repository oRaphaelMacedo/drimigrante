/**
 * Layout da área logada (DI-045).
 *
 * - Desktop (≥768px): barra lateral como antes.
 * - Celular: cabeçalho com o monograma e o nome (leva ao Início) e barra de navegação
 *   inferior com todas as seções a um toque. Sair fica em Conta, com confirmação.
 * - O conteúdo reserva espaço para a barra inferior, a safe-area e o banner de
 *   cookies (`--cookie-banner-h`), para o último bloco nunca ficar escondido.
 * - ScrollRestoration: cada página nova começa no topo; o "voltar" restaura a rolagem.
 * - Chat (DI-051): no celular a rota não tem padding — o painel do chat ocupa a
 *   tela entre o cabeçalho e a barra inferior e cuida das próprias margens.
 */
import { useEffect } from 'react'
import { Link, Outlet, ScrollRestoration, useLocation } from 'react-router-dom'
import { ChevronRight, Lock, ShieldCheck } from 'lucide-react'
import { BottomNav } from '@/components/dashboard/BottomNav'
import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { markAnalysisOpened } from '@/components/dashboard/dashboard-storage'
import { resolveNavItems } from '@/components/dashboard/nav-items'
import { BrandMark } from '@/components/layout/BrandLogo'
import { useAuth } from '@/hooks/useAuth'
import { cn, getInitials } from '@/lib/utils'

export function DashboardLayout() {
  const { authUser, isHubUser, access, hasAccess } = useAuth()
  const location = useLocation()
  const navItems = resolveNavItems(location.pathname, access, hasAccess)
  const userId = authUser?.user.id
  const canReadAnalysis = hasAccess('full_analysis')

  // O upsell de €4,90 só ganha destaque depois que a pessoa abriu a análise (DI-047).
  useEffect(() => {
    if (!userId || !canReadAnalysis) return
    if (location.pathname === '/dashboard/analysis' || location.pathname.startsWith('/dashboard/analysis/')) {
      markAnalysisOpened(userId)
    }
  }, [location.pathname, userId, canReadAnalysis])

  const displayName = authUser?.profile?.full_name?.trim() || 'Sua conta'
  const isChatRoute = location.pathname === '/dashboard/chat' || location.pathname.startsWith('/dashboard/chat/')

  return (
    <div className="flex min-h-dvh bg-background">
      <ScrollRestoration />

      {/* Barra lateral (desktop) */}
      <aside className="hidden w-64 flex-shrink-0 border-r bg-card md:flex md:flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <Link
            to="/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-md text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark className="h-7 w-7" />
            Doutor Imigrante
          </Link>
        </div>

        <nav aria-label="Navegação do painel" className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ to, href, icon: Icon, label, locked, active }) => (
            <Link
              key={to}
              to={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-primary/[.08] text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
              {locked ? (
                <>
                  <Lock aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
                  <span className="sr-only">(bloqueado)</span>
                </>
              ) : (
                active && <ChevronRight aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
              )}
            </Link>
          ))}

          {isHubUser && (
            <div className="mt-4 border-t pt-4">
              <p className="mb-1.5 px-3 text-xs font-semibold text-muted-foreground">Equipe</p>
              <Link
                to="/admin"
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
                Painel admin
                <ChevronRight aria-hidden="true" className="ml-auto h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </nav>

        <div className="border-t p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1">
            <div
              aria-hidden="true"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/[.08] text-xs font-semibold text-primary"
            >
              {getInitials(authUser?.profile?.full_name || authUser?.user.email || 'U')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{authUser?.user.email}</p>
            </div>
            <SignOutButton variant="icon" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Cabeçalho (celular) */}
        <header className="sticky top-0 z-40 border-b bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <div className="flex h-16 items-center justify-between gap-3 px-4">
            <Link
              to="/dashboard"
              className="-ml-1 inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-base font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <BrandMark className="h-7 w-7" />
              Doutor Imigrante
            </Link>
            {isHubUser && (
              <Link
                to="/admin"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
                Admin
              </Link>
            )}
          </div>
        </header>

        {/* Espaço inferior = barra de navegação (~4rem + safe-area) + banner de cookies, se aberto.
            No chat, a altura do próprio painel já desconta a barra e o banner (ChatPage). */}
        <main
          className={cn(
            'flex-1 md:p-6',
            !isChatRoute && 'px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom)+var(--cookie-banner-h,0px))]',
          )}
        >
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  )
}
