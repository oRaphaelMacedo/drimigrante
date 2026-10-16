// Testes da apresentação do Stripe Checkout (DI-087): idioma, código promocional
// e texto de reforço ao lado do botão de pagar. Rodar: npm run test:functions

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { ONE_TIME_ACCESS_DAYS, RECURRING_MAX_CYCLES } from '../_shared/payments.ts'
import { OFFER } from '../../../src/lib/offer.ts'
import {
  CHECKOUT_OFFER,
  checkoutPresentationParams,
  checkoutSubmitMessage,
  DEFAULT_CHECKOUT_PRESENTATION,
  resolveCheckoutPresentation,
  STRIPE_SUBMIT_MESSAGE_MAX,
} from './checkout-options.ts'

const envOf = (values: Record<string, string>) => (key: string) => values[key]

Deno.test('sem variáveis: pt-BR e código promocional desligado', () => {
  const { presentation, warnings } = resolveCheckoutPresentation(envOf({}))
  assertEquals(presentation, { locale: 'pt-BR', allowPromotionCodes: false })
  assertEquals(presentation, DEFAULT_CHECKOUT_PRESENTATION)
  assertEquals(warnings, [])
})

Deno.test('STRIPE_LOCALE aceita os idiomas do Stripe (sem diferenciar maiúsculas)', () => {
  const pt = resolveCheckoutPresentation(envOf({ STRIPE_LOCALE: 'pt' }))
  assertEquals(pt.presentation.locale, 'pt')
  assertEquals(pt.warnings, [])

  assertEquals(resolveCheckoutPresentation(envOf({ STRIPE_LOCALE: ' pt-br ' })).presentation.locale, 'pt-BR')
  assertEquals(resolveCheckoutPresentation(envOf({ STRIPE_LOCALE: 'auto' })).presentation.locale, 'auto')
  assertEquals(resolveCheckoutPresentation(envOf({ STRIPE_LOCALE: 'en-gb' })).presentation.locale, 'en-GB')
  // Vazio = padrão, sem aviso.
  assertEquals(resolveCheckoutPresentation(envOf({ STRIPE_LOCALE: '  ' })).warnings, [])
})

Deno.test('STRIPE_LOCALE inválido: volta para pt-BR e avisa (o Stripe recusaria a sessão)', () => {
  const { presentation, warnings } = resolveCheckoutPresentation(envOf({ STRIPE_LOCALE: 'pt_BR' }))
  assertEquals(presentation.locale, 'pt-BR')
  assertEquals(warnings, [{ key: 'STRIPE_LOCALE', fallback: 'pt-BR' }])
})

Deno.test('STRIPE_ALLOW_PROMOTION_CODES: liga só com valor verdadeiro explícito', () => {
  for (const value of ['true', 'TRUE', '1', 'sim', 'yes', 'on']) {
    const { presentation, warnings } = resolveCheckoutPresentation(
      envOf({ STRIPE_ALLOW_PROMOTION_CODES: value }),
    )
    assertEquals(presentation.allowPromotionCodes, true, value)
    assertEquals(warnings, [], value)
  }
  for (const value of ['false', '0', 'não', 'nao', 'no', 'off', '']) {
    const { presentation, warnings } = resolveCheckoutPresentation(
      envOf({ STRIPE_ALLOW_PROMOTION_CODES: value }),
    )
    assertEquals(presentation.allowPromotionCodes, false, value)
    assertEquals(warnings, [], value)
  }
  const invalid = resolveCheckoutPresentation(envOf({ STRIPE_ALLOW_PROMOTION_CODES: 'talvez' }))
  assertEquals(invalid.presentation.allowPromotionCodes, false)
  assertEquals(invalid.warnings, [{ key: 'STRIPE_ALLOW_PROMOTION_CODES', fallback: 'false' }])
})

Deno.test('CHECKOUT_OFFER espelha src/lib/offer.ts e _shared/payments.ts', () => {
  assertEquals(CHECKOUT_OFFER.priceLabel, OFFER.priceLabel)
  assertEquals(CHECKOUT_OFFER.accessDays, OFFER.accessDays)
  assertEquals(CHECKOUT_OFFER.delivery, OFFER.delivery)
  assertEquals(CHECKOUT_OFFER.includesChat, OFFER.includesChat)
  assertEquals(CHECKOUT_OFFER.recurring.priceLabel, OFFER.recurring.priceLabel)
  assertEquals(CHECKOUT_OFFER.recurring.maxCycles, OFFER.recurring.maxCycles)
  assertEquals(CHECKOUT_OFFER.accessDays, ONE_TIME_ACCESS_DAYS)
  assertEquals(CHECKOUT_OFFER.recurring.maxCycles, RECURRING_MAX_CYCLES)
})

const FORBIDDEN = [/garanti/i, /advogad/i, /24\s*h/i, /para sempre/i, /ilimitad/i, /revis/i, /mais popular/i]

Deno.test('texto do €30: preço, prazo e chat vindos da oferta, sem €4,90 nem promessas', () => {
  const message = checkoutSubmitMessage('one_time')
  assertEquals(
    message,
    'Pagamento único de €30, sem renovação automática. A análise fica disponível logo após o pagamento, ' +
      'com acesso ao painel e ao chat IA por 30 dias.',
  )
  assert(!message.includes(OFFER.recurring.priceLabel), 'o €4,90 só aparece no painel')
  for (const pattern of FORBIDDEN) assert(!pattern.test(message), `texto proibido: ${pattern}`)
  assert(message.length <= STRIPE_SUBMIT_MESSAGE_MAX)
})

Deno.test('texto do €4,90/mês: limite de 12 cobranças e cancelamento pelo suporte', () => {
  const message = checkoutSubmitMessage('recurring')
  assertEquals(
    message,
    'Assinatura de €4,90/mês por até 12 meses: depois da 12ª cobrança, ela termina sozinha. ' +
      'Você mantém o painel, a análise, o checklist e os documentos, e o chat IA enquanto a assinatura ' +
      'estiver ativa. Cancelamento pelo suporte.',
  )
  for (const pattern of FORBIDDEN) assert(!pattern.test(message), `texto proibido: ${pattern}`)
  assert(message.length <= STRIPE_SUBMIT_MESSAGE_MAX)
})

Deno.test('checkoutPresentationParams monta locale, allow_promotion_codes e custom_text.submit', () => {
  assertEquals(checkoutPresentationParams('one_time', { locale: 'pt', allowPromotionCodes: true }), {
    locale: 'pt',
    allow_promotion_codes: true,
    custom_text: { submit: { message: checkoutSubmitMessage('one_time') } },
  })
  assertEquals(checkoutPresentationParams('recurring', DEFAULT_CHECKOUT_PRESENTATION), {
    locale: 'pt-BR',
    allow_promotion_codes: false,
    custom_text: { submit: { message: checkoutSubmitMessage('recurring') } },
  })
})
