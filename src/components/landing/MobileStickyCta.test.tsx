// @vitest-environment jsdom
/**
 * DI-035 — CTA fixo da landing: aparece depois do hero, some na seção final (e
 * abaixo dela) e enquanto o banner de cookies estiver aberto.
 * IntersectionObserver controlado pelo teste.
 */
import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

import { MobileStickyCta } from './MobileStickyCta'

type Entry = Partial<IntersectionObserverEntry> & { isIntersecting: boolean; boundingClientRect: DOMRect }
const observers = new Map<Element, (entry: Entry) => void>()

class FakeIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    observers.set(target, (entry) =>
      this.callback([{ target, ...entry } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
    )
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect

function Harness() {
  const anchorRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLElement>(null)
  return (
    <MemoryRouter>
      <div ref={anchorRef} data-testid="anchor" />
      <MobileStickyCta anchorRef={anchorRef} endRef={endRef} label="Fazer o diagnóstico grátis" />
      <section ref={endRef} data-testid="end" />
    </MemoryRouter>
  )
}

function fire(testId: string, entry: Entry) {
  const target = screen.getByTestId(testId)
  act(() => observers.get(target)?.(entry))
}

const bar = () => screen.getByTestId('sticky-cta')
const isShown = () => bar().dataset.state === 'visible' && !bar().classList.contains('invisible')

beforeEach(() => {
  observers.clear()
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  document.documentElement.style.setProperty('--cookie-banner-h', '0px')
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--cookie-banner-h')
})

describe('MobileStickyCta', () => {
  it('fica escondido enquanto o hero está na tela e aparece quando ele sai por cima', () => {
    render(<Harness />)
    expect(isShown()).toBe(false)

    fire('anchor', { isIntersecting: false, boundingClientRect: rect(-300, -20) })
    expect(isShown()).toBe(true)
    expect(screen.getByTestId('cta-start-quiz-sticky')).toHaveAttribute('href', '/quiz')
  })

  it('some ao chegar na seção final e continua escondido abaixo dela', () => {
    render(<Harness />)
    fire('anchor', { isIntersecting: false, boundingClientRect: rect(-300, -20) })
    expect(isShown()).toBe(true)

    fire('end', { isIntersecting: true, boundingClientRect: rect(500, 800) })
    expect(isShown()).toBe(false)

    // Rolou até o rodapé: a seção final ficou acima da tela.
    fire('end', { isIntersecting: false, boundingClientRect: rect(-400, -100) })
    expect(isShown()).toBe(false)

    // Voltou para cima (seção final abaixo da dobra): reaparece.
    fire('end', { isIntersecting: false, boundingClientRect: rect(1200, 1500) })
    expect(isShown()).toBe(true)
  })

  it('some enquanto o banner de cookies está aberto', async () => {
    render(<Harness />)
    fire('anchor', { isIntersecting: false, boundingClientRect: rect(-300, -20) })
    expect(isShown()).toBe(true)

    await act(async () => {
      document.documentElement.style.setProperty('--cookie-banner-h', '108px')
      await Promise.resolve()
    })
    expect(isShown()).toBe(false)

    await act(async () => {
      document.documentElement.style.setProperty('--cookie-banner-h', '0px')
      await Promise.resolve()
    })
    expect(isShown()).toBe(true)
  })
})
