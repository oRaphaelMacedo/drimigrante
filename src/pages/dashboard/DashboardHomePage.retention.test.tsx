// @vitest-environment jsdom
// Retenção na home (DI-049, DI-078, DI-072): próximo passo, convite de instalação e eventos.
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessState, hasFeatureAccess, type AccessSubscription } from '@/lib/access'
import { OFFER } from '@/lib/offer'

const mocks = vi.hoisted(() => ({
  auth: null as unknown,
  result: null as unknown,
  docs: [] as unknown[],
  track: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/hooks/useAssessmentResult', () => ({
  useAssessmentResult: () => ({ result: mocks.result, isLoading: false, hasDbResult: !!mocks.result, error: null }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: mocks.docs, error: null }) }) }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: new Error('bloqueado no teste') })) },
  },
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn(), captureMessage: vi.fn() } }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

import { DashboardHomePage } from './DashboardHomePage'
import { resetPwaInstallStateForTests, type BeforeInstallPromptEvent } from '@/hooks/usePwaInstall'

const DAY = 86_400_000
const USER_ID = '00000000-0000-4000-8000-000000000001'

function subscription(daysLeft: number): AccessSubscription & { one_time_paid_at: string } {
  return {
    one_time_paid: true,
    one_time_paid_at: new Date(Date.now() - (30 - daysLeft) * DAY).toISOString(),
    one_time_access_expires_at: new Date(Date.now() + daysLeft * DAY).toISOString(),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
  }
}

function setAuth(sub: ReturnType<typeof subscription> | null) {
  const authUser = { user: { id: USER_ID, email: 'ana@example.com' }, profile: { full_name: 'Ana Souza' }, subscription: sub, roles: [] }
  mocks.auth = {
    authUser,
    session: {},
    loading: false,
    userDataError: null,
    refreshUser: vi.fn(async () => authUser),
    access: getAccessState(sub),
    hasAccess: (feature: Parameters<typeof hasFeatureAccess>[1]) => hasFeatureAccess(sub, feature),
    isHubUser: false,
    isStaffUser: false,
    signOut: vi.fn(),
  }
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function fireInstallPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent
  Object.assign(event, { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome: 'accepted' }) })
  act(() => {
    window.dispatchEvent(event)
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(`di_dashboard_v1:welcome_seen:${USER_ID}`, '1')
  mocks.docs = []
  mocks.track.mockClear()
  resetPwaInstallStateForTests()
  mocks.result = {
    assessmentId: '00000000-0000-4000-8000-0000000000aa',
    scoreNumeric: 80,
    scoreCategory: 'alta',
    scoreLabel: 'Alta elegibilidade',
    scorePercentage: 80,
    suggestedVisaTypes: [],
    iaExplanationShort: 'Resumo',
    leadName: 'Ana Souza',
    leadEmail: 'ana@example.com',
    completedAt: new Date(Date.now() - 3 * DAY).toISOString(),
    pathways: [{ code: 'nacionalidade_casamento', name: 'Naturalização pelo Casamento', match: 'strong' }],
    localVisas: [],
    analysisReady: true,
  }
})

describe('DashboardHomePage — próximo passo (DI-049)', () => {
  it('ativo: card com o primeiro documento pendente, barra X/Y e ação secundária', async () => {
    setAuth(subscription(20))
    const { container } = renderHome()

    const card = await screen.findByTestId('next-step-card')
    expect(screen.getByTestId('next-step-progress')).toHaveTextContent('0 de 3 itens prontos')
    expect(screen.getByTestId('next-step-label')).toHaveTextContent('passaporte ou documento de identificação')
    const link = screen.getByTestId('next-step-link')
    expect(link).toHaveAttribute('href', '/dashboard/documents#doc-passaporte')
    expect(link).not.toHaveAttribute('data-primary-cta')
    // A ação principal da tela continua única ("Ver minha análise").
    expect(container.querySelectorAll('[data-primary-cta]')).toHaveLength(1)
    expect(card.textContent).not.toContain('A_PREENCHER')
    expect(card.textContent).not.toContain(OFFER.recurring.priceLabel)
  })

  it('documento enviado conta no progresso e na linha do tempo', async () => {
    mocks.docs = [
      {
        id: 'd1',
        document_type: 'passaporte',
        display_name: 'Passaporte',
        file_name: 'p.pdf',
        storage_path: `${USER_ID}/general/passaporte/1.pdf`,
        file_size: 1000,
        mime_type: 'application/pdf',
        status: 'uploaded',
        feedback: null,
        created_at: new Date().toISOString(),
      },
    ]
    setAuth(subscription(20))
    renderHome()
    await waitFor(() => expect(screen.getByTestId('next-step-progress')).toHaveTextContent('1 de 3'))
    expect(screen.getByTestId('next-step-link')).toHaveAttribute('href', '/dashboard/documents#doc-assento_nascimento')
    expect(screen.getByTestId('timeline-documents')).toHaveTextContent('1 documento enviado')
  })

  it('não pagante e expirado: sem card de próximo passo', async () => {
    setAuth(null)
    const first = renderHome()
    await waitFor(() => expect(screen.getByTestId('dashboard-result')).toBeInTheDocument())
    expect(screen.queryByTestId('next-step-card')).toBeNull()
    first.unmount()

    setAuth(subscription(-3))
    renderHome()
    await screen.findByTestId('access-banner-expired')
    expect(screen.queryByTestId('next-step-card')).toBeNull()
  })
})

describe('DashboardHomePage — convite de instalação (DI-078)', () => {
  it('pós-compra: aparece com o prompt nativo disponível', async () => {
    setAuth(subscription(20))
    renderHome()
    fireInstallPrompt()
    expect(await screen.findByTestId('pwa-install-card')).toBeInTheDocument()
  })

  it('quem não pagou: nunca aparece', () => {
    setAuth(null)
    renderHome()
    fireInstallPrompt()
    expect(screen.queryByTestId('pwa-install-card')).toBeNull()
  })
})

describe('DashboardHomePage — eventos (DI-072)', () => {
  it('dashboard_viewed com status e dias restantes, sem PII', () => {
    setAuth(subscription(20))
    renderHome()
    expect(mocks.track).toHaveBeenCalledWith('dashboard_viewed', { plan_status: 'active', days_left: 20 })
    expect(JSON.stringify(mocks.track.mock.calls)).not.toMatch(/ana@example\.com|Ana Souza/)
  })

  it('perto de expirar e expirado disparam os eventos do aviso de prazo', async () => {
    setAuth(subscription(5))
    const first = renderHome()
    await waitFor(() => expect(mocks.track).toHaveBeenCalledWith('access_expiring_viewed', { days_left: 5 }))
    first.unmount()

    setAuth(subscription(-2))
    renderHome()
    await waitFor(() => expect(mocks.track).toHaveBeenCalledWith('access_expired_viewed'))
  })
})
