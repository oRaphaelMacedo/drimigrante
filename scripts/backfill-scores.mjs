// Recalcula score_numeric e score_category de assessment_results com o motor de score
// do servidor (supabase/functions/_shared/quiz-engine.ts) — DI-006.
//
// AÇÃO MANUAL DO DONO. Ninguém da equipe roda isto contra produção.
//
// O que faz: lê os resultados gravados, as respostas dos assessments e as perguntas
// ativas do quiz pelo PostgREST (service role), calcula o score LOCALMENTE com o mesmo
// código do compute-eligibility e, só com --apply, grava as duas colunas de score.
// O que NÃO faz: não chama Edge Functions, OpenAI, Stripe nem Resend; não regenera as
// análises de IA (ia_explanation_*) nem mexe em nenhuma outra coluna.
//
// Uso (Node ≥ 22.18, que importa .ts direto; antes disso, acrescente
// --experimental-strip-types depois de `node`):
//
//   node --env-file=<arquivo com as variáveis> scripts/backfill-scores.mjs           → simulação
//   node --env-file=<arquivo com as variáveis> scripts/backfill-scores.mjs --apply   → grava
//
// Variáveis: SUPABASE_URL (ou VITE_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY.
// A chave nunca é impressa. Com a chave anon o script se recusa a rodar (o RLS
// esconderia linhas e a simulação sairia errada).
//
// Opções:
//   --apply                grava as mudanças (sem isso, só mostra o que mudaria)
//   --yes                  não pede a confirmação interativa do --apply
//   --only <id[,id...]>    limita a estes assessment_id
//   --skip-with-analysis   não mexe em resultados cuja análise de IA já foi gerada
//   --json                 imprime o plano em JSON (sem cores nem tabela)
//
// Ordem recomendada: deploy do compute-eligibility novo → simulação → --apply.
// Passo a passo em docs/operacao/runbook-pagamentos.md (seção "Backfill dos scores").

import { createInterface } from 'node:readline/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE_SIZE = 500
const ID_CHUNK = 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(message) {
  console.error(`backfill-scores: ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const opts = { apply: false, yes: false, only: null, skipWithAnalysis: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--apply') opts.apply = true
    else if (arg === '--yes') opts.yes = true
    else if (arg === '--skip-with-analysis') opts.skipWithAnalysis = true
    else if (arg === '--json') opts.json = true
    else if (arg === '--only') {
      const value = argv[++i]
      if (!value) fail('informe os assessment_id depois de --only.')
      const ids = value.split(',').map((v) => v.trim()).filter(Boolean)
      const invalid = ids.filter((id) => !UUID_RE.test(id))
      if (invalid.length) fail(`id inválido em --only: ${invalid.join(', ')}`)
      opts.only = ids
    } else if (arg === '--help' || arg === '-h') {
      console.log('Uso: node --env-file=<arquivo> scripts/backfill-scores.mjs [--apply] [--yes] [--only <ids>] [--skip-with-analysis] [--json]')
      process.exit(0)
    } else fail(`opção desconhecida: ${arg}`)
  }
  return opts
}

/** Papel de uma chave JWT legada (anon/service_role); null para as chaves novas. */
function jwtRole(key) {
  const parts = key.split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role ?? null
  } catch {
    return null
  }
}

function readEnv() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url) fail('defina SUPABASE_URL (ou VITE_SUPABASE_URL).')
  if (!key) fail('defina SUPABASE_SERVICE_ROLE_KEY (chave service role do projeto).')
  let host
  try {
    host = new URL(url).host
  } catch {
    fail('SUPABASE_URL não é uma URL válida.')
  }
  const role = jwtRole(key)
  if (key.startsWith('sb_publishable_') || (role !== null && role !== 'service_role')) {
    fail('SUPABASE_SERVICE_ROLE_KEY não é uma chave service role (parece a chave anon/publishable).')
  }
  return { url, key, host }
}

async function importTs(relPath) {
  try {
    return await import(pathToFileURL(resolve(ROOT, relPath)).href)
  } catch (err) {
    if (err?.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      fail('este Node não importa .ts. Use Node ≥ 22.18 ou rode com: node --experimental-strip-types scripts/backfill-scores.mjs')
    }
    throw err
  }
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function check(error, what) {
  if (error) fail(`falha ao ${what}: ${error.code ?? ''} ${error.message ?? error}`.trim())
}

async function fetchResults(db, only) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = db
      .from('assessment_results')
      .select('assessment_id, score_numeric, score_category, ia_explanation_short')
      .order('assessment_id')
      .range(from, from + PAGE_SIZE - 1)
    if (only) query = query.in('assessment_id', only)
    const { data, error } = await query
    check(error, 'ler assessment_results')
    for (const row of data ?? []) {
      rows.push({
        assessment_id: row.assessment_id,
        score_numeric: row.score_numeric,
        score_category: row.score_category,
        has_analysis: typeof row.ia_explanation_short === 'string' && row.ia_explanation_short.trim() !== '',
      })
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  return rows
}

async function fetchAnswers(db, ids) {
  const answers = new Map()
  for (const part of chunk(ids, ID_CHUNK)) {
    const { data, error } = await db.from('assessments').select('id, answers').in('id', part)
    check(error, 'ler assessments')
    for (const row of data ?? []) answers.set(row.id, row.answers)
  }
  return answers
}

async function fetchQuestions(db, select) {
  // Mesma consulta do compute-eligibility (hint da FK: sem ela o embed dá PGRST201).
  const { data, error } = await db
    .from('form_questions')
    .select(select)
    .eq('is_active', true)
    .eq('form_question_options.is_active', true)
    .order('sort_order')
  check(error, 'ler form_questions')
  return data ?? []
}

function fmt(score) {
  const n = score.scoreNumeric === null ? '—' : String(score.scoreNumeric)
  return `${n.padStart(3)} ${score.scoreCategory ?? '—'}`
}

function printPlan(plan, toApply, opts) {
  if (opts.json) {
    console.log(JSON.stringify({ ...plan, toApply: toApply.map((c) => c.assessmentId) }, null, 2))
    return
  }
  if (plan.repairedConditions.length) {
    console.log(
      `Aviso: ${plan.repairedConditions.length} pergunta(s) com display_conditions incompleta no banco ` +
        `(${plan.repairedConditions.join(', ')}). Foi usada a regra do código, como no navegador ` +
        '(a migration 20261016000200 corrige os dados).',
    )
  }
  if (plan.usedCodeQuestions) console.log('Aviso: o banco não trouxe perguntas ativas; foram usadas as do código.')
  if (plan.missingAnswers.length) {
    console.log(`Sem assessment correspondente (ignorados): ${plan.missingAnswers.join(', ')}`)
  }
  console.log(`\nResultados lidos: ${plan.changes.length + plan.unchanged + plan.missingAnswers.length}`)
  console.log(`Já corretos: ${plan.unchanged}`)
  console.log(`Com score diferente do motor: ${plan.changes.length}`)
  if (plan.changes.length) {
    console.log('\nassessment_id                          antes        depois')
    for (const c of plan.changes) {
      const note = c.hasAnalysis
        ? opts.skipWithAnalysis
          ? '  [pulado: análise de IA já gerada]'
          : '  [análise de IA gerada com o score antigo; não será regenerada]'
        : ''
      console.log(`${c.assessmentId}   ${fmt(c.before).padEnd(10)} → ${fmt(c.after)}${note}`)
    }
  }
  console.log(`\nA gravar: ${toApply.length}`)
}

async function confirm(host, count) {
  if (!process.stdin.isTTY) fail('--apply sem terminal interativo: use também --yes para confirmar.')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`Gravar ${count} linha(s) em ${host}? Digite APLICAR para confirmar: `)
  rl.close()
  return answer.trim() === 'APLICAR'
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const env = readEnv()
  const { createClient } = await import('@supabase/supabase-js')
  const { planScoreBackfill, QUIZ_SCORING_SELECT } = await importTs('supabase/functions/_shared/quiz-engine.ts')

  const db = createClient(env.url, env.key, { auth: { persistSession: false, autoRefreshToken: false } })

  if (!opts.json) {
    console.log(`Projeto: ${env.host}`)
    console.log(opts.apply ? 'Modo: GRAVAR (--apply)' : 'Modo: simulação (nada é gravado; use --apply para gravar)')
  }

  const results = await fetchResults(db, opts.only)
  const answers = await fetchAnswers(db, results.map((r) => r.assessment_id))
  const questionRows = await fetchQuestions(db, QUIZ_SCORING_SELECT)

  const plan = planScoreBackfill(results, answers, questionRows)
  const toApply = plan.changes.filter((c) => !(opts.skipWithAnalysis && c.hasAnalysis))
  printPlan(plan, toApply, opts)

  if (!opts.apply || toApply.length === 0) return
  if (!opts.yes && !(await confirm(env.host, toApply.length))) {
    console.log('Cancelado: nada foi gravado.')
    return
  }

  let written = 0
  for (const change of toApply) {
    const { error } = await db
      .from('assessment_results')
      .update({ score_numeric: change.after.scoreNumeric, score_category: change.after.scoreCategory })
      .eq('assessment_id', change.assessmentId)
    if (error) {
      console.error(`Gravadas ${written} de ${toApply.length} antes do erro.`)
      check(error, `gravar ${change.assessmentId}`)
    }
    written++
  }
  console.log(`Gravadas: ${written}. Rode de novo sem --apply para conferir (esperado: 0 diferentes).`)
}

await main()
