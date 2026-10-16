import * as React from 'react'
import { cn } from '@/lib/utils'

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

function isEditableElement(el: EventTarget | Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(el.type)
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el.isContentEditable
}

/**
 * true enquanto um campo editável está focado ou o teclado virtual reduz a área
 * visível (visualViewport). Barras fixas somem nesse caso para não cobrir o campo.
 */
function useVirtualKeyboardOpen(): boolean {
  const [editableFocused, setEditableFocused] = React.useState(false)
  const [viewportShrunk, setViewportShrunk] = React.useState(false)

  React.useEffect(() => {
    let timer: number | undefined
    const sync = () => setEditableFocused(isEditableElement(document.activeElement))
    const handleFocusIn = (event: FocusEvent) => {
      if (isEditableElement(event.target)) setEditableFocused(true)
    }
    // O foco ainda não mudou durante o focusout: confere no próximo tick.
    const handleFocusOut = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(sync, 0)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    sync()

    const vv = window.visualViewport
    const handleViewport = () => {
      if (!vv) return
      // height × scale ignora o zoom por pinça; só o teclado reduz a área assim.
      setViewportShrunk(vv.height * vv.scale < window.innerHeight * 0.75)
    }
    vv?.addEventListener('resize', handleViewport)
    handleViewport()

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
      vv?.removeEventListener('resize', handleViewport)
    }
  }, [])

  return editableFocused || viewportShrunk
}

export interface StickyCTAProps {
  /** Conteúdo da barra, normalmente um `<Button className="w-full">`. */
  children: React.ReactNode
  /**
   * Elemento-âncora (ex.: hero). A barra só aparece depois que ele sai da tela
   * por cima. Sem âncora, a barra aparece desde o início.
   */
  anchorRef?: React.RefObject<Element>
  /**
   * CTA inline equivalente. Enquanto ele estiver visível, a barra some para não
   * haver dois CTAs iguais na tela.
   */
  inlineCtaRef?: React.RefObject<Element>
  /** Exibe também a partir de md (padrão: só no celular). */
  showOnDesktop?: boolean
  /** Rótulo da região para leitores de tela. */
  label?: string
  /** Classe extra da barra. */
  className?: string
}

/**
 * Barra de ação fixa no rodapé (z-30), pensada para o celular.
 *
 * - Aparece quando a âncora sai da tela e some quando o CTA inline está visível
 *   (IntersectionObserver).
 * - Some enquanto um input/textarea está focado (teclado aberto).
 * - Fica acima do banner de cookies (`bottom: var(--cookie-banner-h)`) e respeita
 *   a safe-area do iPhone.
 * - Renderiza um espaçador com a altura da barra no lugar onde é montada: monte-a
 *   no fim do conteúdo da página para que o último bloco não fique coberto.
 *
 * @example
 * const heroRef = useRef<HTMLElement>(null)
 * const offerCtaRef = useRef<HTMLButtonElement>(null)
 * ...
 * <StickyCTA anchorRef={heroRef} inlineCtaRef={offerCtaRef}>
 *   <Button variant="pay" size="lg" className="w-full">Desbloquear análise — €30</Button>
 * </StickyCTA>
 */
export function StickyCTA({
  children,
  anchorRef,
  inlineCtaRef,
  showOnDesktop = false,
  label = 'Ação principal',
  className,
}: StickyCTAProps) {
  const barRef = React.useRef<HTMLDivElement>(null)
  const [anchorPassed, setAnchorPassed] = React.useState(!anchorRef)
  const [inlineVisible, setInlineVisible] = React.useState(false)
  const [barHeight, setBarHeight] = React.useState(0)
  const keyboardOpen = useVirtualKeyboardOpen()

  React.useEffect(() => {
    const anchor = anchorRef?.current
    if (!anchor) {
      setAnchorPassed(true)
      return
    }
    if (typeof IntersectionObserver === 'undefined') {
      setAnchorPassed(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      // "Saiu da tela" = rolou para cima dela; abaixo da dobra ainda não conta.
      setAnchorPassed(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0)
    })
    observer.observe(anchor)
    return () => observer.disconnect()
  }, [anchorRef])

  React.useEffect(() => {
    const inlineCta = inlineCtaRef?.current
    if (!inlineCta || typeof IntersectionObserver === 'undefined') {
      setInlineVisible(false)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setInlineVisible(entry.isIntersecting))
    observer.observe(inlineCta)
    return () => observer.disconnect()
  }, [inlineCtaRef])

  React.useEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () => setBarHeight(bar.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])

  const visible = anchorPassed && !inlineVisible && !keyboardOpen

  return (
    <>
      {/* Espaçador: compensa a altura da barra no fim do conteúdo. */}
      <div aria-hidden="true" className={cn(!showOnDesktop && 'md:hidden')} style={{ height: barHeight }} />
      <div
        ref={barRef}
        role="region"
        aria-label={label}
        data-state={visible ? 'visible' : 'hidden'}
        data-testid="sticky-cta"
        className={cn(
          'fixed inset-x-0 z-30 border-t bg-card/95 px-4 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgb(20_26_41/0.12)] backdrop-blur',
          'transition-[transform,opacity,visibility] duration-base ease-out',
          'data-[state=hidden]:pointer-events-none data-[state=hidden]:invisible data-[state=hidden]:translate-y-full data-[state=hidden]:opacity-0',
          !showOnDesktop && 'md:hidden',
          className,
        )}
        style={{ bottom: 'var(--cookie-banner-h, 0px)' }}
      >
        <div className="mx-auto w-full max-w-lg">{children}</div>
      </div>
    </>
  )
}
