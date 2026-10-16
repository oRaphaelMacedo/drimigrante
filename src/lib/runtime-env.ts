/**
 * Onde o app está rodando — usado para NÃO poluir analytics e Sentry com
 * tráfego de desenvolvimento, previews da Vercel e testes automatizados.
 */

/** Domínios de produção (mesmo valor do og:url do index.html). */
export const PRODUCTION_HOSTS = ['www.drimigrante.com', 'drimigrante.com'] as const

export interface RuntimeEnv {
  hostname: string
  /** localhost, 127.0.0.1, [::1], *.localhost, *.local, *.test */
  isLocalHost: boolean
  /** Deploys de preview da Vercel (*.vercel.app) */
  isPreviewHost: boolean
  isProductionHost: boolean
  /** Playwright, Selenium e afins (navigator.webdriver) */
  isAutomation: boolean
  isDevBuild: boolean
  /** VITE_APP_ENV, quando definida */
  appEnv: string | undefined
}

function readHostname(): string {
  try {
    return typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase()
  } catch {
    return ''
  }
}

export function getRuntimeEnv(): RuntimeEnv {
  const hostname = readHostname()
  const appEnvRaw = import.meta.env.VITE_APP_ENV as string | undefined
  const appEnv = appEnvRaw ? appEnvRaw.trim().toLowerCase() : undefined

  const isLocalHost =
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.test')

  let isAutomation = false
  try {
    isAutomation = typeof navigator !== 'undefined' && navigator.webdriver === true
  } catch {
    isAutomation = false
  }

  return {
    hostname,
    isLocalHost,
    isPreviewHost: hostname.endsWith('.vercel.app'),
    isProductionHost: (PRODUCTION_HOSTS as readonly string[]).includes(hostname),
    isAutomation,
    isDevBuild: import.meta.env.DEV === true,
    appEnv,
  }
}

/**
 * Analytics (PostHog, GA4, Meta) só rodam em produção de verdade:
 *  - nunca em build de dev, localhost, *.vercel.app ou navegador automatizado;
 *  - fora disso, só quando VITE_APP_ENV=production OU o host é o domínio de
 *    produção (proteção contra VITE_APP_ENV ausente/errada na Vercel).
 */
export function isAnalyticsEnvironment(env: RuntimeEnv = getRuntimeEnv()): boolean {
  if (env.isDevBuild || env.isAutomation || env.isLocalHost || env.isPreviewHost) return false
  return env.appEnv === 'production' || env.isProductionHost
}

/**
 * Sentry roda em produção e nos previews (para pegar erro antes do release),
 * mas nunca em dev, localhost ou testes automatizados.
 */
export function isErrorMonitoringEnvironment(env: RuntimeEnv = getRuntimeEnv()): boolean {
  return !(env.isDevBuild || env.isAutomation || env.isLocalHost)
}

/** Nome do ambiente enviado ao Sentry. */
export function getMonitoringEnvironment(env: RuntimeEnv = getRuntimeEnv()): string {
  if (env.isProductionHost) return 'production'
  if (env.appEnv) return env.appEnv
  if (env.isPreviewHost) return 'preview'
  return import.meta.env.MODE
}
