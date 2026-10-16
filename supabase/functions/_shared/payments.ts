// _shared/payments.ts — regras comerciais compartilhadas pelas functions de
// pagamento (stripe-webhook, create-checkout-session, claim-session). W1-03.
//
// Modelo (decisões do dono, 2026-06-30):
//  - €30 one-time → acesso de 30 dias (painel, análise completa e chat IA — DI-012);
//  - €4,90/mês → só para quem já pagou o €30, limitado a 12 ciclos (DI-021).

/** Dias de acesso concedidos pelo pagamento único (€30). */
export const ONE_TIME_ACCESS_DAYS = 30

/** Número máximo de ciclos mensais da assinatura de €4,90. */
export const RECURRING_MAX_CYCLES = 12

/**
 * payment_status de Checkout Session que confirmam o pagamento.
 * 'no_payment_required' cobre cupom de 100% (nada a cobrar, checkout concluído).
 * 'unpaid' (ex.: meio de pagamento assíncrono ainda pendente) NUNCA concede acesso.
 */
const SETTLED_PAYMENT_STATUSES = new Set(['paid', 'no_payment_required'])

export function isCheckoutSettled(paymentStatus: string | null | undefined): boolean {
  return !!paymentStatus && SETTLED_PAYMENT_STATUSES.has(paymentStatus)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** E-mail normalizado (trim + minúsculas) ou null se ausente/inválido. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null
  return email
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Data (ISO) de expiração do acesso one-time a partir do instante do pagamento. */
export function oneTimeExpiresAt(paidAt: Date): string {
  return new Date(paidAt.getTime() + ONE_TIME_ACCESS_DAYS * DAY_MS).toISOString()
}

/**
 * Soma meses de calendário a um timestamp Unix (segundos), em UTC, preservando
 * hora/minuto/segundo. Quando o dia não existe no mês de destino (ex.: 31/jan
 * + 1 mês, 29/fev + 12 meses), usa o último dia desse mês — o mesmo critério do
 * Stripe para a âncora de cobrança mensal.
 */
export function addCalendarMonthsUtc(unixSeconds: number, months: number): number {
  const d = new Date(unixSeconds * 1000)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + months
  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d.getUTCDate(), lastDayOfTarget)
  return Math.floor(
    Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()) / 1000,
  )
}

/** Unix (segundos) → ISO, ou null. */
export function unixToIso(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null
}

/** Campos de `subscriptions` usados nas regras de acesso. */
export interface AccessRow {
  one_time_paid?: boolean | null
  one_time_access_expires_at?: string | null
  recurring_active?: boolean | null
}

/**
 * true quando o acesso do €30 está vigente. No instante exato da expiração o
 * acesso ainda vale (mesma regra do frontend: só expira quando now > expires_at).
 * expires_at NULL = compra legada sem prazo.
 */
export function isOneTimeAccessActive(row: AccessRow | null | undefined, now: Date): boolean {
  if (!row?.one_time_paid) return false
  if (!row.one_time_access_expires_at) return true
  return now.getTime() <= new Date(row.one_time_access_expires_at).getTime()
}

/** true quando o usuário já tem acesso pago vigente (€30 ativo ou €4,90 ativo). */
export function hasActivePaidAccess(row: AccessRow | null | undefined, now: Date): boolean {
  return !!row?.recurring_active || isOneTimeAccessActive(row, now)
}

/** Código do Postgres para violação de UNIQUE/PK. */
export const PG_UNIQUE_VIOLATION = '23505'
