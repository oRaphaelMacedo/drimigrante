import { describe, expect, it } from 'vitest'
import {
  CRM_STAGES,
  CRM_STAGE_META,
  countByCrmStage,
  csvField,
  isCrmStage,
  leadTemperature,
  parseCrmStage,
  readAnswerText,
} from './crm-stage'

describe('parseCrmStage', () => {
  it('aceita as fases conhecidas', () => {
    for (const stage of CRM_STAGES) expect(parseCrmStage(stage)).toBe(stage)
  })

  it('trata vazio, nulo e valores desconhecidos como "novo"', () => {
    expect(parseCrmStage(null)).toBe('novo')
    expect(parseCrmStage(undefined)).toBe('novo')
    expect(parseCrmStage('')).toBe('novo')
    expect(parseCrmStage('Contactado')).toBe('novo')
    expect(parseCrmStage(42)).toBe('novo')
  })

  it('isCrmStage só aceita os identificadores do banco', () => {
    expect(isCrmStage('proposta')).toBe(true)
    expect(isCrmStage('contatado')).toBe(false)
  })
})

describe('CRM_STAGE_META', () => {
  it('tem rótulos em pt-BR (sem "contacto")', () => {
    const labels = Object.values(CRM_STAGE_META).flatMap((m) => [m.label, m.pluralLabel])
    expect(labels.join(' ')).not.toMatch(/contact/i)
    expect(CRM_STAGE_META.contactado.label).toBe('Contatado')
  })
})

describe('countByCrmStage', () => {
  it('conta por fase, inclusive as vazias, e põe desconhecidos em "novo"', () => {
    expect(
      countByCrmStage([
        { crm_stage: 'novo' },
        { crm_stage: 'convertido' },
        { crm_stage: 'convertido' },
        { crm_stage: null },
        { crm_stage: 'xyz' },
      ]),
    ).toEqual({ novo: 3, contactado: 0, proposta: 0, convertido: 2 })
  })
})

describe('leadTemperature', () => {
  it('segue a porcentagem do quiz respondida', () => {
    expect(leadTemperature(null)).toBe('frio')
    expect(leadTemperature(0)).toBe('frio')
    expect(leadTemperature(49)).toBe('frio')
    expect(leadTemperature(50)).toBe('morno')
    expect(leadTemperature(99)).toBe('morno')
    expect(leadTemperature(100)).toBe('quente')
  })
})

describe('readAnswerText', () => {
  it('lê só strings não vazias de um objeto JSON', () => {
    expect(readAnswerText({ score_category: 'alta' }, 'score_category')).toBe('alta')
    expect(readAnswerText({ score_category: '  ' }, 'score_category')).toBeNull()
    expect(readAnswerText({ score_category: 3 }, 'score_category')).toBeNull()
    expect(readAnswerText(['alta'], 'score_category')).toBeNull()
    expect(readAnswerText('alta', 'score_category')).toBeNull()
    expect(readAnswerText(null, 'score_category')).toBeNull()
  })
})

describe('csvField', () => {
  it('escapa aspas e trata vazios', () => {
    expect(csvField('Ana "Bia" Souza')).toBe('"Ana ""Bia"" Souza"')
    expect(csvField(null)).toBe('""')
    expect(csvField(undefined)).toBe('""')
    expect(csvField(42)).toBe('"42"')
  })

  it('neutraliza fórmulas vindas do visitante', () => {
    expect(csvField('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"')
    expect(csvField('@SUM(A1)')).toBe('"\'@SUM(A1)"')
    expect(csvField('+cmd')).toBe('"\'+cmd"')
    expect(csvField('-2+3')).toBe('"\'-2+3"')
    expect(csvField('-1-2')).toBe('"\'-1-2"')
    expect(csvField('-(1)')).toBe('"\'-(1)"')
    expect(csvField('-5')).toBe('"-5"')
    expect(csvField('-2,5')).toBe('"-2,5"')
  })

  it('mantém telefones com sinal de +', () => {
    expect(csvField('+351 912 345 678')).toBe('"+351 912 345 678"')
    expect(csvField('+55 (11) 91234-5678')).toBe('"+55 (11) 91234-5678"')
  })
})
