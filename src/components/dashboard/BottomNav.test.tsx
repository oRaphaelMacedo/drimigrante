// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { getAccessState, hasFeatureAccess, type AccessSubscription } from '@/lib/access'

const mocks = vi.hoisted(() => ({ auth: null as unknown }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

import { BottomNav } from './BottomNav'
import { SignOutButton } from './SignOutButton'

const DAY = 86_400_000

function setAuth(sub: AccessSubscription | null, signOut = vi.fn()) {
  mocks.auth = {
    authUser: { user: { id: 'u1', email: 'ana@example.com' }, profile: null, subscription: sub, roles: [] },
    access: getAccessState(sub),
    hasAccess: (feature: Parameters<typeof hasFeatureAccess>[1]) => hasFeatureAccess(sub, feature),
    signOut,
  }
  return signOut
}

const paid: AccessSubscription = {
  one_time_paid: true,
  one_time_access_expires_at: new Date(Date.now() + 20 * DAY).toISOString(),
  recurring_active: false,
  has_dashboard_access: true,
  has_full_analysis: true,
  has_chat_access: false,
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              {ui}
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('5 seções com rótulo, a atual com aria-current="page"', () => {
    setAuth(paid)
    renderAt('/dashboard/documents', <BottomNav />)

    const nav = screen.getByRole('navigation', { name: 'Navegação do painel' })
    const links = Array.from(nav.querySelectorAll('a'))
    expect(links.map((link) => link.textContent?.replace('(bloqueado)', '').trim())).toEqual([
      'Início',
      'Análise',
      'Chat',
      'Documentos',
      'Conta',
    ])
    expect(screen.getByTestId('bottom-nav-documents')).toHaveAttribute('aria-current', 'page')
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page')).toHaveLength(1)
  })

  it('chat sem acesso: cadeado anunciado e leva à oferta no Início', () => {
    setAuth(paid)
    renderAt('/dashboard', <BottomNav />)

    const chat = screen.getByTestId('bottom-nav-chat')
    expect(chat).toHaveTextContent('(bloqueado)')
    expect(chat).toHaveAttribute('href', '/dashboard?upsell=chat')
  })

  it('some com um campo de texto focado (teclado aberto)', async () => {
    setAuth(paid)
    renderAt(
      '/dashboard',
      <>
        <textarea aria-label="Mensagem" />
        <BottomNav />
      </>,
    )
    const nav = screen.getByTestId('bottom-nav')
    expect(nav).toHaveAttribute('data-state', 'visible')
    fireEvent.focusIn(screen.getByLabelText('Mensagem'))
    await waitFor(() => expect(nav).toHaveAttribute('data-state', 'hidden'))
  })
})

describe('SignOutButton', () => {
  it('sair exige confirmação', async () => {
    const signOut = setAuth(paid)
    renderAt('/dashboard/settings', <SignOutButton />)

    fireEvent.click(screen.getByTestId('sign-out-open'))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Sair da conta?')
    expect(signOut).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(signOut).not.toHaveBeenCalled()
  })

  it('confirmado: sai e volta para o início', async () => {
    const signOut = setAuth(paid)
    const { supabase } = await import('@/lib/supabase')
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: null } as never)
    renderAt('/dashboard/settings', <SignOutButton />)

    fireEvent.click(screen.getByTestId('sign-out-open'))
    fireEvent.click(await screen.findByTestId('sign-out-confirm'))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/))
  })

  it('se a sessão continuar (sem conexão), avisa e não finge que saiu', async () => {
    const signOut = setAuth(paid)
    const { supabase } = await import('@/lib/supabase')
    const { toast } = await import('sonner')
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: {} }, error: null } as never)
    renderAt('/dashboard/settings', <SignOutButton />)

    fireEvent.click(screen.getByTestId('sign-out-open'))
    fireEvent.click(await screen.findByTestId('sign-out-confirm'))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não foi possível sair', expect.anything()))
    expect(screen.getByTestId('location')).toHaveTextContent('/dashboard/settings')
  })
})
