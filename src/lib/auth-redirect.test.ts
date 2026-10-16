import { describe, expect, it } from 'vitest'
import { buildAuthCallbackUrl, getAuthRedirectBase, isLocalDevHostname } from './auth-redirect'

const PROD = { origin: 'https://www.drimigrante.com', hostname: 'www.drimigrante.com' }
const LOCAL = { origin: 'http://localhost:34220', hostname: 'localhost' }

describe('isLocalDevHostname', () => {
  it('aceita só hosts locais', () => {
    expect(isLocalDevHostname('localhost')).toBe(true)
    expect(isLocalDevHostname('127.0.0.1')).toBe(true)
    expect(isLocalDevHostname('[::1]')).toBe(true)
    expect(isLocalDevHostname('www.drimigrante.com')).toBe(false)
    expect(isLocalDevHostname('localhost.evil.com')).toBe(false)
    expect(isLocalDevHostname('drimigrante-git-feat.vercel.app')).toBe(false)
    expect(isLocalDevHostname(undefined)).toBe(false)
  })
})

describe('getAuthRedirectBase', () => {
  it('em localhost usa a origem atual, mesmo com VITE_APP_URL de outra porta', () => {
    expect(getAuthRedirectBase('http://localhost:5173', LOCAL)).toBe('http://localhost:34220')
  })

  it('fora de localhost usa o domínio canônico de VITE_APP_URL', () => {
    expect(
      getAuthRedirectBase('https://www.drimigrante.com/', {
        origin: 'https://drimigrante.com',
        hostname: 'drimigrante.com',
      }),
    ).toBe('https://www.drimigrante.com')
  })

  it('sem VITE_APP_URL válida, cai na origem atual', () => {
    expect(getAuthRedirectBase(undefined, PROD)).toBe(PROD.origin)
    expect(getAuthRedirectBase('não é url', PROD)).toBe(PROD.origin)
    expect(getAuthRedirectBase('javascript:alert(1)', PROD)).toBe(PROD.origin)
  })
})

describe('buildAuthCallbackUrl', () => {
  const base = 'https://www.drimigrante.com'

  it('sem next (ou next padrão) não adiciona query', () => {
    expect(buildAuthCallbackUrl(undefined, base)).toBe(`${base}/auth/callback`)
    expect(buildAuthCallbackUrl('/dashboard', base)).toBe(`${base}/auth/callback`)
  })

  it('codifica o next interno', () => {
    expect(buildAuthCallbackUrl('/checkout?plan=one_time', base)).toBe(
      `${base}/auth/callback?next=%2Fcheckout%3Fplan%3Done_time`,
    )
  })

  it('descarta next externo', () => {
    expect(buildAuthCallbackUrl('//evil.com', base)).toBe(`${base}/auth/callback`)
    expect(buildAuthCallbackUrl('https://evil.com', base)).toBe(`${base}/auth/callback`)
  })
})
