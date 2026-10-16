// Gera o SQL de seed do quiz a partir de src/data/quiz-questions.ts.
//
// Uso:
//   node scripts/generate-quiz-seed.mjs                 → imprime o SQL no stdout
//   node scripts/generate-quiz-seed.mjs --out <arquivo> → grava o SQL no arquivo
//
// Requer Node ≥ 22.18 (importa os .ts direto, com remoção de tipos nativa).
// Em versões anteriores: node --experimental-strip-types scripts/generate-quiz-seed.mjs
//
// IMPORTANTE: o SQL faz TRUNCATE das tabelas do quiz. Serve para ambientes novos
// (local/staging). NÃO reescreva migrations já aplicadas (ex.:
// 20260509000002_seed_quiz_v1.sql); para corrigir dados de produção, crie uma
// migration nova (ex.: 20261016000200_fix_quiz_display_conditions.sql).
//
// display_conditions usa o mesmo conversor do app (src/lib/quiz-conditions.ts),
// então answer_contains e any/all são preservados.
import { writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

async function importTs(relPath) {
  try {
    return await import(pathToFileURL(resolve(root, relPath)).href)
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      console.error(
        'Este Node não importa .ts. Use Node ≥ 22.18 ou rode com: node --experimental-strip-types scripts/generate-quiz-seed.mjs',
      )
      process.exit(1)
    }
    throw err
  }
}

const { QUIZ_THEMES, QUIZ_QUESTIONS } = await importTs('src/data/quiz-questions.ts')
const { toDisplayConditions, parseDisplayConditions } = await importTs('src/lib/quiz-conditions.ts')

const outIdx = process.argv.indexOf('--out')
const outArg = outIdx !== -1 ? process.argv[outIdx + 1] : null
if (outIdx !== -1 && !outArg) {
  console.error('Informe o arquivo depois de --out.')
  process.exit(1)
}

// SQL escaping helper
const sql = (v) => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  return `'${String(v).replace(/'/g, "''")}'`
}

// Confere as condições antes de gerar: nada de {question_key} sozinho ou {}.
const problems = []
for (const q of QUIZ_QUESTIONS) {
  const dc = toDisplayConditions(q.showIf)
  const parsed = parseDisplayConditions(dc)
  if (q.showIf && parsed.kind !== 'rule') problems.push(`${q.key}: ${parsed.reason ?? parsed.kind}`)
}
if (problems.length) {
  console.error('display_conditions inválidas:\n  ' + problems.join('\n  '))
  process.exit(1)
}

const lines = []
lines.push('-- =====================================================')
lines.push('-- Seed do quiz gerado por scripts/generate-quiz-seed.mjs')
lines.push('-- a partir de src/data/quiz-questions.ts.')
lines.push('-- ATENÇÃO: faz TRUNCATE de form_themes/questions/options antes de semear.')
lines.push('-- =====================================================')
lines.push('')
lines.push('BEGIN;')
lines.push('')
lines.push('-- Wipe existing seed data (CASCADE drops dependent rows)')
lines.push('TRUNCATE form_question_options, form_questions, form_themes RESTART IDENTITY CASCADE;')
lines.push('')

// Insert themes
lines.push('-- THEMES')
QUIZ_THEMES.forEach((t, i) => {
  lines.push(
    `INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES (${sql(t.code)}, ${sql(t.name)}, ${sql(t.color)}, ${sql('')}, ${i}, TRUE);`,
  )
})
lines.push('')

// Insert questions
lines.push('-- QUESTIONS')
QUIZ_QUESTIONS.forEach((q, i) => {
  const displayConditions = toDisplayConditions(q.showIf)
  const validation = {}
  if (typeof q.min === 'number') validation.min = q.min
  if (typeof q.max === 'number') validation.max = q.max
  lines.push(
    `INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)\n` +
    `  SELECT id, ${sql(q.key)}, ${sql(q.text)}, ${sql(q.helpText ?? null)}, ${sql(q.fieldType)}::field_type, ${sql(displayConditions)}, ${sql(validation)}, ${sql(q.placeholder ?? null)}, ${sql(q.isRequired)}, ${i}\n` +
    `  FROM form_themes WHERE code = ${sql(q.themeCode)};`,
  )
})
lines.push('')

// Insert options
lines.push('-- OPTIONS')
QUIZ_QUESTIONS.forEach((q) => {
  if (!q.options) return
  q.options.forEach((opt, i) => {
    lines.push(
      `INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)\n` +
      `  SELECT id, ${sql(opt.key)}, ${sql(opt.label)}, ${sql(opt.score)}, ${sql(opt.isEliminatory ?? false)}, ${i}\n` +
      `  FROM form_questions WHERE question_key = ${sql(q.key)};`,
    )
  })
})
lines.push('')
lines.push('COMMIT;')
lines.push('')

const output = lines.join('\n')
const optCount = QUIZ_QUESTIONS.reduce((sum, q) => sum + (q.options?.length ?? 0), 0)
const summary = `${QUIZ_THEMES.length} temas, ${QUIZ_QUESTIONS.length} perguntas, ${optCount} opções`

if (outArg) {
  const outFile = resolve(process.cwd(), outArg)
  await writeFile(outFile, output, 'utf8')
  console.error(`Gravado em ${outFile} (${summary})`)
} else {
  process.stdout.write(output)
  console.error(`-- ${summary}`)
}
