// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))

import { InstallCard } from './InstallCard'
import {
  PWA_DISMISS_KEY,
  detectPwaPlatform,
  isPwaInviteDismissed,
  resetPwaInstallStateForTests,
  type BeforeInstallPromptEvent,
} from '@/hooks/usePwaInstall'

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const INSTAGRAM_UA = `${IPHONE_UA} Instagram 300.0.0.0`

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true })
}

function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matches && query.includes('standalone'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

/** Simula o `beforeinstallprompt` do Chrome no Android. */
function fireInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  const prompt = vi.fn(async () => undefined)
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }), platforms: ['web'] })
  act(() => {
    window.dispatchEvent(event)
  })
  return { event, prompt }
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.track.mockClear()
  resetPwaInstallStateForTests()
  setStandalone(false)
  setUserAgent(ANDROID_UA)
})

afterEach(() => {
  resetPwaInstallStateForTests()
})

describe('InstallCard — Android (prompt nativo)', () => {
  it('sem beforeinstallprompt não aparece', () => {
    render(<InstallCard />)
    expect(screen.queryByTestId('pwa-install-card')).toBeNull()
  })

  it('com o evento: aparece, impede a mini-barra e abre o prompt nativo ao tocar', async () => {
    render(<InstallCard />)
    const { event, prompt } = fireInstallPrompt('accepted')
    expect(event.defaultPrevented).toBe(true)

    expect(await screen.findByTestId('pwa-install-card')).toBeInTheDocument()
    expect(mocks.track).toHaveBeenCalledWith('pwa_install_card_viewed', { platform: 'android' })

    fireEvent.click(screen.getByTestId('pwa-install-btn'))
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mocks.track).toHaveBeenCalledWith('pwa_install_accepted', { platform: 'android' }))
    expect(mocks.track).toHaveBeenCalledWith('pwa_install_clicked', { platform: 'android' })
    await waitFor(() => expect(screen.queryByTestId('pwa-install-card')).toBeNull())
  })

  it('recusou no prompt nativo: some e não volta por 30 dias', async () => {
    render(<InstallCard />)
    fireInstallPrompt('dismissed')
    fireEvent.click(await screen.findByTestId('pwa-install-btn'))
    await waitFor(() => expect(mocks.track).toHaveBeenCalledWith('pwa_install_dismissed', { platform: 'android' }))
    expect(isPwaInviteDismissed()).toBe(true)
  })

  it('"Agora não" guarda a dispensa por 30 dias', async () => {
    const { unmount } = render(<InstallCard />)
    fireInstallPrompt()
    fireEvent.click(await screen.findByTestId('pwa-install-dismiss'))
    expect(screen.queryByTestId('pwa-install-card')).toBeNull()
    expect(window.localStorage.getItem(PWA_DISMISS_KEY)).toBeTruthy()
    unmount()

    render(<InstallCard />)
    fireInstallPrompt()
    expect(screen.queryByTestId('pwa-install-card')).toBeNull()

    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86_400_000).toISOString()
    window.localStorage.setItem(PWA_DISMISS_KEY, thirtyOneDaysAgo)
    expect(isPwaInviteDismissed()).toBe(false)
  })

  it('app já instalado (standalone): não aparece', () => {
    setStandalone(true)
    render(<InstallCard />)
    fireInstallPrompt()
    expect(screen.queryByTestId('pwa-install-card')).toBeNull()
  })
})

describe('InstallCard — iOS', () => {
  beforeEach(() => setUserAgent(IPHONE_UA))

  it('sem login por código: não convida (o link mágico abriria no Safari)', () => {
    render(<InstallCard iosCodeLogin={false} />)
    expect(screen.queryByTestId('pwa-install-card')).toBeNull()
  })

  it('com login por código: instruções do Safari num sheet', async () => {
    render(<InstallCard iosCodeLogin />)
    expect(screen.getByTestId('pwa-install-card')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('pwa-ios-instructions-btn'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Adicionar à Tela de Início')
    expect(dialog).toHaveTextContent('código de 6 dígitos')
    expect(mocks.track).toHaveBeenCalledWith('pwa_ios_instructions_viewed')
  })

  it('navegador embutido (Instagram): não convida', () => {
    setUserAgent(INSTAGRAM_UA)
    render(<InstallCard iosCodeLogin />)
    expect(screen.queryByTestId('pwa-install-card')).toBeNull()
  })
})

describe('detectPwaPlatform', () => {
  it('reconhece iPhone, iPad (como Mac com toque) e Android', () => {
    expect(detectPwaPlatform(IPHONE_UA)).toBe('ios')
    expect(detectPwaPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe('ios')
    expect(detectPwaPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe('desktop')
    expect(detectPwaPlatform(ANDROID_UA)).toBe('android')
  })
})

describe('InstallCard — onde aparece', () => {
  it('só é usado na área logada (nunca em /, /quiz ou /results)', () => {
    const sources = import.meta.glob('/src/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<
      string,
      string
    >
    const importers = Object.entries(sources)
      .filter(([file]) => !file.endsWith('.test.tsx') && !file.endsWith('/InstallCard.tsx'))
      .filter(([, source]) => /from ['"]@\/components\/dashboard\/InstallCard['"]|from ['"]\.\/InstallCard['"]/.test(source))
      .map(([file]) => file)
    expect(importers.length).toBeGreaterThan(0)
    for (const file of importers) expect(file).toMatch(/^\/src\/(pages|components)\/dashboard\//)
  })
})
