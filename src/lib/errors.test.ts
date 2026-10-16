import { afterEach, describe, expect, it, vi } from 'vitest'
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { DEFAULT_ERROR_MESSAGE, TimeoutError, isAbortError, toUserError, toUserMessage } from './errors'

function httpError(status: number, body?: unknown): FunctionsHttpError {
  const response = new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
  return new FunctionsHttpError(response)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toUserMessage', () => {
  it('nunca devolve a mensagem técnica original', () => {
    expect(toUserMessage(new Error('Stripe session URL não recebida.'))).toBe(DEFAULT_ERROR_MESSAGE)
    expect(toUserMessage(new Error('Edge Function returned a non-2xx status code'))).toBe(DEFAULT_ERROR_MESSAGE)
    expect(toUserMessage('boom', 'Falhou.')).toBe('Falhou.')
  })

  it('usa o status HTTP da function', () => {
    expect(toUserMessage(httpError(500))).toMatch(/problema do nosso lado/)
    expect(toUserMessage(httpError(409))).toMatch(/já tem acesso ativo/)
    expect(toUserMessage(httpError(429))).toMatch(/Muitas tentativas/)
  })

  it('reconhece timeout e falha de rede', () => {
    const aborted = new FunctionsFetchError(new DOMException('aborted', 'AbortError'))
    expect(toUserMessage(aborted)).toMatch(/demorou para responder/)
    expect(toUserMessage(new FunctionsFetchError(new TypeError('Failed to fetch')))).toMatch(/Não conseguimos falar/)
    expect(toUserMessage(new FunctionsRelayError({}))).toMatch(/Não conseguimos falar/)
  })

  it('avisa quando o aparelho está sem internet', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(toUserMessage(new FunctionsFetchError(new TypeError('Failed to fetch')))).toMatch(/sem internet/)
  })
})

describe('toUserError', () => {
  it('lê o código do servidor no corpo da resposta', async () => {
    const error = await toUserError(httpError(409, { error: 'already_active', message: 'You already...' }))
    expect(error).toMatchObject({ kind: 'http', status: 409, code: 'already_active', retryable: false })
    expect(error.message).toMatch(/já tem acesso ativo/)
  })

  it('permite trocar a mensagem por código', async () => {
    const error = await toUserError(httpError(403, { error: 'assessment_not_found' }), {
      codeMessages: { assessment_not_found: 'Mensagem própria.' },
    })
    expect(error.message).toBe('Mensagem própria.')
  })

  it('ignora corpo inválido e cai no status', async () => {
    const response = new Response('<html>erro</html>', { status: 502 })
    const error = await toUserError(new FunctionsHttpError(response))
    expect(error).toMatchObject({ kind: 'http', status: 502, code: null, retryable: true })
  })

  it('timeout é recuperável', async () => {
    const error = await toUserError(new TimeoutError())
    expect(error).toMatchObject({ kind: 'timeout', retryable: true })
  })
})

describe('isAbortError', () => {
  it('detecta abort direto e dentro do FunctionsFetchError', () => {
    expect(isAbortError(new TimeoutError())).toBe(true)
    expect(isAbortError(new FunctionsFetchError(new DOMException('x', 'AbortError')))).toBe(true)
    expect(isAbortError(new Error('x'))).toBe(false)
  })
})
