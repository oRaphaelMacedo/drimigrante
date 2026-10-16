// quiz-submission.ts — qual session_id usar em cada envio do quiz.
//
// Um session_id corresponde a UM conjunto de respostas enviado. O RPC
// upsert_anon_assessment faz upsert por session_id, e o compute-eligibility
// congela o resultado quando a análise de IA já existe (DI-004). Se a pessoa
// refizesse o quiz com o mesmo session_id, o assessment ganharia as respostas
// novas mas manteria score, vias e análise das antigas — e é esse assessment que
// vai para o checkout de €30. Por isso:
//   - envio novo com respostas diferentes numa sessão já enviada → session_id novo;
//   - reenvio com as mesmas respostas → mesmo session_id (sem lead duplicado).
// O useQuiz também gira a sessão (resetSession) depois de um envio persistido.
//
// Módulo puro (sem aliases nem acesso a window no import): testado pelo Deno em
// supabase/functions/_shared/quiz-submission_test.ts.

export const QUIZ_RESULT_KEY = 'dr_imigrante_quiz_result'
export const SUBMITTED_SESSIONS_KEY = 'dr_imigrante_quiz_submitted'
export const MAX_REMEMBERED_SUBMISSIONS = 10

export interface SubmittedSession {
  sessionId: string
  answersKey: string
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/** Chave canônica das respostas: ignora a ordem das chaves e valores vazios. */
export function answersKey(answers: unknown): string {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return '[]'
  const entries = Object.entries(answers as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

function readJson(storage: StorageLike, key: string): unknown {
  try {
    const raw = storage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isSubmittedSession(value: unknown): value is SubmittedSession {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.sessionId === 'string' && v.sessionId !== '' && typeof v.answersKey === 'string'
}

/**
 * Envios já feitos neste navegador: a lista própria e, para quem enviou antes
 * desta versão, o resultado guardado (dr_imigrante_quiz_result).
 */
export function readSubmittedSessions(storage: StorageLike | null): SubmittedSession[] {
  if (!storage) return []
  const list = readJson(storage, SUBMITTED_SESSIONS_KEY)
  const submitted = Array.isArray(list) ? list.filter(isSubmittedSession) : []

  const stored = readJson(storage, QUIZ_RESULT_KEY) as { sessionId?: unknown; answers?: unknown } | null
  if (
    stored &&
    typeof stored.sessionId === 'string' &&
    stored.sessionId !== '' &&
    !submitted.some((s) => s.sessionId === stored.sessionId)
  ) {
    submitted.push({ sessionId: stored.sessionId, answersKey: answersKey(stored.answers) })
  }
  return submitted
}

/** Registra um envio persistido (mais recente primeiro, sem repetir, com limite). */
export function rememberSubmission(storage: StorageLike | null, entry: SubmittedSession): void {
  if (!storage) return
  try {
    const list = readJson(storage, SUBMITTED_SESSIONS_KEY)
    const previous = Array.isArray(list) ? list.filter(isSubmittedSession) : []
    const next = [entry, ...previous.filter((s) => s.sessionId !== entry.sessionId)].slice(
      0,
      MAX_REMEMBERED_SUBMISSIONS,
    )
    storage.setItem(SUBMITTED_SESSIONS_KEY, JSON.stringify(next))
  } catch {
    // storage indisponível (modo privado/cota): o resetSession ainda gira a sessão.
  }
}

export function pickSubmissionSessionId(params: {
  currentSessionId: string
  answers: Record<string, string>
  submitted: SubmittedSession[]
  createId: () => string
}): string {
  const previous = params.submitted.find((s) => s.sessionId === params.currentSessionId)
  if (!previous || previous.answersKey === answersKey(params.answers)) return params.currentSessionId
  return params.createId()
}

/** session_id novo: UUID (formato aceito pelo RPC e pelo hardening previsto no DI-081). */
export function createSessionId(): string {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  // Navegador sem randomUUID (contexto não seguro): mesmo formato do useQuizPersistence.
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
