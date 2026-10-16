/**
 * Rodapé público (DI-038).
 *
 *  - `full` (padrão): marca, navegação e links legais, com alvos de 44px.
 *  - `compact` (modo foco do funil): só os links legais, numa linha.
 *  - O fundo reserva a altura do banner de cookies (`--cookie-banner-h`) e,
 *    só enquanto uma barra fixa está na tela (StickyCTA, navegação do quiz), a
 *    altura dela (`--sticky-cta-h`, que já inclui a safe-area); sem barra, só a
 *    safe-area. Assim os links nunca ficam cobertos no celular e não sobra
 *    espaço em branco no fim da página (DI-079). Como o rodapé reserva, o
 *    StickyCTA dispensa o próprio espaçador (`data-sticky-cta-reserve`).
 *  - Identificação da empresa (razão social, NIF, sede) só com dados reais de
 *    `COMPANY`: campos `null` não aparecem (DI-035).
 */
import { Link } from 'react-router-dom'
import { COMPANY, getCompanyIdentification } from '@/data/company'
import { cn } from '@/lib/utils'
import { Container } from '@/components/ui/Container'
import { STICKY_CTA_RESERVE_ATTR } from '@/components/ui/sticky-bar'
import { BrandLogo } from './BrandLogo'

const SERVICE_LINKS = [
  { to: '/quiz', label: 'Diagnóstico gratuito' },
  { to: '/#como-funciona', label: 'Como funciona' },
  { to: '/#precos', label: 'Preços' },
] as const

const LEGAL_LINKS = [
  { to: '/termos', label: 'Termos e condições', shortLabel: 'Termos' },
  { to: '/privacidade', label: 'Privacidade', shortLabel: 'Privacidade' },
  { to: '/cookies', label: 'Cookies', shortLabel: 'Cookies' },
] as const

const linkClass = cn(
  'inline-flex min-h-11 items-center rounded-md text-sm text-muted-foreground',
  'underline-offset-4 transition-colors hover:text-foreground hover:underline',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
)

/**
 * Espaço no fim do rodapé: a barra fixa visível (que já inclui a safe-area) ou,
 * sem barra, a safe-area; mais o banner de cookies.
 */
const BOTTOM_RESERVE =
  'pb-[calc(max(var(--sticky-cta-h,0px),env(safe-area-inset-bottom,0px))+var(--cookie-banner-h,0px))]'

/** Marca o rodapé como responsável pela reserva da barra fixa (ver StickyCTA). */
const reserveProps = { [STICKY_CTA_RESERVE_ATTR]: '' }

export interface FooterProps {
  /** `compact` no modo foco do funil (quiz, resultado, checkout). */
  variant?: 'full' | 'compact'
}

export function Footer({ variant = 'full' }: FooterProps) {
  if (variant === 'compact') return <CompactFooter />

  const year = new Date().getFullYear()
  const identification = getCompanyIdentification()
  const holder = identification.find((field) => field.key === 'legalName')?.value ?? COMPANY.brandName
  // "Lda." já termina em ponto: não duplica.
  const holderSentence = holder.endsWith('.') ? holder : `${holder}.`

  return (
    <footer data-variant="full" {...reserveProps} className={cn('border-t border-border bg-card', BOTTOM_RESERVE)}>
      <Container className="pb-5 pt-6 sm:pb-6 sm:pt-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4 md:gap-y-8">
          <div className="col-span-2">
            <Link
              to="/"
              className="inline-flex rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <BrandLogo />
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground [text-wrap:pretty]">
              Diagnóstico de elegibilidade à nacionalidade portuguesa, feito a partir das suas
              respostas.
            </p>
          </div>

          <nav aria-labelledby="footer-servico">
            <h2 id="footer-servico" className="text-sm font-semibold text-foreground">
              Serviço
            </h2>
            <ul className="mt-1">
              {SERVICE_LINKS.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-legal">
            <h2 id="footer-legal" className="text-sm font-semibold text-foreground">
              Legal
            </h2>
            <ul className="mt-1">
              {LEGAL_LINKS.map(({ to, label }) => (
                <li key={to}>
                  <Link to={to} className={linkClass}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-5 space-y-1 border-t border-border pt-5 text-center text-sm text-muted-foreground [text-wrap:pretty] sm:mt-8 sm:pt-6">
          <p>
            © {year} {holderSentence} Todos os direitos reservados.
          </p>
          {identification
            .filter((field) => field.key !== 'legalName')
            .map((field) => (
              <p key={field.key} data-testid={`footer-company-${field.key}`}>
                {field.label}: {field.value}
              </p>
            ))}
          <p>As informações deste site não constituem aconselhamento jurídico.</p>
        </div>
      </Container>
    </footer>
  )
}

/**
 * Modo foco: links legais numa linha. A barra de ação fixa (quiz, StickyCTA)
 * fica em `bottom: --cookie-banner-h` e cobriria os links no fim da rolagem: o
 * rodapé reserva a altura dela só enquanto ela está visível (`--sticky-cta-h`;
 * 0px no desktop, onde a barra não é fixa).
 */
function CompactFooter() {
  return (
    <footer
      data-variant="compact"
      {...reserveProps}
      className={cn('border-t border-border bg-background', BOTTOM_RESERVE)}
    >
      <Container className="py-1">
        <nav aria-label="Links legais">
          <ul className="flex flex-wrap items-center justify-center gap-x-4">
            {LEGAL_LINKS.map(({ to, label, shortLabel }) => (
              <li key={to}>
                <Link to={to} className={linkClass} aria-label={label === shortLabel ? undefined : label}>
                  {shortLabel}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  )
}
