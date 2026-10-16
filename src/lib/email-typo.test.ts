import { describe, expect, it } from 'vitest'
import { COMMON_EMAIL_DOMAINS, editDistance, suggestEmailCorrection, suggestEmailDomain } from './email-typo'

describe('editDistance', () => {
  it('conta inserção, remoção, troca e transposição como 1', () => {
    expect(editDistance('gmail.com', 'gmail.com')).toBe(0)
    expect(editDistance('gmai.com', 'gmail.com')).toBe(1)
    expect(editDistance('gmaill.com', 'gmail.com')).toBe(1)
    expect(editDistance('gnail.com', 'gmail.com')).toBe(1)
    expect(editDistance('gmial.com', 'gmail.com')).toBe(1)
    expect(editDistance('', 'abc')).toBe(3)
  })
})

describe('suggestEmailCorrection', () => {
  it("'x@gmial.com' sugere 'x@gmail.com'", () => {
    expect(suggestEmailCorrection('x@gmial.com')).toBe('x@gmail.com')
  })

  it.each([
    ['maria@gmai.com', 'maria@gmail.com'],
    ['maria@gmail.con', 'maria@gmail.com'],
    ['maria@gmail.cmo', 'maria@gmail.com'],
    ['maria@gmail.co', 'maria@gmail.com'],
    ['maria@hotmal.com', 'maria@hotmail.com'],
    ['maria@hotmail.com.bt', 'maria@hotmail.com.br'],
    ['maria@outlok.com', 'maria@outlook.com'],
    ['maria@yaho.com.br', 'maria@yahoo.com.br'],
    ['maria@icloud.co', 'maria@icloud.com'],
    ['maria@gmail.com.br', 'maria@gmail.com'],
    ['joao@sapo.p', 'joao@sapo.pt'],
  ])('%s → %s', (typed, expected) => {
    expect(suggestEmailCorrection(typed)).toBe(expected)
  })

  it('mantém a parte local como foi digitada e normaliza só o domínio', () => {
    expect(suggestEmailCorrection('  Maria.Souza+quiz@GMIAL.COM ')).toBe('Maria.Souza+quiz@gmail.com')
  })

  it('não sugere nada para provedores conhecidos', () => {
    for (const domain of COMMON_EMAIL_DOMAINS) {
      expect(suggestEmailCorrection(`ana@${domain}`)).toBeNull()
    }
    expect(suggestEmailCorrection('ana@GMAIL.com')).toBeNull()
  })

  it('não "corrige" domínios próprios ou distantes da lista', () => {
    expect(suggestEmailCorrection('ana@empresa.com.br')).toBeNull()
    expect(suggestEmailCorrection('ana@universidade.pt')).toBeNull()
    expect(suggestEmailCorrection('ana@me.com')).toBeNull()
    expect(suggestEmailCorrection('ana@gmx.com')).toBeNull()
    expect(suggestEmailCorrection('ana@outlook.pt')).toBeNull()
  })

  it('provedores reais parecidos com os comuns nunca são "corrigidos"', () => {
    for (const domain of ['ymail.com', 'aol.com', 'mac.com', 'me.com', 'msn.com', 'gmx.com', 'gmx.net', 'aim.com']) {
      expect(suggestEmailCorrection(`ana@${domain}`)).toBeNull()
    }
    expect(suggestEmailCorrection('ana@googlemail.com')).toBeNull()
    expect(suggestEmailCorrection('ana@protonmail.ch')).toBeNull()
    expect(suggestEmailCorrection('ana@oi.com.br')).toBeNull()
  })

  it('não troca o país de um provedor com domínios regionais', () => {
    for (const domain of [
      'yahoo.com.ar',
      'hotmail.com.ar',
      'yahoo.com.mx',
      'yahoo.com.pt',
      'outlook.com.pt',
      'live.com.pt',
      'hotmail.co.uk',
      'hotmail.ca',
      'live.ca',
      'yahoo.ca',
      'outlook.pt',
      'yahoo.com.co',
    ]) {
      expect(suggestEmailDomain(domain)).toBeNull()
    }
  })

  it('em provedor regional, corrige o nome e mantém o país digitado', () => {
    expect(suggestEmailDomain('hotmial.com.ar')).toBe('hotmail.com.ar')
    expect(suggestEmailDomain('yaho.com.mx')).toBe('yahoo.com.mx')
    expect(suggestEmailDomain('hotmal.co.uk')).toBe('hotmail.co.uk')
    // Sufixo cortado ou país implausível continuam sendo erro de digitação.
    expect(suggestEmailDomain('hotmail.co')).toBe('hotmail.com')
    expect(suggestEmailDomain('hotmail.com.bt')).toBe('hotmail.com.br')
  })

  it('sem o ".br", UOL e BOL não viram aol.com', () => {
    expect(suggestEmailDomain('uol.com')).toBe('uol.com.br')
    expect(suggestEmailDomain('bol.com')).toBe('bol.com.br')
  })

  it('domínio curto aceita só 1 letra de diferença', () => {
    expect(suggestEmailDomain('sapo.pt')).toBeNull()
    expect(suggestEmailDomain('sapo.p')).toBe('sapo.pt')
    expect(suggestEmailDomain('sa.pt')).toBeNull()
  })

  it('entrada inválida não gera sugestão', () => {
    expect(suggestEmailCorrection('')).toBeNull()
    expect(suggestEmailCorrection('sem-arroba')).toBeNull()
    expect(suggestEmailCorrection('@gmial.com')).toBeNull()
    expect(suggestEmailCorrection('a@b@gmial.com')).toBeNull()
    expect(suggestEmailCorrection('ana@')).toBeNull()
  })
})
