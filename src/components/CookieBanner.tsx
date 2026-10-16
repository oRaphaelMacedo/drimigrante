import { useEffect, useRef, useState, type RefObject } from 'react'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getConsent, setConsent } from '@/lib/analytics'
import { Button } from '@/components/ui/Button'

const HEIGHT_VAR = '--cookie-banner-h'

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

export function CookieBanner() {
  const [visible, setVisible] = useState(false)
  const bannerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setVisible(getConsent() === 'pending')
  }, [])

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
      data-testid="cookie-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm shadow-2xl"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:gap-6 md:py-3">
        <Cookie className="hidden h-6 w-6 shrink-0 text-brand-600 md:block" aria-hidden />
        <p className="flex-1 text-sm text-foreground/80">
          Usamos cookies para melhorar a sua experiência, medir tráfego e personalizar conteúdo.
          Consulte a nossa{' '}
          <Link to="/privacidade" className="font-semibold text-brand-600 underline">
            Política de Privacidade
          </Link>{' '}
          e{' '}
          <Link to="/cookies" className="font-semibold text-brand-600 underline">
            Política de Cookies
          </Link>
          .
        </p>
        {/* Rejeitar e Aceitar com o mesmo peso visual (mesma variante, tamanho e largura). */}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={reject}
            data-testid="cookie-reject"
            className="min-h-11 flex-1 md:flex-none"
          >
            Rejeitar
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={accept}
            data-testid="cookie-accept"
            className="min-h-11 flex-1 md:flex-none"
          >
            Aceitar
          </Button>
          <Button variant="ghost" size="icon" onClick={reject} aria-label="Fechar" className="text-muted-foreground md:hidden">
            <X />
          </Button>
        </div>
      </div>
    </div>
  )
}
