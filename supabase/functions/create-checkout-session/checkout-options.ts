// create-checkout-session/checkout-options.ts — apresentação do Stripe Checkout (DI-087)
//
// - Idioma: STRIPE_LOCALE (padrão pt-BR, o público é majoritariamente brasileiro).
//   Valor fora da lista do Stripe volta para o padrão com um aviso no log, porque
//   o Stripe recusaria a criação da sessão (400) e o funil pararia.
// - Código promocional: STRIPE_ALLOW_PROMOTION_CODES (padrão desligado). O campo
//   "Adicionar código promocional" só aparece durante uma campanha com códigos
//   criados no painel do Stripe; sem campanha, ele só distrai quem vai pagar.
// - Texto de reforço ao lado do botão de pagar (custom_text.submit.message),
//   montado a partir da oferta. Sem garantia, revisão humana ou prazo que a
//   oferta não tenha (OFFER.guarantee/reviewedBy = null), e o €4,90 só aparece
//   no checkout da assinatura, que só existe para quem já pagou o €30.
//
// CHECKOUT_OFFER ESPELHA src/lib/offer.ts (a Edge Function não importa código do
// front no deploy). checkout-options.test.ts compara os dois: mudou a oferta lá,
// mude aqui.

import { ONE_TIME_ACCESS_DAYS, RECURRING_MAX_CYCLES } from '../_shared/payments.ts'

/** Idiomas aceitos pelo Stripe Checkout (stripe@14, API 2023-10-16). */
export const STRIPE_CHECKOUT_LOCALES = [
  'auto', 'bg', 'cs', 'da', 'de', 'el', 'en', 'en-GB', 'es', 'es-419', 'et', 'fi', 'fil', 'fr',
  'fr-CA', 'hr', 'hu', 'id', 'it', 'ja', 'ko', 'lt', 'lv', 'ms', 'mt', 'nb', 'nl', 'pl', 'pt',
  'pt-BR', 'ro', 'ru', 'sk', 'sl', 'sv', 'th', 'tr', 'vi', 'zh', 'zh-HK', 'zh-TW',
] as const

export type StripeCheckoutLocale = (typeof STRIPE_CHECKOUT_LOCALES)[number]

/** Limite do Stripe para custom_text.*.message. */
export const STRIPE_SUBMIT_MESSAGE_MAX = 1200

export interface CheckoutPresentation {
  locale: StripeCheckoutLocale
  allowPromotionCodes: boolean
}

export const DEFAULT_CHECKOUT_PRESENTATION: Readonly<CheckoutPresentation> = Object.freeze({
  locale: 'pt-BR',
  allowPromotionCodes: false,
})

/** Variável com valor inválido: o padrão foi usado. Nunca carrega o valor lido. */
export interface CheckoutConfigWarning {
  key: 'STRIPE_LOCALE' | 'STRIPE_ALLOW_PROMOTION_CODES'
  fallback: string
}

const LOCALES_BY_LOWERCASE = new Map<string, StripeCheckoutLocale>(
  STRIPE_CHECKOUT_LOCALES.map((locale) => [locale.toLowerCase(), locale]),
)

const TRUE_VALUES = new Set(['true', '1', 'sim', 'yes', 'on'])
const FALSE_VALUES = new Set(['false', '0', 'não', 'nao', 'no', 'off'])

/** Lê STRIPE_LOCALE e STRIPE_ALLOW_PROMOTION_CODES; ausente ou vazio = padrão. */
export function resolveCheckoutPresentation(
  env: (key: string) => string | undefined,
): { presentation: CheckoutPresentation; warnings: CheckoutConfigWarning[] } {
  const warnings: CheckoutConfigWarning[] = []
  const presentation: CheckoutPresentation = { ...DEFAULT_CHECKOUT_PRESENTATION }

  const rawLocale = env('STRIPE_LOCALE')?.trim() ?? ''
  if (rawLocale) {
    const locale = LOCALES_BY_LOWERCASE.get(rawLocale.toLowerCase())
    if (locale) presentation.locale = locale
    else warnings.push({ key: 'STRIPE_LOCALE', fallback: presentation.locale })
  }

  const rawPromo = env('STRIPE_ALLOW_PROMOTION_CODES')?.trim().toLowerCase() ?? ''
  if (rawPromo) {
    if (TRUE_VALUES.has(rawPromo)) presentation.allowPromotionCodes = true
    else if (!FALSE_VALUES.has(rawPromo)) {
      warnings.push({ key: 'STRIPE_ALLOW_PROMOTION_CODES', fallback: String(presentation.allowPromotionCodes) })
    }
  }

  return { presentation, warnings }
}

/** Campos de src/lib/offer.ts usados no texto do Checkout (espelho; ver topo). */
export const CHECKOUT_OFFER = {
  priceLabel: '€30',
  accessDays: ONE_TIME_ACCESS_DAYS,
  delivery: 'Disponível logo após o pagamento',
  includesChat: true,
  recurring: {
    priceLabel: '€4,90/mês',
    maxCycles: RECURRING_MAX_CYCLES,
  },
} as const

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** Texto exibido ao lado do botão de pagar do Stripe. */
export function checkoutSubmitMessage(plan: 'one_time' | 'recurring'): string {
  const offer = CHECKOUT_OFFER
  if (plan === 'recurring') {
    const { priceLabel, maxCycles } = offer.recurring
    return (
      `Assinatura de ${priceLabel} por até ${maxCycles} meses: depois da ${maxCycles}ª cobrança, ` +
      'ela termina sozinha. Você mantém o painel, a análise, o checklist e os documentos' +
      (offer.includesChat ? ', e o chat IA enquanto a assinatura estiver ativa' : '') +
      '. Cancelamento pelo suporte.'
    )
  }
  return (
    `Pagamento único de ${offer.priceLabel}, sem renovação automática. ` +
    `A análise fica ${lowerFirst(offer.delivery)}, com acesso ao painel` +
    (offer.includesChat ? ' e ao chat IA' : '') +
    ` por ${offer.accessDays} dias.`
  )
}

/** Parâmetros de apresentação para checkout.sessions.create. */
export function checkoutPresentationParams(
  plan: 'one_time' | 'recurring',
  presentation: CheckoutPresentation,
): Record<string, unknown> {
  return {
    locale: presentation.locale,
    allow_promotion_codes: presentation.allowPromotionCodes,
    custom_text: { submit: { message: checkoutSubmitMessage(plan).slice(0, STRIPE_SUBMIT_MESSAGE_MAX) } },
  }
}
