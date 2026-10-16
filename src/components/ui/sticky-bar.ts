/**
 * Coordenação das barras fixas do rodapé da tela (W4-04 / DI-079).
 *
 * - `--sticky-cta-h`: altura da barra de ação visível (StickyCTA ou a navegação
 *   do quiz); 0px quando escondida. O rodapé público reserva esse espaço.
 * - `data-sticky-cta-reserve`: marca quem já faz essa reserva (o rodapé), para
 *   o StickyCTA não renderizar um espaçador a mais.
 * - `--cookie-banner-h` e `--bottom-nav-h`: publicadas pelo banner de cookies e
 *   pela BottomNav; cobrem o fim da tela.
 *
 * Fica fora do StickyCTA.tsx para o arquivo do componente exportar só o
 * componente (Fast Refresh).
 */
import * as React from 'react'

/**
 * Altura da barra fixa visível no momento (0px quando escondida ou no desktop).
 * O rodapé público usa para reservar espaço só quando há barra na tela.
 */
export const STICKY_CTA_HEIGHT_VAR = '--sticky-cta-h'

/**
 * Atributo de quem já reserva a altura da barra no fim da página (o rodapé
 * público). Com ele no documento, o StickyCTA não renderiza o próprio
 * espaçador — senão o espaço em branco no fim da página dobraria.
 */
export const STICKY_CTA_RESERVE_ATTR = 'data-sticky-cta-reserve'

/** Barras fixas no rodapé da tela que cobrem o CTA inline (publicadas por elas). */
const BOTTOM_OVERLAY_VARS = ['--cookie-banner-h', '--bottom-nav-h'] as const

function readPxVar(name: string): number {
  if (typeof document === 'undefined') return 0
  const value = Number.parseFloat(document.documentElement.style.getPropertyValue(name))
  return Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Altura (px) coberta no rodapé da tela pelo banner de cookies e pela BottomNav,
 * atualizada quando elas publicam uma altura nova no <html>.
 */
export function useBottomOverlayHeight(): number {
  const read = () => BOTTOM_OVERLAY_VARS.reduce((sum, name) => sum + readPxVar(name), 0)
  const [height, setHeight] = React.useState(read)

  React.useEffect(() => {
    const sync = () => setHeight(BOTTOM_OVERLAY_VARS.reduce((sum, name) => sum + readPxVar(name), 0))
    sync()
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [])

  return height
}

/**
 * Publica em `--sticky-cta-h` (no <html>) a altura da barra enquanto ela está
 * visível e fixa na tela; 0px quando escondida, no desktop (display: none ou
 * position: static) e ao desmontar. Serve ao StickyCTA e a barras próprias,
 * como a navegação do quiz.
 */
export function usePublishStickyBarHeight(ref: React.RefObject<HTMLElement>, visible: boolean) {
  React.useLayoutEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!el) {
      // Barra desmontada (ex.: a etapa do quiz mudou): nada a reservar.
      root.style.setProperty(STICKY_CTA_HEIGHT_VAR, '0px')
      return
    }
    const publish = () => {
      const shown =
        visible && el.getClientRects().length > 0 && window.getComputedStyle(el).position === 'fixed'
      root.style.setProperty(STICKY_CTA_HEIGHT_VAR, `${shown ? el.offsetHeight : 0}px`)
    }
    publish()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish)
    observer?.observe(el)
    window.addEventListener('resize', publish)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', publish)
    }
  }, [ref, visible])

  React.useEffect(
    () => () => {
      document.documentElement.style.removeProperty(STICKY_CTA_HEIGHT_VAR)
    },
    [],
  )
}
