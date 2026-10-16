/**
 * DI-081 — session_id do quiz: formatos aceitos (iguais aos da RPC) e geração
 * com Web Crypto.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SESSION_ID_PATTERN, createSecureSessionId, isValidSessionId } from './session-id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('isValidSessionId', () => {
  it.each([
    ['UUID', '0f4a1d4e-5b8a-4c64-9f1e-1d2f3a4b5c6d'],
    ['UUID em maiúsculas', '0F4A1D4E-5B8A-4C64-9F1E-1D2F3A4B5C6D'],
    ['legado', 's_1700000000000_abc1234'],
    ['legado com aleatório curto', 's_1700000000000_a'],
    ['lista de espera (UUID)', '8f14e45f-ceea-467e-a5b6-1b2c3d4e5f60-wl'],
    ['lista de espera (legado)', 's_1700000000000_abc1234-wl'],
    ['E2E', 'e2e-session-0001-anon'],
  ])('aceita %s', (_label, value) => {
    expect(isValidSessionId(value)).toBe(true)
  })

  it.each([
    ['curto', 'curto'],
    ['com espaço', 'tem espaço no meio'],
    ['injeção', "x' OR 1=1 --"],
    ['longo demais', `e2e-${'a'.repeat(61)}`],
    ['UUID com sobra', '0f4a1d4e-5b8a-4c64-9f1e-1d2f3a4b5c6dx'],
    ['prefixo desconhecido', 'smoke-anon-test-1760000000'],
    ['sufixo repetido', '8f14e45f-ceea-467e-a5b6-1b2c3d4e5f60-wl-wl'],
    ['vazio', ''],
    ['número', 12345678],
    ['nulo', null],
  ])('recusa %s', (_label, value) => {
    expect(isValidSessionId(value)).toBe(false)
  })
})

describe('createSecureSessionId', () => {
  it('usa crypto.randomUUID quando existe', () => {
    const id = createSecureSessionId({
      randomUUID: () => '11111111-2222-4333-8444-555555555555',
      getRandomValues: () => {
        throw new Error('não deveria ser chamado')
      },
    } as unknown as Crypto)
    expect(id).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('sem randomUUID, monta um UUID v4 com getRandomValues', () => {
    const fake = {
      getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
        const bytes = array as unknown as Uint8Array
        for (let i = 0; i < bytes.length; i++) bytes[i] = 0xff
        return array
      },
    }
    const id = createSecureSessionId(fake as unknown as Crypto)
    expect(id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(id).toMatch(UUID_V4)
    expect(isValidSessionId(id)).toBe(true)
  })

  it('sem Web Crypto, cai no formato legado (ainda aceito pela RPC)', () => {
    const id = createSecureSessionId(null)
    expect(id).toMatch(/^s_\d{13}_[0-9a-z]{0,7}$/)
    expect(isValidSessionId(id)).toBe(true)
  })

  it('no navegador gera UUID v4 diferentes a cada chamada', () => {
    const a = createSecureSessionId()
    const b = createSecureSessionId()
    expect(a).toMatch(UUID_V4)
    expect(b).toMatch(UUID_V4)
    expect(a).not.toBe(b)
  })
})

describe('paridade com a migration', () => {
  it('o padrão é o mesmo de private.is_valid_quiz_session_id', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/20261025000100_anon_rpc_limits.sql', import.meta.url),
      'utf8',
    )
    const match = migration.match(/p_session_id ~\* '([^']+)'/)
    expect(match?.[1]).toBe(SESSION_ID_PATTERN)
  })
})
