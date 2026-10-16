/**
 * Prazo de acesso visível na home do dashboard (DI-046).
 *
 * - 'active'    → chip "Acesso até dd/mm (N dias)".
 * - 'expiring'  → aviso âmbar (≤7 dias) com "Manter acesso por €4,90/mês".
 * - 'expired'   → "Seu acesso terminou em dd/mm", os caminhos pelo nome,
 *                 €4,90/mês como ação principal e €30 como secundária.
 * - 'recurring' → chip "Assinatura ativa"; equipe → chip "Acesso de equipe".
 * - 'none'      → nada (a oferta de €30 fica no resultado do diagnóstico).
 */
import { useEffect, useId } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, CalendarCheck, CalendarClock, CalendarX2, Check, ShieldCheck } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { useSubscribeCheckout } from '@/hooks/useSubscribeCheckout'
import type { AccessState } from '@/lib/access'
import { track } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { cn } from '@/lib/utils'
import {
  RECURRING_TERMS,
  accessUntilLabel,
  daysRemainingLabel,
  formatDayMonth,
  lowerFirst,
} from './dashboard-access'

export interface AccessBannerProps {
  access: AccessState
  /** Nomes dos caminhos identificados (mostrados a quem já pagou e expirou). */
  pathways?: string[]
  assessmentId?: string | null
  /** false enquanto a assinatura é confirmada (volta do Stripe): esconde as ofertas. */
  showOffer?: boolean
  className?: string
}

export function AccessBanner({ access, pathways = [], assessmentId, showOffer = true, className }: AccessBannerProps) {
  if (access.isStaff) {
    return (
      <Badge variant="neutral" className={className} data-testid="access-chip">
        <ShieldCheck aria-hidden="true" />
        Acesso de equipe
      </Badge>
    )
  }

  switch (access.state) {
    case 'none':
      return null
    case 'recurring':
      return (
        <Badge variant="success" className={className} data-testid="access-chip">
          <BadgeCheck aria-hidden="true" />
          Assinatura ativa
        </Badge>
      )
    case 'active':
      return (
        <Badge variant="primary" className={cn('whitespace-normal text-left', className)} data-testid="access-chip">
          <CalendarCheck aria-hidden="true" />
          {accessUntilLabel(access)}
        </Badge>
      )
    case 'expiring':
      return (
        <ExpiringBanner access={access} assessmentId={assessmentId} showOffer={showOffer} className={className} />
      )
    case 'expired':
      return (
        <ExpiredBanner
          access={access}
          pathways={pathways}
          assessmentId={assessmentId}
          showOffer={showOffer}
          className={className}
        />
      )
  }
}

/** "faltam 5 dias" → "Faltam 5 dias". */
function capitalize(text: string): string {
  return text ? text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1) : text
}

// ── Perto de expirar ─────────────────────────────────────────────────────────

function ExpiringBanner({
  access,
  assessmentId,
  showOffer,
  className,
}: {
  access: AccessState
  assessmentId?: string | null
  showOffer: boolean
  className?: string
}) {
  const titleId = useId()
  const { subscribe, isPending } = useSubscribeCheckout(assessmentId)
  const date = access.expiresAt ? formatDayMonth(access.expiresAt) : null
  const days = access.daysLeft ?? 0

  useEffect(() => {
    track('access_expiring_viewed', { days_left: access.daysLeft })
  }, [access.daysLeft])
  useEffect(() => {
    if (showOffer) track('upsell_viewed', { placement: 'banner_expiring' })
  }, [showOffer])

  return (
    <section
      aria-labelledby={titleId}
      data-testid="access-banner-expiring"
      className={cn(
        'rounded-lg border border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.06)] p-5 sm:p-6',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <CalendarClock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--warning))]" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold leading-snug text-foreground [text-wrap:balance]">
            {date ? `Seu acesso termina em ${date}` : 'Seu acesso está perto do fim'}
          </h2>
          <Badge variant="warning" size="sm" className="mt-1.5">
            {capitalize(daysRemainingLabel(days))}
          </Badge>
          <p className="mt-2 text-base text-foreground [text-wrap:pretty]">
            Com a assinatura mensal, você pode {lowerFirst(OFFER.recurring.benefits[0])}.
          </p>
        </div>
      </div>
      {showOffer && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{RECURRING_TERMS}</p>
          <Button
            variant="pay"
            className="w-full sm:w-auto"
            loading={isPending}
            data-primary-cta=""
            data-testid="access-banner-subscribe"
            onClick={() => void subscribe('banner_expiring')}
          >
            Manter acesso por {OFFER.recurring.priceLabel}
          </Button>
        </div>
      )}
    </section>
  )
}

// ── Expirado ─────────────────────────────────────────────────────────────────

function ExpiredBanner({
  access,
  pathways,
  assessmentId,
  showOffer,
  className,
}: {
  access: AccessState
  pathways: string[]
  assessmentId?: string | null
  showOffer: boolean
  className?: string
}) {
  const titleId = useId()
  const { subscribe, isPending } = useSubscribeCheckout(assessmentId)
  const date = access.expiresAt ? formatDayMonth(access.expiresAt) : null

  useEffect(() => {
    track('access_expired_viewed')
  }, [])
  useEffect(() => {
    if (showOffer) track('upsell_viewed', { placement: 'banner_expired' })
  }, [showOffer])

  return (
    <section
      aria-labelledby={titleId}
      data-testid="access-banner-expired"
      className={cn('rounded-lg border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6', className)}
    >
      <div className="flex items-start gap-3">
        <CalendarX2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold leading-snug text-foreground [text-wrap:balance]">
            {date ? `Seu acesso terminou em ${date}` : 'Seu acesso terminou'}
          </h2>
          <p className="mt-1 text-base text-muted-foreground [text-wrap:pretty]">
            O prazo de {OFFER.accessDays} dias da análise acabou. Seus documentos enviados continuam
            disponíveis para baixar ou apagar.
          </p>
        </div>
      </div>

      {pathways.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">
            {pathways.length === 1 ? 'Caminho identificado para você:' : 'Caminhos identificados para você:'}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {pathways.map((name) => (
              <li key={name}>
                <Badge variant="neutral" size="sm" className="whitespace-normal">
                  {name}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showOffer && (
        <div className="mt-4 border-t pt-4">
          <p className="text-base font-medium text-foreground">Com a assinatura mensal:</p>
          <ul className="mt-2 space-y-2">
            {OFFER.recurring.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-base text-foreground [text-wrap:pretty]">
                <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              variant="pay"
              size="lg"
              className="w-full sm:w-auto"
              loading={isPending}
              data-primary-cta=""
              data-testid="access-banner-subscribe"
              onClick={() => void subscribe('banner_expired')}
            >
              Assinar por {OFFER.recurring.priceLabel}
            </Button>
            <p className="text-center text-sm text-muted-foreground sm:hidden">{RECURRING_TERMS}</p>
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link
                to="/checkout"
                state={{ plan: 'one_time', assessmentId }}
                data-testid="access-banner-one-time"
                onClick={() => track('paywall_cta_clicked', { placement: 'dashboard_banner_expired' })}
              >
                Comprar mais {OFFER.accessDays} dias por {OFFER.priceLabel}
              </Link>
            </Button>
          </div>
          <p className="mt-2 hidden text-sm text-muted-foreground sm:block">{RECURRING_TERMS}</p>
        </div>
      )}
    </section>
  )
}
