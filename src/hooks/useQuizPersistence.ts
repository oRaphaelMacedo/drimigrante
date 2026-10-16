// useQuizPersistence.ts — sessão do quiz guardada neste aparelho (localStorage).
//
// A sessão guarda as respostas, onde a pessoa parou (currentKey), o status e a
// data da última atividade (DI-041). Assim, recarregar ou sair e voltar oferece
// "Continue de onde parou". Sessões sem atividade há mais de 30 dias ou já
// concluídas são descartadas na leitura.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createSessionId } from '@/lib/quiz-submission'

export const QUIZ_SESSION_KEY = 'dr_imigrante_quiz_session'
export const QUIZ_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type QuizSessionStatus = 'in_progress' | 'completed'

export interface QuizSession {
  sessionId: string
  answers: Record<string, string>
  startedAt: string
  /** Última atividade (resposta ou mudança de etapa). */
  updatedAt: string
  status: QuizSessionStatus
  /** Onde a pessoa parou: key da pergunta ou CAPTURE_STEP ('contato'). */
  currentKey: string | null
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function createQuizSession(now: Date = new Date()): QuizSession {
  const iso = now.toISOString()
  return {
    sessionId: createSessionId(),
    answers: {},
    startedAt: iso,
    updatedAt: iso,
    status: 'in_progress',
    currentKey: null,
  }
}

function asAnswers(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const answers: Record<string, string> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') answers[key] = v
  }
  return answers
}

function asIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return Number.isNaN(Date.parse(value)) ? null : value
}

/**
 * Lê a sessão guardada. Aceita o formato antigo (sem status/updatedAt/currentKey).
 * Devolve null para JSON inválido, sessão concluída ou parada há mais de 30 dias.
 */
export function parseQuizSession(raw: string | null | undefined, now: number = Date.now()): QuizSession | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>

  const sessionId = typeof record.sessionId === 'string' ? record.sessionId : ''
  // Mesmo limite do RPC upsert_anon_assessment (8–64 caracteres).
  if (sessionId.length < 8 || sessionId.length > 64) return null
  if (record.status === 'completed') return null

  const startedAt = asIsoDate(record.startedAt) ?? new Date(now).toISOString()
  const updatedAt = asIsoDate(record.updatedAt) ?? startedAt
  if (now - Date.parse(updatedAt) > QUIZ_SESSION_MAX_AGE_MS) return null

  return {
    sessionId,
    answers: asAnswers(record.answers),
    startedAt,
    updatedAt,
    status: 'in_progress',
    currentKey: typeof record.currentKey === 'string' && record.currentKey !== '' ? record.currentKey : null,
  }
}

export function readStoredQuizSession(storage: StorageLike | null = browserStorage()): QuizSession | null {
  if (!storage) return null
  try {
    return parseQuizSession(storage.getItem(QUIZ_SESSION_KEY))
  } catch {
    return null
  }
}

function writeStoredQuizSession(session: QuizSession, storage: StorageLike | null = browserStorage()): void {
  if (!storage) return
  try {
    storage.setItem(QUIZ_SESSION_KEY, JSON.stringify(session))
  } catch {
    // modo privado/cota cheia: o quiz segue só em memória.
  }
}

export function useQuizPersistence() {
  const [session, setSession] = useState<QuizSession>(() => readStoredQuizSession() ?? createQuizSession())
  const sessionRef = useRef(session)

  // Grava a sessão nova (ou a lida, já normalizada) para o session_id ficar estável.
  useEffect(() => {
    writeStoredQuizSession(sessionRef.current)
  }, [])

  const commit = useCallback((next: QuizSession) => {
    sessionRef.current = next
    writeStoredQuizSession(next)
    setSession(next)
  }, [])

  const updateAnswers = useCallback(
    (questionKey: string, value: string) => {
      const prev = sessionRef.current
      commit({
        ...prev,
        answers: { ...prev.answers, [questionKey]: value },
        status: 'in_progress',
        updatedAt: new Date().toISOString(),
      })
    },
    [commit],
  )

  /** Guarda onde a pessoa está (pergunta ou captura) para a retomada. */
  const setCurrentKey = useCallback(
    (currentKey: string | null) => {
      const prev = sessionRef.current
      if (prev.currentKey === currentKey) return
      commit({ ...prev, currentKey, updatedAt: new Date().toISOString() })
    },
    [commit],
  )

  /** Troca o session_id mantendo as respostas (assessment antigo já vinculado a uma conta). */
  const replaceSessionId = useCallback(
    (sessionId: string) => {
      commit({ ...sessionRef.current, sessionId, updatedAt: new Date().toISOString() })
    },
    [commit],
  )

  /** Sessão nova: session_id novo, sem respostas. */
  const resetSession = useCallback(() => {
    const next = createQuizSession()
    commit(next)
    return next
  }, [commit])

  return { session, updateAnswers, setCurrentKey, replaceSessionId, resetSession }
}
