// Testes das correções locais do scripts/supabase-local.mjs. Rodar: npm run test:scripts
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  LOCAL_MIGRATION_FIXES,
  enableE2ELoginInConfig,
  recoverInterruptedPatches,
  withTemporaryPatches,
} from './supabase-local.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fix = LOCAL_MIGRATION_FIXES.find((f) => f.file.endsWith('20260108000000_initial_schema.sql'))

test("correção local inclui 'multiselect' no CREATE TYPE field_type da migration inicial", () => {
  const original = readFileSync(resolve(ROOT, fix.file), 'utf8')
  const patched = fix.apply(original)
  const line = patched.split('\n').find((l) => l.startsWith('CREATE TYPE field_type AS ENUM'))
  assert.ok(line, 'linha do CREATE TYPE encontrada')
  assert.match(line, /'phone', 'multiselect'\);$/)
  // Só essa linha muda.
  assert.equal(patched.split('\n').length, original.split('\n').length)
  assert.equal(
    patched.split('\n').filter((l, i) => l !== original.split('\n')[i]).length,
    original.includes("'phone', 'multiselect');") ? 0 : 1,
  )
})

test('correção local é idempotente (no-op quando a migration já tem o valor)', () => {
  const sql = "CREATE TYPE field_type AS ENUM ('text', 'multiselect');\nSELECT 1;"
  assert.equal(fix.apply(sql), sql)
})

test('enableE2ELoginInConfig liga só a seção [functions.e2e-login]', () => {
  const original = readFileSync(resolve(ROOT, 'supabase/config.toml'), 'utf8')
  const patched = enableE2ELoginInConfig(original)
  const section = (toml) => toml.slice(toml.indexOf('[functions.e2e-login]'))
  assert.match(section(original), /enabled = false/)
  assert.match(section(patched), /enabled = true/)
  // [db.pooler] e [analytics] continuam desligados.
  const before = original.slice(0, original.indexOf('[functions.e2e-login]'))
  assert.equal(patched.slice(0, patched.indexOf('[functions.e2e-login]')), before)
  assert.equal(enableE2ELoginInConfig(patched), patched)
})

/** Árvore temporária com `supabase/config.toml` e a pasta de backups. */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'supabase-local-'))
  mkdirSync(join(root, 'supabase'), { recursive: true })
  const file = 'supabase/config.toml'
  writeFileSync(join(root, file), '[functions.e2e-login]\nenabled = false\n')
  return { root, file, backupDir: join(root, 'supabase/.temp/local-patches') }
}

const enable = { file: 'supabase/config.toml', reason: 'teste', apply: enableE2ELoginInConfig }

test('withTemporaryPatches aplica durante fn, restaura ao fim e apaga o backup', async () => {
  const { root, file, backupDir } = sandbox()
  const code = await withTemporaryPatches(
    [enable],
    async () => {
      assert.match(readFileSync(join(root, file), 'utf8'), /enabled = true/)
      assert.equal(readdirSync(backupDir).length, 1)
      return 0
    },
    { root, backupDir },
  )
  assert.equal(code, 0)
  assert.match(readFileSync(join(root, file), 'utf8'), /enabled = false/)
  assert.deepEqual(readdirSync(backupDir), [])
})

test('withTemporaryPatches restaura mesmo quando fn lança erro', async () => {
  const { root, file, backupDir } = sandbox()
  await assert.rejects(
    withTemporaryPatches(
      [enable],
      async () => {
        throw new Error('falhou')
      },
      { root, backupDir },
    ),
    /falhou/,
  )
  assert.match(readFileSync(join(root, file), 'utf8'), /enabled = false/)
})

test('recoverInterruptedPatches restaura arquivo deixado alterado por processo morto', () => {
  const { root, file, backupDir } = sandbox()
  const original = readFileSync(join(root, file), 'utf8')
  writeFileSync(join(root, file), enableE2ELoginInConfig(original))
  mkdirSync(backupDir, { recursive: true })
  // PID acima do limite padrão do Linux (2^22) e do macOS: nenhum processo vivo.
  writeFileSync(
    join(backupDir, 'supabase__config.toml.json'),
    JSON.stringify({ file, content: original, pid: 4194305 }),
  )
  assert.deepEqual(recoverInterruptedPatches({ root, backupDir }), [file])
  assert.equal(readFileSync(join(root, file), 'utf8'), original)
  assert.equal(existsSync(join(backupDir, 'supabase__config.toml.json')), false)
})

test('recoverInterruptedPatches mantém a alteração de um processo que ainda roda', () => {
  const { root, file, backupDir } = sandbox()
  const original = readFileSync(join(root, file), 'utf8')
  const patched = enableE2ELoginInConfig(original)
  writeFileSync(join(root, file), patched)
  mkdirSync(backupDir, { recursive: true })
  // O processo pai deste teste está vivo (simula o serve em outro terminal).
  writeFileSync(
    join(backupDir, 'supabase__config.toml.json'),
    JSON.stringify({ file, content: original, pid: process.ppid }),
  )
  assert.deepEqual(recoverInterruptedPatches({ root, backupDir }), [])
  assert.equal(readFileSync(join(root, file), 'utf8'), patched)
})
