// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessState, hasFeatureAccess } from '@/lib/access'
import { OFFER } from '@/lib/offer'
import { SUPPORT_EMAIL } from '@/config/contact'
import { addCalendarMonths, formatFullDate, getRecurringSummary } from '@/components/dashboard/plan-summary'

// ── Mocks (nada de rede: Supabase, functions, analytics) ────────────────────

const mocks = vi.hoisted(() => ({
  auth: null as unknown,
  result: null as unknown,
  invoke: vi.fn(),
  update: vi.fn(),
  signOut: vi.fn(),
  track: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/hooks/useAssessmentResult', () => ({
  useAssessmentResult: () => ({ result: mocks.result, isLoading: false }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ update: (values: unknown) => ({ eq: (column: string, value: unknown) => mocks.update(values, column, value) }) }),
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    auth: { signOut: (...args: unknown[]) => mocks.signOut(...args) },
  },
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn(), captureMessage: vi.fn() } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { SettingsPage } from './SettingsPage'

// A primeira renderização carrega Radix Tabs/Switch: folga para máquinas lentas.
vi.setConfig({ testTimeout: 20_000 })

const DAY = 86_400_000
const USER_ID = '00000000-0000-4000-8000-000000000001'

type Sub = Record<string, unknown>

function oneTime(daysLeft: number): Sub {
  return {
    one_time_paid: true,
    one_time_paid_at: new Date(Date.now() - (30 - daysLeft) * DAY).toISOString(),
    one_time_access_expires_at: new Date(Date.now() + daysLeft * DAY).toISOString(),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
    stripe_customer_id: 'cus_TEST123',
  }
}

function recurring(startedDaysAgo: number, extra: Sub = {}): Sub {
  const startedAt = new Date(Date.now() - startedDaysAgo * DAY)
  return {
    ...oneTime(-10),
    recurring_active: true,
    recurring_started_at: startedAt.toISOString(),
    recurring_cancel_at: addCalendarMonths(startedAt, 12).toISOString(),
    stripe_subscription_id: 'sub_TEST',
    ...extra,
  }
}

function setAuth(sub: Sub | null, { isStaff = false } = {}) {
  const authUser = {
    user: { id: USER_ID, email: 'ana@example.com' },
    profile: { id: USER_ID, full_name: 'Ana Souza', phone: '', notification_preferences: { process_updates: true, offers: false } },
    subscription: sub,
    roles: [],
  }
  const typed = sub as Parameters<typeof getAccessState>[0]
  mocks.auth = {
    authUser,
    session: { user: { email: 'ana@example.com' } },
    refreshUser: vi.fn(async () => authUser),
    access: getAccessState(typed, { isStaff }),
    hasAccess: (feature: Parameters<typeof hasFeatureAccess>[1]) => hasFeatureAccess(typed, feature, { isStaff }),
  }
}

function renderSettings(path = '/dashboard/settings') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.result = { assessmentId: '00000000-0000-4000-8000-0000000000aa', pathways: [], localVisas: [] }
  mocks.update.mockResolvedValue({ data: null, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } })
})

describe('SettingsPage — título, abas e perfil', () => {
  it('título unificado "Conta" e labels ligadas aos campos', () => {
    setAuth(oneTime(20))
    renderSettings()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Conta')
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Ana Souza')
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@example.com')
    const phone = screen.getByLabelText('Telefone ou WhatsApp')
    expect(phone).toHaveAttribute('type', 'tel')
    // Placeholder neutro: nada de número português de exemplo.
    expect(phone.getAttribute('placeholder') ?? '').not.toMatch(/\+351 9/)
  })

  it('salvar o perfil atualiza o banco e recarrega a conta (nome novo no painel)', async () => {
    setAuth(oneTime(20))
    renderSettings()
    fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Maria Souza' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ full_name: 'Ana Maria Souza', phone: null })
    expect(mocks.update.mock.calls[0][1]).toBe('id')
    await waitFor(() => expect((mocks.auth as { refreshUser: ReturnType<typeof vi.fn> }).refreshUser).toHaveBeenCalled())
  })

  it('telefone inválido mostra erro no campo e não salva', async () => {
    setAuth(oneTime(20))
    renderSettings()
    fireEvent.change(screen.getByLabelText('Telefone ou WhatsApp'), { target: { value: 'meu número' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira o número')
    expect(screen.getByLabelText('Telefone ou WhatsApp')).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('SettingsPage — Meu plano', () => {
  it('pagamento único: fim do acesso, sem renovação automática, sem botão do portal', () => {
    setAuth(oneTime(20))
    renderSettings('/dashboard/settings?aba=plano')
    const plan = screen.getByTestId('settings-plan')
    expect(plan).toHaveAttribute('data-plan-kind', 'one_time')
    expect(within(plan).getByTestId('settings-plan-status')).toHaveTextContent('Pagamento único')
    expect(plan).toHaveTextContent(/Acesso até\s*\d{2}\/\d{2}\/\d{4} \(faltam 20 dias\)/)
    expect(plan).toHaveTextContent('Não renova sozinho')
    expect(screen.queryByTestId('settings-portal-btn')).toBeNull()
    expect(mocks.track).toHaveBeenCalledWith('settings_plan_viewed', { plan_status: 'active' })
  })

  it('assinatura: próxima cobrança, 12ª cobrança e término; o portal chama a function e redireciona', async () => {
    const sub = recurring(40)
    setAuth(sub)
    renderSettings('/dashboard/settings?aba=plano')
    const plan = screen.getByTestId('settings-plan')
    expect(plan).toHaveAttribute('data-plan-kind', 'recurring')
    expect(within(plan).getByTestId('settings-plan-status')).toHaveTextContent('Assinatura ativa')

    const startedAt = new Date(sub.recurring_started_at as string)
    const summary = getRecurringSummary(sub, new Date())
    expect(plan).toHaveTextContent(`Próxima cobrança${formatFullDate(summary.nextChargeAt!)} (prevista)`)
    expect(plan).toHaveTextContent(`12ª e última cobrança${formatFullDate(addCalendarMonths(startedAt, 11))}`)
    expect(plan).toHaveTextContent(`A assinatura termina em${formatFullDate(addCalendarMonths(startedAt, 12))}`)
    expect(plan).toHaveTextContent(SUPPORT_EMAIL)

    mocks.invoke.mockResolvedValueOnce({ data: { url: 'https://billing.stripe.com/p/session/test_123' }, error: null })
    fireEvent.click(screen.getByTestId('settings-portal-btn'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session/test_123'))
    expect(mocks.invoke).toHaveBeenCalledWith('create-portal-session', expect.objectContaining({ body: {} }))
    expect(mocks.track).toHaveBeenCalledWith('portal_clicked', { placement: 'settings_plan' })
    expect(mocks.track).toHaveBeenCalledWith('settings_plan_viewed', { plan_status: 'recurring' })
  })

  it('portal indisponível (function sem customer): mensagem amigável e o suporte continua visível', async () => {
    setAuth(recurring(10))
    renderSettings('/dashboard/settings?aba=plano')
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'customer_not_found' }), { status: 404 })),
    })
    fireEvent.click(screen.getByTestId('settings-portal-btn'))
    expect(await screen.findByTestId('settings-portal-error')).toHaveTextContent('Não encontramos uma assinatura')
    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute('href', expect.stringContaining(`mailto:${SUPPORT_EMAIL}`))
  })

  it('cancelamento agendado antes das 12 cobranças aparece como tal', () => {
    const startedAt = new Date(Date.now() - 40 * DAY)
    setAuth(recurring(40, { recurring_cancel_at: addCalendarMonths(startedAt, 3).toISOString() }))
    renderSettings('/dashboard/settings?aba=plano')
    const plan = screen.getByTestId('settings-plan')
    expect(plan).toHaveTextContent(`Cancelamento agendado para${formatFullDate(addCalendarMonths(startedAt, 3))}`)
    expect(plan).not.toHaveTextContent('12ª e última cobrança')
  })

  it('expirado: data do fim e oferta de €4,90 (quem já pagou)', () => {
    setAuth(oneTime(-3))
    renderSettings('/dashboard/settings?aba=plano')
    const plan = screen.getByTestId('settings-plan')
    expect(plan).toHaveAttribute('data-plan-kind', 'expired')
    expect(plan).toHaveTextContent(/terminou em \d{2}\/\d{2}\/\d{4}/)
    expect(screen.getByTestId('subscription-upsell-card')).toHaveTextContent(OFFER.recurring.priceLabel)
  })

  it('não pagante: oferta de €30, nunca €4,90', () => {
    setAuth(null)
    const { container } = renderSettings('/dashboard/settings?aba=plano')
    expect(screen.getByTestId('settings-plan')).toHaveAttribute('data-plan-kind', 'free')
    expect(container.textContent).toContain(OFFER.priceLabel)
    expect(container.textContent).not.toContain(OFFER.recurring.priceLabel)
  })
})

describe('SettingsPage — segurança', () => {
  it('"Sair dos outros aparelhos" usa scope others, sem toast "Em breve"', async () => {
    setAuth(oneTime(20))
    renderSettings('/dashboard/settings?aba=seguranca')
    fireEvent.click(screen.getByTestId('settings-signout-others'))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'others' }))
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled())
    const messages = JSON.stringify([...mocks.toast.mock.calls, ...mocks.toast.success.mock.calls])
    expect(messages).not.toMatch(/Em breve/i)
  })
})

describe('getRecurringSummary', () => {
  it('sem data de início: sem datas inventadas', () => {
    const summary = getRecurringSummary({ recurring_started_at: null }, new Date())
    expect(summary).toEqual({ startedAt: null, nextChargeAt: null, lastChargeAt: null, endsAt: null, cancelScheduled: false })
  })

  it('31/jan + 1 mês = último dia de fevereiro (mesmo critério do Stripe)', () => {
    expect(addCalendarMonths(new Date('2027-01-31T10:00:00Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z')
  })

  it('depois da 12ª cobrança não há próxima', () => {
    const startedAt = new Date('2026-01-10T12:00:00Z')
    const summary = getRecurringSummary(
      { recurring_started_at: startedAt.toISOString() },
      new Date('2026-12-20T12:00:00Z'),
    )
    expect(summary.lastChargeAt?.toISOString()).toBe('2026-12-10T12:00:00.000Z')
    expect(summary.nextChargeAt).toBeNull()
    expect(summary.endsAt?.toISOString()).toBe('2027-01-10T12:00:00.000Z')
  })
})
