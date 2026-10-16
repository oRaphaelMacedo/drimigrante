// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  leads: [] as Array<Record<string, unknown>>,
  update: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => ({ limit: async () => ({ data: mocks.leads, error: null }) }) }),
      update: (patch: unknown) => ({
        eq: async (column: string, value: unknown) => {
          mocks.update(patch, column, value)
          // O "banco" guarda a mudança: o refetch depois da mutação já vem atualizado.
          const row = mocks.leads.find((lead) => lead[column] === value)
          if (row) Object.assign(row, patch)
          return { error: null }
        },
      }),
    }),
  },
}))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { AdminPipelinePage } from './AdminPipelinePage'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdminPipelinePage />
    </QueryClientProvider>,
  )
}

const column = (title: string) => screen.getByRole('listitem', { name: title })

beforeEach(() => {
  mocks.update.mockReset()
  mocks.leads = [
    {
      id: 'lead-1',
      full_name: 'Ana Souza',
      email: 'ana@example.com',
      phone: null,
      status: 'completed',
      completion_percentage: 100,
      crm_stage: 'novo',
      created_at: '2026-10-10T12:00:00Z',
      answers: { score_category: 'alta', score_label: 'Alta probabilidade' },
    },
    {
      id: 'lead-2',
      full_name: null,
      email: null,
      phone: null,
      status: 'incomplete',
      completion_percentage: 40,
      crm_stage: 'proposta',
      created_at: '2026-10-11T12:00:00Z',
      answers: null,
    },
  ]
})

describe('AdminPipelinePage (DI-073 / DI-088)', () => {
  it('mostra as 4 colunas em pt-BR com os leads na fase certa', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Pipeline CRM' })).toBeInTheDocument()

    const titles = within(screen.getByRole('list', { name: 'Fases do CRM' }))
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(titles).toEqual(['Novos leads', 'Contatados', 'Proposta enviada', 'Convertidos'])

    expect(within(column('Novos leads')).getByText('Ana Souza')).toBeInTheDocument()
    expect(within(column('Novos leads')).getByText('Alta probabilidade')).toBeInTheDocument()
    expect(within(column('Proposta enviada')).getByText('Lead anônimo')).toBeInTheDocument()
    expect(within(column('Proposta enviada')).getByText('40% completo')).toBeInTheDocument()
    expect(within(column('Contatados')).getByText('Sem leads')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Contactad|Anónimo|Largar|actualizar/)
  })

  it('o quadro rola na horizontal sem alargar a página', async () => {
    renderPage()
    const board = await screen.findByRole('list', { name: 'Fases do CRM' })
    expect(board).toHaveClass('overflow-x-auto', 'min-w-0')
  })

  it('o menu do cartão move o lead (alternativa ao arrastar)', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await screen.findByText('Ana Souza')

    await user.click(screen.getByRole('button', { name: 'Mover o lead Ana Souza' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Novo' })).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: 'Convertido' }))

    await waitFor(() => expect(within(column('Convertidos')).getByText('Ana Souza')).toBeInTheDocument())
    expect(mocks.update).toHaveBeenCalledWith({ crm_stage: 'convertido' }, 'id', 'lead-1')
  })
})
