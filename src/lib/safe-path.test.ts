import { describe, expect, it } from 'vitest'
import { DEFAULT_AFTER_LOGIN_PATH, safeInternalPath, safePathFromLocation } from './safe-path'

describe('safeInternalPath', () => {
  it('aceita caminhos internos e preserva query e hash', () => {
    expect(safeInternalPath('/dashboard')).toBe('/dashboard')
    expect(safeInternalPath('/checkout?plan=one_time')).toBe('/checkout?plan=one_time')
    expect(safeInternalPath('/dashboard?upsell=chat#topo')).toBe('/dashboard?upsell=chat#topo')
    expect(safeInternalPath('/')).toBe('/')
  })

  it('normaliza segmentos relativos sem sair da origem', () => {
    expect(safeInternalPath('/dashboard/../results')).toBe('/results')
    expect(safeInternalPath('/../../etc')).toBe('/etc')
  })

  it.each([
    ['//evil.com', 'URL relativa ao protocolo'],
    ['//evil.com/dashboard', 'URL relativa ao protocolo com caminho'],
    ['/\\evil.com', 'barra invertida tratada como barra'],
    ['/dashboard\\..\\', 'barra invertida no meio'],
    ['https://evil.com', 'URL absoluta'],
    ['http://localhost/dashboard', 'URL absoluta da mesma máquina'],
    ['javascript:alert(1)', 'esquema javascript'],
    ['dashboard', 'sem barra inicial'],
    [' /dashboard', 'espaço antes da barra'],
    ['/\t/evil.com', 'tab que o navegador remove'],
    ['/\n/evil.com', 'quebra de linha que o navegador remove'],
    ['', 'vazio'],
    // A normalização de `.`/`..` recriaria `//evil.com` (relativa ao protocolo).
    ['/.//evil.com', 'ponto seguido de barra dupla'],
    ['/a/..//evil.com', 'ponto-ponto seguido de barra dupla'],
    ['/%2e//evil.com', 'ponto codificado seguido de barra dupla'],
    ['/%2e%2e//evil.com', 'ponto-ponto codificado seguido de barra dupla'],
    ['/a/../..//evil.com', 'subida além da raiz seguida de barra dupla'],
    ['/./\\evil.com', 'ponto seguido de barra invertida'],
    ['/.//\\evil.com', 'ponto seguido de barra dupla e invertida'],
  ])('rejeita %j (%s)', (input: string) => {
    expect(safeInternalPath(input)).toBe(DEFAULT_AFTER_LOGIN_PATH)
  })

  it('rejeita valores que não são string', () => {
    expect(safeInternalPath(null)).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safeInternalPath(undefined)).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safeInternalPath(42)).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safeInternalPath({ pathname: '/x' })).toBe(DEFAULT_AFTER_LOGIN_PATH)
  })

  it('não devolve as rotas de autenticação (evita loop)', () => {
    expect(safeInternalPath('/login')).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safeInternalPath('/login?error=link_expired')).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safeInternalPath('/login/')).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safeInternalPath('/auth/callback?next=/dashboard')).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safeInternalPath('/loginho')).toBe('/loginho')
  })

  it('rejeita caminhos longos demais', () => {
    expect(safeInternalPath(`/${'a'.repeat(3000)}`)).toBe(DEFAULT_AFTER_LOGIN_PATH)
  })

  it('usa o fallback informado', () => {
    expect(safeInternalPath('//evil.com', '/results')).toBe('/results')
  })

  it('nunca devolve URL relativa ao protocolo e é idempotente', () => {
    const inputs = [
      '/dashboard',
      '/checkout?plan=one_time#x',
      '/dashboard/../results',
      '/.//evil.com',
      '/a/..//evil.com',
      '/%2e//evil.com',
      '/./\\evil.com',
      '/.%2f/evil.com',
      '/./%5cevil.com',
      '/%2F%2Fevil.com',
      '//evil.com',
    ]
    for (const input of inputs) {
      const once = safeInternalPath(input)
      expect(once.startsWith('//')).toBe(false)
      expect(once.startsWith('/\\')).toBe(false)
      expect(safeInternalPath(once)).toBe(once)
    }
  })

  it('não decodifica de novo: %2F%2F continua sendo caminho interno', () => {
    expect(safeInternalPath('/%2F%2Fevil.com')).toBe('/%2F%2Fevil.com')
    expect(safeInternalPath('%2F%2Fevil.com')).toBe(DEFAULT_AFTER_LOGIN_PATH)
  })
})

describe('safePathFromLocation', () => {
  it('monta o caminho a partir de um Location do react-router', () => {
    expect(
      safePathFromLocation({ pathname: '/dashboard/chat', search: '?a=1', hash: '#b', state: null }),
    ).toBe('/dashboard/chat?a=1#b')
  })

  it('aceita string e valida igual a safeInternalPath', () => {
    expect(safePathFromLocation('/checkout')).toBe('/checkout')
    expect(safePathFromLocation('//evil.com')).toBe(DEFAULT_AFTER_LOGIN_PATH)
  })

  it('rejeita objetos inválidos', () => {
    expect(safePathFromLocation(null)).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safePathFromLocation({})).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safePathFromLocation({ pathname: '//evil.com' })).toBe(DEFAULT_AFTER_LOGIN_PATH)
    expect(safePathFromLocation({ pathname: '/.//evil.com' })).toBe(DEFAULT_AFTER_LOGIN_PATH)
  })
})
