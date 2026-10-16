/**
 * Sheet de oferta do dashboard (DI-013, DI-046).
 *
 * Abre quando a pessoa toca numa funcionalidade bloqueada (ou chega por
 * `/dashboard?upsell=chat`, vindo do ProtectedRoute). A oferta depende do
 * estado de acesso — nunca há redirecionamento silencioso:
 *  - não pagou ('none') → oferta de €30 (OFFER), nunca o €4,90;
 *  - já pagou e não assina ('active' sem a funcionalidade, 'expiring',
 *    'expired') → assinatura de €4,90/mês (OFFER.recurring);
 *  - assinante ou equipe → nada a oferecer (o sheet não abre).
 */
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { BottomSheet, Button } from '@/components/ui'
import { useSubscribeCheckout } from '@/hooks/useSubscribeCheckout'
import type { AccessState } from '@/lib/access'
import { track } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import {
  ONE_TIME_CTA_LABEL,
  RECURRING_CTA_LABEL,
  RECURRING_TERMS,
  formatDayMonth,
  upsellOfferFor,
  type UpsellReason,
} from './dashboard-access'

const ONE_TIME_TITLES: Record<UpsellReason, string> = {
  chat: 'O chat IA faz parte da análise completa',
  analysis: 'Desbloqueie sua análise completa',
  documents: 'Organize seus documentos com a análise completa',
  plan: 'Desbloqueie sua análise completa',
}

/** Títulos para quem já pagou e ainda está no prazo ('active'/'expiring'). */
const RECURRING_TITLES: Record<UpsellReason, string> = {
  chat: 'Use o chat IA com a assinatura mensal',
  analysis: 'Mantenha o acesso à sua análise',
  documents: 'Continue enviando seus documentos',
  plan: `Mantenha seu painel depois dos ${OFFER.accessDays} dias`,
}

/** Títulos para quem já pagou e o prazo acabou ('expired'). */
const EXPIRED_TITLES: Record<UpsellReason, string> = {
  chat: 'Volte a usar o chat IA',
  analysis: 'Volte a acessar sua análise',
  documents: 'Volte a enviar documentos',
  plan: 'Reative seu painel',
}

function recurringDescription(access: AccessState): string {
  const date = access.expiresAt ? formatDayMonth(access.expiresAt) : null
  if (access.state === 'expired') {
    return date
      ? `Seu acesso de ${OFFER.accessDays} dias terminou em ${date}.`
      : `Seu acesso de ${OFFER.accessDays} dias terminou.`
  }
  if (access.state === 'expiring' && date) return `Seu acesso termina em ${date}.`
  if (date) return `Seu acesso atual vai até ${date}.`
  return `A assinatura mensal mantém o acesso depois dos ${OFFER.accessDays} dias.`
}

export interface UpsellSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason: UpsellReason
  access: AccessState
  /** Diagnóstico da pessoa (vai para o checkout do €30). */
  assessmentId?: string | null
  /** Sem diagnóstico não há o que desbloquear: o sheet leva ao quiz. */
  hasQuizResult: boolean
}

export function UpsellSheet({ open, onOpenChange, reason, access, assessmentId, hasQuizResult }: UpsellSheetProps) {
  const offer = upsellOfferFor(access)
  const { subscribe, isPending } = useSubscribeCheckout(assessmentId)
  const placement = `sheet_${reason}`

  // Um evento por abertura.
  const trackedRef = useRef(false)
  useEffect(() => {
    if (!open) {
      trackedRef.current = false
      return
    }
    if (trackedRef.current || !offer) return
    trackedRef.current = true
    if (offer === 'recurring') track('upsell_viewed', { placement })
    else track('paywall_viewed', { placement: `dashboard_${placement}` })
  }, [open, offer, placement])

  if (!offer) return null

  if (offer === 'recurring') {
    const expired = access.state === 'expired'
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={expired ? EXPIRED_TITLES[reason] : RECURRING_TITLES[reason]}
        description={recurringDescription(access)}
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="pay"
              size="lg"
              className="w-full"
              loading={isPending}
              data-testid="upsell-subscribe-btn"
              onClick={() => void subscribe(placement)}
            >
              {RECURRING_CTA_LABEL}
            </Button>
            {expired && (
              <Button asChild variant="ghost" className="w-full">
                <Link
                  to="/checkout"
                  state={{ plan: 'one_time', assessmentId }}
                  onClick={() => track('paywall_cta_clicked', { placement: `dashboard_${placement}` })}
                >
                  Comprar mais {OFFER.accessDays} dias por {OFFER.priceLabel}
                </Link>
              </Button>
            )}
          </div>
        }
      >
        <p className="text-base font-medium text-foreground">Com a assinatura de {OFFER.recurring.priceLabel}:</p>
        <ul className="mt-3 space-y-2.5">
          {OFFER.recurring.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-base text-foreground [text-wrap:pretty]">
              <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground" data-testid="upsell-terms">
          {RECURRING_TERMS}
        </p>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={ONE_TIME_TITLES[reason]}
      description={`Pagamento único de ${OFFER.priceLabel}, com acesso por ${OFFER.accessDays} dias.`}
      footer={
        hasQuizResult ? (
          <Button asChild variant="pay" size="lg" className="w-full">
            <Link
              to="/checkout"
              state={{ plan: 'one_time', assessmentId }}
              data-testid="upsell-one-time-btn"
              onClick={() => track('paywall_cta_clicked', { placement: `dashboard_${placement}` })}
            >
              {ONE_TIME_CTA_LABEL}
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg" className="w-full">
            <Link to="/quiz">Fazer o diagnóstico gratuito</Link>
          </Button>
        )
      }
    >
      <p className="text-base font-medium text-foreground">Está incluído:</p>
      <ul className="mt-3 space-y-2.5">
        {OFFER.includes.map((item) => (
          <li key={item} className="flex items-start gap-2 text-base text-foreground [text-wrap:pretty]">
            <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted-foreground">
        {hasQuizResult
          ? `${OFFER.delivery}.`
          : 'Para desbloquear a análise, faça primeiro o diagnóstico gratuito.'}
      </p>
    </BottomSheet>
  )
}
