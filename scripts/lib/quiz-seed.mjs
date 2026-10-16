// scripts/lib/quiz-seed.mjs — funções puras do seed do quiz (DI-089), usadas por
// scripts/generate-quiz-seed.mjs e testadas em quiz-seed.test.mjs.
//
// O SQL gerado é NÃO destrutivo: upsert por chave natural e is_active = FALSE
// para o que saiu do código. Nunca TRUNCATE nem DELETE: assessments referencia
// form_questions (current_question_id), então um `TRUNCATE form_questions ...
// CASCADE` apagaria também os diagnósticos e tudo que depende deles.
import { createHash } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'

/** Marca as migrations criadas pelo script (só essas entram na checagem de "nada mudou"). */
export const SEED_MARKER = '-- gerado-por: scripts/generate-quiz-seed.mjs'
const HASH_PREFIX = '-- quiz-seed-sha256: '

/** Nome de migration do Supabase: AAAAMMDDHHMMSS_nome.sql */
export const MIGRATION_FILE_RE = /^(\d{14})_[^/\\]+\.sql$/
/** Parte do nome depois do timestamp (--migration <nome>). */
export const MIGRATION_SLUG_RE = /^[a-z0-9][a-z0-9_]{0,79}$/

/** Literal SQL: NULL, número, booleano, texto ou jsonb (objetos). */
export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Número inválido no seed: ${value}`)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
  return `'${String(value).replace(/'/g, "''")}'`
}

const list = (values) => values.map(sqlLiteral).join(', ')

/**
 * Comandos do seed (sem cabeçalho nem transação), na ordem dos arrays de
 * src/data/quiz-questions.ts. Determinístico: mesma entrada → mesmo texto.
 */
export function buildQuizSeedStatements({ themes, questions, toDisplayConditions }) {
  if (!themes?.length) throw new Error('Quiz sem temas: o seed desativaria todos os temas.')
  if (!questions?.length) throw new Error('Quiz sem perguntas: o seed desativaria todas as perguntas.')

  const lines = []

  lines.push('-- 2. Temas: upsert por code; os que saíram do código ficam inativos.')
  themes.forEach((theme, index) => {
    lines.push(
      `INSERT INTO form_themes (code, name_pt, color, sort_order, is_active)\n` +
        `  VALUES (${list([theme.code, theme.name, theme.color ?? null, index])}, TRUE)\n` +
        `  ON CONFLICT (code) DO UPDATE SET name_pt = EXCLUDED.name_pt, color = EXCLUDED.color,` +
        ` sort_order = EXCLUDED.sort_order, is_active = TRUE, updated_at = NOW();`,
    )
  })
  lines.push(
    `UPDATE form_themes SET is_active = FALSE, updated_at = NOW()\n` +
      `  WHERE is_active AND code NOT IN (${list(themes.map((theme) => theme.code))});`,
  )
  lines.push('')

  lines.push('-- 3. Perguntas: upsert por question_key; as que saíram do código ficam inativas.')
  questions.forEach((question, index) => {
    const validation = {}
    if (typeof question.min === 'number') validation.min = question.min
    if (typeof question.max === 'number') validation.max = question.max
    const values = list([
      question.key,
      question.text,
      question.helpText ?? null,
    ])
    lines.push(
      `INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type,` +
        ` display_conditions, validation_rules, placeholder, is_required, sort_order, is_active)\n` +
        `  SELECT id, ${values}, ${sqlLiteral(question.fieldType)}::field_type,` +
        ` ${sqlLiteral(toDisplayConditions(question.showIf) ?? null)}, ${sqlLiteral(validation)},` +
        ` ${sqlLiteral(question.placeholder ?? null)}, ${sqlLiteral(!!question.isRequired)}, ${index}, TRUE\n` +
        `  FROM form_themes WHERE code = ${sqlLiteral(question.themeCode)}\n` +
        `  ON CONFLICT (question_key) DO UPDATE SET theme_id = EXCLUDED.theme_id,` +
        ` question_text_pt = EXCLUDED.question_text_pt, help_text = EXCLUDED.help_text,` +
        ` field_type = EXCLUDED.field_type, display_conditions = EXCLUDED.display_conditions,` +
        ` validation_rules = EXCLUDED.validation_rules, placeholder = EXCLUDED.placeholder,` +
        ` is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order, is_active = TRUE,` +
        ` updated_at = NOW();`,
    )
  })
  lines.push(
    `UPDATE form_questions SET is_active = FALSE, updated_at = NOW()\n` +
      `  WHERE is_active AND question_key NOT IN (${list(questions.map((question) => question.key))});`,
  )
  lines.push('')

  lines.push('-- 4. Opções: upsert por (question_id, option_key); as que saíram do código ficam inativas.')
  const optionPairs = []
  for (const question of questions) {
    ;(question.options ?? []).forEach((option, index) => {
      optionPairs.push(`(${list([question.key, option.key])})`)
      lines.push(
        `INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory,` +
          ` sort_order, is_active)\n` +
          `  SELECT id, ${list([option.key, option.label, option.score ?? 0, !!option.isEliminatory, index])}, TRUE\n` +
          `  FROM form_questions WHERE question_key = ${sqlLiteral(question.key)}\n` +
          `  ON CONFLICT (question_id, option_key) DO UPDATE SET option_text_pt = EXCLUDED.option_text_pt,` +
          ` score = EXCLUDED.score, is_eliminatory = EXCLUDED.is_eliminatory, sort_order = EXCLUDED.sort_order,` +
          ` is_active = TRUE;`,
      )
    })
  }
  lines.push(
    `UPDATE form_question_options o SET is_active = FALSE\n` +
      `  FROM form_questions q\n` +
      `  WHERE o.question_id = q.id AND o.is_active` +
      (optionPairs.length ? `\n    AND (q.question_key, o.option_key) NOT IN (VALUES ${optionPairs.join(', ')});` : ';'),
  )

  return lines.join('\n')
}

/** sha256 (hex) dos comandos: identifica o conteúdo do quiz, sem o cabeçalho. */
export function quizSeedHash(statements) {
  return createHash('sha256').update(statements, 'utf8').digest('hex')
}

/** Arquivo SQL completo: cabeçalho, snapshot para rollback e comandos numa transação. */
export function buildQuizSeedSql({ statements, hash, label, summary }) {
  return [
    '-- =====================================================',
    `-- ${label} — seed do quiz gerado por scripts/generate-quiz-seed.mjs`,
    `-- a partir de src/data/quiz-questions.ts (${summary}).`,
    '--',
    '-- STATUS: NÃO APLICADA. Revise e aplique só pelo processo de release',
    '-- (docs/operacao/release.md).',
    '--',
    '-- NÃO destrutivo: upsert por chave natural (form_themes.code,',
    '-- form_questions.question_key, form_question_options(question_id, option_key))',
    '-- e is_active = FALSE para o que saiu do código. Nada de TRUNCATE nem DELETE:',
    '-- assessments referencia form_questions, e um TRUNCATE ... CASCADE apagaria',
    '-- os diagnósticos.',
    '-- Sobrescreve edições feitas pelo admin nas perguntas e opções que existem no',
    '-- código. O snapshot do passo 1 permite voltar pelo Histórico do admin.',
    '-- Aplicar de novo deixa o quiz igual (só grava outro snapshot).',
    '-- =====================================================',
    SEED_MARKER,
    `${HASH_PREFIX}${hash}`,
    '',
    'BEGIN;',
    '',
    '-- 1. Snapshot para rollback (mesmo formato de snapshot_quiz_version), só se já houver quiz.',
    'INSERT INTO form_versions (version_number, name, description, schema_snapshot, is_active, published_at, published_by)',
    'SELECT',
    '  COALESCE((SELECT MAX(version_number) FROM form_versions), 0) + 1,',
    `  ${sqlLiteral(`Antes do seed ${label}`.slice(0, 255))},`,
    "  'Snapshot automático antes do seed gerado por scripts/generate-quiz-seed.mjs',",
    '  jsonb_build_object(',
    "    'themes',    COALESCE((SELECT jsonb_agg(t ORDER BY t.sort_order) FROM form_themes t), '[]'::jsonb),",
    "    'questions', COALESCE((SELECT jsonb_agg(q ORDER BY q.sort_order) FROM form_questions q), '[]'::jsonb),",
    "    'options',   COALESCE((SELECT jsonb_agg(o ORDER BY o.question_id, o.sort_order) FROM form_question_options o), '[]'::jsonb)",
    '  ),',
    '  FALSE,',
    '  NOW(),',
    '  NULL',
    'WHERE EXISTS (SELECT 1 FROM form_questions);',
    '',
    statements,
    '',
    'COMMIT;',
    '',
  ].join('\n')
}

/** Hash gravado por buildQuizSeedSql, ou null se o arquivo não foi gerado pelo script. */
export function readSeedHash(content) {
  if (!content.includes(SEED_MARKER)) return null
  const line = content.split(/\r?\n/).find((l) => l.startsWith(HASH_PREFIX))
  const hash = line?.slice(HASH_PREFIX.length).trim()
  return hash && /^[0-9a-f]{64}$/.test(hash) ? hash : null
}

/** A migration gerada pelo script com o maior timestamp: { name, hash } ou null. */
export function latestGeneratedSeed(entries) {
  const sorted = [...entries]
    .filter((entry) => MIGRATION_FILE_RE.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name))
  for (const entry of sorted) {
    const hash = readSeedHash(entry.content)
    if (hash) return { name: entry.name, hash }
  }
  return null
}

const pad = (n, size = 2) => String(n).padStart(size, '0')

/** AAAAMMDDHHMMSS em UTC (formato das migrations do Supabase CLI). */
export function migrationTimestamp(date) {
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  )
}

function parseMigrationTimestamp(ts) {
  const n = (start, end) => Number(ts.slice(start, end))
  return new Date(Date.UTC(n(0, 4), n(4, 6) - 1, n(6, 8), n(8, 10), n(10, 12), n(12, 14)))
}

/**
 * Timestamp da próxima migration: agora, ou 1 segundo depois da mais recente
 * se ela tiver timestamp maior (o repositório tem migrations com data futura, e
 * uma migration "no passado" ficaria fora de ordem no `supabase db push`).
 */
export function nextMigrationTimestamp(existingNames, now) {
  const candidate = migrationTimestamp(now)
  let latest = null
  for (const name of existingNames) {
    const match = MIGRATION_FILE_RE.exec(name)
    if (match && (!latest || match[1] > latest)) latest = match[1]
  }
  if (!latest || candidate > latest) return candidate
  return migrationTimestamp(new Date(parseMigrationTimestamp(latest).getTime() + 1000))
}

/** true se `child` é `parent` ou está dentro dele (caminhos absolutos já resolvidos). */
export function isInsideDir(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}
