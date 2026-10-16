import { describe, expect, it } from 'vitest'
import { OFFER, type Offer } from '@/lib/offer'
import {
  firstNameOf,
  offerFaq,
  offerIncludes,
  offerTitle,
  pathwayTitle,
  sortPathways,
  splitTeaser,
} from './results-copy'

describe('sortPathways (DI-070)', () => {
  it('ordena strong > possible > weak e mantém a ordem original no empate', () => {
    const sorted = sortPathways([
      { code: 'a', match: 'weak' },
      { code: 'b', match: 'possible' },
      { code: 'c', match: 'strong' },
      { code: 'd', match: 'possible' },
      { code: 'e', match: 'desconhecido' },
    ])
    expect(sorted.map((p) => p.code)).toEqual(['c', 'b', 'd', 'a', 'e'])
  })
})

describe('splitTeaser', () => {
  it('deixa até 5 palavras nítidas e o resto desfocado', () => {
    const { visible, hidden } = splitTeaser('Com mais de 3 anos de casamento você cumpre o prazo exigido.')
    expect(visible).toBe('Com mais de 3 anos')
    expect(hidden).toBe('de casamento você cumpre o prazo exigido.')
  })

  it('sempre desfoca pelo menos 2 palavras', () => {
    expect(splitTeaser('Uma frase curta aqui')).toEqual({ visible: 'Uma frase', hidden: 'curta aqui' })
    expect(splitTeaser('Curta')).toEqual({ visible: '', hidden: 'Curta' })
    expect(splitTeaser('   ')).toEqual({ visible: '', hidden: '' })
  })
})

describe('título da oferta (DI-030)', () => {
  it('contém o caminho mais forte e o primeiro nome', () => {
    expect(offerTitle('Maria', { code: 'nacionalidade_casamento' })).toBe(
      'Maria, veja o passo a passo para a nacionalidade pelo casamento ou união estável',
    )
    expect(offerTitle(null, { code: 'naturalizacao_residencia' })).toBe(
      'Veja o passo a passo para a naturalização por residência',
    )
  })

  it('sem caminho conhecido, título neutro', () => {
    expect(offerTitle('Ana', { code: 'analise_personalizada' })).toBe('Ana, veja a análise completa do seu caso')
    expect(offerTitle(null, null)).toBe('Veja a análise completa do seu caso')
  })

  it('nome do caminho em sentence case vindo do catálogo', () => {
    expect(
      pathwayTitle({ code: 'nacionalidade_descendencia_1', name: 'Nacionalidade por Descendência (1.º grau)' }),
    ).toBe('Nacionalidade por descendência (1.º grau)')
    expect(pathwayTitle({ code: 'legado', name: 'Nome antigo' })).toBe('Nome antigo')
  })

  it('primeiro nome sem espaços extras', () => {
    expect(firstNameOf('  Maria   Souza ')).toBe('Maria')
    expect(firstNameOf('')).toBeNull()
    expect(firstNameOf(null)).toBeNull()
  })
})

describe('oferta vinda de OFFER', () => {
  const withPlaceholders: Offer = { ...OFFER, includes: ['Análise', '', '  ', 'A_PREENCHER', 'Painel'] }

  it('inclusões vazias ou placeholder não renderizam', () => {
    expect(offerIncludes(withPlaceholders)).toEqual(['Análise', 'Painel'])
    expect(offerIncludes()).toEqual([...OFFER.includes])
  })

  it('mini-FAQ com 3 itens, prazo e preço de OFFER, sem garantia nem revisão humana', () => {
    const faq = offerFaq()
    expect(faq).toHaveLength(3)
    const text = faq.map((f) => `${f.question} ${f.answer}`).join(' ')
    expect(text).toContain(`${OFFER.accessDays} dias`)
    expect(text).toContain(OFFER.priceLabel)
    expect(text).not.toMatch(/garantia|revisada por|advogados|menos de €1|4,90/i)
  })

  it('garantia e revisão só aparecem quando o dono preenche', () => {
    const filled: Offer = { ...OFFER, guarantee: 'Reembolso em até 7 dias.', reviewedBy: 'uma equipe jurídica' }
    const faq = offerFaq(filled)
    expect(faq).toHaveLength(4)
    expect(faq.map((f) => f.answer).join(' ')).toContain('revisada por uma equipe jurídica')
    expect(faq[3].answer).toBe('Reembolso em até 7 dias.')
    expect(offerFaq({ ...OFFER, guarantee: 'A_PREENCHER' })).toHaveLength(3)
  })
})
