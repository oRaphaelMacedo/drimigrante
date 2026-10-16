/**
 * auth-redirect — monta as URLs de retorno do magic link / OAuth (DI-027).
 *
 * O destino pós-login viaja na própria URL (`/auth/callback?next=/checkout`),
 * então funciona mesmo quando o link é aberto em outra aba, outro navegador
 * do aparelho ou no app de e-mail. O localStorage continua como reserva.
 *
 * Supabase Auth: confirmar no painel (Authentication → URL Configuration) que
 * `<site>/auth/callback` com query (`?next=...`) é aceito; para localhost e
 * previews, cadastrar Redirect URLs com curinga (`**`). Ação manual do dono.
 */
import { DEFAULT_AFTER_LOGIN_PATH, safeInternalPath } from './safe-path'

export const AUTH_CALLBACK_PATH = '/auth/callback'

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** true só em localhost (usado para o login rápido de desenvolvimento). */
export function isLocalDevHostname(hostname: string | null | undefined): boolean {
  return typeof hostname === 'string' && LOCAL_DEV_HOSTNAMES.has(hostname.toLowerCase())
}

function originFrom(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.origin
  } catch {
    return null
  }
}

type LocationLike = Pick<Location, 'origin' | 'hostname'>

/**
 * Origem para onde o e-mail de acesso deve voltar.
 *  - Em localhost usa sempre a origem atual (a porta do dev server varia).
 *  - Fora dele, usa VITE_APP_URL (domínio canônico); sem ela, a origem atual.
 */
export function getAuthRedirectBase(
  envUrl: string | undefined = import.meta.env.VITE_APP_URL as string | undefined,
  location: LocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined,
): string {
  if (location && isLocalDevHostname(location.hostname)) return location.origin
  return originFrom(envUrl) ?? location?.origin ?? ''
}

/** URL do callback com `?next=` quando o destino não é o padrão. */
export function buildAuthCallbackUrl(
  next?: string | null,
  base: string = getAuthRedirectBase(),
): string {
  const url = `${base}${AUTH_CALLBACK_PATH}`
  const safeNext = safeInternalPath(next, DEFAULT_AFTER_LOGIN_PATH)
  if (safeNext === DEFAULT_AFTER_LOGIN_PATH) return url
  return `${url}?next=${encodeURIComponent(safeNext)}`
}
