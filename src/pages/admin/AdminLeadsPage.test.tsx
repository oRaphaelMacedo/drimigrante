// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks (nada de rede) ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  leads: [] as Array<Record<string, unknown>>,
  loadError: null as { message: string } | null,
  selected: [] as string[],
  update: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: (columns: string) => {
        mocks.selected.push(columns)
        return {
          order: () => ({
            limit: async () =>
              mocks.loadError ? { data: null, error: mocks.loadError } : { data: mocks.leads, error: null },
          }),
        }
      },
      update: (patch: unknown) => ({
        eq: async (column: string, value: unknown) => {
          mocks.update(patch, column, value)
          return { error: null }
        },
      }),
    }),
  },
}))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: (...args: unknown[]) => mocks.toastSuccess(...args), error: vi.fn() }),
}))

import { AdminLeadsPage } from './AdminLeadsPage'

beforeAll(() => {
  // Radix (menu suspenso) mede o gatilho com ResizeObserver, que o jsdom não tem.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

function lead(id: string, extra: Record<string, unknown>) {
  return {
    id,
    full_name: null,
    email: null,
    phone: null,
    status: 'incomplete',
    completion_percentage: 0,
    crm_stage: 'novo',
    created_at: '2026-10-10T12:00:00Z',
    ...extra,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AdminLeadsPage />
    </QueryClientProvider>,
  )
}

/** Lista de cartões (celular); a tabela do desktop também está no DOM do jsdom. */
const mobileList = () => screen.getAllByRole('list')[0]

beforeEach(() => {
  mocks.selected = []
  mocks.loadError = null
  mocks.update.mockReset()
  mocks.toastSuccess.mockReset()
  mocks.leads = [
    lead('aaaaaaaa-0000-4000-8000-000000000001', {
      full_name: 'Ana Souza',
      email: 'ana@example.com',
      status: 'completed',
      completion_percentage: 100,
      crm_stage: 'contactado',
    }),
    lead('bbbbbbbb-0000-4000-8000-000000000002', { full_name: 'Bruno Lima', phone: '+351 912 345 678' }),
    lead('cccccccc-0000-4000-8000-000000000003', { full_name: 'Carla Dias', crm_stage: 'valor_antigo' }),
  ]
})

describe('AdminLeadsPage (DI-073 / DI-088 / DI-080)', () => {
  it('lê só as colunas usadas (sem select *) e mostra as fases em pt-BR', async () => {
    renderPage()
    expect(await screen.findAllByText('Ana Souza')).not.toHaveLength(0)
    expect(mocks.selected[0]).not.toContain('*')
    expect(mocks.selected[0]).toContain('crm_stage')

    expect(within(mobileList()).getAllByText('Contatado')).toHaveLength(1)
    // Fase desconhecida no banco conta como "Novo".
    expect(within(mobileList()).getAllByText('Novo')).toHaveLength(2)
    expect(screen.getByRole('columnheader', { name: 'Contato' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Contacto|Acções|Gerir|pt-PT/)
  })

  it('filtra por fase com contagem nos botões', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await screen.findAllByText('Ana Souza')

    const filter = screen.getByRole('button', { name: /Contatados \(1\)/ })
    await user.click(filter)
    expect(filter).toHaveAttribute('aria-pressed', 'true')
    expect(within(mobileList()).getByText('Ana Souza')).toBeInTheDocument()
    expect(within(mobileList()).queryByText('Bruno Lima')).not.toBeInTheDocument()
    expect(screen.getByText('1 de 3 leads')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Novos \(2\)/ }))
    expect(within(mobileList()).getByText('Carla Dias')).toBeInTheDocument()
    expect(within(mobileList()).queryByText('Ana Souza')).not.toBeInTheDocument()
  })

  it('busca por nome ou e-mail', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await screen.findAllByText('Ana Souza')
    await user.type(screen.getByRole('searchbox', { name: /Buscar leads/ }), 'EXAMPLE.COM')
    expect(within(mobileList()).getByText('Ana Souza')).toBeInTheDocument()
    expect(within(mobileList()).queryByText('Bruno Lima')).not.toBeInTheDocument()
  })

  it('o menu de ações move o lead para outra fase (valor do banco, rótulo em pt-BR)', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await screen.findAllByText('Bruno Lima')

    await user.click(within(mobileList()).getByRole('button', { name: 'Ações do lead Bruno Lima' }))
    const menu = await screen.findByRole('menu')
    // A fase atual não aparece; "Novo" (atual) fica de fora.
    expect(within(menu).queryByRole('menuitem', { name: 'Novo' })).not.toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: 'Contatado' }))

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({ crm_stage: 'contactado' }, 'id', 'bbbbbbbb-0000-4000-8000-000000000002'),
    )
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith('Lead movido para "Contatado"'))
  })

  it('erro de carga oferece "Tentar de novo", que refaz a consulta', async () => {
    const user = userEvent.setup({ delay: null })
    mocks.loadError = { message: 'falha de rede' }
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os leads.')

    mocks.loadError = null
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findAllByText('Ana Souza')).not.toHaveLength(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.selected).toHaveLength(2)
  })
})
