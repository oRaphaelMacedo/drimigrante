/**
 * DI-053 — link de partilha: só /quiz com UTMs fixas, nunca nome, e-mail, ids
 * ou score de quem partilhou.
 */
import { describe, expect, it } from 'vitest'
import {
  SHARE_TEXT,
  buildShareMessage,
  buildShareUrl,
  buildWhatsAppUrl,
  canUseNativeShare,
  isShareAbort,
} from './share'

const ORIGIN = 'https://doutorimigrante.com'

describe('buildShareUrl', () => {
  it('leva ao quiz com utm_source=share, canal e lugar', () => {
    const url = new URL(buildShareUrl(ORIGIN, { method: 'whatsapp', placement: 'results' }))
    expect(url.origin).toBe(ORIGIN)
    expect(url.pathname).toBe('/quiz')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: 'share',
      utm_medium: 'whatsapp',
      utm_campaign: 'results',
    })
  })

  it('sem opções: só utm_source', () => {
    expect(buildShareUrl(`${ORIGIN}/`)).toBe(`${ORIGIN}/quiz?utm_source=share`)
  })

  it('descarta placement que não é um identificador simples (nunca vaza dado)', () => {
    for (const placement of ['maria.souza@gmail.com', 'Maria Souza', '00000000-0000-0000-0000-000000000001x'.repeat(2), 'r=abc']) {
      const url = new URL(buildShareUrl(ORIGIN, { method: 'copy_link', placement }))
      expect(url.searchParams.has('utm_campaign')).toBe(false)
      expect(url.href).not.toContain('maria')
      expect(url.href).not.toContain('@')
    }
  })

  it('não leva nenhum parâmetro além das UTMs', () => {
    const url = new URL(buildShareUrl(ORIGIN, { method: 'native', placement: 'analysis' }))
    expect([...url.searchParams.keys()].sort()).toEqual(['utm_campaign', 'utm_medium', 'utm_source'])
    expect(url.hash).toBe('')
  })
})

describe('WhatsApp e mensagem', () => {
  it('mensagem = texto fixo + link', () => {
    const url = buildShareUrl(ORIGIN, { method: 'whatsapp' })
    expect(buildShareMessage(url)).toBe(`${SHARE_TEXT} ${url}`)
  })

  it('wa.me sem destinatário, com o texto codificado', () => {
    const url = buildShareUrl(ORIGIN, { method: 'whatsapp', placement: 'results' })
    const wa = new URL(buildWhatsAppUrl(url))
    expect(wa.origin).toBe('https://wa.me')
    expect(wa.pathname).toBe('/')
    expect(wa.searchParams.get('text')).toBe(`${SHARE_TEXT} ${url}`)
  })

  it('o texto não fala de resultado, score nem promete aprovação', () => {
    expect(SHARE_TEXT).not.toMatch(/\d+ ?%|alta|média|baixa|garant|aprova/i)
  })
})

describe('navigator.share', () => {
  it('detecta a folha nativa', () => {
    expect(canUseNativeShare({ share: async () => undefined })).toBe(true)
    expect(canUseNativeShare({} as Pick<Navigator, 'share'>)).toBe(false)
    expect(canUseNativeShare(undefined)).toBe(false)
  })

  it('AbortError = a pessoa fechou a folha (não é erro)', () => {
    expect(isShareAbort(new DOMException('cancelado', 'AbortError'))).toBe(true)
    expect(isShareAbort(new DOMException('negado', 'NotAllowedError'))).toBe(false)
    expect(isShareAbort(new Error('x'))).toBe(false)
    expect(isShareAbort(null)).toBe(false)
  })
})
