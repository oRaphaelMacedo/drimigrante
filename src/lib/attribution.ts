/**
 * Atribuição de campanha (first-touch por sessão do navegador).
 *
 * A pessoa entra por /?utm_source=instagram e só depois vai para /quiz; sem
 * isto as UTMs se perdem na navegação. `captureAttribution()` roda no boot
 * (main.tsx) e guarda as UTMs da URL de entrada em sessionStorage.
 * `getAttribution()` devolve o que foi guardado — é o que o useQuiz envia
 * ao RPC (p_utm_source, p_utm_medium, p_utm_campaign).
 *
 * Regras:
 *  - first-touch: a primeira entrada da sessão vence; exceção: se a primeira
 *    entrada foi direta (sem UTM) e depois chega uma com UTM, a campanha vence.
 *  - sem PII: só UTMs, o domínio de quem indicou (referrer externo) e o
 *    caminho de entrada (sem query). Valores são truncados e sanitizados.
 *  - sessionStorage (dura até fechar a aba) — dado funcional de primeira parte,
 *    não depende do consentimento de cookies; não é enviado a terceiros.
 */
import { scrubText } from './url-sanitize'

export interface Attribution {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  /** Domínio do site que trouxe a pessoa (ex.: l.instagram.com), se externo. */
  referrer_host?: string
  /** Caminho da página de entrada, sem query nem fragmento. */
  landing_path?: string
  /** ISO 8601 do momento da captura. */
  captured_at?: string
}

const STORAGE_KEY = 'di_attribution_v1'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const MAX_LENGTH = 150

function clean(value: string | null): string | undefined {
  if (!value) return undefined
  // remove caracteres de controle e espaços nas pontas
  const printable = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code >= 0x20 && code !== 0x7f
    })
    .join('')
    .trim()
  const normalized = scrubText(printable)
  return normalized ? normalized.slice(0, MAX_LENGTH) : undefined
}

function hasUtm(a: Attribution | null | undefined): boolean {
  return !!a && UTM_KEYS.some((key) => !!a[key])
}

/** Lê as UTMs e o referrer de uma URL de entrada (função pura, testável). */
export function parseAttribution(href: string, referrer = '', now: Date = new Date()): Attribution {
  const result: Attribution = {}
  let url: URL | null = null
  try {
    url = new URL(href)
  } catch {
    url = null
  }

  if (url) {
    for (const key of UTM_KEYS) {
      const value = clean(url.searchParams.get(key))
      if (value) result[key] = value
    }
    result.landing_path = url.pathname.slice(0, MAX_LENGTH)
  }

  if (referrer) {
    try {
      const ref = new URL(referrer)
      if (!url || ref.hostname !== url.hostname) result.referrer_host = ref.hostname.slice(0, MAX_LENGTH)
    } catch {
      // referrer inválido: ignora
    }
  }

  result.captured_at = now.toISOString()
  return result
}

function readStored(): Attribution | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Attribution) : null
  } catch {
    return null
  }
}

function store(value: Attribution): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // sessionStorage indisponível (aba privada antiga, bloqueio): segue sem guardar
  }
}

/** Chamar no boot, antes de qualquer navegação limpar a URL. */
export function captureAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null
  const current = parseAttribution(window.location.href, document.referrer)
  const stored = readStored()
  if (!stored || (!hasUtm(stored) && hasUtm(current))) {
    store(current)
    return current
  }
  return stored
}

/**
 * Atribuição desta sessão. Sem nada guardado (ou storage bloqueado), cai
 * para as UTMs da URL atual.
 */
export function getAttribution(): Attribution {
  if (typeof window === 'undefined') return {}
  const stored = readStored()
  if (stored) return stored
  const current = parseAttribution(window.location.href, document.referrer)
  return hasUtm(current) ? current : {}
}
