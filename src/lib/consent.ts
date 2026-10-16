/**
 * Consentimento de cookies e rastreamento (RGPD/LGPD).
 *
 * Valor guardado em localStorage['di_cookie_consent']:
 *  - 'granted'   → estatísticas + marketing ("Aceitar" no banner)
 *  - 'analytics' → só estatísticas (opção da página /cookies)
 *  - 'denied'    → só o essencial
 *  - ausente     → ainda não escolheu (banner visível)
 *
 * Toda mudança dispara `consent-changed` em window (detail = ConsentChoice),
 * que o analytics e o Sentry escutam.
 */

export type ConsentState = 'granted' | 'denied' | 'pending'
export type ConsentChoice = 'granted' | 'analytics' | 'denied'
export type ConsentCategory = 'analytics' | 'marketing'

export const CONSENT_STORAGE_KEY = 'di_cookie_consent'
export const CONSENT_EVENT = 'consent-changed'

/** Cópia em memória para quando o localStorage está bloqueado. */
let memoryChoice: ConsentChoice | null = null

function readChoice(): ConsentChoice | null {
  try {
    if (typeof window === 'undefined') return memoryChoice
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (value === 'granted' || value === 'analytics' || value === 'denied') return value
    return memoryChoice
  } catch {
    return memoryChoice
  }
}

/** Escolha detalhada (null enquanto a pessoa não decidiu). */
export function getConsentChoice(): ConsentChoice | null {
  return readChoice()
}

/**
 * Estado resumido, compatível com o banner: 'granted' quando há consentimento
 * para estatísticas (com ou sem marketing).
 */
export function getConsent(): ConsentState {
  const choice = readChoice()
  if (choice === null) return 'pending'
  return choice === 'denied' ? 'denied' : 'granted'
}

export function hasConsent(category: ConsentCategory): boolean {
  const choice = readChoice()
  if (category === 'analytics') return choice === 'granted' || choice === 'analytics'
  return choice === 'granted'
}

export function setConsent(choice: ConsentChoice): void {
  memoryChoice = choice
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice)
  } catch {
    // Armazenamento bloqueado: a escolha vale só para esta página.
  }
  try {
    window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_EVENT, { detail: choice }))
  } catch {
    // ambiente sem CustomEvent (SSR/testes)
  }
}

/** Inscreve um ouvinte para mudanças de consentimento. Devolve o "unsubscribe". */
export function onConsentChange(listener: (choice: ConsentChoice) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ConsentChoice>).detail
    if (detail === 'granted' || detail === 'analytics' || detail === 'denied') listener(detail)
  }
  window.addEventListener(CONSENT_EVENT, handler)
  return () => window.removeEventListener(CONSENT_EVENT, handler)
}
