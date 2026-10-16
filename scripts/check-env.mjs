#!/usr/bin/env node
// scripts/check-env.mjs — confere as variáveis de ambiente usadas no código com
// os arquivos de exemplo (DI-084). Roda no CI (npm run check-env).
//
// Para cada camada, a lista de chaves LIDAS pelo código precisa bater com a
// lista DOCUMENTADA no exemplo — sem faltar nenhuma e sem chave órfã:
//   front     src/**/*.ts(x)  (import.meta.env.VITE_*)        → .env.example,
//             src/vite-env.d.ts e o schema de src/lib/env.ts
//   functions supabase/functions/** (Deno.env.get / env('X')) → supabase/functions/.env.example
//   e2e       e2e/** e playwright.config.ts (process.env.X)   → .env.test.example
//
// Também falha se um exemplo tiver algo que pareça chave ou ID real (os
// exemplos só levam placeholders e endereços locais) e se os arquivos .env
// reais não estiverem no .gitignore. Nunca imprime valores.
//
// Uso: npm run check-env   (ou node scripts/check-env.mjs [--root <dir>])

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRODUCTION_SUPABASE_REF } from './lib/test-target-guard.mjs'

// --root <dir> permite rodar contra outra árvore (usado nos testes do script).
const rootIndex = process.argv.indexOf('--root')
const ROOT =
  rootIndex >= 0 ? resolve(process.argv[rootIndex + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Injetadas pelo Supabase em toda Edge Function (local e produção). */
const PLATFORM_FUNCTION_KEYS = new Set([
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
])

/** Variáveis do próprio runner (não documentadas no exemplo). */
const RUNNER_KEYS = new Set(['CI'])

/** Formatos de chaves/IDs reais que nunca podem aparecer num exemplo. */
const REAL_VALUE_PATTERNS = [
  /^(sk|rk|pk)_(live|test)_/i,
  /^whsec_/i,
  /^price_[A-Za-z0-9]{6,}/,
  /^prod_[A-Za-z0-9]{6,}/,
  /^re_[A-Za-z0-9]{6,}/,
  /^phc_[A-Za-z0-9]{6,}/,
  /^G-[A-Z0-9]{6,}$/,
  /^eyJ[A-Za-z0-9_-]{10,}/,
  /^sb_(secret|publishable)_/,
  /^sk-[A-Za-z0-9_-]{10,}/,
  /sentry\.io/i,
  /[a-z0-9]{20}\.supabase\.(co|in)/i,
  new RegExp(PRODUCTION_SUPABASE_REF, 'i'),
  /^[A-Za-z0-9+/=_-]{32,}$/,
]

function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, accept, out)
    else if (accept(path)) out.push(path)
  }
  return out
}

function collect(files, patterns) {
  const keys = new Map() // chave → primeiro arquivo onde aparece
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        if (!keys.has(match[1])) keys.set(match[1], relative(ROOT, file))
      }
    }
  }
  return keys
}

/** KEY=valor (sem comentários) de um arquivo de exemplo. */
function readExample(relPath) {
  const path = resolve(ROOT, relPath)
  if (!existsSync(path)) return null
  const entries = new Map()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim())
    if (match) entries.set(match[1], match[2].replace(/(^|\s)#.*$/, '').trim())
  }
  return entries
}

const problems = []
const report = (layer, message) => problems.push(`[${layer}] ${message}`)

function compare(layer, used, declared, declaredLabel, { ignore = new Set() } = {}) {
  for (const [key, file] of used) {
    if (ignore.has(key)) continue
    if (!declared.has(key)) report(layer, `${key} é lida em ${file} mas falta em ${declaredLabel}.`)
  }
  for (const key of declared.keys()) {
    if (!used.has(key)) report(layer, `${key} está em ${declaredLabel} mas o código não usa (órfã).`)
  }
}

function checkPlaceholders(layer, relPath, entries) {
  for (const [key, value] of entries) {
    if (!value) continue
    if (REAL_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      report(layer, `${key} em ${relPath} parece um valor real — exemplos só levam placeholders.`)
    }
  }
}

// ── Front ────────────────────────────────────────────────────────────────────
const srcFiles = walk(resolve(ROOT, 'src'), (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path))
const frontUsed = collect(
  srcFiles.filter((path) => !path.endsWith('vite-env.d.ts')),
  [/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g],
)
const envTsPath = resolve(ROOT, 'src/lib/env.ts')
const envTsKeys = collect([envTsPath], [/\b(VITE_[A-Z0-9_]+)\s*:/g])
for (const [key, file] of envTsKeys) if (!frontUsed.has(key)) frontUsed.set(key, file)

const frontExample = readExample('.env.example')
if (!frontExample) report('front', '.env.example não existe.')
else {
  compare('front', frontUsed, frontExample, '.env.example')
  checkPlaceholders('front', '.env.example', frontExample)
}
const dtsKeys = collect([resolve(ROOT, 'src/vite-env.d.ts')], [/readonly\s+(VITE_[A-Z0-9_]+)\??\s*:/g])
compare('front', frontUsed, dtsKeys, 'src/vite-env.d.ts')
for (const [key, file] of frontUsed) {
  if (!envTsKeys.has(key)) report('front', `${key} é lida em ${file} mas não é validada em src/lib/env.ts.`)
}

// ── Edge Functions ───────────────────────────────────────────────────────────
const functionFiles = walk(
  resolve(ROOT, 'supabase/functions'),
  (path) =>
    path.endsWith('.ts') &&
    !/(_test|\.test)\.ts$/.test(path) &&
    !path.includes(`${join('_shared', 'testing')}`) &&
    !path.endsWith('fakes.ts'),
)
const functionsUsed = collect(functionFiles, [
  /Deno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)/g,
  /\b(?:env|getEnv)\(\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\)/g,
])
const functionsExample = readExample('supabase/functions/.env.example')
if (!functionsExample) report('functions', 'supabase/functions/.env.example não existe.')
else {
  compare('functions', functionsUsed, functionsExample, 'supabase/functions/.env.example', {
    ignore: PLATFORM_FUNCTION_KEYS,
  })
  for (const key of functionsExample.keys()) {
    if (PLATFORM_FUNCTION_KEYS.has(key)) {
      report('functions', `${key} é injetada pelo Supabase — não declare em supabase/functions/.env.example.`)
    }
  }
  checkPlaceholders('functions', 'supabase/functions/.env.example', functionsExample)
}

// ── E2E ──────────────────────────────────────────────────────────────────────
const e2eFiles = [
  ...walk(resolve(ROOT, 'e2e'), (path) => path.endsWith('.ts')),
  resolve(ROOT, 'playwright.config.ts'),
].filter((path) => existsSync(path))
const e2eUsed = collect(e2eFiles, [/process\.env\.([A-Z][A-Z0-9_]*)/g, /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g])
for (const key of RUNNER_KEYS) e2eUsed.delete(key)
const testExample = readExample('.env.test.example')
if (!testExample) report('e2e', '.env.test.example não existe.')
else {
  compare('e2e', e2eUsed, testExample, '.env.test.example')
  checkPlaceholders('e2e', '.env.test.example', testExample)
}

// ── Arquivos reais fora do git ───────────────────────────────────────────────
const MUST_BE_IGNORED = [
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
  'supabase/functions/.env',
]
const ignoredCheck = spawnSync('git', ['check-ignore', '--no-index', ...MUST_BE_IGNORED], {
  cwd: ROOT,
  encoding: 'utf8',
})
if (!ignoredCheck.error && ignoredCheck.status !== 128) {
  const ignored = new Set(ignoredCheck.stdout.split(/\r?\n/).filter(Boolean))
  for (const file of MUST_BE_IGNORED) {
    if (!ignored.has(file)) report('git', `${file} não está no .gitignore (risco de commitar chaves).`)
  }
}

// ── Resultado ────────────────────────────────────────────────────────────────
const counts = `front ${frontUsed.size} · functions ${functionsUsed.size} · e2e ${e2eUsed.size} chaves`
if (problems.length > 0) {
  console.error(`check-env: ${problems.length} problema(s) (${counts})\n`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nAtualize o exemplo correspondente (ou remova a variável órfã). Veja o README.md.')
  process.exit(1)
}
console.log(`check-env: ok (${counts}).`)
