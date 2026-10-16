import { describe, expect, it } from 'vitest'
import { hasStoredAuthSession } from './stored-session'

function storage(entries: Record<string, string>) {
  const keys = Object.keys(entries)
  return {
    length: keys.length,
    key: (index: number) => keys[index] ?? null,
    getItem: (key: string) => entries[key] ?? null,
  }
}

describe('hasStoredAuthSession', () => {
  it('reconhece a sessão do supabase-js (sb-<ref>-auth-token)', () => {
    expect(hasStoredAuthSession(storage({ 'sb-krjirhlmdnxqqrpzmowz-auth-token': '{"access_token":"x"}' }))).toBe(true)
  })

  it('ignora o code verifier, outras chaves e valores vazios', () => {
    expect(hasStoredAuthSession(storage({ 'sb-abc-auth-token-code-verifier': 'x' }))).toBe(false)
    expect(hasStoredAuthSession(storage({ dr_imigrante_quiz_result: '{}' }))).toBe(false)
    expect(hasStoredAuthSession(storage({ 'sb-abc-auth-token': 'null' }))).toBe(false)
    expect(hasStoredAuthSession(storage({}))).toBe(false)
  })

  it('storage ausente ou bloqueado: false', () => {
    expect(hasStoredAuthSession(null)).toBe(false)
    expect(
      hasStoredAuthSession({
        get length(): number {
          throw new Error('SecurityError')
        },
        key: () => null,
        getItem: () => null,
      }),
    ).toBe(false)
  })
})
