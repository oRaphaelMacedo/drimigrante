// @vitest-environment jsdom
/**
 * DI-034 / DI-035 — landing de nacionalidade, honesta e com CTA ao alcance.
 * Analytics mockado (nenhuma chamada de rede).
 */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))

import { LandingPage } from './LandingPage'
import { OFFER } from '@/lib/offer'
import { SUPPORT_EMAIL } from '@/config/contact'

function renderLanding() {
  const router = createMemoryRouter(
    [
      { path: '/', element: <LandingPage /> },
      { path: '/quiz', element: <h1>Quiz</h1> },
      { path: '/privacidade', element: <h1>Privacidade</h1> },
    ],
    {
      initialEntries: ['/'],
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

beforeEach(() => {
  mocks.track.mockReset()
})

describe('copy honesta (DI-034)', () => {
  it('não mostra plano mensal, promessas falsas nem textos de visto', () => {
    renderLanding()
    const text = document.body.textContent ?? ''

    for (const forbidden of [
      /4,90/,
      new RegExp(OFFER.recurring.priceLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      /válido para sempre/i,
      /mais popular/i,
      /20 perguntas/i,
      /advogados? especializad/i,
      /análise jurídica/i,
      /ilimitad/i,
      /\b24 ?h\b/i,
      /garanti/i,
      /reembolso/i,
      /A_PREENCHER/,
      /visto para Portugal/i,
    ]) {
      expect(text).not.toMatch(forbidden)
    }
  })

  it('H1 sobre nacionalidade e microcopy do diagnóstico', () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/nacionalidade portuguesa/i)
    expect(screen.getAllByText('Grátis · sem criar conta · poucos minutos').length).toBeGreaterThan(0)
  })

  it('um único cartão de preço, vindo de OFFER', () => {
    renderLanding()
    const offer = screen.getByTestId('landing-offer')
    expect(within(offer).getByText(OFFER.priceLabel)).toBeInTheDocument()
    expect(offer).toHaveTextContent(`acesso por ${OFFER.accessDays} dias`)
    for (const item of OFFER.includes) expect(within(offer).getByText(item)).toBeInTheDocument()
    expect(screen.queryByTestId('cta-pricing-subscription')).toBeNull()
    // Todo valor em euros da página é o do pagamento único.
    const prices = document.body.textContent?.match(/€\s?\d+(?:[.,]\d+)?/g) ?? []
    expect(prices.length).toBeGreaterThan(0)
    expect(new Set(prices)).toEqual(new Set([OFFER.priceLabel]))
  })

  it('a prévia do resultado é rotulada como ilustrativa', () => {
    renderLanding()
    expect(screen.getByText(/exemplo ilustrativo/i)).toBeInTheDocument()
  })
})

describe('CTAs', () => {
  it('mantém o cta-start-quiz-hero e registra a posição do clique', async () => {
    const user = userEvent.setup()
    const router = renderLanding()
    const hero = screen.getByTestId('cta-start-quiz-hero')
    expect(hero).toHaveAttribute('href', '/quiz')

    await user.click(hero)
    expect(mocks.track).toHaveBeenCalledWith('landing_cta_clicked', { position: 'hero' })
    expect(router.state.location.pathname).toBe('/quiz')
  })

  it.each([
    ['cta-pricing-onetime', 'pricing'],
    ['cta-start-quiz-final', 'final'],
    ['cta-start-quiz-sticky', 'sticky'],
  ])('%s leva ao quiz (posição %s)', async (testId, position) => {
    const user = userEvent.setup()
    renderLanding()
    const link = screen.getByTestId(testId)
    expect(link).toHaveAttribute('href', '/quiz')
    await user.click(link)
    expect(mocks.track).toHaveBeenCalledWith('landing_cta_clicked', { position })
  })

  it('CTA fixo do celular com 48px (Button md) dentro da barra fixa', () => {
    renderLanding()
    const bar = screen.getByTestId('sticky-cta')
    expect(bar).toHaveClass('fixed', 'md:hidden')
    expect(within(bar).getByTestId('cta-start-quiz-sticky')).toHaveClass('min-h-12')
  })
})

describe('FAQ e quem somos (DI-035)', () => {
  it('tem 6+ perguntas, inclusive a dos 30 dias, fechadas por padrão', () => {
    renderLanding()
    const faq = screen.getByTestId('landing-faq')
    const items = faq.querySelectorAll('details')
    expect(items.length).toBeGreaterThanOrEqual(6)
    for (const item of items) expect(item).not.toHaveAttribute('open')
    const summaries = [...faq.querySelectorAll('summary')].map((s) => s.textContent ?? '')
    expect(summaries.some((q) => q.includes(`${OFFER.accessDays} dias`))).toBe(true)
    expect(faq.textContent).toMatch(/não substitui a orientação de um advogado/i)
  })

  it('quem somos usa só dados reais: sem identificação legal enquanto COMPANY for null', () => {
    renderLanding()
    expect(screen.queryByTestId('landing-company-identification')).toBeNull()
    const contact = screen.getByRole('link', { name: SUPPORT_EMAIL })
    expect(contact).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`)
  })

  it('sem depoimentos enquanto a lista estiver vazia', () => {
    renderLanding()
    expect(screen.queryByTestId('landing-testimonials')).toBeNull()
  })
})

describe('âncoras', () => {
  it('seções #como-funciona, #precos e #perguntas-frequentes com margem do header', () => {
    renderLanding()
    for (const id of ['como-funciona', 'precos', 'perguntas-frequentes']) {
      expect(document.getElementById(id)).toHaveClass('scroll-mt-16')
    }
  })
})
