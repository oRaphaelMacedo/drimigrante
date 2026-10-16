// @vitest-environment jsdom
/**
 * DI-038 — navegação pública: âncoras com ScrollRestoration, menu do celular e
 * modo foco do funil. useAuth, analytics e o CookieBanner são mockados (nenhuma
 * chamada de rede); a LandingPage é a real, para testar as âncoras de verdade.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authUser: null as null | { user: { id: string } },
  signOut: vi.fn(),
  track: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ authUser: mocks.authUser, signOut: mocks.signOut }),
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))
vi.mock('@/components/CookieBanner', () => ({ CookieBanner: () => null }))

import { Layout } from './Layout'
import { LandingPage } from '@/pages/LandingPage'

const scrolledIds: string[] = []
const originalScrollIntoView = Element.prototype.scrollIntoView
const originalScrollTo = window.scrollTo

beforeEach(() => {
  mocks.authUser = null
  mocks.signOut.mockResolvedValue(undefined)
  scrolledIds.length = 0
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolledIds.push(this.id)
  }
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView
  window.scrollTo = originalScrollTo
})

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <LandingPage /> },
          { path: '/termos', element: <h1>Termos de Serviço</h1> },
          { path: '/privacidade', element: <h1>Privacidade</h1> },
          { path: '/cookies', element: <h1>Cookies</h1> },
          { path: '/login', element: <h1>Entrar na sua conta</h1> },
          { path: '/quiz', element: <h1>Quiz</h1> },
          { path: '/results', element: <h1>Resultado</h1> },
          { path: '/checkout', element: <h1>Checkout</h1> },
          { path: '/checkout/success', element: <h1>Pagamento confirmado</h1> },
          { path: '/dashboard', element: <h1>Painel</h1> },
        ],
      },
    ],
    {
      initialEntries: [path],
      // Mesmas flags do router do app (src/router/index.tsx e App.tsx).
      future: {
        v7_relativeSplatPath: true,
        v7_fetcherPersist: true,
        v7_normalizeFormMethod: true,
        v7_partialHydration: true,
        v7_skipActionErrorRevalidation: true,
      },
    },
  )
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />)
  return router
}

const menuToggle = () => screen.getByRole('button', { name: /abrir menu|fechar menu/i })
const mobileMenu = () => screen.getByRole('navigation', { name: 'Menu', hidden: true })
const fullFooter = () => document.querySelector('footer[data-variant="full"]')
const compactFooter = () => document.querySelector('footer[data-variant="compact"]')

describe('âncoras da landing', () => {
  it('o link do rodapé para /#como-funciona leva à seção, com margem do header fixo', async () => {
    const user = userEvent.setup()
    const router = renderAt('/termos')

    await user.click(within(fullFooter() as HTMLElement).getByRole('link', { name: 'Como funciona' }))

    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.hash).toBe('#como-funciona')
    const section = document.getElementById('como-funciona')
    expect(section).toHaveClass('scroll-mt-16')
    await waitFor(() => expect(scrolledIds).toContain('como-funciona'))
  })

  it('o link do header para /#precos leva à seção de preços', async () => {
    const user = userEvent.setup()
    renderAt('/termos')

    await user.click(menuToggle())
    await user.click(within(mobileMenu()).getByRole('link', { name: 'Preços' }))

    expect(document.getElementById('precos')).toHaveClass('scroll-mt-16')
    await waitFor(() => expect(scrolledIds).toContain('precos'))
  })

  it('o "Como funciona" do hero navega pelo router (sem <a href="#">)', async () => {
    const user = userEvent.setup()
    const router = renderAt('/')
    const hero = document.querySelector('main section') as HTMLElement

    await user.click(within(hero).getByRole('link', { name: /como funciona/i }))

    expect(router.state.historyAction).toBe('PUSH')
    expect(router.state.location.hash).toBe('#como-funciona')
    await waitFor(() => expect(scrolledIds).toContain('como-funciona'))
  })

  it('voltar devolve a posição salva em vez de pular de novo para o hash', async () => {
    const router = renderAt('/termos')
    await act(() => router.navigate('/#precos'))
    await waitFor(() => expect(scrolledIds).toContain('precos'))
    await act(() => router.navigate('/termos'))

    scrolledIds.length = 0
    await act(() => router.navigate(-1))

    expect(router.state.location.hash).toBe('#precos')
    // Duas pinturas: o efeito da landing roda em requestAnimationFrame.
    await act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(scrolledIds).toEqual([])
  })
})

describe('menu do celular', () => {
  it('alterna aria-expanded e controla o painel do menu', async () => {
    const user = userEvent.setup()
    renderAt('/')
    const toggle = menuToggle()

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAccessibleName('Abrir menu')
    const panel = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
    expect(panel).not.toBeNull()
    expect(panel).not.toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveAccessibleName('Fechar menu')
    expect(panel).toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toBeVisible()
  })

  it('tem Como funciona, Preços, Entrar e o CTA do diagnóstico', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await user.click(menuToggle())

    const menu = within(mobileMenu())
    expect(menu.getByRole('link', { name: 'Como funciona' })).toHaveAttribute('href', '/#como-funciona')
    expect(menu.getByRole('link', { name: 'Preços' })).toHaveAttribute('href', '/#precos')
    expect(menu.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
    const cta = menu.getByRole('link', { name: 'Fazer o diagnóstico grátis' })
    expect(cta).toHaveAttribute('href', '/quiz')
    expect(cta).toHaveClass('min-h-12')
  })

  it('fecha depois de navegar e não reabre ao voltar', async () => {
    const user = userEvent.setup()
    const router = renderAt('/')

    await user.click(menuToggle())
    await user.click(within(mobileMenu()).getByRole('link', { name: 'Entrar' }))

    expect(router.state.location.pathname).toBe('/login')
    expect(menuToggle()).toHaveAttribute('aria-expanded', 'false')

    await act(() => router.navigate(-1))
    expect(router.state.location.pathname).toBe('/')
    expect(menuToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('fecha numa navegação programática (sem clique no menu)', async () => {
    const user = userEvent.setup()
    const router = renderAt('/')

    await user.click(menuToggle())
    await act(() => router.navigate('/termos'))

    expect(menuToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape fecha e devolve o foco ao botão do menu', async () => {
    const user = userEvent.setup()
    renderAt('/')

    await user.click(menuToggle())
    within(mobileMenu()).getByRole('link', { name: 'Preços' }).focus()
    await user.keyboard('{Escape}')

    expect(menuToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(menuToggle()).toHaveFocus()
  })

  it('toque fora do header fecha o menu', async () => {
    const user = userEvent.setup()
    renderAt('/termos')

    await user.click(menuToggle())
    await user.click(screen.getByRole('heading', { level: 1, name: 'Termos de Serviço' }))

    expect(menuToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('logado: mostra Meu painel e Sair (que sai e volta para a home)', async () => {
    mocks.authUser = { user: { id: 'u1' } }
    const user = userEvent.setup()
    const router = renderAt('/termos')

    await user.click(menuToggle())
    const menu = within(mobileMenu())
    expect(menu.getByRole('link', { name: 'Meu painel' })).toHaveAttribute('href', '/dashboard')
    expect(menu.queryByRole('link', { name: 'Entrar' })).toBeNull()

    await user.click(menu.getByRole('button', { name: 'Sair' }))
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('o CTA do header registra o clique com a posição', async () => {
    const user = userEvent.setup()
    renderAt('/termos')

    await user.click(menuToggle())
    await user.click(within(mobileMenu()).getByRole('link', { name: 'Fazer o diagnóstico grátis' }))

    expect(mocks.track).toHaveBeenCalledWith('landing_cta_clicked', { position: 'header_menu' })
  })
})

describe('modo foco do funil', () => {
  it.each(['/quiz', '/results', '/checkout'])('%s: header reduzido, sem Footer e links legais numa linha', (path) => {
    renderAt(path)

    expect(fullFooter()).toBeNull()
    const footer = compactFooter() as HTMLElement
    expect(footer).not.toBeNull()
    const legalHrefs = within(footer)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(legalHrefs).toEqual(['/termos', '/privacidade', '/cookies'])

    expect(screen.queryByRole('button', { name: /abrir menu/i })).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull()
    const header = screen.getByRole('banner')
    expect(within(header).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(['/'])
    expect(header).not.toHaveClass('sticky')
  })

  it.each(['/', '/termos', '/login', '/checkout/success'])('%s: navegação completa e rodapé completo', (path) => {
    renderAt(path)

    expect(fullFooter()).not.toBeNull()
    expect(compactFooter()).toBeNull()
    expect(menuToggle()).toBeInTheDocument()
  })
})

describe('copy do header e do rodapé', () => {
  it('não promete análise jurídica nem advogados e avisa que não é aconselhamento jurídico', () => {
    renderAt('/termos')
    const header = screen.getByRole('banner').textContent ?? ''
    const footer = fullFooter()?.textContent ?? ''

    for (const text of [header, footer]) {
      expect(text).not.toMatch(/advogad/i)
      expect(text).not.toMatch(/análise jurídica/i)
    }
    expect(footer).toMatch(/não constituem aconselhamento jurídico/i)
  })

  it('links do rodapé têm alvo de pelo menos 44px (min-h-11)', () => {
    renderAt('/termos')
    const links = within(fullFooter() as HTMLElement).getAllByRole('link')
    // O primeiro é a marca; os demais são navegação e links legais.
    for (const link of links.slice(1)) expect(link).toHaveClass('min-h-11')
  })
})
