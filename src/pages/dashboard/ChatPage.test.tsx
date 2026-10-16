// @vitest-environment jsdom
/**
 * ChatPage sem acesso (DI-013): nada de "Acesso Restrito" com volta silenciosa —
 * a oferta certa abre na própria página. Sem rede: hooks de dados mockados.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessState, hasFeatureAccess, type AccessSubscription } from '@/lib/access'
import { OFFER } from '@/lib/offer'

const mocks = vi.hoisted(() => ({ auth: null as unknown }))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/hooks/useAssessmentResult', () => ({
  useAssessmentResult: () => ({ result: null, isLoading: false, hasDbResult: false, error: null }),
}))
vi.mock('@/hooks/useChatData', () => ({
  useChatData: () => ({
    assessment: { id: 'a1' },
    isLoadingAssessment: false,
    messages: [],
    isLoadingMessages: false,
    sendMessage: vi.fn(),
    isStreaming: false,
    streamingText: '',
    pendingUserMessage: null,
    sendError: null,
  }),
}))
vi.mock('@/lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn() } }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { ChatPage } from './ChatPage'

const DAY = 86_400_000

function setAuth(sub: AccessSubscription | null) {
  mocks.auth = {
    authUser: { user: { id: 'u1' }, profile: null, subscription: sub, roles: [] },
    access: getAccessState(sub),
    hasAccess: (feature: Parameters<typeof hasFeatureAccess>[1]) => hasFeatureAccess(sub, feature),
    refreshUser: vi.fn(async () => null),
  }
}

function paid(extra: Partial<AccessSubscription> = {}): AccessSubscription {
  return {
    one_time_paid: true,
    one_time_access_expires_at: new Date(Date.now() + 20 * DAY).toISOString(),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
    ...extra,
  }
}

function renderChat() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ChatPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.auth = null
  // jsdom não implementa scrollIntoView (usado para rolar até a última mensagem).
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ChatPage', () => {
  it('pagante sem chat: mostra o cadeado e abre o sheet do €4,90 na própria página', async () => {
    setAuth(paid({ has_chat_access: false }))
    renderChat()

    expect(screen.queryByText(/Acesso Restrito/i)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver como liberar' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('upsell-terms')).toHaveTextContent('€4,90/mês · até 12 meses')
    expect(within(dialog).getByTestId('upsell-subscribe-btn')).toBeInTheDocument()
  })

  it('não pagante: a oferta é o €30, nunca o €4,90', async () => {
    setAuth(null)
    const { container } = renderChat()

    fireEvent.click(screen.getByRole('button', { name: 'Ver como liberar' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(OFFER.priceLabel)
    expect(dialog.textContent).not.toContain(OFFER.recurring.priceLabel)
    expect(container.textContent).not.toContain(OFFER.recurring.priceLabel)
  })

  it('assinante abre o chat normalmente', () => {
    setAuth(paid({ recurring_active: true, one_time_access_expires_at: new Date(Date.now() - 40 * DAY).toISOString() }))
    renderChat()

    expect(screen.getByTestId('chat-input')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Mensagem para o assistente' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver como liberar' })).toBeNull()
  })
})
