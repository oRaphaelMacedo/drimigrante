// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    authUser: {
      user: { id: 'u1', email: 'admin@example.test' },
      profile: { full_name: 'Ana Admin' },
      roles: ['super_admin'],
    },
  }),
}))

import { AdminLayout } from './AdminLayout'

// O <ScrollRestoration/> rola a janela a cada navegação; o jsdom não implementa scrollTo.
Object.defineProperty(window, 'scrollTo', { value: () => undefined, writable: true })

const SECTIONS = ['Visão geral', 'Leads', 'Pipeline', 'Quiz', 'Escritórios', 'Configuração de IA', 'Configurações']

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin', element: <h1>Visão geral do admin</h1> },
          { path: '/admin/leads', element: <h1>Página de leads</h1> },
          { path: '/admin/quiz/history', element: <h1>Histórico</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />)
  return router
}

describe('AdminLayout (DI-073)', () => {
  it('o botão de menu abre o painel com as 7 seções', async () => {
    renderAt('/admin')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu do admin' }))

    const drawer = await screen.findByRole('dialog', { name: 'Menu do admin' })
    const nav = within(drawer).getByRole('navigation', { name: 'Navegação do admin' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent?.trim())).toEqual(SECTIONS)
    expect(within(nav).getByRole('link', { name: /Visão geral/ })).toHaveAttribute('aria-current', 'page')
  })

  it('fecha o painel ao navegar por um item', async () => {
    const router = renderAt('/admin')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu do admin' }))
    const drawer = await screen.findByRole('dialog', { name: 'Menu do admin' })
    fireEvent.click(within(drawer).getByRole('link', { name: /Leads/ }))

    expect(await screen.findByRole('heading', { name: 'Página de leads' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/leads')
    expect(screen.queryByRole('dialog', { name: 'Menu do admin' })).not.toBeInTheDocument()
  })

  it('marca a seção pai em subpáginas e não repete o h1 da página no cabeçalho', () => {
    renderAt('/admin/quiz/history')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const sidebarNav = screen.getAllByRole('navigation', { name: 'Navegação do admin' })[0]
    expect(within(sidebarNav).getByRole('link', { name: /Quiz/ })).toHaveAttribute('aria-current', 'page')
    expect(within(sidebarNav).getByRole('link', { name: /Visão geral/ })).not.toHaveAttribute('aria-current')
  })

  it('a coluna do conteúdo tem min-w-0 (tabelas e kanban não alargam a página)', () => {
    renderAt('/admin')
    expect(screen.getByRole('main')).toHaveClass('min-w-0')
    expect(screen.getByRole('main').parentElement).toHaveClass('min-w-0')
  })

  it('usa pt-BR (sem "Definições")', () => {
    renderAt('/admin')
    expect(document.body.textContent).not.toMatch(/Defini[cç][õo]es|Dr Imigrante/)
  })
})
