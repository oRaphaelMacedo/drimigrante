// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PRIVACY_EMAIL, SUPPORT_EMAIL } from '@/config/contact'
import { OFFER } from '@/lib/offer'
import { TermsPage } from './TermsPage'

function renderTerms() {
  return render(
    <MemoryRouter>
      <TermsPage />
    </MemoryRouter>,
  )
}

describe('TermsPage', () => {
  it('descreve o pagamento único a partir do OFFER (preço, itens e 30 dias)', () => {
    const { container } = renderTerms()
    const text = container.textContent ?? ''

    expect(text).toContain(`${OFFER.priceLabel}, pagamento único`)
    for (const item of OFFER.includes) expect(text).toContain(item)
    expect(text).toContain(`${OFFER.accessDays} dias`)
    expect(text).toContain(OFFER.delivery)
  })

  it('descreve o plano recorrente com o limite de ciclos e cancelamento pelo suporte', () => {
    const { container } = renderTerms()
    const text = container.textContent ?? ''

    expect(text).toContain(OFFER.recurring.priceLabel)
    for (const benefit of OFFER.recurring.benefits) expect(text).toContain(benefit)
    expect(text).toContain(`${OFFER.recurring.maxCycles} cobranças`)
    expect(text).not.toMatch(/ilimitad/i)
    expect(text).not.toMatch(/atualizações regulatórias/i)
  })

  it('não promete garantia, revisão humana nem nega reembolso enquanto OFFER disser null', () => {
    const { container } = renderTerms()
    const text = container.textContent ?? ''

    expect(OFFER.guarantee).toBeNull()
    expect(text).not.toMatch(/garantia/i)
    expect(text).not.toMatch(/não é reembolsável/i)
    expect(text).not.toMatch(/revis(ão|ado|ada) humana/i)
    expect(text).not.toMatch(/relatório jurídico/i)
  })

  it('usa só os e-mails de contact.ts nos links mailto', () => {
    const { container } = renderTerms()
    const mailtos = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="mailto:"]'))

    expect(mailtos.length).toBeGreaterThan(0)
    for (const link of mailtos) {
      const address = link.getAttribute('href')!.replace('mailto:', '').split('?')[0]
      expect([SUPPORT_EMAIL, PRIVACY_EMAIL]).toContain(address)
      expect(link.textContent).toBe(address)
    }
    expect(container.textContent).not.toMatch(/doutorimigrante\.com/)
  })

  it('não renderiza identificação da empresa com campos null nem placeholders', () => {
    const { container } = renderTerms()
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/Razão social|NIF:|Sede:/)
    expect(text).not.toMatch(/A_PREENCHER|null|undefined/)
  })

  it('não mostra botão de WhatsApp quando o link está vazio', () => {
    const { container } = renderTerms()

    expect(container.querySelector('a[href*="wa.me"], a[href*="whatsapp"]')).toBeNull()
  })
})
