/**
 * Consentimento de cookies e rastreamento (RGPD/LGPD).
 *
 * Valor guardado em localStorage['di_cookie_consent']:
 *  - 'all'       → estatísticas + marketing. Só pode ser gravado por um botão
 *                  cujo texto mencione marketing/anúncios ("Aceitar estatísticas
 *                  e marketing" em /cookies, visível só com o Pixel configurado).
 *  - 'granted'   → só estatísticas. É o valor do "Aceitar" do banner e de todas
 *                  as aceitações anteriores a este contrato, quando o banner só
 *                  falava de estatísticas. NUNCA conta como marketing.
 *  - 'analytics' → só estatísticas ("Aceitar estatísticas"/"Só estatísticas" em
 *                  /cookies).
 *  - 'denied'    → só o essencial.
 *  - ausente     → ainda não escolheu (banner visível).
 *
 * Contrato com o CookieBanner (W1-08/W3-02): ele continua gravando
 * setConsent('granted') ou setConsent('denied'). O banner só pode passar a
 * gravar 'all' quando o próprio texto do botão mencionar marketing/anúncios.
 *
 * Toda mudança dispara `consent-changed` em window (detail = ConsentChoice),
 * que o analytics e o Sentry escutam.
 */

export type ConsentState = 'granted' | 'denied' | 'pending'
export type ConsentChoice = 'all' | 'granted' | 'analytics' | 'denied'
export type ConsentCategory = 'analytics' | 'marketing'

export const CONSENT_STORAGE_KEY = 'di_cookie_consent'
export const CONSENT_EVENT = 'consent-changed'

const CHOICES: readonly ConsentChoice[] = ['all', 'granted', 'analytics', 'denied']

export function isConsentChoice(value: unknown): value is ConsentChoice {
  return typeof value === 'string' && (CHOICES as readonly string[]).includes(value)
}

/**
 * O que uma escolha permite. Marketing exige 'all'; 'granted' (banner e
 * aceitações antigas) vale só para estatísticas.
 */
export function choiceAllows(choice: ConsentChoice | null, category: ConsentCategory): boolean {
  if (category === 'marketing') return choice === 'all'
  return choice === 'all' || choice === 'granted' || choice === 'analytics'
}

/** Cópia em memória para quando o localStorage está bloqueado. */
let memoryChoice: ConsentChoice | null = null

function readChoice(): ConsentChoice | null {
  try {
    if (typeof window === 'undefined') return memoryChoice
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (isConsentChoice(value)) return value
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
  return choiceAllows(readChoice(), category)
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
    const detail = (event as CustomEvent<unknown>).detail
    if (isConsentChoice(detail)) listener(detail)
  }
  window.addEventListener(CONSENT_EVENT, handler)
  return () => window.removeEventListener(CONSENT_EVENT, handler)
}
