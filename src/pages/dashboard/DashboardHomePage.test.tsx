// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessState, hasFeatureAccess, type AccessSubscription } from '@/lib/access'
import { OFFER } from '@/lib/offer'
import type { AssessmentResult } from '@/hooks/useAssessmentResult'

// ── Mocks (nada de rede: Supabase, functions, analytics e Sentry falsos) ─────

const mocks = vi.hoisted(() => ({
  auth: null as unknown,
  result: null as unknown,
  refreshUser: null as unknown,
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/hooks/useAssessmentResult', () => ({
  useAssessmentResult: () => ({ result: mocks.result, isLoading: false, hasDbResult: !!mocks.result, error: null }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: new Error('bloqueado no teste') })) },
  },
}))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn(), captureMessage: vi.fn() } }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }))

import { DashboardHomePage } from './DashboardHomePage'

// ── Cenários ────────────────────────────────────────────────────────────────

const DAY = 86_400_000
const USER_ID = '00000000-0000-4000-8000-000000000001'

function subscription(daysLeft: number, extra: Partial<AccessSubscription> = {}) {
  return {
    one_time_paid: true,
    one_time_paid_at: new Date(Date.now() - (30 - daysLeft) * DAY).toISOString(),
    one_time_access_expires_at: new Date(Date.now() + daysLeft * DAY).toISOString(),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
    ...extra,
  }
}

function setAuth(sub: ReturnType<typeof subscription> | null, { isStaff = false } = {}) {
  const authUser = {
    user: { id: USER_ID, email: 'ana@example.com' },
    profile: { full_name: 'Ana Souza' },
    subscription: sub,
    roles: [],
  }
  const refreshUser = vi.fn(async () => authUser)
  mocks.refreshUser = refreshUser
  mocks.auth = {
    authUser,
    session: {},
    loading: false,
    userDataError: null,
    refreshUser,
    access: getAccessState(sub, { isStaff }),
    hasAccess: (feature: Parameters<typeof hasFeatureAccess>[1]) => hasFeatureAccess(sub, feature, { isStaff }),
    isHubUser: false,
    isStaffUser: isStaff,
    signOut: vi.fn(),
  }
}

function quizResult(extra: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    assessmentId: '00000000-0000-4000-8000-0000000000aa',
    scoreNumeric: 80,
    scoreCategory: 'alta',
    scoreLabel: 'Alta Elegibilidade',
    scorePercentage: 80,
    suggestedVisaTypes: [],
    iaExplanationShort: null,
    iaExplanationFull: '## Caminho\nTexto da análise.',
    leadName: 'Ana Souza',
    leadEmail: 'ana@example.com',
    completedAt: new Date(Date.now() - 3 * DAY).toISOString(),
    localVisas: [
      { code: 'NAC_DESCENDENTE', name: 'Nacionalidade por descendência', match: 'alta' },
      { code: 'NAC_CASAMENTO', name: 'Nacionalidade por casamento', match: 'media' },
    ],
    ...extra,
  }
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderHome(path = '/dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <>
                <DashboardHomePage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function primaryCtas(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-primary-cta]'))
}

const FORBIDDEN_COPY = /Complete o pagamento|alertas?|revisão do processo|ilimitad|Em curso/i

beforeEach(() => {
  window.localStorage.clear()
  // Boas-vindas já vistas, salvo nos testes delas (deixa as telas mais limpas).
  window.localStorage.setItem(`di_dashboard_v1:welcome_seen:${USER_ID}`, '1')
  mocks.result = quizResult()
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Estados de acesso ───────────────────────────────────────────────────────

describe('DashboardHomePage — estados de acesso', () => {
  it('não pagante: €30 no resultado, 1 CTA principal, nunca €4,90', () => {
    setAuth(null)
    const { container } = renderHome()

    const unlock = screen.getByTestId('dashboard-unlock-btn')
    expect(unlock).toHaveTextContent(OFFER.priceLabel)
    expect(unlock).toHaveAttribute('href', '/checkout')
    expect(primaryCtas(container)).toEqual([unlock])
    expect(container.textContent).not.toContain(OFFER.recurring.priceLabel)
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY)
    // Teaser borrado: os nomes dos caminhos não aparecem para quem não pagou.
    expect(container.textContent).not.toContain('Nacionalidade por descendência')
    expect(screen.getByText('2 caminhos identificados')).toBeInTheDocument()
  })

  it('não pagante: card bloqueado abre o sheet do €30 (sem redirecionar)', async () => {
    setAuth(null)
    renderHome()

    fireEvent.click(screen.getByTestId('dashboard-card-chat'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('O chat IA faz parte da análise completa')
    for (const item of OFFER.includes) expect(dialog).toHaveTextContent(item)
    expect(within(dialog).getByTestId('upsell-one-time-btn')).toHaveTextContent(OFFER.priceLabel)
    expect(dialog.textContent).not.toContain(OFFER.recurring.priceLabel)
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard')
  })

  it('ativo com 25 dias: chip com a data, ação principal = ver a análise, sem upsell em destaque', () => {
    setAuth(subscription(25))
    const { container } = renderHome()

    expect(screen.getByTestId('access-chip')).toHaveTextContent(/Acesso até \d{2}\/\d{2} \(25 dias\)/)
    const primary = primaryCtas(container)
    expect(primary).toHaveLength(1)
    expect(primary[0]).toHaveTextContent('Ver minha análise')
    // Logo depois do pagamento (análise ainda não aberta): nenhum card de €4,90.
    expect(screen.queryByTestId('subscription-upsell-card')).toBeNull()
    expect(container.textContent).not.toContain(OFFER.recurring.priceLabel)
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY)
    expect(screen.getByText('Nacionalidade por descendência')).toBeInTheDocument()
  })

  it('ativo, depois de abrir a análise: upsell discreto no fim, nunca como primeiro bloco', () => {
    window.localStorage.setItem(`di_dashboard_v1:analysis_opened:${USER_ID}`, '1')
    setAuth(subscription(25))
    const { container } = renderHome()

    const card = screen.getByTestId('subscription-upsell-card')
    expect(card).toHaveTextContent('€4,90/mês · até 12 meses · cancelamento pelo suporte')
    for (const benefit of OFFER.recurring.benefits) expect(card).toHaveTextContent(benefit)
    expect(card.textContent).not.toMatch(FORBIDDEN_COPY)
    // Fica depois do resultado e da linha do tempo.
    const result = screen.getByTestId('dashboard-result')
    const timeline = screen.getByTestId('timeline-quiz')
    expect(result.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(timeline.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Continua havendo uma única ação principal (o botão do card é secundário).
    expect(primaryCtas(container)).toHaveLength(1)
    expect(within(card).getByTestId('dashboard-subscribe-btn')).not.toHaveAttribute('data-primary-cta')
  })

  it('perto de expirar (5 dias): aviso âmbar com "Manter acesso por €4,90/mês" como ação principal', () => {
    setAuth(subscription(5))
    const { container } = renderHome()

    const banner = screen.getByTestId('access-banner-expiring')
    expect(banner).toHaveTextContent(/Seu acesso termina em \d{2}\/\d{2}/)
    expect(banner).toHaveTextContent(/faltam 5 dias/i)
    const primary = primaryCtas(container)
    expect(primary).toHaveLength(1)
    expect(primary[0]).toHaveTextContent(`Manter acesso por ${OFFER.recurring.priceLabel}`)
    expect(screen.getByTestId('dashboard-open-analysis')).not.toHaveAttribute('data-primary-cta')
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY)
  })

  it('expirado: data do fim, caminhos pelo nome, €4,90 principal e €30 secundário', () => {
    setAuth(subscription(-2))
    const { container } = renderHome('/dashboard?acesso=expirado')

    const banner = screen.getByTestId('access-banner-expired')
    expect(banner).toHaveTextContent(/Seu acesso terminou em \d{2}\/\d{2}/)
    expect(banner).toHaveTextContent('Nacionalidade por descendência')
    expect(banner).toHaveTextContent('Nacionalidade por casamento')
    const primary = primaryCtas(container)
    expect(primary).toHaveLength(1)
    expect(primary[0]).toHaveTextContent(`Assinar por ${OFFER.recurring.priceLabel}`)
    expect(screen.getByTestId('access-banner-one-time')).toHaveTextContent(OFFER.priceLabel)
    expect(container.textContent).not.toMatch(FORBIDDEN_COPY)
    // Documentos continuam acessíveis para baixar/apagar.
    expect(screen.getByTestId('dashboard-card-documents')).toHaveAttribute('href', '/dashboard/documents')
    // O parâmetro é lido e removido da URL.
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/)
  })

  it('assinante: "Assinatura ativa" e nenhuma oferta', () => {
    setAuth(subscription(-40, { recurring_active: true }))
    const { container } = renderHome()

    expect(screen.getByTestId('access-chip')).toHaveTextContent('Assinatura ativa')
    expect(container.textContent).not.toContain(OFFER.recurring.priceLabel)
    expect(container.textContent).not.toContain(`por ${OFFER.priceLabel}`)
    expect(primaryCtas(container)).toHaveLength(1)
  })
})

// ── ?upsell=chat ────────────────────────────────────────────────────────────

describe('DashboardHomePage — /dashboard?upsell=chat', () => {
  it('pagante sem chat: abre o sheet com "€4,90/mês · até 12 meses" e o botão de assinar', async () => {
    setAuth(subscription(20, { has_chat_access: false }))
    renderHome('/dashboard?upsell=chat')

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('upsell-terms')).toHaveTextContent('€4,90/mês · até 12 meses')
    expect(within(dialog).getByTestId('upsell-subscribe-btn')).toHaveTextContent(`Assinar por ${OFFER.recurring.priceLabel}`)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/))
  })

  it('não pagante: o sheet oferece o €30, nunca o €4,90', async () => {
    setAuth(null)
    renderHome('/dashboard?upsell=chat')

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(OFFER.priceLabel)
    expect(dialog.textContent).not.toContain(OFFER.recurring.priceLabel)
  })

  it('expirado: o sheet do chat oferece €4,90 e o €30 como opção secundária', async () => {
    setAuth(subscription(-3))
    renderHome('/dashboard?upsell=chat')

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Volte a usar o chat IA')
    expect(dialog).toHaveTextContent(/Seu acesso de 30 dias terminou em \d{2}\/\d{2}/)
    expect(within(dialog).getByTestId('upsell-subscribe-btn')).toHaveTextContent(`Assinar por ${OFFER.recurring.priceLabel}`)
    expect(within(dialog).getByRole('link', { name: /Comprar mais 30 dias/ })).toHaveTextContent(OFFER.priceLabel)
  })

  it('expirado: tocar num card bloqueado já no Início abre o sheet (sem toque sem resposta)', async () => {
    setAuth(subscription(-3))
    renderHome()

    fireEvent.click(screen.getByTestId('dashboard-card-analysis'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Volte a acessar sua análise')
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/)
  })

  it('quem já tem chat (assinante) não vê sheet nenhum', async () => {
    setAuth(subscription(-40, { recurring_active: true }))
    renderHome('/dashboard?upsell=chat')

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

// ── ?subscribed=1 ───────────────────────────────────────────────────────────

describe('DashboardHomePage — volta do Stripe (?subscribed=1)', () => {
  it('mostra a confirmação, esconde o upsell e consulta a conta', async () => {
    window.localStorage.setItem(`di_dashboard_v1:analysis_opened:${USER_ID}`, '1')
    setAuth(subscription(25))
    renderHome('/dashboard?subscribed=1')

    expect(await screen.findByTestId('subscription-status')).toHaveTextContent('Confirmando sua assinatura')
    expect(screen.queryByTestId('subscription-upsell-card')).toBeNull()
    await waitFor(() => expect(mocks.refreshUser).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/dashboard$/))
  })

  it('para de consultar depois de 20 s sem confirmação', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setAuth(subscription(25))
    renderHome('/dashboard?subscribed=1')

    await screen.findByTestId('subscription-status')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000)
    })
    const calls = (mocks.refreshUser as ReturnType<typeof vi.fn>).mock.calls.length
    expect(calls).toBeGreaterThanOrEqual(9)
    expect(calls).toBeLessThanOrEqual(11)
    expect(screen.getByTestId('subscription-status')).toHaveTextContent('Ainda estamos confirmando')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect((mocks.refreshUser as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })
})

// ── Boas-vindas e linha do tempo ────────────────────────────────────────────

describe('DashboardHomePage — boas-vindas e linha do tempo', () => {
  it('boas-vindas aparecem uma única vez', () => {
    window.localStorage.removeItem(`di_dashboard_v1:welcome_seen:${USER_ID}`)
    setAuth(subscription(29))
    const first = renderHome()
    expect(screen.getByTestId('dashboard-welcome')).toBeInTheDocument()
    first.unmount()

    renderHome()
    expect(screen.queryByTestId('dashboard-welcome')).toBeNull()
  })

  it('saudação sem emoji e sem "Olá, bem-vindo!"', () => {
    setAuth(subscription(20))
    renderHome()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Olá, Ana')
    expect(heading.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('análise ainda sem texto: "Gerando…", nunca "Em curso"', () => {
    mocks.result = quizResult({ iaExplanationFull: null })
    setAuth(subscription(20))
    const { container } = renderHome()
    expect(screen.getByTestId('timeline-analysis')).toHaveTextContent('Gerando…')
    expect(screen.getByTestId('timeline-analysis')).toHaveAttribute('data-status', 'current')
    expect(container.textContent).not.toMatch(/Em curso/)
  })

  it('análise pronta e pagamento com data: etapas concluídas com dado real', () => {
    setAuth(subscription(20))
    renderHome()
    expect(screen.getByTestId('timeline-quiz')).toHaveAttribute('data-status', 'done')
    expect(screen.getByTestId('timeline-payment')).toHaveTextContent(/Desbloqueada em \d{2}\/\d{2}/)
    expect(screen.getByTestId('timeline-analysis')).toHaveAttribute('data-status', 'done')
  })

  it('expirado: a análise não aparece como disponível', () => {
    setAuth(subscription(-3))
    renderHome()
    expect(screen.getByTestId('timeline-analysis')).toHaveTextContent(/Acesso encerrado em \d{2}\/\d{2}/)
    expect(screen.getByTestId('timeline-analysis')).not.toHaveTextContent('Disponível em Minha análise')
  })

  it('não pagante: só o diagnóstico está concluído', () => {
    setAuth(null)
    renderHome()
    expect(screen.getByTestId('timeline-quiz')).toHaveAttribute('data-status', 'done')
    expect(screen.getByTestId('timeline-payment')).toHaveAttribute('data-status', 'current')
    expect(screen.getByTestId('timeline-analysis')).toHaveAttribute('data-status', 'todo')
  })
})
