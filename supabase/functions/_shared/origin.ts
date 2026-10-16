// _shared/origin.ts — allowlist de origens do frontend (DI-019, W1-03)
//
// Os return URLs do Stripe (success_url / cancel_url) e os links de login por
// e-mail seguem o header Origin da chamada SOMENTE quando ele é um dos nossos
// frontends; caso contrário usamos APP_URL. Isso permite que previews da Vercel
// e o dev server local completem a ida e volta do checkout sem abrir um
// redirecionamento arbitrário (open redirect).
//
// Regras:
//  - o Origin precisa ser uma origem "pura" (scheme://host[:porta]), sem path,
//    userinfo ou variação de caixa — qualquer coisa fora disso é rejeitada;
//  - aceitos: a origem exata de APP_URL, previews deste projeto na Vercel e
//    http://localhost / http://127.0.0.1 com porta opcional;
//  - rejeitados, por exemplo: https://evil.com, http://localhost.evil.com,
//    https://dr-imigrante-x-oraphaelmacedo-3991s-projects.vercel.app.evil.com.

export const DEFAULT_APP_URL = 'http://localhost:5173'

const VERCEL_PREVIEW_ORIGIN =
  /^https:\/\/dr-imigrante-[a-z0-9-]+-oraphaelmacedo-3991s-projects\.vercel\.app$/
const LOCAL_DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/

type EnvGetter = (key: string) => string | undefined

const denoEnv: EnvGetter = (key) => Deno.env.get(key)

/** Retorna a origem canônica de uma URL http(s), ou null se inválida. */
export function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

/** true quando `origin` é um frontend nosso (ver regras no topo do arquivo). */
export function isAllowedOrigin(
  origin: string | null | undefined,
  appUrl?: string | null,
): boolean {
  if (!origin) return false
  // O header Origin legítimo já vem canônico; qualquer diferença indica path,
  // caixa alta, barra final ou outro truque — rejeitar.
  if (toOrigin(origin) !== origin) return false
  const appOrigin = toOrigin(appUrl)
  if (appOrigin && origin === appOrigin) return true
  return VERCEL_PREVIEW_ORIGIN.test(origin) || LOCAL_DEV_ORIGIN.test(origin)
}

/** APP_URL configurado (sem barra final) ou o padrão de desenvolvimento. */
export function getAppUrl(getEnv: EnvGetter = denoEnv): string {
  const configured = toOrigin(getEnv('APP_URL')?.trim())
  return configured ?? DEFAULT_APP_URL
}

/**
 * Base URL do frontend para montar links de retorno: a Origin da chamada se
 * for permitida, senão APP_URL.
 */
export function resolveAppUrl(req: Request, getEnv: EnvGetter = denoEnv): string {
  const appUrl = getAppUrl(getEnv)
  const origin = req.headers.get('Origin')
  return isAllowedOrigin(origin, appUrl) ? (origin as string) : appUrl
}
