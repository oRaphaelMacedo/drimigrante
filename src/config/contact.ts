/**
 * Fonte única dos contatos públicos (DI-009).
 *
 * Nenhuma página deve ter e-mail ou telefone fixo: importe daqui.
 *
 * ATENÇÃO (ação do dono): o domínio drimigrante.com ainda não tem registro MX,
 * ou seja, estes endereços não recebem e-mail até a caixa (ou o encaminhamento)
 * ser configurada no provedor de DNS/e-mail.
 */

/** Suporte geral: dúvidas, cancelamento da assinatura, reembolso, conta. */
export const SUPPORT_EMAIL = 'contacto@drimigrante.com'

/** Encarregado de dados / pedidos do RGPD. */
export const PRIVACY_EMAIL = 'privacidade@drimigrante.com'

/**
 * Link do WhatsApp (opcional), ex.: 'https://wa.me/351XXXXXXXXX'.
 * Vazio = o botão de WhatsApp não aparece em lugar nenhum.
 */
export const WHATSAPP_URL: string = ''

const WHATSAPP_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com'])

/** `true` só para links https do WhatsApp (vazio ou placeholder = `false`). */
export function isUsableWhatsAppUrl(url: string): boolean {
  const value = url.trim()
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && WHATSAPP_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

/** Use para decidir se o botão/link de WhatsApp é renderizado. */
export const HAS_WHATSAPP = isUsableWhatsAppUrl(WHATSAPP_URL)

/** Monta um link `mailto:` com assunto opcional já codificado. */
export function mailtoHref(email: string, subject?: string): string {
  const base = `mailto:${email}`
  return subject ? `${base}?subject=${encodeURIComponent(subject)}` : base
}
