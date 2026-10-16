// @vitest-environment jsdom
/**
 * DI-036 — banner de cookies compacto: Rejeitar e Aceitar com a mesma classe e
 * 44px, sem o "X" redundante, publicando a altura em --cookie-banner-h.
 * O analytics é trocado pelo módulo de consentimento puro (sem rede).
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Consentimento só no localStorage (o módulo real guarda uma cópia em memória
// que vazaria entre os testes) e o mesmo evento do módulo real.
vi.mock('@/lib/analytics', async () => {
  const { CONSENT_EVENT, CONSENT_STORAGE_KEY } = await vi.importActual<typeof import('@/lib/consent')>('@/lib/consent')
  return {
    getConsent: () => {
      const value = localStorage.getItem(CONSENT_STORAGE_KEY)
      return value === null ? 'pending' : value === 'denied' ? 'denied' : 'granted'
    },
    setConsent: (choice: string) => {
      localStorage.setItem(CONSENT_STORAGE_KEY, choice)
      window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }))
    },
  }
})

import { CookieBanner } from './CookieBanner'
import { setConsent } from '@/lib/analytics'
import { CONSENT_STORAGE_KEY } from '@/lib/consent'

const bannerVar = () => document.documentElement.style.getPropertyValue('--cookie-banner-h')
const originalRect = HTMLElement.prototype.getBoundingClientRect

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieBanner />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.style.removeProperty('--cookie-banner-h')
  // jsdom não faz layout: simula a altura do banner.
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(this: HTMLElement) {
    if (this.dataset.testid !== 'cookie-banner') return originalRect.call(this)
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 108, width: 0, height: 108, toJSON: () => ({}) } as DOMRect
  }
})

afterEach(() => {
  HTMLElement.prototype.getBoundingClientRect = originalRect
})

describe('CookieBanner', () => {
  it('aparece na primeira visita e publica a própria altura', () => {
    renderBanner()
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument()
    expect(bannerVar()).toBe('108px')
  })

  it('Rejeitar e Aceitar têm a mesma classe, 44px, e não há botão de fechar', () => {
    renderBanner()
    const reject = screen.getByTestId('cookie-reject')
    const accept = screen.getByTestId('cookie-accept')
    expect(reject.className).toBe(accept.className)
    expect(reject).toHaveClass('h-11', 'min-h-11')
    expect(screen.queryByRole('button', { name: /fechar/i })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('o texto é curto e aponta para a Política de Cookies', () => {
    renderBanner()
    const dialog = screen.getByRole('dialog', { name: 'Aviso de cookies' })
    expect(dialog).toHaveAccessibleDescription(/cookies de estatística/i)
    expect(screen.getByRole('link', { name: 'Política de Cookies' })).toHaveAttribute('href', '/cookies')
    expect((dialog.textContent ?? '').length).toBeLessThan(120)
  })

  it.each([
    ['cookie-reject', 'denied'],
    ['cookie-accept', 'granted'],
  ])('%s grava "%s", fecha e zera a altura', async (testId, stored) => {
    const user = userEvent.setup()
    renderBanner()
    await user.click(screen.getByTestId(testId))
    expect(localStorage.getItem(CONSENT_STORAGE_KEY)).toBe(stored)
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(bannerVar()).toBe('0px')
  })

  it('não aparece para quem já escolheu', () => {
    localStorage.setItem(CONSENT_STORAGE_KEY, 'denied')
    renderBanner()
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
  })

  it('fecha quando a escolha é feita em outro lugar (página de cookies)', () => {
    renderBanner()
    act(() => setConsent('analytics'))
    expect(screen.queryByTestId('cookie-banner')).toBeNull()
    expect(bannerVar()).toBe('0px')
  })
})
