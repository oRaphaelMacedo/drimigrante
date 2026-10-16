// @vitest-environment jsdom
/**
 * DI-035 — identificação da empresa no rodapé só com dados reais: campos
 * `null`/placeholder de COMPANY não aparecem.
 * W4-04 — o rodapé reserva a barra fixa só quando ela está visível
 * (`--sticky-cta-h`), sem os 5,5rem fixos que dobravam o espaço em branco.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const company = vi.hoisted(() => ({
  value: { brandName: 'Doutor Imigrante', legalName: null, nif: null, address: null } as {
    brandName: string
    legalName: string | null
    nif: string | null
    address: string | null
  },
}))

vi.mock('@/data/company', async () => {
  const actual = await vi.importActual<typeof import('@/data/company')>('@/data/company')
  return {
    ...actual,
    get COMPANY() {
      return company.value
    },
    getCompanyIdentification: () => actual.getCompanyIdentification(company.value),
  }
})

import { Footer } from './Footer'
import { STICKY_CTA_RESERVE_ATTR } from '@/components/ui/sticky-bar'

function renderFooter() {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>,
  )
  return screen.getByRole('contentinfo')
}

describe('Footer — identificação da empresa', () => {
  it('com os campos em null mostra só a marca, sem rótulos vazios', () => {
    company.value = { brandName: 'Doutor Imigrante', legalName: null, nif: null, address: null }
    const footer = renderFooter()
    expect(footer).toHaveTextContent('Doutor Imigrante. Todos os direitos reservados.')
    expect(footer.textContent).not.toMatch(/NIF|Sede|Razão social|A_PREENCHER/)
  })

  it('mostra só os campos preenchidos (placeholder conta como vazio)', () => {
    company.value = { brandName: 'Doutor Imigrante', legalName: 'Empresa Exemplo, Lda.', nif: 'A_PREENCHER', address: 'Lisboa' }
    const footer = renderFooter()
    expect(footer).toHaveTextContent('Empresa Exemplo, Lda. Todos os direitos reservados.')
    expect(screen.getByTestId('footer-company-address')).toHaveTextContent('Sede: Lisboa')
    expect(screen.queryByTestId('footer-company-nif')).toBeNull()
    expect(footer.textContent).not.toMatch(/A_PREENCHER/)
  })
})

describe('Footer — reserva da barra fixa (W4-04)', () => {
  it.each(['full', 'compact'] as const)('%s: reserva --sticky-cta-h (ou a safe-area) e o banner de cookies', (variant) => {
    render(
      <MemoryRouter>
        <Footer variant={variant} />
      </MemoryRouter>,
    )
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveAttribute(STICKY_CTA_RESERVE_ATTR)
    expect(footer.className).toContain(
      'pb-[calc(max(var(--sticky-cta-h,0px),env(safe-area-inset-bottom,0px))+var(--cookie-banner-h,0px))]',
    )
    expect(footer.className).not.toContain('5.5rem')
  })

  it('compacto: links legais com "Termos e condições" como nome acessível', () => {
    render(
      <MemoryRouter>
        <Footer variant="compact" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Termos e condições' })).toHaveAttribute('href', '/termos')
  })
})
