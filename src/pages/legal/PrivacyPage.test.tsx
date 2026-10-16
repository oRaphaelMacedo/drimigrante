// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PRIVACY_EMAIL } from '@/config/contact'
import { RETENTION } from '@/lib/retention'

vi.mock('@/lib/analytics', () => ({ isMetaPixelConfigured: () => false }))

import { PrivacyPage } from './PrivacyPage'

function renderPrivacy() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <PrivacyPage />
    </MemoryRouter>,
  )
}

describe('PrivacyPage (DI-083)', () => {
  it('prazos de retenção vêm de RETENTION (os mesmos da migration)', () => {
    const { container } = renderPrivacy()
    const text = container.textContent ?? ''
    expect(text).toContain(`removidos ${RETENTION.anonymousAssessmentDays} dias`)
    expect(text).toContain(`${RETENTION.waitlistMonths} meses`)
    expect(text).toContain(`${RETENTION.emailContentDays} dias`)
    expect(text).toContain(`${RETENTION.emailAddressDays} dias`)
    // O texto antigo ("mais 5 anos" e "indefinidamente") não corresponde ao que o banco faz.
    expect(text).not.toMatch(/5 anos|indefinidamente/)
  })

  it('explica como baixar e apagar os dados pela Conta, e o que fica guardado', () => {
    renderPrivacy()
    const link = screen.getAllByRole('link', { name: 'Conta → Privacidade' })[0]
    expect(link).toHaveAttribute('href', '/dashboard/settings?aba=privacidade')
    const text = document.body.textContent ?? ''
    expect(text).toContain('Baixar meus dados')
    expect(text).toContain('Apagar minha conta')
    expect(text).toMatch(/registros de pagamento/i)
  })

  it('exportação: a análise completa só com acesso ativo; diagnósticos sem conta pelo e-mail (DI-016)', () => {
    const { container } = renderPrivacy()
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/diagnósticos e análise/)
    expect(text).toContain('A análise completa vai no arquivo enquanto o seu acesso estiver ativo.')
    expect(text).toMatch(/Diagnósticos feitos sem entrar na conta não vão no arquivo/)
  })

  it('usa o contato de privacidade central e cita ANPD e CNPD', () => {
    renderPrivacy()
    const mail = screen.getAllByRole('link', { name: PRIVACY_EMAIL })
    expect(mail.length).toBeGreaterThan(0)
    expect(mail[0].getAttribute('href')).toMatch(new RegExp(`^mailto:${PRIVACY_EMAIL}`))
    expect(screen.getByRole('link', { name: 'gov.br/anpd' })).toHaveAttribute('href', 'https://www.gov.br/anpd')
    expect(screen.getByRole('link', { name: 'cnpd.pt' })).toBeInTheDocument()
  })

  it('não renderiza placeholders nem campos da empresa vazios', () => {
    const { container } = renderPrivacy()
    expect(container.textContent).not.toMatch(/A_PREENCHER|null|undefined/)
    expect(container.textContent).not.toMatch(/Razão social:|NIF:|Sede:/)
  })
})
