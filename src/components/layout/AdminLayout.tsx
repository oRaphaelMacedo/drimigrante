import { Outlet, Link, useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import {
  Users, LayoutDashboard, Kanban, Building2,
  Settings, Brain, LogOut, ChevronRight, ListChecks,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn, getInitials } from '@/lib/utils'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/admin/leads', icon: Users, label: 'Leads' },
  { to: '/admin/pipeline', icon: Kanban, label: 'Pipeline' },
  { to: '/admin/quiz', icon: ListChecks, label: 'Quiz' },
  { to: '/admin/tenants', icon: Building2, label: 'Escritórios' },
  { to: '/admin/ai-config', icon: Brain, label: 'Config. IA' },
  { to: '/admin/settings', icon: Settings, label: 'Definições' },
]

export function AdminLayout() {
  const { authUser, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-gray-200 bg-gray-900 md:flex md:flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-gray-700 px-6">
          <Link to="/admin" className="text-base font-bold text-white">
            Dr Imigrante <span className="ml-1 text-xs font-normal text-gray-400">Admin</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {navItems.map(({ to, icon: Icon, label, exact }) => {
            const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-700 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {isActive && <ChevronRight className="ml-auto h-3.5 w-3.5" />}
              </Link>
            )
          })}
        </nav>

        {/* User */}
        <div className="border-t border-gray-700 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-semibold text-white">
              {getInitials(authUser?.profile?.full_name ?? 'A')}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {authUser?.profile?.full_name ?? 'Admin'}
              </p>
              <p className="truncate text-xs text-gray-400">{authUser?.roles[0]}</p>
            </div>
            <button onClick={handleSignOut} className="text-gray-400 hover:text-white" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center border-b border-gray-200 bg-white px-6">
          <h1 className="text-sm font-medium text-gray-500">
            {navItems.find(({ to, exact }) => exact ? location.pathname === to : location.pathname.startsWith(to))?.label ?? 'Admin'}
          </h1>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
