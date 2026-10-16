// @vitest-environment jsdom
/**
 * StickyCTA (W4-04 / DI-079):
 *  - o CTA inline só conta como visível com ~50% dele na tela, descontando o
 *    banner de cookies e a BottomNav (rootMargin inferior negativo), e o
 *    observador é recriado quando essas alturas mudam;
 *  - publica a altura em --sticky-cta-h só enquanto a barra está visível e
 *    fixa (0px escondida, com forceHidden e ao desmontar);
 *  - não renderiza espaçador quando o rodapé público já reserva o espaço.
 * IntersectionObserver controlado pelo teste.
 */
import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StickyCTA } from './StickyCTA'
import { STICKY_CTA_HEIGHT_VAR, STICKY_CTA_RESERVE_ATTR } from './sticky-bar'

interface FakeEntry {
  isIntersecting: boolean
  intersectionRatio?: number
  boundingClientRect?: Partial<DOMRect>
}

class FakeIntersectionObserver {
  static all: FakeIntersectionObserver[] = []
  targets: Element[] = []
  disconnected = false
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeIntersectionObserver.all.push(this)
  }
  observe(target: Element) {
    this.targets.push(target)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
    this.targets = []
  }
  takeRecords() {
    return []
  }
  fire(target: Element, entry: FakeEntry) {
    if (this.disconnected || !this.targets.includes(target)) return
    this.callback(
      [{ target, boundingClientRect: { top: 0, bottom: 0 }, ...entry } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    )
  }
}

/** Observadores ativos de um alvo. */
const observersOf = (target: Element) =>
  FakeIntersectionObserver.all.filter((o) => !o.disconnected && o.targets.includes(target))

function fire(target: Element, entry: FakeEntry) {
  act(() => {
    for (const observer of observersOf(target)) observer.fire(target, entry)
  })
}

function Harness({ forceHidden = false }: { forceHidden?: boolean }) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const inlineRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <div ref={anchorRef} data-testid="anchor" />
      <button ref={inlineRef} data-testid="inline-cta">
        Comprar
      </button>
      <StickyCTA anchorRef={anchorRef} inlineCtaRef={inlineRef} forceHidden={forceHidden}>
        <button>Comprar (barra)</button>
      </StickyCTA>
    </>
  )
}

const root = document.documentElement
const bar = () => screen.getByTestId('sticky-cta')
const published = () => root.style.getPropertyValue(STICKY_CTA_HEIGHT_VAR)

/** Âncora saiu da tela por cima: a barra pode aparecer. */
const passAnchor = () =>
  fire(screen.getByTestId('anchor'), { isIntersecting: false, boundingClientRect: { top: -300, bottom: -20 } })

async function setRootVar(name: string, value: string) {
  await act(async () => {
    root.style.setProperty(name, value)
    await Promise.resolve() // MutationObserver
  })
}

beforeEach(() => {
  FakeIntersectionObserver.all = []
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  // jsdom não faz layout: a barra "existe", é fixa e tem 72px.
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(72)
  const realGetComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    const style = realGetComputedStyle(el)
    if ((el as HTMLElement).dataset?.testid !== 'sticky-cta') return style
    return new Proxy(style, {
      get: (target, prop) => (prop === 'position' ? 'fixed' : Reflect.get(target, prop)),
    })
  })
  root.style.setProperty('--cookie-banner-h', '0px')
})

afterEach(() => {
  vi.unstubAllGlobals()
  root.style.removeProperty('--cookie-banner-h')
  root.style.removeProperty('--bottom-nav-h')
  root.style.removeProperty(STICKY_CTA_HEIGHT_VAR)
  document.body.removeAttribute(STICKY_CTA_RESERVE_ATTR)
})

describe('StickyCTA — CTA inline visível só com metade na tela', () => {
  it('observa o CTA inline com limiar de 50% e sem desconto quando não há banner', () => {
    render(<Harness />)
    const [observer] = observersOf(screen.getByTestId('inline-cta'))
    expect(observer.options.rootMargin).toBe('0px 0px 0px 0px')
    expect(observer.options.threshold).toEqual([0, 0.5, 1])
  })

  it('poucos pixels do CTA inline na tela não escondem a barra; metade esconde', () => {
    render(<Harness />)
    passAnchor()
    expect(bar()).toHaveAttribute('data-state', 'visible')

    const inline = screen.getByTestId('inline-cta')
    fire(inline, { isIntersecting: true, intersectionRatio: 0.15 }) // 8 px de 56
    expect(bar()).toHaveAttribute('data-state', 'visible')

    fire(inline, { isIntersecting: true, intersectionRatio: 0.5 })
    expect(bar()).toHaveAttribute('data-state', 'hidden')

    fire(inline, { isIntersecting: false, intersectionRatio: 0 })
    expect(bar()).toHaveAttribute('data-state', 'visible')
  })

  it('desconta o banner de cookies e a BottomNav e recria o observador quando eles mudam', async () => {
    await setRootVar('--cookie-banner-h', '108px')
    render(<Harness />)
    const inline = screen.getByTestId('inline-cta')
    expect(observersOf(inline).map((o) => o.options.rootMargin)).toEqual(['0px 0px -108px 0px'])

    await setRootVar('--bottom-nav-h', '64px')
    expect(observersOf(inline).map((o) => o.options.rootMargin)).toEqual(['0px 0px -172px 0px'])

    await setRootVar('--cookie-banner-h', '0px')
    expect(observersOf(inline).map((o) => o.options.rootMargin)).toEqual(['0px 0px -64px 0px'])
  })
})

describe('StickyCTA — altura publicada em --sticky-cta-h', () => {
  it('0px escondida, a altura da barra visível e 0px de novo ao esconder', () => {
    render(<Harness />)
    expect(published()).toBe('0px')

    passAnchor()
    expect(published()).toBe('72px')

    fire(screen.getByTestId('inline-cta'), { isIntersecting: true, intersectionRatio: 1 })
    expect(published()).toBe('0px')
  })

  it('forceHidden esconde a barra e publica 0px', () => {
    const { rerender } = render(<Harness forceHidden />)
    passAnchor()
    expect(bar()).toHaveAttribute('data-state', 'hidden')
    expect(published()).toBe('0px')

    rerender(<Harness />)
    expect(bar()).toHaveAttribute('data-state', 'visible')
    expect(published()).toBe('72px')
  })

  it('remove a variável ao desmontar', () => {
    const { unmount } = render(<Harness />)
    passAnchor()
    expect(published()).toBe('72px')
    unmount()
    expect(published()).toBe('')
  })
})

describe('StickyCTA — espaçador', () => {
  const spacerOf = (container: HTMLElement) => container.querySelector('div[aria-hidden="true"]')

  it('sem rodapé que reserve, renderiza o espaçador', () => {
    const { container } = render(<Harness />)
    expect(spacerOf(container)).not.toBeNull()
  })

  it('com o rodapé público reservando (data-sticky-cta-reserve), não duplica o espaço', () => {
    document.body.setAttribute(STICKY_CTA_RESERVE_ATTR, '')
    const { container } = render(<Harness />)
    expect(spacerOf(container)).toBeNull()
  })
})
