/**
 * Oferta de €4,90/mês na home do dashboard (DI-047).
 *
 * Só para quem já pagou o €30 (`canOfferRecurring`) — quem decide se aparece é
 * a página. Copy e condições vêm de OFFER.recurring: nada de alertas
 * legislativos, revisão do processo ou "ilimitado".
 */
import { useEffect, useId } from 'react'
import { Check, RefreshCw } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'
import { useSubscribeCheckout } from '@/hooks/useSubscribeCheckout'
import { track } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { cn } from '@/lib/utils'
import { RECURRING_CTA_LABEL, RECURRING_TERMS } from './dashboard-access'

export interface SubscriptionUpsellCardProps {
  /** Identifica a posição nos eventos upsell_viewed/upsell_clicked. */
  placement: string
  /**
   * `quiet` (padrão): botão secundário, para não competir com a ação principal
   * da tela. `primary`: botão de pagamento, quando a assinatura é a ação principal.
   */
  emphasis?: 'quiet' | 'primary'
  assessmentId?: string | null
  className?: string
}

export function SubscriptionUpsellCard({
  placement,
  emphasis = 'quiet',
  assessmentId,
  className,
}: SubscriptionUpsellCardProps) {
  const { subscribe, isPending } = useSubscribeCheckout(assessmentId)
  const titleId = useId()

  useEffect(() => {
    track('upsell_viewed', { placement })
  }, [placement])

  return (
    <Card
      role="region"
      aria-labelledby={titleId}
      className={cn('space-y-4', className)}
      data-testid="subscription-upsell-card"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[.08] text-primary"
        >
          <RefreshCw className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <Badge variant="neutral" size="sm">
            Assinatura mensal
          </Badge>
          <h2 id={titleId} className="text-lg font-semibold leading-snug text-foreground [text-wrap:balance]">
            Mantenha seu painel depois dos {OFFER.accessDays} dias
          </h2>
        </div>
      </div>

      <ul className="space-y-2">
        {OFFER.recurring.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-base text-foreground [text-wrap:pretty]">
            <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{RECURRING_TERMS}</p>
        <Button
          id="dashboard-subscribe-btn"
          data-testid="dashboard-subscribe-btn"
          variant={emphasis === 'primary' ? 'pay' : 'secondary'}
          className="w-full sm:w-auto"
          loading={isPending}
          onClick={() => void subscribe(placement)}
        >
          {RECURRING_CTA_LABEL}
        </Button>
      </div>
    </Card>
  )
}
