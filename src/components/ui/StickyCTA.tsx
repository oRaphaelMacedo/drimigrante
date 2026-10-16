import * as React from 'react'
import { cn } from '@/lib/utils'
import { STICKY_CTA_RESERVE_ATTR, useBottomOverlayHeight, usePublishStickyBarHeight } from './sticky-bar'

/** Fração do CTA inline que precisa estar na tela para contar como visível. */
const INLINE_VISIBLE_RATIO = 0.5

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
   * CTA inline equivalente. Enquanto pelo menos metade dele estiver visível
   * (descontando o banner de cookies e a BottomNav, que o cobrem), a barra some
   * para não haver dois CTAs iguais na tela.
   */
  inlineCtaRef?: React.RefObject<Element>
  /** Esconde a barra (ex.: a página já mostra o próprio CTA). Publica 0px. */
  forceHidden?: boolean
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
 * - Aparece quando a âncora sai da tela e some quando pelo menos metade do CTA
 *   inline está visível (IntersectionObserver). A área considerada desconta o
 *   banner de cookies e a BottomNav (`--cookie-banner-h`, `--bottom-nav-h`):
 *   um botão escondido atrás do banner não conta como visível.
 * - Some enquanto um input/textarea está focado (teclado aberto).
 * - Fica acima do banner de cookies (`bottom: var(--cookie-banner-h)`) e respeita
 *   a safe-area do iPhone.
 * - Publica a própria altura em `--sticky-cta-h` enquanto está visível (0px
 *   escondida), para o rodapé público reservar espaço só quando preciso.
 * - Fora do layout público (sem rodapé que reserve espaço), renderiza um
 *   espaçador com a altura da barra no lugar onde é montada: monte-a no fim do
 *   conteúdo da página para que o último bloco não fique coberto.
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
  forceHidden = false,
  showOnDesktop = false,
  label = 'Ação principal',
  className,
}: StickyCTAProps) {
  const barRef = React.useRef<HTMLDivElement>(null)
  const [anchorPassed, setAnchorPassed] = React.useState(!anchorRef)
  const [inlineVisible, setInlineVisible] = React.useState(false)
  const [barHeight, setBarHeight] = React.useState(0)
  const [footerReserves, setFooterReserves] = React.useState(false)
  const keyboardOpen = useVirtualKeyboardOpen()
  const bottomOverlay = useBottomOverlayHeight()

  // O rodapé público já reserva a altura da barra: sem espaçador duplicado.
  React.useLayoutEffect(() => {
    setFooterReserves(document.querySelector(`[${STICKY_CTA_RESERVE_ATTR}]`) !== null)
  }, [])

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

  // Recria o observador quando o banner de cookies/BottomNav muda de altura:
  // o rootMargin negativo tira do "visível" a faixa que eles cobrem.
  React.useEffect(() => {
    const inlineCta = inlineCtaRef?.current
    if (!inlineCta || typeof IntersectionObserver === 'undefined') {
      setInlineVisible(false)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return
        // Sem razão informada (ambientes simulados), vale o isIntersecting.
        const ratio = typeof entry.intersectionRatio === 'number' ? entry.intersectionRatio : 1
        setInlineVisible(entry.isIntersecting && ratio >= INLINE_VISIBLE_RATIO - 0.01)
      },
      { rootMargin: `0px 0px ${-Math.round(bottomOverlay)}px 0px`, threshold: [0, INLINE_VISIBLE_RATIO, 1] },
    )
    observer.observe(inlineCta)
    return () => observer.disconnect()
  }, [inlineCtaRef, bottomOverlay])

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

  const visible = !forceHidden && anchorPassed && !inlineVisible && !keyboardOpen
  usePublishStickyBarHeight(barRef, visible)

  return (
    <>
      {/* Espaçador: compensa a altura da barra no fim do conteúdo (só sem rodapé que reserve). */}
      {!footerReserves && (
        <div aria-hidden="true" className={cn(!showOnDesktop && 'md:hidden')} style={{ height: barHeight }} />
      )}
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
