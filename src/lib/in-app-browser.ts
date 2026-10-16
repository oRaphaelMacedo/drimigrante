/**
 * in-app-browser — detecta navegadores embutidos de apps (Instagram,
 * Facebook, TikTok, LINE, Snapchat, LinkedIn, WebView do Android).
 *
 * O Google bloqueia o OAuth nesses navegadores ("disallowed_useragent"), então
 * o /login esconde o botão "Entrar com Google" quando esta função devolve true.
 * Detecção por user agent: é heurística e pode ter falso negativo; por isso o
 * link por e-mail continua sendo sempre a opção principal.
 */

const IN_APP_PATTERNS: RegExp[] = [
  /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, // Facebook e Messenger
  /Instagram/i,
  /\bLine\//i, // LINE
  /TikTok|musical_ly|BytedanceWebview|trill_/i,
  /Snapchat/i,
  /LinkedInApp/i,
  /; wv\)/i, // Android WebView genérico
]

export function isInAppBrowser(userAgent?: string | null): boolean {
  const ua =
    userAgent ?? (typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : '')
  if (!ua) return false
  return IN_APP_PATTERNS.some((pattern) => pattern.test(ua))
}
