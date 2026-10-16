// Gera o SQL do quiz a partir de src/data/quiz-questions.ts (DI-005, DI-089).
//
// Uso (com o tsx local, devDependency do projeto; Node ≥ 22.18 também roda direto):
//   npx tsx scripts/generate-quiz-seed.mjs                    → só imprime o SQL (não grava nada)
//   npx tsx scripts/generate-quiz-seed.mjs --migration [nome] → cria supabase/migrations/<timestamp>_<nome>.sql
//                                                               (nome padrão: quiz_seed)
//   npx tsx scripts/generate-quiz-seed.mjs --out <arquivo>    → grava num arquivo NOVO fora de supabase/migrations
//   --migrations-dir <dir>  troca o diretório de migrations (usado nos testes)
//
// Garantias (scripts/generate-quiz-seed.test.mjs):
// - Nunca sobrescreve arquivo: --out e --migration criam o arquivo com a flag
//   exclusiva 'wx' (o arquivo já existe → erro, nada é gravado).
// - --out não grava dentro de supabase/migrations: migration só por --migration.
// - --migration usa um timestamp depois da migration mais recente e NÃO cria
//   nada quando o quiz do código é igual ao da última migration gerada por este
//   script (hash no cabeçalho). Rodar 2x não altera as migrations.
// - O SQL é NÃO destrutivo (scripts/lib/quiz-seed.mjs): upsert por chave
//   natural, is_active = FALSE para o que saiu do código e snapshot em
//   form_versions antes. Nunca TRUNCATE: assessments referencia form_questions.
// - A migration criada NÃO é aplicada. Migrations já aplicadas (ex.:
//   20260509000002_seed_quiz_v1.sql) nunca são reescritas.
//
// display_conditions usa o mesmo conversor do app (src/lib/quiz-conditions.ts),
// então answer_contains e any/all são preservados.
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  MIGRATION_FILE_RE,
  MIGRATION_SLUG_RE,
  buildQuizSeedSql,
  buildQuizSeedStatements,
  isInsideDir,
  latestGeneratedSeed,
  nextMigrationTimestamp,
  quizSeedHash,
} from './lib/quiz-seed.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

/** Caminho para mensagens: relativo ao diretório atual quando está dentro dele. */
function display(file) {
  const rel = relative(process.cwd(), file)
  return rel && !rel.startsWith('..') ? rel : file
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

// ── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const valueOf = (flag) => {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const value = args[index + 1]
  return value && !value.startsWith('--') ? value : null
}

const outArg = valueOf('--out')
const migrationArg = valueOf('--migration')
const migrationsDirArg = valueOf('--migrations-dir')

if (outArg === null) fail('Informe o arquivo depois de --out.')
if (migrationsDirArg === null) fail('Informe o diretório depois de --migrations-dir.')
if (outArg !== undefined && migrationArg !== undefined) fail('Use --out OU --migration, não os dois.')
const slug = migrationArg ?? 'quiz_seed'
if (migrationArg !== undefined && !MIGRATION_SLUG_RE.test(slug)) {
  fail(`Nome inválido para a migration: "${slug}". Use letras minúsculas, números e _ (ex.: quiz_textos).`)
}

const migrationsDir = resolve(process.cwd(), migrationsDirArg ?? resolve(root, 'supabase/migrations'))

// ── Dados do quiz ────────────────────────────────────────────────────────────
async function importTs(relPath) {
  try {
    return await import(pathToFileURL(resolve(root, relPath)).href)
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      fail('Este Node não importa .ts. Rode com o tsx local: npx tsx scripts/generate-quiz-seed.mjs')
    }
    throw err
  }
}

const { QUIZ_THEMES, QUIZ_QUESTIONS } = await importTs('src/data/quiz-questions.ts')
const { toDisplayConditions, parseDisplayConditions } = await importTs('src/lib/quiz-conditions.ts')

// Confere as condições antes de gerar: nada de {question_key} sozinho ou {}.
const problems = []
for (const q of QUIZ_QUESTIONS) {
  const parsed = parseDisplayConditions(toDisplayConditions(q.showIf))
  if (q.showIf && parsed.kind !== 'rule') problems.push(`${q.key}: ${parsed.reason ?? parsed.kind}`)
}
if (problems.length) fail('display_conditions inválidas:\n  ' + problems.join('\n  '))

const statements = buildQuizSeedStatements({
  themes: QUIZ_THEMES,
  questions: QUIZ_QUESTIONS,
  toDisplayConditions,
})
const hash = quizSeedHash(statements)
const optCount = QUIZ_QUESTIONS.reduce((sum, q) => sum + (q.options?.length ?? 0), 0)
const summary = `${QUIZ_THEMES.length} temas, ${QUIZ_QUESTIONS.length} perguntas, ${optCount} opções`

/** Cria o arquivo só se ele ainda não existir. */
function writeNewFile(file, content) {
  try {
    writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' })
  } catch (err) {
    if (err?.code === 'EEXIST') fail(`${display(file)} já existe; o script nunca sobrescreve arquivos.`)
    throw err
  }
}

/** Caminho real (resolve symlinks) do arquivo ou, se ele não existir, da pasta dele. */
function realTarget(file) {
  try {
    return realpathSync(file)
  } catch {
    try {
      return resolve(realpathSync(dirname(file)), basename(file))
    } catch {
      return file
    }
  }
}

function realDir(dir) {
  try {
    return realpathSync(dir)
  } catch {
    return dir
  }
}

// ── --migration ──────────────────────────────────────────────────────────────
if (migrationArg !== undefined) {
  let names
  try {
    names = readdirSync(migrationsDir).filter((name) => MIGRATION_FILE_RE.test(name))
  } catch {
    fail(`Diretório de migrations não encontrado: ${migrationsDir}`)
  }

  const latest = latestGeneratedSeed(
    names.map((name) => ({ name, content: readFileSync(resolve(migrationsDir, name), 'utf8') })),
  )
  if (latest?.hash === hash) {
    console.error(`Nada mudou desde ${latest.name}: nenhuma migration criada (${summary}).`)
    process.exit(0)
  }

  const name = `${nextMigrationTimestamp(names, new Date())}_${slug}.sql`
  const file = resolve(migrationsDir, name)
  writeNewFile(file, buildQuizSeedSql({ statements, hash, label: name.replace(/\.sql$/, ''), summary }))
  console.error(
    `Criada ${display(file)} (${summary}). Ela NÃO foi aplicada: revise e aplique pelo processo de release.`,
  )
  process.exit(0)
}

// ── --out / stdout ───────────────────────────────────────────────────────────
const output = buildQuizSeedSql({ statements, hash, label: 'Seed do quiz', summary })

if (outArg !== undefined) {
  const outFile = resolve(process.cwd(), outArg)
  if (isInsideDir(realDir(migrationsDir), realTarget(outFile))) {
    fail(`--out não grava em ${display(migrationsDir)}: use --migration [nome].`)
  }
  writeNewFile(outFile, output)
  console.error(`Gravado em ${display(outFile)} (${summary})`)
} else {
  process.stdout.write(output)
  console.error(`-- ${summary}`)
}
