// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessState } from '@/lib/access'
import { OFFER } from '@/lib/offer'

// ── Mocks (nada de rede: Supabase, functions e analytics) ───────────────────

const mocks = vi.hoisted(() => ({
  auth: null as unknown,
  invoke: vi.fn(),
  signOut: vi.fn(),
  track: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
    auth: { signOut: (...args: unknown[]) => mocks.signOut(...args) },
  },
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { PrivacyPanel } from './PrivacyPanel'

vi.setConfig({ testTimeout: 20_000 })

const USER_ID = '00000000-0000-4000-8000-000000000001'
const EMAIL = 'ana@example.com'
const DAY = 86_400_000

type Sub = Record<string, unknown> | null

function setAuth(sub: Sub, { isStaff = false } = {}) {
  const typed = sub as Parameters<typeof getAccessState>[0]
  mocks.auth = {
    authUser: { user: { id: USER_ID, email: EMAIL }, profile: null, subscription: sub, roles: [] },
    session: { user: { id: USER_ID, email: EMAIL } },
    access: getAccessState(typed, { isStaff }),
    isStaffUser: isStaff,
  }
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/dashboard/settings?aba=privacidade']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/dashboard/settings" element={<PrivacyPanel />} />
        <Route path="/" element={<p>Página inicial</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const createObjectURL = vi.fn(() => 'blob:meus-dados')
const revokeObjectURL = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.signOut.mockResolvedValue({ error: null })
  Object.assign(URL, { createObjectURL, revokeObjectURL })
  window.localStorage.clear()
})

describe('PrivacyPanel — baixar meus dados', () => {
  it('gera o JSON pela function e dispara o download', async () => {
    setAuth(null)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    mocks.invoke.mockResolvedValue({ data: { formato: 'doutor-imigrante/meus-dados@1' }, error: null })
    renderPanel()
    fireEvent.click(screen.getByTestId('privacy-export-btn'))
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    expect(mocks.invoke).toHaveBeenCalledWith('export-my-data', expect.anything())
    expect(createObjectURL).toHaveBeenCalled()
    expect(mocks.toast.success).toHaveBeenCalledWith('Arquivo pronto.', expect.anything())
    // Sem analytics nestes fluxos.
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('falha mostra mensagem em pt-BR', async () => {
    setAuth(null)
    mocks.invoke.mockResolvedValue({ data: null, error: new Error('boom') })
    renderPanel()
    fireEvent.click(screen.getByTestId('privacy-export-btn'))
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalled())
    expect(String(mocks.toast.error.mock.calls[0][0])).toMatch(/Não foi possível|Algo deu errado|servidor/)
  })
})

describe('PrivacyPanel — apagar a conta', () => {
  it('confirmação dupla: abre o sheet e só habilita com o e-mail da conta digitado', async () => {
    setAuth(null)
    renderPanel()
    fireEvent.click(screen.getByTestId('privacy-delete-open'))
    const dialog = await screen.findByRole('dialog', { name: 'Apagar sua conta?' })
    const confirm = within(dialog).getByTestId('delete-account-confirm')
    expect(confirm).toBeDisabled()

    const input = within(dialog).getByLabelText(/Para confirmar, digite/)
    expect(input).toHaveAttribute('type', 'email')
    fireEvent.change(input, { target: { value: 'outra@example.com' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(input, { target: { value: ' ANA@example.com ' } })
    expect(confirm).toBeEnabled()
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('sucesso: chama delete-account, limpa o aparelho, sai localmente e vai para a página inicial', async () => {
    setAuth(null)
    window.localStorage.setItem('dr_imigrante_quiz_result', '{"email":"ana@example.com"}')
    mocks.invoke.mockResolvedValue({ data: { deleted: true, retained: { payments: 1 } }, error: null })
    renderPanel()
    fireEvent.click(screen.getByTestId('privacy-delete-open'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByTestId('delete-account-email'), { target: { value: EMAIL } })
    fireEvent.click(within(dialog).getByTestId('delete-account-confirm'))

    expect(await screen.findByText('Página inicial')).toBeInTheDocument()
    expect(mocks.invoke).toHaveBeenCalledWith('delete-account', expect.objectContaining({ body: { confirm_email: EMAIL } }))
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(window.localStorage.getItem('dr_imigrante_quiz_result')).toBeNull()
    expect(mocks.toast.success).toHaveBeenCalledWith('Sua conta foi apagada.', expect.anything())
  })

  it('erro do servidor aparece no sheet e nada de sair da conta', async () => {
    setAuth(null)
    const { FunctionsHttpError } = await import('@supabase/supabase-js')
    mocks.invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(new Response(JSON.stringify({ error: 'open_case' }), { status: 409 })),
    })
    renderPanel()
    fireEvent.click(screen.getByTestId('privacy-delete-open'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByTestId('delete-account-email'), { target: { value: EMAIL } })
    fireEvent.click(within(dialog).getByTestId('delete-account-confirm'))
    expect(await within(dialog).findByTestId('delete-account-error')).toHaveTextContent('processo em andamento')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('assinante: avisa que a assinatura é cancelada na hora', async () => {
    setAuth({
      one_time_paid: true,
      one_time_paid_at: new Date(Date.now() - 40 * DAY).toISOString(),
      one_time_access_expires_at: new Date(Date.now() - 10 * DAY).toISOString(),
      recurring_active: true,
      recurring_started_at: new Date(Date.now() - 10 * DAY).toISOString(),
      has_dashboard_access: true,
    })
    renderPanel()
    fireEvent.click(screen.getByTestId('privacy-delete-open'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('delete-account-recurring')).toHaveTextContent(OFFER.recurring.priceLabel)
  })

  it('€30 no prazo: avisa que o acesso restante é perdido; sem €4,90 para quem não assina', async () => {
    setAuth({
      one_time_paid: true,
      one_time_paid_at: new Date(Date.now() - 5 * DAY).toISOString(),
      one_time_access_expires_at: new Date(Date.now() + 25 * DAY).toISOString(),
      recurring_active: false,
      has_dashboard_access: true,
    })
    renderPanel()
    fireEvent.click(screen.getByTestId('privacy-delete-open'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('delete-account-one-time')).toHaveTextContent('Você perde agora o acesso')
    expect(dialog.textContent).not.toContain(OFFER.recurring.priceLabel)
  })

  it('conta da equipe não vê o botão de apagar', () => {
    setAuth(null, { isStaff: true })
    renderPanel()
    expect(screen.queryByTestId('privacy-delete-open')).toBeNull()
    expect(screen.getByTestId('privacy-staff-note')).toBeInTheDocument()
  })

  it('nenhum placeholder renderizado', () => {
    setAuth(null)
    const { container } = renderPanel()
    expect(container.textContent).not.toMatch(/A_PREENCHER|TODO/)
  })
})
