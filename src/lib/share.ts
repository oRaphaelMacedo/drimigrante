/**
 * Partilha com a família (DI-053): link e texto do convite, sem PII.
 *
 * O link leva SEMPRE ao quiz grátis (/quiz) com UTMs fixas. Nunca entram nome,
 * e-mail, telefone, ids (assessment, session_id, resume token) nem o score:
 * quem recebe faz o próprio diagnóstico e o resultado de quem partilhou
 * continua só no aparelho dele. As UTMs são capturadas por src/lib/attribution.ts
 * na entrada e vão para o assessment de quem recebeu (utm_source=share).
 *
 * Ordem dos canais no ShareButton: navigator.share → WhatsApp (wa.me) → copiar.
 */

/** Canal usado na partilha (vai para `share_clicked.method` e `utm_medium`). */
export type ShareMethod = 'native' | 'whatsapp' | 'copy_link'

export const SHARE_UTM_SOURCE = 'share'
export const SHARE_PATH = '/quiz'

export const SHARE_TITLE = 'Doutor Imigrante: diagnóstico gratuito'
export const SHARE_TEXT =
  'Fiz o diagnóstico gratuito do Doutor Imigrante sobre a nacionalidade portuguesa. Faça o seu também:'

/** Só letras minúsculas, números, `_` e `-` (valores fixos, nunca dados da pessoa). */
const SAFE_UTM_VALUE = /^[a-z0-9_-]{1,40}$/

function safeUtm(value: string | undefined): string | null {
  return value && SAFE_UTM_VALUE.test(value) ? value : null
}

/**
 * URL partilhada: `<origem>/quiz?utm_source=share&utm_medium=<canal>&utm_campaign=<onde>`.
 * `placement` aceita só identificadores simples (ex.: 'results', 'analysis');
 * qualquer outro valor é descartado para não vazar dado por engano.
 */
export function buildShareUrl(origin: string, options: { method?: ShareMethod; placement?: string } = {}): string {
  const params = new URLSearchParams({ utm_source: SHARE_UTM_SOURCE })
  const medium = safeUtm(options.method)
  const campaign = safeUtm(options.placement)
  if (medium) params.set('utm_medium', medium)
  if (campaign) params.set('utm_campaign', campaign)
  return `${origin.replace(/\/+$/, '')}${SHARE_PATH}?${params.toString()}`
}

/** Mensagem completa (texto + link), usada no WhatsApp e no "copiar". */
export function buildShareMessage(url: string): string {
  return `${SHARE_TEXT} ${url}`
}

/** Link do WhatsApp sem destinatário: a pessoa escolhe o contato no app. */
export function buildWhatsAppUrl(url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(buildShareMessage(url))}`
}

/** O navegador tem a folha de partilha nativa (Android, iOS)? */
export function canUseNativeShare(nav: Pick<Navigator, 'share'> | undefined = globalThis.navigator): boolean {
  return typeof nav?.share === 'function'
}

/** A pessoa fechou a folha de partilha sem escolher um app (não é erro). */
export function isShareAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Copia o texto para a área de transferência. Usa a Clipboard API e, sem ela
 * (contexto não seguro, navegador embutido), o método antigo com execCommand.
 * Devolve `false` quando nenhum funcionou (a tela mostra o link para copiar à mão).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // segue para o método antigo
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
