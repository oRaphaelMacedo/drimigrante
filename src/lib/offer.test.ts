import { describe, expect, it } from 'vitest'
import { OFFER } from './offer'

// Promessas que o dono ainda não confirmou ou que foram vetadas (ver decisões de copy).
const FORBIDDEN_COPY = [
  /para sempre/i,
  /ilimitad/i,
  /mais popular/i,
  /24\s?h/i,
  /advogad/i,
  /revis(ão|ado|ada) humana/i,
  /garantia/i,
  /menos de €1/i,
  /a_preencher/i,
]

function allCopy(): string[] {
  return [
    OFFER.priceLabel,
    OFFER.delivery,
    ...OFFER.includes,
    OFFER.recurring.priceLabel,
    ...OFFER.recurring.benefits,
  ]
}

describe('OFFER — fonte única da oferta', () => {
  it('pagamento único de €30 em euros', () => {
    expect(OFFER).toMatchObject({ price: 30, currency: 'EUR', priceLabel: '€30' })
  })

  it('acesso de 30 dias, refletido nos itens incluídos', () => {
    expect(OFFER.accessDays).toBe(30)
    expect(OFFER.includes.some((item) => item.includes(`${OFFER.accessDays} dias`))).toBe(true)
  })

  it('entrega imediata, sem prazo prometido', () => {
    expect(OFFER.delivery).toBe('Disponível logo após o pagamento')
  })

  it('inclui os 5 itens combinados, com o chat IA', () => {
    expect(OFFER.includes).toHaveLength(5)
    expect(OFFER.includesChat).toBe(true)
    expect(OFFER.includes.some((item) => /chat/i.test(item))).toBe(OFFER.includesChat)
  })

  it('não afirma garantia nem revisão humana enquanto o dono não confirmar', () => {
    expect(OFFER.guarantee).toBeNull()
    expect(OFFER.reviewedBy).toBeNull()
  })

  it('plano recorrente de €4,90/mês limitado a 12 ciclos', () => {
    expect(OFFER.recurring.priceLabel).toBe('€4,90/mês')
    expect(OFFER.recurring.maxCycles).toBe(12)
    expect(OFFER.recurring.benefits).toHaveLength(2)
    expect(OFFER.recurring.benefits.some((b) => /chat/i.test(b))).toBe(true)
  })

  it('nenhum texto da oferta contém promessa vetada ou placeholder', () => {
    for (const text of allCopy()) {
      expect(text.trim()).not.toBe('')
      for (const pattern of FORBIDDEN_COPY) {
        expect(text).not.toMatch(pattern)
      }
    }
  })
})
