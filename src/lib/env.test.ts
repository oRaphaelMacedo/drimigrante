import { describe, expect, it } from 'vitest'
import { EnvValidationError, loadClientEnv, parseClientEnv } from './env'

/** JWT sem assinatura válida, só para o campo `role` (formato das chaves do Supabase). */
function fakeJwt(role: string): string {
  const b64 = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase-demo', role })}.assinatura`
}

const BASE = {
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_ANON_KEY: fakeJwt('anon'),
}

describe('parseClientEnv', () => {
  it('aceita o mínimo obrigatório e deriva a URL das functions', () => {
    const result = parseClientEnv(BASE)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.env.supabaseUrl).toBe('http://127.0.0.1:54321')
    expect(result.env.supabaseFunctionsUrl).toBe('http://127.0.0.1:54321/functions/v1')
    expect(result.env.authEmailCode).toBe(false)
    expect(result.warnings).toEqual([])
  })

  it('remove barra final e espaços; usa VITE_SUPABASE_FUNCTIONS_URL quando definida', () => {
    const result = parseClientEnv({
      VITE_SUPABASE_URL: ' https://exemplo.supabase.co/ ',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_exemplo',
      VITE_SUPABASE_FUNCTIONS_URL: 'https://fn.exemplo.test/functions/v1/',
      VITE_APP_URL: 'http://localhost:33401',
      VITE_APP_ENV: 'Production',
      VITE_AUTH_EMAIL_CODE: 'true',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.env.supabaseUrl).toBe('https://exemplo.supabase.co')
    expect(result.env.supabaseFunctionsUrl).toBe('https://fn.exemplo.test/functions/v1')
    expect(result.env.appEnv).toBe('production')
    expect(result.env.authEmailCode).toBe(true)
  })

  it('falha sem URL ou sem chave anon (string vazia conta como ausente)', () => {
    const result = parseClientEnv({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '   ' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual([
      'VITE_SUPABASE_URL: obrigatória',
      'VITE_SUPABASE_ANON_KEY: obrigatória',
    ])
  })

  it('recusa URL sem http(s)', () => {
    const result = parseClientEnv({ ...BASE, VITE_SUPABASE_URL: 'ftp://exemplo.test' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]).toMatch(/^VITE_SUPABASE_URL: precisa começar com http/)
  })

  it('recusa chave secreta no front (service role JWT ou sb_secret_)', () => {
    for (const key of [fakeJwt('service_role'), 'sb_secret_abc123']) {
      const result = parseClientEnv({ ...BASE, VITE_SUPABASE_ANON_KEY: key })
      expect(result.ok).toBe(false)
      if (result.ok) continue
      expect(result.errors[0]).toMatch(/^VITE_SUPABASE_ANON_KEY: é uma chave SECRETA/)
    }
  })

  it('opcionais inválidas viram aviso e são ignoradas, sem derrubar o app', () => {
    const result = parseClientEnv({
      ...BASE,
      VITE_SENTRY_DSN: 'nao-e-url',
      VITE_GA_MEASUREMENT_ID: 'UA-123',
      VITE_META_PIXEL_ID: 'abc',
      VITE_AUTH_EMAIL_CODE: 'sim',
      VITE_POSTHOG_KEY: 'phc_exemplo',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.env.sentryDsn).toBeUndefined()
    expect(result.env.gaMeasurementId).toBeUndefined()
    expect(result.env.metaPixelId).toBeUndefined()
    expect(result.env.authEmailCode).toBe(false)
    expect(result.env.posthogKey).toBe('phc_exemplo')
    expect(result.warnings).toHaveLength(4)
  })

  it('mensagens nunca incluem os valores das variáveis', () => {
    const secret = fakeJwt('service_role')
    const result = parseClientEnv({
      VITE_SUPABASE_URL: 'segredo-na-url',
      VITE_SUPABASE_ANON_KEY: secret,
      VITE_SENTRY_DSN: 'dsn-secreto',
    })
    const text = JSON.stringify(result)
    expect(text).not.toContain(secret)
    expect(text).not.toContain('segredo-na-url')
    expect(text).not.toContain('dsn-secreto')
  })
})

describe('loadClientEnv', () => {
  it('lança EnvValidationError com orientação de setup', () => {
    expect(() => loadClientEnv({})).toThrow(EnvValidationError)
    expect(() => loadClientEnv({})).toThrow(/README\.md/)
  })

  it('devolve o env válido', () => {
    expect(loadClientEnv(BASE).supabaseAnonKey).toBe(BASE.VITE_SUPABASE_ANON_KEY)
  })
})
