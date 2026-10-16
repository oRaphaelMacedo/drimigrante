// Testes das funções puras do seed do quiz (DI-089). Rodar: npm run test:scripts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildQuizSeedSql,
  buildQuizSeedStatements,
  isInsideDir,
  latestGeneratedSeed,
  migrationTimestamp,
  nextMigrationTimestamp,
  quizSeedHash,
  readSeedHash,
  sqlLiteral,
} from './quiz-seed.mjs'

const THEMES = [
  { code: 'processo', name: 'Tipo de Processo', color: '#3b62f6' },
  { code: 'selecao', name: "Seleção d'Caso", color: '#6366f1' },
]

const QUESTIONS = [
  {
    key: 'processo_tipo',
    themeCode: 'processo',
    fieldType: 'radio',
    text: 'Qual é o seu objetivo principal?',
    isRequired: true,
    options: [
      { key: 'nacionalidade', label: 'Nacionalidade', score: 10 },
      { key: 'visto', label: 'Visto', score: 0, isEliminatory: true },
    ],
  },
  {
    key: 'idade',
    themeCode: 'selecao',
    fieldType: 'number',
    text: 'Quantos anos você tem?',
    helpText: 'Só números.',
    min: 0,
    max: 120,
    isRequired: false,
    showIf: { questionKey: 'processo_tipo', answerKey: 'nacionalidade' },
  },
]

const toDisplayConditions = (rule) =>
  rule ? { question_key: rule.questionKey, answer_key: rule.answerKey } : null

const build = (overrides = {}) =>
  buildQuizSeedStatements({ themes: THEMES, questions: QUESTIONS, toDisplayConditions, ...overrides })

test('sqlLiteral: NULL, números, booleanos, texto com aspas e jsonb', () => {
  assert.equal(sqlLiteral(null), 'NULL')
  assert.equal(sqlLiteral(undefined), 'NULL')
  assert.equal(sqlLiteral(10), '10')
  assert.equal(sqlLiteral(true), 'TRUE')
  assert.equal(sqlLiteral(false), 'FALSE')
  assert.equal(sqlLiteral("d'Ávila"), "'d''Ávila'")
  assert.equal(sqlLiteral({ a: "x'y" }), `'{"a":"x''y"}'::jsonb`)
})

test('statements: upsert por chave natural e desativação, nunca TRUNCATE nem DELETE', () => {
  const sql = build()
  assert.match(sql, /ON CONFLICT \(code\) DO UPDATE SET/)
  assert.match(sql, /ON CONFLICT \(question_key\) DO UPDATE SET/)
  assert.match(sql, /ON CONFLICT \(question_id, option_key\) DO UPDATE SET/)
  assert.match(sql, /UPDATE form_themes SET is_active = FALSE[\s\S]*code NOT IN \('processo', 'selecao'\)/)
  assert.match(sql, /UPDATE form_questions SET is_active = FALSE[\s\S]*question_key NOT IN \('processo_tipo', 'idade'\)/)
  assert.match(sql, /\(q\.question_key, o\.option_key\) NOT IN \(VALUES \('processo_tipo', 'nacionalidade'\), \('processo_tipo', 'visto'\)\)/)
  assert.doesNotMatch(sql, /\bTRUNCATE\b/i)
  assert.doesNotMatch(sql, /\bDELETE\b/i)
  // Escapes, condições, validação e flags.
  assert.match(sql, /'Seleção d''Caso'/)
  assert.match(sql, /'\{"question_key":"processo_tipo","answer_key":"nacionalidade"\}'::jsonb/)
  assert.match(sql, /'\{"min":0,"max":120\}'::jsonb/)
  assert.match(sql, /'number'::field_type/)
  assert.match(sql, /'visto', 'Visto', 0, TRUE, 1, TRUE/)
})

test('statements: determinísticos (mesma entrada → mesmo SQL e mesmo hash)', () => {
  assert.equal(build(), build())
  assert.equal(quizSeedHash(build()), quizSeedHash(build()))
  assert.match(quizSeedHash(build()), /^[0-9a-f]{64}$/)
  const changed = build({ themes: [{ ...THEMES[0], name: 'Outro nome' }, THEMES[1]] })
  assert.notEqual(quizSeedHash(changed), quizSeedHash(build()))
})

test('statements: sem opções, desativa todas as opções ativas', () => {
  const sql = build({ questions: QUESTIONS.map(({ options: _options, ...q }) => q) })
  assert.match(sql, /UPDATE form_question_options o SET is_active = FALSE\s+FROM form_questions q\s+WHERE o\.question_id = q\.id AND o\.is_active;/)
})

test('statements: recusa quiz sem temas ou sem perguntas (desativaria tudo)', () => {
  assert.throws(() => build({ themes: [] }), /sem temas/)
  assert.throws(() => build({ questions: [] }), /sem perguntas/)
})

test('arquivo: cabeçalho com marcador e hash, snapshot antes e transação', () => {
  const statements = build()
  const hash = quizSeedHash(statements)
  const sql = buildQuizSeedSql({ statements, hash, label: '20261031000000_quiz_seed', summary: '2 temas' })
  assert.equal(readSeedHash(sql), hash)
  assert.match(sql, /20261031000000_quiz_seed/)
  const snapshot = sql.indexOf('INSERT INTO form_versions')
  const begin = sql.indexOf('BEGIN;')
  assert.ok(begin !== -1 && snapshot > begin && sql.indexOf('INSERT INTO form_themes') > snapshot)
  assert.match(sql, /WHERE EXISTS \(SELECT 1 FROM form_questions\);/)
  assert.ok(sql.trimEnd().endsWith('COMMIT;'))
})

test('readSeedHash: só reconhece arquivos gerados pelo script', () => {
  assert.equal(readSeedHash('-- quiz-seed-sha256: abc\nSELECT 1;'), null)
  assert.equal(readSeedHash('SELECT 1;'), null)
})

test('migrationTimestamp: AAAAMMDDHHMMSS em UTC', () => {
  assert.equal(migrationTimestamp(new Date('2026-10-16T09:05:07Z')), '20261016090507')
})

test('nextMigrationTimestamp: agora, ou 1s depois da última migration se ela for mais nova', () => {
  const now = new Date('2026-10-16T09:05:07Z')
  assert.equal(nextMigrationTimestamp(['20260108000000_initial_schema.sql'], now), '20261016090507')
  assert.equal(
    nextMigrationTimestamp(['20261030000200_x.sql', '20261025000000_y.sql', 'README.md'], now),
    '20261030000201',
  )
  assert.equal(nextMigrationTimestamp(['20261030235959_x.sql'], now), '20261031000000')
  assert.equal(nextMigrationTimestamp(['20261016090507_mesmo_segundo.sql'], now), '20261016090508')
  assert.equal(nextMigrationTimestamp([], now), '20261016090507')
})

test('latestGeneratedSeed: a migration gerada mais recente, ignorando as escritas à mão', () => {
  const generated = (hash) => `-- gerado-por: scripts/generate-quiz-seed.mjs\n-- quiz-seed-sha256: ${hash}\n`
  const entries = [
    { name: '20260509000002_seed_quiz_v1.sql', content: 'TRUNCATE form_questions;' },
    { name: '20261031000000_quiz_seed.sql', content: generated('a'.repeat(64)) },
    { name: '20261101000000_quiz_seed.sql', content: generated('b'.repeat(64)) },
    { name: '20261102000000_outra_coisa.sql', content: 'SELECT 1;' },
  ]
  assert.deepEqual(latestGeneratedSeed(entries), { name: '20261101000000_quiz_seed.sql', hash: 'b'.repeat(64) })
  assert.equal(latestGeneratedSeed(entries.slice(0, 1)), null)
})

test('isInsideDir: o próprio diretório e subpastas contam; vizinhos com prefixo igual não', () => {
  assert.equal(isInsideDir('/repo/supabase/migrations', '/repo/supabase/migrations/x.sql'), true)
  assert.equal(isInsideDir('/repo/supabase/migrations', '/repo/supabase/migrations'), true)
  assert.equal(isInsideDir('/repo/supabase/migrations', '/repo/supabase/migrations/a/b.sql'), true)
  assert.equal(isInsideDir('/repo/supabase/migrations', '/repo/supabase/migrations-old/x.sql'), false)
  assert.equal(isInsideDir('/repo/supabase/migrations', '/repo/seed.sql'), false)
})
