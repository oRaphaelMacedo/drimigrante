// @vitest-environment jsdom
// Aba "Privacidade" da Conta (DI-083): integração com SettingsPage (a aba
// "Meu plano" e as demais continuam cobertas por SettingsPage.test.tsx).
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessState } from '@/lib/access'

const mocks = vi.hoisted(() => ({
  auth: null as unknown,
  invoke: vi.fn(),
  track: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/hooks/useAssessmentResult', () => ({ useAssessmentResult: () => ({ result: null, isLoading: false }) }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    auth: { signOut: vi.fn(() => Promise.resolve({ error: null })) },
  },
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn(), captureMessage: vi.fn() } }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { SettingsPage } from './SettingsPage'

vi.setConfig({ testTimeout: 20_000 })

const USER_ID = '00000000-0000-4000-8000-000000000001'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.search}</output>
}

function renderSettings(path: string) {
  const authUser = {
    user: { id: USER_ID, email: 'ana@example.com' },
    profile: { id: USER_ID, full_name: 'Ana Souza', phone: '', notification_preferences: {} },
    subscription: null,
    roles: [],
  }
  mocks.auth = {
    authUser,
    session: { user: { id: USER_ID, email: 'ana@example.com' } },
    refreshUser: vi.fn(async () => authUser),
    access: getAccessState(null, { isStaff: false }),
    isStaffUser: false,
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SettingsPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('SettingsPage — aba Privacidade', () => {
  it('?aba=privacidade abre a aba com exportar e apagar', () => {
    renderSettings('/dashboard/settings?aba=privacidade')
    expect(screen.getByRole('tab', { name: 'Privacidade' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('settings-privacy')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Baixar meus dados/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Apagar minha conta/ })).toBeInTheDocument()
  })

  it('a aba entra na URL e as abas antigas continuam lá (inclusive Meu plano)', () => {
    renderSettings('/dashboard/settings')
    for (const name of ['Perfil', 'Meu plano', 'Notificações', 'Segurança', 'Privacidade']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    const tab = screen.getByRole('tab', { name: 'Privacidade' })
    fireEvent.mouseDown(tab)
    fireEvent.click(tab)
    expect(screen.getByTestId('location')).toHaveTextContent('aba=privacidade')
  })
})
