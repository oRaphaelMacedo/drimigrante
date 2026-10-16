/**
 * Header público (DI-038).
 *
 *  - Navegação: Como funciona, Preços, Entrar e o CTA do diagnóstico (48px no menu).
 *  - Menu do celular: botão de 44px com aria-expanded/aria-controls; fecha ao
 *    navegar, com Escape (o foco volta ao botão) e ao tocar fora do header.
 *  - Modo foco (`focus`, rotas do funil): só a marca, sem menu nem CTA, e sem
 *    sticky — a tela fica toda para a etapa (quiz, resultado ou checkout).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { BrandLogo } from './BrandLogo'

const NAV_LINKS = [
  { to: '/#como-funciona', label: 'Como funciona' },
  { to: '/#precos', label: 'Preços' },
] as const

const QUIZ_CTA_LABEL = 'Fazer o diagnóstico grátis'

const brandLinkClass =
  'inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const desktopLinkClass = cn(
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground',
  'transition-colors hover:bg-muted hover:text-foreground',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
)

const mobileItemClass = cn(
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-base font-medium text-foreground',
  'transition-colors hover:bg-muted',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
)

export interface HeaderProps {
  /** Modo foco do funil: header reduzido, sem navegação. */
  focus?: boolean
}

export function Header({ focus = false }: HeaderProps) {
  const { authUser, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const menuId = useId()
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Fecha ao mudar de location (link, voltar, navigate programático). Ajuste
  // durante a renderização, sem efeito: o menu nunca pinta aberto na tela nova.
  const [locationKey, setLocationKey] = useState(location.key)
  if (locationKey !== location.key) {
    setLocationKey(location.key)
    setMenuOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      toggleRef.current?.focus()
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && headerRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  const handleSignOut = async () => {
    closeMenu()
    await signOut()
    navigate('/')
  }

  const trackQuizCta = (position: 'header' | 'header_menu') => {
    closeMenu()
    track('landing_cta_clicked', { position })
  }

  if (focus) {
    return (
      <header className="border-b border-border bg-card">
        <Container className="flex h-14 items-center">
          <Link to="/" className={brandLinkClass}>
            <BrandLogo />
          </Link>
        </Container>
      </header>
    )
  }

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur"
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link to="/" className={brandLinkClass} onClick={closeMenu}>
          <BrandLogo />
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ to, label }) => (
            <Link key={to} to={to} className={desktopLinkClass}>
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {authUser ? (
            <>
              <Link to="/dashboard" className={desktopLinkClass}>
                <LayoutDashboard aria-hidden="true" className="h-4 w-4" />
                Meu painel
              </Link>
              <Button variant="secondary" size="sm" onClick={handleSignOut}>
                <LogOut aria-hidden="true" />
                Sair
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className={desktopLinkClass}>
                Entrar
              </Link>
              <Button asChild size="sm">
                <Link to="/quiz" onClick={() => trackQuizCta('header')}>
                  {QUIZ_CTA_LABEL}
                </Link>
              </Button>
            </>
          )}
        </div>

        <Button
          ref={toggleRef}
          variant="ghost"
          size="icon"
          className="-mr-2 md:hidden"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </Container>

      {/* `hidden` no invólucro: classes de display no mesmo elemento venceriam o atributo. */}
      <div id={menuId} hidden={!menuOpen} className="border-t border-border bg-card md:hidden">
        <Container
          as="div"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain py-3"
        >
          <nav aria-label="Menu" className="flex flex-col gap-1">
            {NAV_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} className={mobileItemClass} onClick={closeMenu}>
                {label}
              </Link>
            ))}
            {authUser ? (
              <>
                <button type="button" onClick={handleSignOut} className={mobileItemClass}>
                  <LogOut aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
                  Sair
                </button>
                <Button asChild size="md" className="mt-2 w-full">
                  <Link to="/dashboard" onClick={closeMenu}>
                    <LayoutDashboard aria-hidden="true" />
                    Meu painel
                  </Link>
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className={mobileItemClass} onClick={closeMenu}>
                  Entrar
                </Link>
                <Button asChild size="md" className="mt-2 w-full">
                  <Link to="/quiz" onClick={() => trackQuizCta('header_menu')}>
                    {QUIZ_CTA_LABEL}
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </Container>
      </div>
    </header>
  )
}
