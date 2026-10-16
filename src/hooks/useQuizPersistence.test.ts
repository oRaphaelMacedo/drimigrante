// @vitest-environment jsdom
/**
 * DI-041 — sessão do quiz neste aparelho: formato antigo, descarte após 30 dias
 * ou depois do envio, onde a pessoa parou (currentKey) e sessão nova.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  QUIZ_SESSION_KEY,
  QUIZ_SESSION_MAX_AGE_MS,
  parseQuizSession,
  readStoredQuizSession,
  useQuizPersistence,
} from './useQuizPersistence'

const NOW = Date.parse('2026-10-16T12:00:00.000Z')
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

describe('parseQuizSession', () => {
  it('aceita o formato antigo (só sessionId, answers e startedAt)', () => {
    const raw = JSON.stringify({ sessionId: 's_1700000000000_abc1234', answers: { processo_tipo: 'nacionalidade' }, startedAt: iso(-1000) })
    expect(parseQuizSession(raw, NOW)).toEqual({
      sessionId: 's_1700000000000_abc1234',
      answers: { processo_tipo: 'nacionalidade' },
      startedAt: iso(-1000),
      updatedAt: iso(-1000),
      status: 'in_progress',
      currentKey: null,
    })
  })

  it('guarda onde a pessoa parou', () => {
    const raw = JSON.stringify({
      sessionId: 'b8f1c7f2-0d3c-4a59-9a43-2f0d8b1d6c11',
      answers: {},
      startedAt: iso(-5000),
      updatedAt: iso(-1000),
      status: 'in_progress',
      currentKey: 'a2_documento',
    })
    expect(parseQuizSession(raw, NOW)).toMatchObject({ currentKey: 'a2_documento', updatedAt: iso(-1000) })
  })

  it('descarta sessão parada há mais de 30 dias', () => {
    const base = { sessionId: 's_1700000000000_abc1234', answers: { processo_tipo: 'nacionalidade' }, startedAt: iso(-QUIZ_SESSION_MAX_AGE_MS * 2) }
    expect(parseQuizSession(JSON.stringify({ ...base, updatedAt: iso(-QUIZ_SESSION_MAX_AGE_MS - 1000) }), NOW)).toBeNull()
    expect(parseQuizSession(JSON.stringify({ ...base, updatedAt: iso(-QUIZ_SESSION_MAX_AGE_MS + 60_000) }), NOW)).not.toBeNull()
  })

  it('descarta sessão concluída, JSON inválido e session_id fora do formato do RPC', () => {
    expect(parseQuizSession(JSON.stringify({ sessionId: 's_1700000000000_abc1234', answers: {}, status: 'completed' }), NOW)).toBeNull()
    expect(parseQuizSession('{', NOW)).toBeNull()
    expect(parseQuizSession('null', NOW)).toBeNull()
    expect(parseQuizSession(JSON.stringify({ sessionId: 'curto', answers: {} }), NOW)).toBeNull()
    expect(parseQuizSession(JSON.stringify({ sessionId: 'x'.repeat(65), answers: {} }), NOW)).toBeNull()
  })

  it('ignora respostas que não são texto', () => {
    const raw = JSON.stringify({ sessionId: 's_1700000000000_abc1234', answers: { a: 'sim', b: 3, c: null }, startedAt: iso(0) })
    expect(parseQuizSession(raw, NOW)?.answers).toEqual({ a: 'sim' })
  })
})

describe('useQuizPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('cria e grava uma sessão nova (session_id estável entre recargas)', () => {
    const { result, unmount } = renderHook(() => useQuizPersistence())
    const first = result.current.session.sessionId
    expect(readStoredQuizSession()?.sessionId).toBe(first)
    unmount()
    const again = renderHook(() => useQuizPersistence())
    expect(again.result.current.session.sessionId).toBe(first)
  })

  it('grava respostas e a etapa atual para a retomada', () => {
    const { result } = renderHook(() => useQuizPersistence())
    act(() => result.current.updateAnswers('processo_tipo', 'nacionalidade'))
    act(() => result.current.setCurrentKey('caso_tipo'))
    expect(readStoredQuizSession()).toMatchObject({
      answers: { processo_tipo: 'nacionalidade' },
      currentKey: 'caso_tipo',
      status: 'in_progress',
    })
  })

  it('resetSession gera session_id novo e apaga as respostas', () => {
    const { result } = renderHook(() => useQuizPersistence())
    act(() => result.current.updateAnswers('processo_tipo', 'nacionalidade'))
    const previous = result.current.session.sessionId
    act(() => {
      result.current.resetSession()
    })
    expect(result.current.session.sessionId).not.toBe(previous)
    expect(result.current.session.answers).toEqual({})
    expect(readStoredQuizSession()?.sessionId).toBe(result.current.session.sessionId)
  })

  it('replaceSessionId troca só o session_id (mantém as respostas)', () => {
    const { result } = renderHook(() => useQuizPersistence())
    act(() => result.current.updateAnswers('processo_tipo', 'nacionalidade'))
    act(() => result.current.replaceSessionId('0f4a1d4e-5b8a-4c64-9f1e-1d2f3a4b5c6d'))
    expect(readStoredQuizSession()).toMatchObject({
      sessionId: '0f4a1d4e-5b8a-4c64-9f1e-1d2f3a4b5c6d',
      answers: { processo_tipo: 'nacionalidade' },
    })
  })

  it('sem localStorage (modo privado) o quiz segue em memória', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    try {
      const { result } = renderHook(() => useQuizPersistence())
      act(() => result.current.updateAnswers('processo_tipo', 'visto'))
      expect(result.current.session.answers).toEqual({ processo_tipo: 'visto' })
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original)
    }
  })

  it('lê a chave dr_imigrante_quiz_session', () => {
    expect(QUIZ_SESSION_KEY).toBe('dr_imigrante_quiz_session')
  })
})
