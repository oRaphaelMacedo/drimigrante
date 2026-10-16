// scripts/lib/test-target-guard.mjs — trava de segurança dos testes (DI-060).
//
// Fonte ÚNICA, para o tooling de testes (Playwright, fixtures, CI e scripts),
// de "o que é produção". Os testes automatizados só podem apontar para:
//   - Supabase e front LOCAIS (localhost, 127.0.0.1, [::1], *.localhost,
//     host.docker.internal, kong);
//   - hosts de staging listados explicitamente em E2E_ALLOWED_REMOTE_HOSTS.
// O projeto Supabase de produção e os domínios de produção são recusados
// SEMPRE, mesmo que estejam nessa lista.
//
// Uso como módulo (playwright.config.ts, e2e/utils/supabase-admin.ts…):
//   import { assertSafeTestTarget } from './scripts/lib/test-target-guard.mjs'
//   assertSafeTestTarget({ supabaseUrl, baseUrl, allowedRemoteHosts })
//
// Uso como CLI (CI): valida o alvo lido do ambiente e do .env.test.local.
//   node scripts/lib/test-target-guard.mjs [--file .env.test.local]
// Sai com código 1 (sem imprimir chaves) se o alvo não for seguro.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Ref do projeto Supabase de PRODUÇÃO (também está no index.html, que é público). */
export const PRODUCTION_SUPABASE_REF = 'krjirhlmdnxqqrpzmowz'

/** Domínios do front de produção (mesmo valor de PRODUCTION_HOSTS em src/lib/runtime-env.ts). */
export const PRODUCTION_APP_HOSTS = Object.freeze(['www.drimigrante.com', 'drimigrante.com'])

/** Supabase local padrão (`supabase start`). */
export const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal', 'kong'])

/** Normaliza a lista de hosts de staging (vírgula ou espaço; sem esquema nem porta). */
export function parseAllowedRemoteHosts(value) {
  if (!value) return []
  return String(value)
    .split(/[\s,]+/)
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => {
      try {
        return host.includes('://') ? new URL(host).hostname : host.replace(/:\d+$/, '')
      } catch {
        return host
      }
    })
}

/** true para hosts que só existem na máquina (ou na rede do Docker). */
export function isLocalHostname(hostname) {
  const host = String(hostname ?? '').toLowerCase()
  return LOCAL_HOSTNAMES.has(host) || host.endsWith('.localhost')
}

function isProductionHostname(hostname) {
  const host = String(hostname ?? '').toLowerCase()
  return host.includes(PRODUCTION_SUPABASE_REF) || PRODUCTION_APP_HOSTS.includes(host)
}

/**
 * Avalia uma URL usada pelos testes.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function assessUrl(label, value, allowedRemoteHosts = []) {
  if (!value) return { ok: true }
  const raw = String(value).trim()
  if (raw.toLowerCase().includes(PRODUCTION_SUPABASE_REF)) {
    return { ok: false, reason: `${label} aponta para o projeto Supabase de PRODUÇÃO.` }
  }
  let url
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: `${label} não é uma URL válida.` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `${label} precisa usar http:// ou https://.` }
  }
  const hostname = url.hostname.toLowerCase()
  if (isProductionHostname(hostname)) {
    return { ok: false, reason: `${label} aponta para PRODUÇÃO (${hostname}).` }
  }
  if (isLocalHostname(hostname)) return { ok: true }
  if (allowedRemoteHosts.includes(hostname)) return { ok: true }
  return {
    ok: false,
    reason:
      `${label} aponta para um host remoto (${hostname}). Os testes só rodam contra o ` +
      'Supabase local; para staging, liste o host em E2E_ALLOWED_REMOTE_HOSTS.',
  }
}

/**
 * Avalia o alvo completo dos testes (Supabase, front e function de login).
 * @param {{ supabaseUrl?: string, baseUrl?: string, loginUrl?: string, allowedRemoteHosts?: string[] | string }} target
 * @returns {{ ok: true } | { ok: false, reasons: string[] }}
 */
export function assessTestTarget(target = {}) {
  const allowed = Array.isArray(target.allowedRemoteHosts)
    ? target.allowedRemoteHosts.map((h) => String(h).toLowerCase())
    : parseAllowedRemoteHosts(target.allowedRemoteHosts)
  const checks = [
    assessUrl('VITE_SUPABASE_URL', target.supabaseUrl, allowed),
    assessUrl('E2E_BASE_URL', target.baseUrl, allowed),
    assessUrl('E2E_LOGIN_URL', target.loginUrl, allowed),
  ]
  const reasons = checks.filter((check) => !check.ok).map((check) => check.reason)
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}

export class UnsafeTestTargetError extends Error {
  constructor(reasons) {
    super(
      'Alvo de teste recusado (DI-060):\n' +
        reasons.map((reason) => `  - ${reason}`).join('\n') +
        '\nVeja "Testes" no README.md.',
    )
    this.name = 'UnsafeTestTargetError'
    this.reasons = reasons
  }
}

/** Lança UnsafeTestTargetError se qualquer URL do alvo não for segura. */
export function assertSafeTestTarget(target = {}) {
  const result = assessTestTarget(target)
  if (!result.ok) throw new UnsafeTestTargetError(result.reasons)
}

/** Lê um arquivo .env simples (KEY=valor), sem expandir variáveis. */
export function readEnvFile(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    else value = value.replace(/(^|\s)#.*$/, '').trim()
    out[match[1]] = value
  }
  return out
}

function runCli(argv) {
  const index = argv.indexOf('--file')
  const envFile = resolve(index >= 0 ? argv[index + 1] : '.env.test.local')
  const fileEnv = readEnvFile(envFile)
  const pick = (key) => process.env[key] || fileEnv[key] || ''
  const supabaseUrl = pick('VITE_SUPABASE_URL') || LOCAL_SUPABASE_URL
  const result = assessTestTarget({
    supabaseUrl,
    baseUrl: pick('E2E_BASE_URL'),
    loginUrl: pick('E2E_LOGIN_URL'),
    allowedRemoteHosts: pick('E2E_ALLOWED_REMOTE_HOSTS'),
  })
  if (!result.ok) {
    console.error(new UnsafeTestTargetError(result.reasons).message)
    process.exit(1)
  }
  console.log(`Alvo de teste seguro: Supabase em ${new URL(supabaseUrl).host} (sem produção).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2))
}
