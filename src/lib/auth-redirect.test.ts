import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildAuthCallbackUrl, getAuthRedirectBase, isLocalDevHostname } from './auth-redirect'

const PROD = { origin: 'https://www.drimigrante.com', hostname: 'www.drimigrante.com' }
const LOCAL = { origin: 'http://localhost:34220', hostname: 'localhost' }
const PREVIEW = {
  origin: 'https://drimigrante-git-feat.vercel.app',
  hostname: 'drimigrante-git-feat.vercel.app',
}

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

  // `undefined` aciona o parâmetro padrão (import.meta.env.VITE_APP_URL, que o
  // .env.local define): "sem env" é string vazia ou env zerada com stubEnv.
  it('sem VITE_APP_URL válida, cai na origem atual', () => {
    expect(getAuthRedirectBase('', PROD)).toBe(PROD.origin)
    expect(getAuthRedirectBase('não é url', PROD)).toBe(PROD.origin)
    expect(getAuthRedirectBase('javascript:alert(1)', PROD)).toBe(PROD.origin)
  })

  describe('lendo VITE_APP_URL do ambiente', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('usa a env quando nenhum valor é passado', () => {
      vi.stubEnv('VITE_APP_URL', 'https://www.drimigrante.com')
      expect(getAuthRedirectBase(undefined, PREVIEW)).toBe('https://www.drimigrante.com')
    })

    it('com a env vazia, cai na origem atual', () => {
      vi.stubEnv('VITE_APP_URL', '')
      expect(getAuthRedirectBase(undefined, PREVIEW)).toBe(PREVIEW.origin)
    })
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
