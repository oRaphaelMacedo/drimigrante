import { useState, useCallback } from 'react'

export interface QuizSession {
  sessionId: string
  answers: Record<string, string>
  startedAt: string
}

const SESSION_KEY = 'dr_imigrante_quiz_session'

function generateSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function loadSession(): QuizSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as QuizSession
  } catch {
    return null
  }
}

function saveSession(session: QuizSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {}
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {}
}

export function useQuizPersistence() {
  const [session, setSession] = useState<QuizSession>(() => {
    const existing = loadSession()
    if (existing) return existing
    const newSession: QuizSession = {
      sessionId: generateSessionId(),
      answers: {},
      startedAt: new Date().toISOString(),
    }
    saveSession(newSession)
    return newSession
  })

  const updateAnswers = useCallback((questionKey: string, value: string) => {
    setSession(prev => {
      const updated = { ...prev.answers, [questionKey]: value }
      const newSession = { ...prev, answers: updated }
      saveSession(newSession)
      return newSession
    })
  }, [])

  const resetSession = useCallback(() => {
    clearSession()
    const newSession: QuizSession = {
      sessionId: generateSessionId(),
      answers: {},
      startedAt: new Date().toISOString(),
    }
    setSession(newSession)
    saveSession(newSession)
  }, [])

  return { session, updateAnswers, resetSession }
}
