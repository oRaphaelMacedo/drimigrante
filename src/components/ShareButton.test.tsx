// @vitest-environment jsdom
/**
 * DI-053 — ShareButton: navigator.share → WhatsApp → copiar, com o link do
 * quiz grátis e sem PII. Analytics mockado (nada sai daqui).
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => mocks.track(...args) }))

import { ShareButton, ShareWithFamily } from './ShareButton'

const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share')
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalExecCommand = document.execCommand

function setShare(fn: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: fn })
}

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

/** Nenhum dado da pessoa: nome, e-mail, ids ou score. */
function expectNoPii(url: string) {
  const parsed = new URL(url)
  expect(parsed.pathname).toBe('/quiz')
  expect(parsed.searchParams.get('utm_source')).toBe('share')
  expect([...parsed.searchParams.keys()].every((key) => key.startsWith('utm_'))).toBe(true)
  expect(url).not.toMatch(/maria|@|%40|session|assessment|score|[0-9a-f]{8}-[0-9a-f]{4}/i)
}

beforeEach(() => {
  mocks.track.mockReset()
  // Simula um resultado salvo com PII: nada disso pode ir para o link.
  localStorage.setItem(
    'dr_imigrante_quiz_result',
    JSON.stringify({
      sessionId: 'sessao-0001',
      assessmentId: '00000000-0000-0000-0000-000000000001',
      score: { percentage: 80, category: 'alta' },
      leadInfo: { fullName: 'Maria Souza', email: 'maria@example.com' },
    }),
  )
})

afterEach(() => {
  localStorage.clear()
  document.execCommand = originalExecCommand
  if (originalShare) Object.defineProperty(navigator, 'share', originalShare)
  else delete (navigator as { share?: unknown }).share
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else delete (navigator as { clipboard?: unknown }).clipboard
})

describe('com navigator.share (celular)', () => {
  it('abre a folha nativa com o link do quiz, sem PII', async () => {
    const share = vi.fn(async (_data: ShareData) => undefined)
    setShare(share)
    render(<ShareButton placement="results" />)

    await userEvent.click(screen.getByRole('button', { name: 'Compartilhar com a família' }))

    expect(share).toHaveBeenCalledTimes(1)
    const data = share.mock.calls[0]?.[0] ?? {}
    expectNoPii(data.url ?? '')
    expect(new URL(data.url ?? '').searchParams.get('utm_medium')).toBe('native')
    expect(data.text).not.toMatch(/Maria|80/)
    expect(mocks.track).toHaveBeenCalledWith('share_clicked', { method: 'native', placement: 'results' })
    expect(screen.getByTestId('share-options')).not.toBeVisible()
  })

  it('fechar a folha (AbortError) não mostra nada', async () => {
    setShare(vi.fn(async () => Promise.reject(new DOMException('cancelado', 'AbortError'))))
    render(<ShareButton placement="results" />)
    await userEvent.click(screen.getByTestId('share-button'))
    expect(screen.getByTestId('share-options')).not.toBeVisible()
  })

  it('outro erro da folha cai para WhatsApp e copiar', async () => {
    setShare(vi.fn(async () => Promise.reject(new DOMException('negado', 'NotAllowedError'))))
    render(<ShareButton placement="results" />)
    await userEvent.click(screen.getByTestId('share-button'))
    await waitFor(() => expect(screen.getByTestId('share-options')).toBeVisible())
  })
})

describe('sem navigator.share (desktop, navegador embutido)', () => {
  beforeEach(() => setShare(undefined))

  it('o botão abre as opções (aria-expanded) com WhatsApp e copiar', async () => {
    render(<ShareButton placement="analysis" />)
    const button = screen.getByTestId('share-button')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('share-options')).not.toBeVisible()

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(button.getAttribute('aria-controls') ?? '')).toBeVisible()
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('WhatsApp: wa.me com a mensagem e o link sem PII, em nova aba', async () => {
    render(<ShareButton placement="analysis" />)
    await userEvent.click(screen.getByTestId('share-button'))
    const link = screen.getByRole('link', { name: 'Enviar pelo WhatsApp' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))

    const wa = new URL(link.getAttribute('href') ?? '')
    expect(wa.origin).toBe('https://wa.me')
    const text = wa.searchParams.get('text') ?? ''
    const shared = text.slice(text.indexOf('http'))
    expectNoPii(shared)
    expect(new URL(shared).searchParams.get('utm_medium')).toBe('whatsapp')
    expect(new URL(shared).searchParams.get('utm_campaign')).toBe('analysis')

    link.addEventListener('click', (event) => event.preventDefault())
    await userEvent.click(link)
    expect(mocks.track).toHaveBeenCalledWith('share_clicked', { method: 'whatsapp', placement: 'analysis' })
  })

  it('copiar: grava o link e avisa', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    setClipboard(writeText)
    render(<ShareButton placement="results" />)
    await userEvent.click(screen.getByTestId('share-button'))
    await userEvent.click(screen.getByRole('button', { name: 'Copiar link' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expectNoPii(writeText.mock.calls[0]?.[0] ?? '')
    expect(await screen.findByRole('button', { name: 'Link copiado' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Link copiado')
    expect(mocks.track).toHaveBeenCalledWith('share_clicked', { method: 'copy_link', placement: 'results' })
  })

  it('cópia impossível: mostra o link para copiar à mão', async () => {
    setClipboard(vi.fn(async () => Promise.reject(new Error('negado'))))
    document.execCommand = vi.fn(() => false)
    render(<ShareButton placement="results" />)
    await userEvent.click(screen.getByTestId('share-button'))
    await userEvent.click(screen.getByRole('button', { name: 'Copiar link' }))

    const input = await screen.findByTestId('share-manual-link')
    expectNoPii((input as HTMLInputElement).value)
    expect(input).toHaveClass('text-base')
  })
})

describe('ShareWithFamily', () => {
  it('título, aviso de que o resultado não vai junto e o botão', () => {
    setShare(undefined)
    render(<ShareWithFamily placement="results" />)
    const section = screen.getByRole('region', { name: /família/i })
    expect(section).toHaveTextContent(/seu resultado e seus dados não vão junto/i)
    expect(screen.getByTestId('share-button')).toHaveClass('min-h-12')
  })
})
