#!/usr/bin/env node
// scripts/supabase-local.mjs — Supabase LOCAL para desenvolvimento, testes e CI
// (DI-060, DI-084). Nunca fala com o projeto de produção.
//
// Uso (via npm run):
//   supabase:start           supabase start (1ª vez: migrations + supabase/seed.sql).
//                            Argumentos extras vão para o CLI: npm run supabase:start -- -x studio
//   supabase:reset           supabase db reset (recria o banco local: migrations + seed)
//   supabase:stop            supabase stop
//   supabase:env             grava URL e chaves LOCAIS em .env.development.local (dev server)
//                            e .env.test.local (Playwright). Use --target dev|test para só um.
//   supabase:functions:e2e   serve as Edge Functions com a e2e-login ligada e segredos
//                            aleatórios (testes autenticados). Ctrl+C encerra.
//
// Correções temporárias de migration (só na máquina/runner, nunca commitadas):
// a migration 20260509000002_seed_quiz_v1.sql usa o valor 'multiselect' no mesmo
// arquivo em que o adiciona ao enum field_type, o que o CLI recusa (cada arquivo
// roda numa transação). Em `start` e `reset`, o script inclui 'multiselect' no
// CREATE TYPE da migration inicial, roda o CLI e restaura o arquivo original. O
// resultado final do schema é o mesmo de produção. Quando a migration inicial
// for corrigida no repositório, a correção vira no-op.
//
// Toda alteração temporária (a migration acima e a e2e-login ligada no
// supabase/config.toml durante o serve) guarda o original em
// supabase/.temp/local-patches/ antes de gravar. Se o processo morrer sem
// restaurar (kill -9, queda da máquina), o próximo comando deste script
// restaura os arquivos antes de qualquer outra coisa.

import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isLocalHostname, readEnvFile } from './lib/test-target-guard.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_URL = 'http://localhost:33401'
/** Originais dos arquivos alterados temporariamente (supabase/.temp fica fora do versionamento). */
const PATCH_BACKUP_DIR = resolve(ROOT, 'supabase/.temp/local-patches')

/** Correções aplicadas só durante `supabase start` / `supabase db reset`. */
export const LOCAL_MIGRATION_FIXES = [
  {
    file: 'supabase/migrations/20260108000000_initial_schema.sql',
    reason: "enum field_type sem 'multiselect' (usado na 20260509000002 no mesmo arquivo do ADD VALUE)",
    apply(content) {
      return content.replace(
        /^(CREATE TYPE field_type AS ENUM \()([^)]*)(\);)$/m,
        (line, open, values, close) =>
          values.includes("'multiselect'") ? line : `${open}${values}, 'multiselect'${close}`,
      )
    },
  },
]

function fail(message) {
  console.error(`\n[supabase-local] ${message}`)
  process.exit(1)
}

function ensureCli() {
  const probe = spawnSync('supabase', ['--version'], { cwd: ROOT, encoding: 'utf8' })
  if (probe.error || probe.status !== 0) {
    fail(
      'Supabase CLI não encontrado. Instale (https://supabase.com/docs/guides/local-development/cli/getting-started) ' +
        'e deixe o Docker aberto.',
    )
  }
}

/** Backup de um arquivo do repositório (caminho relativo achatado num nome só). */
function backupPathFor(relPath, backupDir) {
  return join(backupDir, `${relPath.replace(/[\\/]/g, '__')}.json`)
}

/** O processo ainda existe? (sinal 0 só testa; EPERM = existe, de outro usuário) */
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

/**
 * Restaura arquivos que ficaram alterados por uma execução interrompida. O
 * backup só existe enquanto a alteração está aplicada; o de um processo que
 * ainda roda (ex.: `supabase:functions:e2e` em outro terminal) é mantido.
 * @returns {string[]} arquivos restaurados (caminhos relativos a `root`)
 */
export function recoverInterruptedPatches({ root = ROOT, backupDir = PATCH_BACKUP_DIR } = {}) {
  if (!existsSync(backupDir)) return []
  const recovered = []
  for (const name of readdirSync(backupDir)) {
    if (!name.endsWith('.json')) continue
    const backup = join(backupDir, name)
    try {
      const { file, content, pid } = JSON.parse(readFileSync(backup, 'utf8'))
      if (pid !== process.pid && isProcessAlive(pid)) continue
      if (typeof file === 'string' && typeof content === 'string') {
        writeFileSync(resolve(root, file), content)
        recovered.push(file)
        console.log(`[supabase-local] ${file} restaurado (uma execução anterior foi interrompida).`)
      }
    } catch {
      // Backup ilegível: não há como restaurar com segurança; só descarta.
    }
    rmSync(backup, { force: true })
  }
  return recovered
}

/**
 * Aplica alterações temporárias, roda `fn` e restaura os originais — no fim
 * normal, com erro, Ctrl+C ou SIGTERM. Retorna o código de saída de `fn`.
 * @param {{ file: string, reason: string, apply: (content: string) => string }[]} patches
 * @param {() => Promise<number>} fn
 */
export async function withTemporaryPatches(patches, fn, { root = ROOT, backupDir = PATCH_BACKUP_DIR } = {}) {
  const applied = []
  const restore = () => {
    while (applied.length > 0) {
      const { path, file, content, backup } = applied.pop()
      writeFileSync(path, content)
      rmSync(backup, { force: true })
      console.log(`[supabase-local] ${file} restaurado ao original.`)
    }
  }
  process.on('exit', restore)
  try {
    for (const patch of patches) {
      const path = resolve(root, patch.file)
      if (!existsSync(path)) continue
      const content = readFileSync(path, 'utf8')
      const patched = patch.apply(content)
      if (patched === content) continue
      // Backup ANTES de gravar: se o processo morrer, o próximo comando restaura.
      const backup = backupPathFor(patch.file, backupDir)
      mkdirSync(backupDir, { recursive: true })
      writeFileSync(backup, JSON.stringify({ file: patch.file, content, pid: process.pid }))
      writeFileSync(path, patched)
      applied.push({ path, file: patch.file, content, backup })
      console.log(`[supabase-local] alteração temporária em ${patch.file} (${patch.reason}) — não commite.`)
    }
    return await fn()
  } finally {
    restore()
    process.off('exit', restore)
  }
}

/** Roda o CLI herdando o terminal; Ctrl+C vai para o CLI e o script espera ele sair. */
function runCli(args, { env } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn('supabase', args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } })
    // Ctrl+C no terminal já chega ao CLI (mesmo grupo de processos); o script
    // só espera ele sair para restaurar os arquivos. SIGTERM é repassado.
    const ignore = () => {}
    const forward = () => child.kill('SIGTERM')
    process.on('SIGINT', ignore)
    process.on('SIGTERM', forward)
    child.on('error', (error) => {
      console.error(`[supabase-local] falha ao executar o CLI: ${error.message}`)
      resolvePromise(1)
    })
    child.on('exit', (code, signal) => {
      process.off('SIGINT', ignore)
      process.off('SIGTERM', forward)
      resolvePromise(code ?? (signal ? 1 : 0))
    })
  })
}

function readStatus() {
  const result = spawnSync('supabase', ['status', '-o', 'json'], { cwd: ROOT, encoding: 'utf8' })
  const start = result.stdout?.indexOf('{') ?? -1
  if (result.status !== 0 || start < 0) {
    fail('Não consegui ler `supabase status`. O stack local está no ar? Rode `npm run supabase:start`.')
  }
  let status
  try {
    status = JSON.parse(result.stdout.slice(start))
  } catch {
    fail('Saída inesperada de `supabase status -o json`.')
  }
  const apiUrl = status.API_URL
  const anonKey = status.ANON_KEY || status.PUBLISHABLE_KEY
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY
  if (!apiUrl || !anonKey || !serviceRoleKey) fail('`supabase status` não trouxe API_URL e as chaves locais.')
  if (!isLocalHostname(new URL(apiUrl).hostname)) {
    fail(`API_URL não é local (${new URL(apiUrl).host}). Este script só grava chaves do Supabase LOCAL.`)
  }
  return { apiUrl: apiUrl.replace(/\/+$/, ''), anonKey, serviceRoleKey }
}

/** Arquivos com chaves precisam estar no .gitignore (ex.: `.env.*.local`). */
function assertIgnored(path) {
  const rel = relative(ROOT, path)
  const check = spawnSync('git', ['check-ignore', '-q', rel], { cwd: ROOT })
  // Sem o binário (error) ou fora de um repositório (128): não há o que commitar.
  if (check.error || check.status === 128) return
  if (check.status !== 0) fail(`${rel} não está no .gitignore — recusando gravar chaves nele.`)
}

/** Atualiza (ou cria) KEY=valor num arquivo .env preservando as outras linhas. */
function upsertEnvFile(path, values, header) {
  assertIgnored(path)
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [header, '']
  const pending = new Map(Object.entries(values))
  const next = lines.map((line) => {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (!match || !pending.has(match[1])) return line
    const value = pending.get(match[1])
    pending.delete(match[1])
    return `${match[1]}=${value}`
  })
  while (next.length > 0 && next[next.length - 1] === '') next.pop()
  for (const [key, value] of pending) next.push(`${key}=${value}`)
  writeFileSync(path, `${next.join('\n')}\n`, { mode: 0o600 })
  console.log(
    `[supabase-local] ${relative(ROOT, path)} atualizado (${Object.keys(values).join(', ')}) — valores não exibidos.`,
  )
}

function writeEnvFiles(target) {
  const { apiUrl, anonKey, serviceRoleKey } = readStatus()
  if (target === 'all' || target === 'dev') {
    upsertEnvFile(
      resolve(ROOT, '.env.development.local'),
      {
        VITE_SUPABASE_URL: apiUrl,
        VITE_SUPABASE_ANON_KEY: anonKey,
        VITE_APP_URL: APP_URL,
        VITE_APP_ENV: 'development',
      },
      '# Gerado por `npm run supabase:env`: dev server apontando para o Supabase LOCAL.',
    )
  }
  if (target === 'all' || target === 'test') {
    upsertEnvFile(
      resolve(ROOT, '.env.test.local'),
      {
        VITE_SUPABASE_URL: apiUrl,
        VITE_SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      },
      '# Gerado por `npm run supabase:env`: Playwright contra o Supabase LOCAL (ver .env.test.example).',
    )
  }
}

const E2E_FUNCTION_SECTION = /(\[functions\.e2e-login\][^[]*?\benabled\s*=\s*)false/

/** Liga a e2e-login no texto do config.toml (sem mexer nas outras seções). */
export function enableE2ELoginInConfig(toml) {
  return toml.replace(E2E_FUNCTION_SECTION, '$1true')
}

async function serveFunctionsForE2E() {
  const testEnvPath = resolve(ROOT, '.env.test.local')
  const current = readEnvFile(testEnvPath)
  const secrets = {
    E2E_LOGIN_SECRET: current.E2E_LOGIN_SECRET || randomBytes(32).toString('hex'),
    INTERNAL_SECRET: current.INTERNAL_SECRET || randomBytes(32).toString('hex'),
  }
  upsertEnvFile(testEnvPath, secrets, '# Gerado por scripts/supabase-local.mjs (ver .env.test.example).')

  // supabase/.temp é ignorado pelo git. Sem chaves da OpenAI, do Stripe e do
  // Resend: as functions respondem erro de configuração e os specs usam mocks.
  const functionsEnvPath = resolve(ROOT, 'supabase/.temp/e2e-functions.env')
  mkdirSync(dirname(functionsEnvPath), { recursive: true })
  writeFileSync(
    functionsEnvPath,
    [
      '# Gerado por scripts/supabase-local.mjs — só local, sem chaves de serviços pagos.',
      'E2E_MODE=true',
      `E2E_LOGIN_SECRET=${secrets.E2E_LOGIN_SECRET}`,
      `INTERNAL_SECRET=${secrets.INTERNAL_SECRET}`,
      `APP_URL=${APP_URL}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  )

  // O CLI não serve function com enabled = false (nem pelo nome). Liga a
  // e2e-login só enquanto o serve roda e restaura o config.toml ao sair.
  const enableE2ELogin = {
    file: 'supabase/config.toml',
    reason: 'e2e-login ligada só enquanto o serve local roda',
    apply: enableE2ELoginInConfig,
  }
  return withTemporaryPatches([enableE2ELogin], () =>
    runCli(['functions', 'serve', '--env-file', relative(ROOT, functionsEnvPath)]),
  )
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  recoverInterruptedPatches()
  switch (command) {
    case 'start':
      ensureCli()
      return withTemporaryPatches(LOCAL_MIGRATION_FIXES, () => runCli(['start', ...rest]))
    case 'reset':
      ensureCli()
      return withTemporaryPatches(LOCAL_MIGRATION_FIXES, () => runCli(['db', 'reset', ...rest]))
    case 'stop':
      ensureCli()
      return runCli(['stop', ...rest])
    case 'env': {
      ensureCli()
      const index = rest.indexOf('--target')
      const target = index >= 0 ? rest[index + 1] : 'all'
      if (!['all', 'dev', 'test'].includes(target)) fail('Use --target dev, test ou all.')
      writeEnvFiles(target)
      return 0
    }
    case 'functions:e2e':
      ensureCli()
      return serveFunctionsForE2E()
    default:
      console.log('Uso: node scripts/supabase-local.mjs <start|reset|stop|env|functions:e2e> [args]')
      return command ? 1 : 0
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then((code) => process.exit(code ?? 0))
}
