import { describe, expect, it } from 'vitest'
import type { UserFacingError } from '@/lib/errors'
import {
  CHECKOUT_SESSION_STORAGE_KEY,
  classifyClaim,
  isStripeSessionId,
  maskEmail,
  purchaseOnceKey,
  takeCheckoutSessionId,
} from './success-flow'

function fakeError(partial: Partial<UserFacingError>): UserFacingError {
  return { kind: 'http', status: null, code: null, message: 'x', retryable: true, ...partial }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  }
}

describe('classifyClaim', () => {
  it('token → login automático', () => {
    expect(classifyClaim({ status: 'token', token_hash: 'abc' }, null)).toEqual({ kind: 'token', tokenHash: 'abc' })
  })

  it('email_sent → link enviado', () => {
    expect(classifyClaim({ status: 'email_sent' }, null)).toEqual({ kind: 'email_sent' })
  })

  it('403 payment_not_completed → processando', () => {
    expect(classifyClaim(null, fakeError({ status: 403, code: 'payment_not_completed' }))).toEqual({
      kind: 'processing',
    })
  })

  it('500, 404 e respostas vazias → fallback', () => {
    expect(classifyClaim(null, fakeError({ status: 500, code: 'internal_error' }))).toEqual({
      kind: 'failed',
      reason: 'internal_error',
    })
    expect(classifyClaim(null, fakeError({ status: 404 }))).toEqual({ kind: 'failed', reason: 'http_404' })
    expect(classifyClaim({}, null)).toEqual({ kind: 'failed', reason: 'unexpected_response' })
    expect(classifyClaim(null, null)).toEqual({ kind: 'failed', reason: 'empty_response' })
  })
})

describe('maskEmail', () => {
  it('esconde o início do e-mail e mantém o domínio', () => {
    expect(maskEmail('joao.silva@gmail.com')).toBe('jo•••@gmail.com')
    expect(maskEmail('ab@x.pt')).toBe('a•••@x.pt')
    expect(maskEmail('sem-arroba')).toBeNull()
    expect(maskEmail(null)).toBeNull()
  })
})

describe('session_id', () => {
  it('aceita só o formato do Stripe', () => {
    expect(isStripeSessionId('cs_test_a1B2c3')).toBe(true)
    expect(isStripeSessionId('cs_live_XYZ9')).toBe(true)
    expect(isStripeSessionId('cs_test_mock_e2e')).toBe(false)
    expect(isStripeSessionId('<script>')).toBe(false)
  })

  it('guarda o session_id da URL na sessionStorage e relê depois', () => {
    const storage = memoryStorage()
    expect(takeCheckoutSessionId(new URLSearchParams('session_id=cs_test_abc123'), storage)).toBe('cs_test_abc123')
    expect(storage.data.get(CHECKOUT_SESSION_STORAGE_KEY)).toBe('cs_test_abc123')
    // Recarregou sem o parâmetro (já limpo da URL).
    expect(takeCheckoutSessionId(new URLSearchParams(''), storage)).toBe('cs_test_abc123')
  })

  it('a chave do purchase não contém o session_id', () => {
    const key = purchaseOnceKey('cs_test_abc123')
    expect(key).toMatch(/^cs-[0-9a-f]{8}$/)
    expect(key).not.toContain('abc123')
    expect(purchaseOnceKey('cs_test_abc123')).toBe(key)
    expect(purchaseOnceKey('cs_test_abc124')).not.toBe(key)
  })
})
