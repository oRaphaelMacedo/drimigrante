import { describe, expect, it } from 'vitest'
import {
  HAS_WHATSAPP,
  PRIVACY_EMAIL,
  SUPPORT_EMAIL,
  WHATSAPP_URL,
  isUsableWhatsAppUrl,
  mailtoHref,
} from './contact'

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

describe('contatos', () => {
  it('e-mails de suporte e privacidade válidos, no domínio do site', () => {
    expect(SUPPORT_EMAIL).toMatch(EMAIL)
    expect(PRIVACY_EMAIL).toMatch(EMAIL)
    expect(SUPPORT_EMAIL.endsWith('@drimigrante.com')).toBe(true)
    expect(PRIVACY_EMAIL.endsWith('@drimigrante.com')).toBe(true)
  })

  it('WhatsApp é opcional: vazio por padrão e botão oculto', () => {
    expect(typeof WHATSAPP_URL).toBe('string')
    expect(HAS_WHATSAPP).toBe(isUsableWhatsAppUrl(WHATSAPP_URL))
    expect(isUsableWhatsAppUrl('')).toBe(false)
    expect(isUsableWhatsAppUrl('   ')).toBe(false)
  })

  it('só aceita links https do WhatsApp', () => {
    expect(isUsableWhatsAppUrl('https://wa.me/351900000000')).toBe(true)
    expect(isUsableWhatsAppUrl('https://api.whatsapp.com/send?phone=351900000000')).toBe(true)
    expect(isUsableWhatsAppUrl('http://wa.me/351900000000')).toBe(false)
    expect(isUsableWhatsAppUrl('https://exemplo.com/whatsapp')).toBe(false)
    expect(isUsableWhatsAppUrl('A_PREENCHER')).toBe(false)
  })
})

describe('mailtoHref', () => {
  it('gera mailto simples sem assunto', () => {
    expect(mailtoHref('contato@exemplo.com')).toBe('mailto:contato@exemplo.com')
  })

  it('codifica o assunto', () => {
    expect(mailtoHref('contato@exemplo.com', 'Cancelar assinatura & reembolso')).toBe(
      'mailto:contato@exemplo.com?subject=Cancelar%20assinatura%20%26%20reembolso',
    )
  })
})
