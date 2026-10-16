import { describe, expect, it } from 'vitest'
import { COMPANY, getCompanyIdentification, isFilledValue, type Company } from './company'

const FILLED: Company = {
  brandName: 'Doutor Imigrante',
  legalName: 'Empresa Exemplo, Lda.',
  nif: '500000000',
  address: 'Rua Exemplo, 1, Lisboa',
}

describe('COMPANY', () => {
  it('tem a marca e deixa os dados legais pendentes como null', () => {
    expect(COMPANY.brandName).toBe('Doutor Imigrante')
    expect(COMPANY.legalName).toBeNull()
    expect(COMPANY.nif).toBeNull()
    expect(COMPANY.address).toBeNull()
  })
})

describe('isFilledValue', () => {
  it('rejeita null, vazio e placeholders', () => {
    for (const value of [null, undefined, '', '   ', 'A_PREENCHER', 'a_preencher', 'TODO', 'TBD', 'XXX']) {
      expect(isFilledValue(value)).toBe(false)
    }
  })

  it('aceita valores reais', () => {
    expect(isFilledValue('500000000')).toBe(true)
    expect(isFilledValue('Empresa Exemplo, Lda.')).toBe(true)
  })
})

describe('getCompanyIdentification', () => {
  it('com os campos null não devolve nada para renderizar', () => {
    expect(getCompanyIdentification(COMPANY)).toEqual([])
  })

  it('devolve só os campos preenchidos, na ordem razão social → NIF → sede', () => {
    expect(getCompanyIdentification(FILLED)).toEqual([
      { key: 'legalName', label: 'Razão social', value: 'Empresa Exemplo, Lda.' },
      { key: 'nif', label: 'NIF', value: '500000000' },
      { key: 'address', label: 'Sede', value: 'Rua Exemplo, 1, Lisboa' },
    ])
  })

  it('ignora campos com placeholder e apara espaços', () => {
    const partial: Company = { ...FILLED, legalName: '  Empresa Exemplo, Lda.  ', nif: 'A_PREENCHER', address: null }

    expect(getCompanyIdentification(partial)).toEqual([
      { key: 'legalName', label: 'Razão social', value: 'Empresa Exemplo, Lda.' },
    ])
  })
})
