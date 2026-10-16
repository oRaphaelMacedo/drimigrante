/**
 * Fonte única da oferta comercial (DI-009).
 *
 * Preço, prazo de acesso, o que está incluído, garantia e plano recorrente
 * vêm SEMPRE daqui — nada de valores fixos espalhados pelas páginas.
 *
 * Regras de uso:
 * - `OFFER.recurring` (€4,90/mês) só pode ser renderizado em
 *   src/pages/dashboard/**, src/components/dashboard/** e src/pages/legal/**
 *   (o upsell aparece só depois do pagamento de €30).
 * - `guarantee` e `reviewedBy` em `null` significam: NÃO afirmar garantia,
 *   reembolso garantido nem revisão humana. Só o dono pode preenchê-los.
 * - O acesso de `accessDays` dias é calculado pelo stripe-webhook a partir da
 *   confirmação do pagamento (subscriptions.one_time_access_expires_at).
 */

export interface RecurringOffer {
  /** Preço exibido do plano mensal. */
  readonly priceLabel: string
  /** Número máximo de cobranças mensais (o plano termina depois disso). */
  readonly maxCycles: number
  readonly benefits: readonly string[]
}

export interface Offer {
  /** Valor do pagamento único, em `currency`. */
  readonly price: number
  readonly currency: 'EUR'
  /** Preço exibido do pagamento único. */
  readonly priceLabel: string
  /** Dias de acesso ao painel (e ao chat, se `includesChat`) após o pagamento. */
  readonly accessDays: number
  /** Quando a análise fica disponível. */
  readonly delivery: string
  readonly includes: readonly string[]
  readonly includesChat: boolean
  /** Texto da garantia/política de reembolso aprovado pelo dono; `null` = não prometer. */
  readonly guarantee: string | null
  /** Quem revisa a análise (ex.: profissional habilitado); `null` = não afirmar revisão humana. */
  readonly reviewedBy: string | null
  readonly recurring: RecurringOffer
}

const ACCESS_DAYS = 30

export const OFFER: Offer = {
  price: 30,
  currency: 'EUR',
  priceLabel: '€30',
  accessDays: ACCESS_DAYS,
  delivery: 'Disponível logo após o pagamento',
  includes: [
    'Análise do seu caminho',
    'Requisitos e documentos de cada caminho',
    'Próximos passos',
    `Painel por ${ACCESS_DAYS} dias`,
    `Chat IA durante os ${ACCESS_DAYS} dias`,
  ],
  includesChat: true,
  guarantee: null,
  reviewedBy: null,
  recurring: {
    priceLabel: '€4,90/mês',
    maxCycles: 12,
    benefits: [
      `Manter o painel, a análise, o checklist e os documentos depois dos ${ACCESS_DAYS} dias`,
      'Chat IA enquanto a assinatura estiver ativa',
    ],
  },
}
