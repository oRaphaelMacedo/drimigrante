// Testes do scripts/generate-quiz-seed.mjs (DI-089). Rodar: npm run test:scripts
//
// Cada teste usa um diretório de migrations temporário (--migrations-dir) com
// cópias falsas: o supabase/migrations do repositório nunca é tocado.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'generate-quiz-seed.mjs')

const EXISTING = {
  '20260509000002_seed_quiz_v1.sql': '-- seed antigo\nTRUNCATE form_question_options, form_questions, form_themes;\n',
  // Mais nova que o relógio: a migration gerada tem de vir depois dela.
  '20991231000000_futura.sql': '-- migration com timestamp no futuro\nSELECT 1;\n',
}

function setup() {
  const cwd = mkdtempSync(join(tmpdir(), 'quiz-seed-'))
  const migrations = join(cwd, 'migrations')
  mkdirSync(migrations)
  for (const [name, content] of Object.entries(EXISTING)) writeFileSync(join(migrations, name), content)
  const run = (...args) => {
    const result = spawnSync(process.execPath, [SCRIPT, '--migrations-dir', migrations, ...args], {
      cwd,
      encoding: 'utf8',
    })
    return { code: result.status, stdout: result.stdout, stderr: result.stderr }
  }
  const snapshot = () =>
    Object.fromEntries(readdirSync(migrations).sort().map((name) => [name, readFileSync(join(migrations, name), 'utf8')]))
  return { cwd, migrations, run, snapshot }
}

test('sem opções: só imprime o SQL (não destrutivo) e não grava nada', () => {
  const { run, snapshot } = setup()
  const before = snapshot()
  const { code, stdout, stderr } = run()
  assert.equal(code, 0, stderr)
  assert.match(stdout, /^BEGIN;$/m)
  assert.match(stdout, /^COMMIT;$/m)
  assert.match(stdout, /ON CONFLICT \(question_key\) DO UPDATE SET/)
  // Os comentários do cabeçalho citam o TRUNCATE só para explicar por que não há.
  const sqlWithoutComments = stdout
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
  assert.doesNotMatch(sqlWithoutComments, /\bTRUNCATE\b|\bDELETE\b/i)
  assert.deepEqual(snapshot(), before)
})

test('--migration 2x: cria UMA migration nova, depois da mais recente, e não altera as existentes', () => {
  const { run, snapshot } = setup()
  const before = snapshot()

  const first = run('--migration')
  assert.equal(first.code, 0, first.stderr)
  const afterFirst = snapshot()
  const created = Object.keys(afterFirst).filter((name) => !(name in before))
  assert.deepEqual(created, ['20991231000001_quiz_seed.sql'])
  for (const [name, content] of Object.entries(before)) assert.equal(afterFirst[name], content, name)
  assert.match(afterFirst[created[0]], /^-- quiz-seed-sha256: [0-9a-f]{64}$/m)
  assert.match(first.stderr, /NÃO foi aplicada/)

  const second = run('--migration')
  assert.equal(second.code, 0, second.stderr)
  assert.match(second.stderr, /Nada mudou/)
  assert.deepEqual(snapshot(), afterFirst)
})

test('--migration com nome próprio; nome inválido é recusado', () => {
  const { run, snapshot } = setup()
  const ok = run('--migration', 'quiz_textos_novos')
  assert.equal(ok.code, 0, ok.stderr)
  assert.ok('20991231000001_quiz_textos_novos.sql' in snapshot())

  const before = snapshot()
  const bad = run('--migration', '../fora')
  assert.equal(bad.code, 1)
  assert.match(bad.stderr, /Nome inválido/)
  assert.deepEqual(snapshot(), before)
})

test('--out dentro do diretório de migrations é recusado (use --migration)', () => {
  const { run, migrations, snapshot } = setup()
  const before = snapshot()
  for (const target of [
    join(migrations, '20260509000002_seed_quiz_v1.sql'),
    join(migrations, '29990101000000_novo.sql'),
    'migrations/./29990101000000_novo.sql',
  ]) {
    const { code, stderr } = run('--out', target)
    assert.equal(code, 1, target)
    assert.match(stderr, /--migration/)
  }
  assert.deepEqual(snapshot(), before)
})

test('--out nunca sobrescreve um arquivo existente; arquivo novo é criado', () => {
  const { run, cwd } = setup()
  const existing = join(cwd, 'seed-local.sql')
  writeFileSync(existing, 'conteúdo do dono\n')
  const refused = run('--out', 'seed-local.sql')
  assert.equal(refused.code, 1)
  assert.match(refused.stderr, /já existe/)
  assert.equal(readFileSync(existing, 'utf8'), 'conteúdo do dono\n')

  const created = run('--out', 'seed-novo.sql')
  assert.equal(created.code, 0, created.stderr)
  assert.ok(existsSync(join(cwd, 'seed-novo.sql')))
  assert.match(readFileSync(join(cwd, 'seed-novo.sql'), 'utf8'), /^COMMIT;$/m)
})

test('--out e --migration juntos, ou --out sem arquivo: erro de uso', () => {
  const { run } = setup()
  assert.equal(run('--out', 'x.sql', '--migration').code, 1)
  assert.equal(run('--out').code, 1)
})
