/**
 * stored-quiz-result — leitura segura do resultado do quiz guardado no
 * localStorage (`dr_imigrante_quiz_result`) para a camada de autenticação.
 *
 * Usado para:
 *  - pré-preencher o e-mail no /login com o e-mail informado no quiz;
 *  - decidir se o assessment anônimo deste navegador pode ser vinculado à
 *    conta que acabou de entrar. Só vincula quando o e-mail do quiz é o mesmo
 *    da conta (sem diferenciar maiúsculas). Em aparelho compartilhado, isso
 *    impede que o resultado de outra pessoa vá parar na conta errada.
 */

export const QUIZ_RESULT_STORAGE_KEY = 'dr_imigrante_quiz_result'

export interface StoredQuizIdentity {
  assessmentId: string | null
  sessionId: string | null
  email: string | null
}

export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Extrai só os campos de identidade do JSON salvo pelo quiz. */
export function parseStoredQuizIdentity(raw: string | null | undefined): StoredQuizIdentity | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const record = parsed as {
      assessmentId?: unknown
      sessionId?: unknown
      leadInfo?: { email?: unknown } | null
    }
    return {
      assessmentId: asNonEmptyString(record.assessmentId),
      sessionId: asNonEmptyString(record.sessionId),
      email: normalizeEmail(record.leadInfo?.email),
    }
  } catch {
    return null
  }
}

/** Lê o resultado do quiz deste navegador (nunca lança). */
export function readStoredQuizIdentity(): StoredQuizIdentity | null {
  try {
    if (typeof window === 'undefined') return null
    return parseStoredQuizIdentity(window.localStorage.getItem(QUIZ_RESULT_STORAGE_KEY))
  } catch {
    return null
  }
}

/**
 * Assessment anônimo que pode ser vinculado à conta `userEmail`, ou `null`.
 * Exige assessmentId, sessionId e e-mail do quiz igual ao da conta.
 */
export function getLinkableAssessment(
  stored: StoredQuizIdentity | null,
  userEmail: string | null | undefined,
): { assessmentId: string; sessionId: string } | null {
  if (!stored?.assessmentId || !stored.sessionId) return null
  const accountEmail = normalizeEmail(userEmail)
  if (!stored.email || !accountEmail || stored.email !== accountEmail) return null
  return { assessmentId: stored.assessmentId, sessionId: stored.sessionId }
}
