/**
 * CTA fixo da landing no celular (DI-035), construído sobre o `StickyCTA`.
 *
 * - Aparece quando o hero sai da tela por cima (`anchorRef`).
 * - Some ao chegar na seção final (`endRef`), que já tem o próprio CTA, e
 *   continua escondido abaixo dela (rodapé).
 * - Some enquanto o banner de cookies está aberto (`--cookie-banner-h` > 0):
 *   duas barras fixas empilhadas cobririam um terço da tela.
 * - O StickyCTA já cuida do resto: some com campo focado, respeita a safe-area
 *   e reserva a própria altura no fluxo (monte antes da seção final).
 */
import { useEffect, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { track } from '@/lib/analytics'
import { Button } from '@/components/ui/Button'
import { StickyCTA } from '@/components/ui/StickyCTA'

const BANNER_VAR = '--cookie-banner-h'

/**
 * Mesmo visual do estado "hidden" do StickyCTA (transição incluída). `invisible`
 * também tira o link da ordem de tabulação e da árvore de acessibilidade.
 */
const FORCED_HIDDEN = 'pointer-events-none invisible translate-y-full opacity-0'

function readBannerHeight(): number {
  const value = document.documentElement.style.getPropertyValue(BANNER_VAR)
  const height = Number.parseFloat(value)
  return Number.isFinite(height) ? height : 0
}

/** `true` enquanto o CookieBanner publica uma altura maior que zero. */
function useCookieBannerOpen(): boolean {
  const [open, setOpen] = useState(() => (typeof document === 'undefined' ? false : readBannerHeight() > 0))

  useEffect(() => {
    const sync = () => setOpen(readBannerHeight() > 0)
    sync()
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])

  return open
}

/** `true` quando a seção final está na tela ou já ficou para trás (acima). */
function useReachedEnd(endRef: RefObject<Element>): boolean {
  const [reached, setReached] = useState(false)

  useEffect(() => {
    const end = endRef.current
    if (!end || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return
      setReached(entry.isIntersecting || entry.boundingClientRect.top < 0)
    })
    observer.observe(end)
    return () => observer.disconnect()
  }, [endRef])

  return reached
}

export interface MobileStickyCtaProps {
  /** Hero: a barra só aparece depois que ele sai da tela. */
  anchorRef: RefObject<Element>
  /** CTA inline equivalente (ex.: o do cartão de preço): enquanto visível, a barra some. */
  inlineCtaRef?: RefObject<Element>
  /** Seção final (com CTA próprio): a barra some a partir dela. */
  endRef: RefObject<Element>
  /** Texto do botão. */
  label: string
}

export function MobileStickyCta({ anchorRef, inlineCtaRef, endRef, label }: MobileStickyCtaProps) {
  const bannerOpen = useCookieBannerOpen()
  const reachedEnd = useReachedEnd(endRef)
  const forcedHidden = bannerOpen || reachedEnd

  return (
    <StickyCTA
      anchorRef={anchorRef}
      inlineCtaRef={inlineCtaRef}
      label="Começar o diagnóstico"
      className={forcedHidden ? FORCED_HIDDEN : undefined}
    >
      <Button asChild size="md" className="w-full">
        <Link
          to="/quiz"
          data-testid="cta-start-quiz-sticky"
          onClick={() => track('landing_cta_clicked', { position: 'sticky' })}
        >
          {label}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </StickyCTA>
  )
}
