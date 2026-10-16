/**
 * Regras de apresentação do acesso no dashboard (DI-013, DI-045, DI-046, DI-047).
 *
 * Funções puras usadas pela home, pela barra de navegação e pelos sheets de
 * oferta. As regras de acesso em si continuam em src/lib/access.ts; aqui só se
 * decide COMO mostrar (datas, rótulos, para onde leva um item bloqueado).
 *
 * `OFFER.recurring` só pode ser renderizado em src/pages/dashboard/** e
 * src/components/dashboard/** (o €4,90 aparece só depois do €30).
 */
import { accessDeniedRedirect, canOfferRecurring, type AccessFeature, type AccessState } from '@/lib/access'
import { OFFER } from '@/lib/offer'

// ── Datas ────────────────────────────────────────────────────────────────────

/** Data curta no formato dd/mm (pt-BR). `timeZone` só para testes determinísticos. */
export function formatDayMonth(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone }).format(date)
}

/** "1 dia", "25 dias" ou "último dia" (0 dias restantes). */
export function daysCountLabel(days: number): string {
  if (days <= 0) return 'último dia'
  return days === 1 ? '1 dia' : `${days} dias`
}

/** "falta 1 dia", "faltam 5 dias" ou "último dia". */
export function daysRemainingLabel(days: number): string {
  if (days <= 0) return 'último dia'
  return days === 1 ? 'falta 1 dia' : `faltam ${days} dias`
}

/**
 * Rótulo do chip de acesso para quem está dentro do prazo:
 * "Acesso até 10/11 (25 dias)". Sem data de fim (registro legado): "Acesso ativo".
 */
export function accessUntilLabel(access: AccessState, timeZone?: string): string {
  if (!access.expiresAt || access.daysLeft === null) return 'Acesso ativo'
  return `Acesso até ${formatDayMonth(access.expiresAt, timeZone)} (${daysCountLabel(access.daysLeft)})`
}

/** Primeira letra minúscula (para encaixar um item do OFFER no meio de uma frase). */
export function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1) : text
}

// ── Oferta recorrente ────────────────────────────────────────────────────────

/**
 * Condições do plano mensal, sempre a partir de OFFER.recurring.
 * O cancelamento é feito pelo suporte até existir o portal de assinatura (DI-052).
 */
export const RECURRING_TERMS = `${OFFER.recurring.priceLabel} · até ${OFFER.recurring.maxCycles} meses · cancelamento pelo suporte`

/** Rótulo do botão de assinatura. */
export const RECURRING_CTA_LABEL = `Assinar por ${OFFER.recurring.priceLabel}`

/** Rótulo do botão do pagamento único (só para quem ainda não pagou). */
export const ONE_TIME_CTA_LABEL = `Desbloquear análise — ${OFFER.priceLabel}`

/** Qual oferta cabe neste estado de acesso. */
export type UpsellOfferKind = 'one_time' | 'recurring'

/**
 * €4,90 só para quem já pagou o €30 e não assina; €30 só para quem não pagou;
 * `null` para assinante e equipe (nada a oferecer).
 */
export function upsellOfferFor(access: AccessState): UpsellOfferKind | null {
  if (canOfferRecurring(access)) return 'recurring'
  if (access.state === 'none' && !access.isStaff) return 'one_time'
  return null
}

// ── Motivo do upsell (parâmetro ?upsell=) ────────────────────────────────────

/** Por que o sheet de oferta foi aberto. */
export type UpsellReason = 'chat' | 'analysis' | 'documents' | 'plan'

const PARAM_BY_REASON: Record<UpsellReason, string> = {
  chat: 'chat',
  analysis: 'analise',
  documents: 'documentos',
  plan: 'plano',
}

/**
 * Lê `?upsell=`. `chat` é o contrato com o ProtectedRoute (DI-025); os demais
 * valores são usados só pela navegação do próprio dashboard.
 */
export function parseUpsellParam(value: string | null): UpsellReason | null {
  if (!value) return null
  const entry = (Object.entries(PARAM_BY_REASON) as Array<[UpsellReason, string]>).find(
    ([, param]) => param === value,
  )
  return entry ? entry[0] : null
}

export function upsellHref(reason: UpsellReason): string {
  return `/dashboard?upsell=${PARAM_BY_REASON[reason]}`
}

const REASON_BY_FEATURE: Partial<Record<AccessFeature, UpsellReason>> = {
  chat: 'chat',
  full_analysis: 'analysis',
  documents_read: 'documents',
  documents_upload: 'documents',
}

/**
 * Destino de um item de navegação bloqueado. Nunca /checkout nem /results:
 * abre no Início o sheet com a oferta certa (€30 para quem não pagou, €4,90
 * para quem já pagou — no expirado, com o €30 como opção secundária).
 *
 * O expirado também vai para o sheet (e não para `?acesso=expirado`): tocar em
 * "Chat" já estando no Início não pode ser um toque sem resposta. O
 * `?acesso=expirado` continua sendo o destino do ProtectedRoute (links diretos).
 */
export function lockedFeatureHref(feature: AccessFeature, access: AccessState): string {
  const reason = REASON_BY_FEATURE[feature]
  return reason ? upsellHref(reason) : accessDeniedRedirect(feature, access)
}
