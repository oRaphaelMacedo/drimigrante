// @vitest-environment jsdom
/**
 * DI-076 — SEO por rota: o RouteMeta aplica o `handle.seo` a cada navegação
 * SPA, sem vazar título/canonical/robots de uma rota para outra; canonical sem
 * query; og:image absoluta (.jpg). Também confere os handles do router real
 * (noindex nas rotas privadas, do funil pós-quiz e 404).
 */
import { act, render } from '@testing-library/react'
import { createMemoryRouter, matchRoutes, RouterProvider, type RouteObject } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), getConsent: () => 'denied', setConsent: vi.fn() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ authUser: null, signOut: vi.fn() }) }))
vi.mock('@/lib/sentry', () => ({ Sentry: { captureException: vi.fn(), captureMessage: vi.fn() } }))

import { RouteMeta } from './RouteMeta'
import { router as appRouter } from './index'
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  DEFAULT_TITLE,
  buildCanonicalUrl,
  mergeRouteSeo,
  useSEO,
} from '@/hooks/useSEO'

const meta = (selector: string) => document.head.querySelector(selector)?.getAttribute('content')
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')

function LegalPage() {
  useSEO({ title: 'Termos e condições', description: 'Termos do serviço.' })
  return <h1>Termos</h1>
}

function renderApp(initial: string) {
  const routes: RouteObject[] = [
    {
      element: <RouteMeta />,
      children: [
        { path: '/', element: <h1>Landing</h1> },
        { path: '/results', element: <h1>Resultado</h1>, handle: { seo: { title: 'Seu pré-resultado', noindex: true } } },
        { path: '/termos', element: <LegalPage />, handle: { seo: { title: 'Termos e condições' } } },
        {
          path: '/dashboard',
          handle: { seo: { title: 'Meu painel', noindex: true } },
          children: [
            { index: true, element: <h1>Painel</h1> },
            { path: 'analysis', element: <h1>Análise</h1>, handle: { seo: { title: 'Sua análise completa' } } },
          ],
        },
      ],
    },
  ]
  const router = createMemoryRouter(routes, {
    initialEntries: [initial],
    // Mesmas flags do router do app (src/router/index.tsx e App.tsx).
    future: {
      v7_relativeSplatPath: true,
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_skipActionErrorRevalidation: true,
    },
  })
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />)
  return router
}

afterEach(() => {
  document.head.innerHTML = ''
  document.title = ''
})

describe('RouteMeta', () => {
  it('aplica os padrões do site na landing, com canonical sem query e og:image absoluta', () => {
    renderApp('/?utm_source=teste&fbclid=abc')

    expect(document.title).toBe(DEFAULT_TITLE)
    expect(meta('meta[name="description"]')).toBe(DEFAULT_DESCRIPTION)
    expect(meta('meta[name="robots"]')).toBe('index,follow')
    expect(canonical()).toBe('https://www.drimigrante.com/')
    expect(meta('meta[property="og:url"]')).toBe('https://www.drimigrante.com/')
    expect(meta('meta[property="og:image"]')).toBe(DEFAULT_OG_IMAGE)
    expect(DEFAULT_OG_IMAGE).toMatch(/^https:\/\/www\.drimigrante\.com\/og-image\.jpg$/)
    expect(meta('meta[property="og:title"]')).toBe(DEFAULT_TITLE)
  })

  it('troca título, robots e canonical na navegação SPA e não vaza para a rota seguinte', async () => {
    const router = renderApp('/')

    await act(() => router.navigate('/results?r=token-secreto'))
    expect(document.title).toBe('Seu pré-resultado — Doutor Imigrante')
    expect(meta('meta[name="robots"]')).toBe('noindex,nofollow')
    expect(canonical()).toBe('https://www.drimigrante.com/results')
    expect(canonical()).not.toContain('token')

    await act(() => router.navigate('/'))
    expect(document.title).toBe(DEFAULT_TITLE)
    expect(meta('meta[name="robots"]')).toBe('index,follow')
    expect(canonical()).toBe('https://www.drimigrante.com/')
  })

  it('rota filha herda o noindex do grupo e define o próprio título', async () => {
    const router = renderApp('/dashboard')
    expect(document.title).toBe('Meu painel — Doutor Imigrante')
    expect(meta('meta[name="robots"]')).toBe('noindex,nofollow')

    await act(() => router.navigate('/dashboard/analysis'))
    expect(document.title).toBe('Sua análise completa — Doutor Imigrante')
    expect(meta('meta[name="robots"]')).toBe('noindex,nofollow')
  })

  it('useSEO da página refina a rota e é desfeito ao sair dela', async () => {
    const router = renderApp('/termos')
    expect(document.title).toBe('Termos e condições — Doutor Imigrante')
    expect(meta('meta[name="description"]')).toBe('Termos do serviço.')

    await act(() => router.navigate('/'))
    expect(document.title).toBe(DEFAULT_TITLE)
    expect(meta('meta[name="description"]')).toBe(DEFAULT_DESCRIPTION)
  })
})

describe('buildCanonicalUrl / mergeRouteSeo', () => {
  it('remove query, hash e barra final', () => {
    expect(buildCanonicalUrl('/quiz/')).toBe('https://www.drimigrante.com/quiz')
    expect(buildCanonicalUrl('/results?r=1#x')).toBe('https://www.drimigrante.com/results')
    expect(buildCanonicalUrl('')).toBe('https://www.drimigrante.com/')
  })

  it('a rota mais interna vence campo a campo', () => {
    expect(
      mergeRouteSeo([undefined, { seo: { title: 'A', noindex: true } }, { other: 1 }, { seo: { title: 'B' } }]),
    ).toEqual({ title: 'B', noindex: true })
  })
})

describe('handles do router do app', () => {
  const seoFor = (path: string) =>
    mergeRouteSeo((matchRoutes(appRouter.routes, path) ?? []).map((match) => match.route.handle))

  it.each([
    '/results',
    '/login',
    '/auth/callback',
    '/checkout',
    '/checkout/success',
    '/dashboard',
    '/dashboard/analysis',
    '/dashboard/chat',
    '/dashboard/documents',
    '/dashboard/settings',
    '/admin',
    '/admin/leads',
    '/rota-que-nao-existe',
  ])('%s tem noindex', (path) => {
    expect(seoFor(path).noindex).toBe(true)
  })

  it.each(['/', '/quiz', '/termos', '/privacidade', '/cookies'])('%s é indexável', (path) => {
    expect(seoFor(path).noindex).not.toBe(true)
  })

  it('o robots.txt não bloqueia rotas com noindex (o robô precisa ler a meta)', () => {
    const robots = readFileSync(resolve(__dirname, '../../public/robots.txt'), 'utf8')
    expect(robots).not.toMatch(/^\s*Disallow:\s*\/\S/m)
    expect(robots).toMatch(/^Sitemap: https:\/\/www\.drimigrante\.com\/sitemap\.xml$/m)
  })
})

describe('index.html alinhado com a landing e o useSEO', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
  const attr = (re: RegExp) => html.match(re)?.[1]

  it('title, og:title e twitter:title são o mesmo produto (nacionalidade)', () => {
    expect(attr(/<title>([^<]+)<\/title>/)).toBe(DEFAULT_TITLE)
    expect(attr(/property="og:title" content="([^"]+)"/)).toBe(DEFAULT_TITLE)
    expect(attr(/name="twitter:title" content="([^"]+)"/)).toBe(DEFAULT_TITLE)
    expect(DEFAULT_TITLE).toMatch(/nacionalidade portuguesa/)
  })

  it('description e og:image iguais aos padrões', () => {
    expect(attr(/name="description" content="([^"]+)"/)).toBe(DEFAULT_DESCRIPTION)
    expect(attr(/property="og:image" content="([^"]+)"/)).toBe(DEFAULT_OG_IMAGE)
    expect(html).not.toMatch(/og-image\.png/)
    expect(html).not.toMatch(/visto para Portugal/i)
  })
})
