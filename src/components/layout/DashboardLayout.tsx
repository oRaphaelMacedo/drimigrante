import { Outlet, Link, useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, MessageSquare, FileText, FolderUp, Settings, LogOut, ChevronRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Início', exact: true },
  { to: '/dashboard/analysis', icon: FileText, label: 'Minha Análise' },
  { to: '/dashboard/chat', icon: MessageSquare, label: 'Chat IA' },
  { to: '/dashboard/documents', icon: FolderUp, label: 'Documentos' },
  { to: '/dashboard/settings', icon: Settings, label: 'Definições' },
]

export function DashboardLayout() {
  const { authUser, isHubUser, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-200 bg-white md:flex md:flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-gray-100 px-6">
          <Link to="/" className="text-base font-bold text-brand-700">
            Doutor Imigrante
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map(({ to, icon: Icon, label, exact }) => {
            const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
              </Link>
            )
          })}

          {isHubUser && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Equipa
              </p>
              <Link
                to="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
              >
                <ShieldCheck className="h-4 w-4 text-brand-600" />
                Painel Admin
                <ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-400" />
              </Link>
            </div>
          )}
        </nav>

        {/* User */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {getInitials(authUser?.profile?.full_name ?? 'U')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">
                {authUser?.profile?.full_name ?? 'Utilizador'}
              </p>
              <p className="truncate text-xs text-gray-500">{authUser?.user.email}</p>
            </div>
            <button onClick={handleSignOut} className="text-gray-400 hover:text-gray-600" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 md:hidden">
          <Link to="/" className="text-base font-bold text-brand-700">Doutor Imigrante</Link>
          <button onClick={handleSignOut} className="text-gray-500">
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
