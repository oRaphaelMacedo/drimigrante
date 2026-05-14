import { useEffect, useState } from 'react'
import { Cookie, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getConsent, setConsent } from '@/lib/analytics'

export function CookieBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(getConsent() === 'pending')
  }, [])

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
        <div className="flex gap-2">
          <button
            onClick={reject}
            data-testid="cookie-reject"
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Rejeitar
          </button>
          <button
            onClick={accept}
            data-testid="cookie-accept"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Aceitar
          </button>
          <button
            onClick={reject}
            aria-label="Fechar"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
