/**
 * Banner de consentimento de cookies (DI-036).
 *
 * - Compacto (≤110px em 360px): texto em até 2 linhas e Rejeitar/Aceitar lado a
 *   lado, com a MESMA classe (mesmo peso visual) e 44px de altura. Sem o "X":
 *   fechar sem escolher seria uma terceira opção ambígua.
 * - "Aceitar" grava 'granted' (só estatísticas); marketing se escolhe na
 *   Política de Cookies.
 * - Publica a própria altura em `--cookie-banner-h` no <html>, para que barras
 *   fixas (StickyCTA, barra do quiz, toasts) fiquem acima dele; zera ao fechar.
 * - Some também quando a escolha é feita em outro lugar (página de cookies).
 */
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { getConsent, setConsent } from '@/lib/analytics'
import { onConsentChange } from '@/lib/consent'
import { Button } from '@/components/ui/Button'

const HEIGHT_VAR = '--cookie-banner-h'

/** Mesma classe nos dois botões: nenhum tem mais destaque que o outro. */
const CHOICE_BUTTON_CLASS = 'h-11 min-h-11 w-full'

/**
 * Publica a altura do banner em `--cookie-banner-h` no <html> para que barras
 * fixas (StickyCTA, barra do quiz…) fiquem acima dele. Zera ao fechar.
 */
function usePublishHeight(ref: RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    const root = document.documentElement
    const el = ref.current
    if (!active || !el) {
      root.style.setProperty(HEIGHT_VAR, '0px')
      return
    }
    const publish = () => root.style.setProperty(HEIGHT_VAR, `${Math.ceil(el.getBoundingClientRect().height)}px`)
    publish()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null
    observer?.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', publish)
      root.style.setProperty(HEIGHT_VAR, '0px')
    }
  }, [ref, active])
}

function isPending(): boolean {
  try {
    return getConsent() === 'pending'
  } catch {
    return false
  }
}

export function CookieBanner() {
  // Leitura síncrona: o banner já entra na primeira pintura (sem salto depois).
  const [visible, setVisible] = useState(isPending)
  const bannerRef = useRef<HTMLDivElement>(null)
  const textId = useId()

  useEffect(() => onConsentChange(() => setVisible(false)), [])

  usePublishHeight(bannerRef, visible)

  if (!visible) return null

  const accept = () => {
    setConsent('granted')
    setVisible(false)
  }
  const reject = () => {
    setConsent('denied')
    setVisible(false)
  }

  return (
    <div
      ref={bannerRef}
      role="dialog"
      aria-label="Aviso de cookies"
      aria-describedby={textId}
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgb(20_26_41/0.12)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 md:flex-row md:items-center md:gap-6 md:py-3">
        <p id={textId} className="text-sm leading-snug text-foreground md:flex-1">
          Só usamos cookies de estatística se você aceitar. Saiba mais na{' '}
          <Link
            to="/cookies"
            className="font-semibold text-primary underline underline-offset-2 hover:decoration-2"
          >
            Política de Cookies
          </Link>
          .
        </p>
        <div className="grid grid-cols-2 gap-2 md:w-72 md:shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={reject}
            data-testid="cookie-reject"
            className={CHOICE_BUTTON_CLASS}
          >
            Rejeitar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={accept}
            data-testid="cookie-accept"
            className={CHOICE_BUTTON_CLASS}
          >
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  )
}
