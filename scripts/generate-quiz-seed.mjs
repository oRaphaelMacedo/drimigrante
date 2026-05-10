// Gera migration SQL a partir de src/data/quiz-questions.ts
// Output: supabase/migrations/20260509000002_seed_quiz_v1.sql
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const tsSource = await readFile(resolve(root, 'src/data/quiz-questions.ts'), 'utf8')

// Extract THEMES via regex (top of file)
const themesMatch = tsSource.match(/export const QUIZ_THEMES = \[([\s\S]*?)\] as const/)
if (!themesMatch) throw new Error('QUIZ_THEMES not found')
const themes = []
for (const line of themesMatch[1].split('\n')) {
  const m = line.match(/code:\s*'([^']+)',\s*name:\s*'([^']+)',\s*color:\s*'([^']+)',\s*icon:\s*'([^']+)'/)
  if (m) themes.push({ code: m[1], name: m[2], color: m[3], icon: m[4] })
}
if (themes.length === 0) throw new Error('No themes parsed')

// To extract questions reliably, dynamically import the .ts via tsx-style transpile is complex.
// Instead: use eval-based approach by copying the QUIZ_QUESTIONS array and converting "as const" patterns.
// The questions file is plain enough — use node --import to register tsx, OR just regex out the relevant pieces.
//
// Simpler: spawn `npx tsx --eval` to print JSON
import { spawnSync } from 'node:child_process'
const out = spawnSync('npx', ['-y', 'tsx', '--eval',
  `import { QUIZ_THEMES, QUIZ_QUESTIONS } from '${resolve(root, 'src/data/quiz-questions.ts')}'; console.log(JSON.stringify({ themes: QUIZ_THEMES, questions: QUIZ_QUESTIONS }))`,
], { encoding: 'utf8' })

if (out.status !== 0) {
  console.error('tsx failed:', out.stderr)
  process.exit(1)
}
const { themes: themesJson, questions } = JSON.parse(out.stdout.trim().split('\n').pop())

// SQL escaping helper
const sql = (v) => {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`
  return `'${String(v).replace(/'/g, "''")}'`
}

const lines = []
lines.push('-- =====================================================')
lines.push('-- 20260509000002 — Seed quiz v1.0 (real questions from src/data/quiz-questions.ts)')
lines.push('-- Replaces the placeholder seed from initial migration.')
lines.push('-- Idempotent: TRUNCATEs form_themes/questions/options before re-seeding.')
lines.push('-- =====================================================')
lines.push('')
lines.push('BEGIN;')
lines.push('')
lines.push('-- Wipe existing seed data (CASCADE drops dependent rows)')
lines.push('TRUNCATE form_question_options, form_questions, form_themes RESTART IDENTITY CASCADE;')
lines.push('')

// Insert themes
lines.push('-- THEMES')
themesJson.forEach((t, i) => {
  lines.push(
    `INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES (${sql(t.code)}, ${sql(t.name)}, ${sql(t.color)}, ${sql(t.icon)}, ${i}, TRUE);`,
  )
})
lines.push('')

// Insert questions
lines.push('-- QUESTIONS')
questions.forEach((q, i) => {
  const displayConditions = q.showIf
    ? { question_key: q.showIf.questionKey, answer_key: q.showIf.answerKey }
    : null
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
questions.forEach((q) => {
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

const outFile = resolve(root, 'supabase/migrations/20260509000002_seed_quiz_v1.sql')
await writeFile(outFile, lines.join('\n'), 'utf8')
console.log(`Wrote ${outFile}`)
console.log(`  ${themesJson.length} themes`)
console.log(`  ${questions.length} questions`)
const optCount = questions.reduce((sum, q) => sum + (q.options?.length ?? 0), 0)
console.log(`  ${optCount} options`)
