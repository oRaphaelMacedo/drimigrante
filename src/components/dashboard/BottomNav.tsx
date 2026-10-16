/**
 * Barra de navegação inferior do dashboard no celular (DI-045).
 *
 * - Só abaixo de 768px (md:hidden); no desktop a barra lateral continua igual.
 * - 5 itens com ícone + rótulo, alvo de 56px de altura, `aria-current="page"`.
 * - Item sem acesso mostra cadeado e abre a oferta certa no Início (sem
 *   redirecionamento silencioso).
 * - z-30, acima do banner de cookies (`--cookie-banner-h`) e da safe-area.
 * - Some enquanto um campo de texto está focado (teclado aberto), para não
 *   cobrir o campo — ex.: a caixa de mensagem do chat.
 * - Publica a própria altura em `--bottom-nav-h` no <html> (0px quando
 *   escondida), para outras barras fixas ficarem acima dela.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { resolveNavItems } from './nav-items'

const HEIGHT_VAR = '--bottom-nav-h'

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

function isEditable(target: EventTarget | Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type)
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
}

/** true enquanto um campo editável está focado ou o teclado virtual encolhe a tela. */
function useKeyboardOpen(): boolean {
  const [focused, setFocused] = useState(false)
  const [shrunk, setShrunk] = useState(false)

  useEffect(() => {
    let timer: number | undefined
    const sync = () => setFocused(isEditable(document.activeElement))
    const onFocusIn = (event: FocusEvent) => {
      if (isEditable(event.target)) setFocused(true)
    }
    // Durante o focusout o foco ainda não mudou: confere no próximo tick.
    const onFocusOut = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(sync, 0)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    sync()

    const vv = window.visualViewport
    const onViewport = () => {
      if (vv) setShrunk(vv.height * vv.scale < window.innerHeight * 0.75)
    }
    vv?.addEventListener('resize', onViewport)
    onViewport()

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', onViewport)
    }
  }, [])

  return focused || shrunk
}

export function BottomNav() {
  const { access, hasAccess } = useAuth()
  const location = useLocation()
  const keyboardOpen = useKeyboardOpen()
  const navRef = useRef<HTMLElement>(null)
  const items = resolveNavItems(location.pathname, access, hasAccess)

  // Altura publicada para StickyCTA e afins (0px quando escondida ou no desktop).
  useLayoutEffect(() => {
    const nav = navRef.current
    const root = document.documentElement
    if (!nav) return
    const publish = () => {
      // getClientRects() vazio = display:none (md:hidden no desktop).
      const visible = !keyboardOpen && nav.getClientRects().length > 0
      root.style.setProperty(HEIGHT_VAR, `${visible ? nav.offsetHeight : 0}px`)
    }
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(nav)
    window.addEventListener('resize', publish)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', publish)
    }
  }, [keyboardOpen])

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(HEIGHT_VAR)
    },
    [],
  )

  return (
    <nav
      ref={navRef}
      aria-label="Navegação do painel"
      data-testid="bottom-nav"
      data-state={keyboardOpen ? 'hidden' : 'visible'}
      className={cn(
        'fixed inset-x-0 z-30 border-t bg-card/95 px-1 pt-1 pb-[calc(.25rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden',
        'shadow-[0_-8px_24px_-12px_rgb(20_26_41/0.12)]',
        'data-[state=hidden]:invisible data-[state=hidden]:pointer-events-none',
      )}
      style={{ bottom: 'var(--cookie-banner-h, 0px)' }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ to, href, icon: Icon, shortLabel, locked, active }) => (
          <li key={to}>
            <Link
              to={href}
              aria-current={active ? 'page' : undefined}
              data-testid={`bottom-nav-${to.split('/').pop()}`}
              className={cn(
                'relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-medium',
                'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {active && (
                <span aria-hidden="true" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />
              )}
              <span className="relative">
                <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={active ? 2.25 : 2} />
                {locked && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-2 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-card bg-muted text-foreground"
                  >
                    <Lock className="h-2.5 w-2.5" />
                  </span>
                )}
              </span>
              {/* Sem truncar: "Documentos" pode passar um pouco da coluna a 360px; os
                  vizinhos (Chat, Conta) são curtos e centralizados, então não colidem. */}
              <span className="whitespace-nowrap leading-tight tracking-tight">{shortLabel}</span>
              {locked && <span className="sr-only">(bloqueado)</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
