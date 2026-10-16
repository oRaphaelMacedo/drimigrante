/**
 * Resumo do plano para a aba "Meu plano" da Conta (DI-052). Função pura.
 *
 * - O estado vem de getAccessState (src/lib/access.ts).
 * - Assinatura de €4,90/mês: limitada a 12 cobranças (OFFER.recurring.maxCycles).
 *   O stripe-webhook grava `recurring_started_at` (início/âncora da cobrança) e
 *   `recurring_cancel_at` (fim agendado: início + 12 meses, ou antes se a pessoa
 *   cancelar). As datas de cobrança daqui são PREVISTAS a partir dessas
 *   colunas — a fonte exata é o portal do Stripe.
 * - `recurring_cancel_at` só existe depois da migration 20261016000150; antes
 *   dela, o fim é calculado como início + 12 meses.
 */
import type { AccessState } from '@/lib/access'
import type { Subscription } from '@/lib/database.types'
import { OFFER } from '@/lib/offer'

export type PlanKind = 'staff' | 'free' | 'one_time' | 'expired' | 'recurring'

/** Campos lidos (aceita mocks parciais e a coluna nova ainda fora dos tipos gerados). */
export type PlanSubscription = Partial<
  Pick<
    Subscription,
    'one_time_paid_at' | 'recurring_started_at' | 'recurring_cancelled_at' | 'stripe_customer_id' | 'stripe_subscription_id'
  >
> & { recurring_cancel_at?: string | null }

export interface RecurringSummary {
  startedAt: Date | null
  /** Próxima cobrança prevista (null: nenhuma cobrança nova). */
  nextChargeAt: Date | null
  /** Última cobrança prevista (a 12ª, ou a última antes de um cancelamento agendado). */
  lastChargeAt: Date | null
  /** Quando a assinatura termina. */
  endsAt: Date | null
  /** A pessoa agendou o cancelamento antes do limite de 12 cobranças. */
  cancelScheduled: boolean
}

export interface PlanSummary {
  kind: PlanKind
  paidAt: Date | null
  /** Fim do acesso de 30 dias (one_time/expired). */
  accessEndsAt: Date | null
  daysLeft: number | null
  recurring: RecurringSummary | null
  /** Há customer no Stripe (o portal pode abrir). */
  hasCustomer: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Soma meses de calendário em UTC (mesmo critério do stripe-webhook e do Stripe:
 * dia inexistente no mês de destino vira o último dia desse mês).
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(date.getUTCDate(), lastDay)
  return new Date(
    Date.UTC(year, month, day, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()),
  )
}

export function getRecurringSummary(sub: PlanSubscription | null | undefined, now: Date): RecurringSummary {
  const startedAt = parseDate(sub?.recurring_started_at)
  const cancelAt = parseDate(sub?.recurring_cancel_at)
  const maxCycles = OFFER.recurring.maxCycles
  const capEnd = startedAt ? addCalendarMonths(startedAt, maxCycles) : null
  const endsAt = cancelAt ?? capEnd
  const cancelScheduled = !!(cancelAt && capEnd && cancelAt.getTime() < capEnd.getTime() - DAY_MS)

  let nextChargeAt: Date | null = null
  let lastChargeAt: Date | null = null
  if (startedAt) {
    for (let cycle = 0; cycle < maxCycles; cycle++) {
      const at = addCalendarMonths(startedAt, cycle)
      if (endsAt && at.getTime() >= endsAt.getTime()) break
      lastChargeAt = at
      if (!nextChargeAt && cycle > 0 && at.getTime() > now.getTime()) nextChargeAt = at
    }
  }

  return { startedAt, nextChargeAt, lastChargeAt, endsAt, cancelScheduled }
}

export function getPlanSummary(
  sub: PlanSubscription | null | undefined,
  access: AccessState,
  now: Date = new Date(),
): PlanSummary {
  const base = {
    paidAt: parseDate(sub?.one_time_paid_at),
    accessEndsAt: access.expiresAt,
    daysLeft: access.daysLeft,
    hasCustomer: typeof sub?.stripe_customer_id === 'string' && sub.stripe_customer_id.startsWith('cus_'),
  }

  if (access.isStaff) return { ...base, kind: 'staff', recurring: null }
  switch (access.state) {
    case 'recurring':
      return { ...base, kind: 'recurring', recurring: getRecurringSummary(sub, now) }
    case 'active':
    case 'expiring':
      return { ...base, kind: 'one_time', recurring: null }
    case 'expired':
      return { ...base, kind: 'expired', recurring: null }
    default:
      return { ...base, kind: 'free', recurring: null }
  }
}

/** Data completa em pt-BR: "16/10/2026". `timeZone` só para testes. */
export function formatFullDate(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(date)
}
