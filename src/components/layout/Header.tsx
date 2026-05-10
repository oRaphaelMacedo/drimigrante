import { Link, useNavigate } from 'react-router-dom'
import { LogOut, LayoutDashboard, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

export function Header() {
  const { authUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <span className="text-lg font-bold text-brand-700">Doutor Imigrante</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          <Link to="/quiz" className="text-sm font-medium text-gray-600 hover:text-brand-700 transition">
            Quiz Gratuito
          </Link>
          <Link to="/#como-funciona" className="text-sm font-medium text-gray-600 hover:text-brand-700 transition">
            Como Funciona
          </Link>
          <Link to="/#precos" className="text-sm font-medium text-gray-600 hover:text-brand-700 transition">
            Preços
          </Link>
        </nav>

        {/* Auth Actions */}
        <div className="hidden items-center gap-3 md:flex">
          {authUser ? (
            <>
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-brand-700"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-gray-600 hover:text-brand-700"
              >
                Entrar
              </Link>
              <Link
                to="/quiz"
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 transition"
              >
                Começar Quiz →
              </Link>
            </>
          )}
        </div>

        {/* Mobile burger */}
        <button
          className="md:hidden p-2"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menu"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div className={cn('md:hidden border-t border-gray-100 bg-white', menuOpen ? 'block' : 'hidden')}>
        <nav className="container flex flex-col gap-1 py-4">
          <Link to="/quiz" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Quiz Gratuito
          </Link>
          {authUser ? (
            <>
              <Link to="/dashboard" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Dashboard
              </Link>
              <button
                onClick={handleSignOut}
                className="rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Sair
              </button>
            </>
          ) : (
            <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
