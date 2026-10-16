/**
 * safe-path — validação de caminhos internos para redirecionamentos.
 *
 * Usado no retorno por link (AuthCallbackPage `?next=`), no login
 * (`state.from` / `state.returnTo`) e em qualquer outro lugar que receba um
 * destino vindo da URL, do history state ou do localStorage. Tudo isso é
 * entrada não confiável: sem esta validação, `?next=//evil.com` vira um open
 * redirect a partir de um link legítimo do nosso domínio.
 *
 * Regras (DI-027):
 *  - precisa começar com exatamente uma barra (`/dashboard`), nunca `//` nem `/\`;
 *  - sem caracteres de controle (o navegador remove tab/quebra de linha e
 *    `/\t/evil.com` viraria `//evil.com`);
 *  - depois de normalizado pelo parser de URL, continua na mesma origem;
 *  - não pode apontar para as próprias rotas de autenticação (evita loops).
 */

/** Destino padrão depois de entrar. */
export const DEFAULT_AFTER_LOGIN_PATH = '/dashboard'

/** Origem fictícia usada só para normalizar o caminho com o parser de URL. */
const PARSE_BASE = 'https://safe-path.invalid'
const MAX_PATH_LENGTH = 2048

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** Rotas que não fazem sentido como destino pós-login (gerariam loop). */
const BLOCKED_PATHS = ['/login', '/auth/callback']

function isBlockedPath(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return BLOCKED_PATHS.some(
    (blocked) => normalized === blocked || normalized.startsWith(`${blocked}/`),
  )
}

/**
 * Devolve `input` normalizado se for um caminho interno seguro; caso
 * contrário, devolve `fallback`.
 *
 * @example
 * safeInternalPath('/checkout?plan=one_time') // '/checkout?plan=one_time'
 * safeInternalPath('//evil.com')              // '/dashboard'
 * safeInternalPath('https://evil.com', '/')   // '/'
 */
export function safeInternalPath(
  input: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN_PATH,
): string {
  if (typeof input !== 'string') return fallback
  if (input.length === 0 || input.length > MAX_PATH_LENGTH) return fallback
  if (input[0] !== '/') return fallback
  // `//host` e `/\host` são URLs relativas ao protocolo para o navegador.
  if (input[1] === '/' || input[1] === '\\') return fallback
  if (input.includes('\\')) return fallback
  if (CONTROL_CHARS.test(input)) return fallback

  let url: URL
  try {
    url = new URL(input, PARSE_BASE)
  } catch {
    return fallback
  }
  if (url.origin !== PARSE_BASE) return fallback
  if (isBlockedPath(url.pathname)) return fallback

  return `${url.pathname}${url.search}${url.hash}`
}

/** Formato mínimo de `Location` do react-router guardado em `state.from`. */
export interface PathLike {
  pathname?: unknown
  search?: unknown
  hash?: unknown
}

/**
 * Converte um `Location` (ex.: `state.from` do ProtectedRoute) em caminho
 * interno seguro. Aceita também uma string.
 */
export function safePathFromLocation(
  from: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN_PATH,
): string {
  if (typeof from === 'string') return safeInternalPath(from, fallback)
  if (!from || typeof from !== 'object') return fallback
  const { pathname, search, hash } = from as PathLike
  if (typeof pathname !== 'string') return fallback
  const path = `${pathname}${typeof search === 'string' ? search : ''}${
    typeof hash === 'string' ? hash : ''
  }`
  return safeInternalPath(path, fallback)
}
