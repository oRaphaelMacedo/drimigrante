// _shared/quiz-engine.ts — motor de score do quiz no servidor (DI-006).
//
// ESPELHO de src/data/quiz-questions.ts (fonte de verdade do score no front) e de
// src/lib/quiz-conditions.ts (leitura das condições gravadas no banco):
//   · getVisibleQuestions(): uma pergunta só é visível se a condição for satisfeita
//     E a pergunta-pai também estiver visível (DI-067); condição incompleta nunca vale;
//   · computeScore(): só perguntas visíveis, multisseleção não pontua, denominador =
//     soma das melhores opções das perguntas visíveis, bônus do caso E (+55/+70),
//     limiares 60 (alta) e 35 (média);
//   · buildEngineQuestions(): converte as linhas de form_questions/form_question_options
//     como o useQuizQuestions faz no navegador — condição incompleta usa a regra do
//     código para a mesma key (ou esconde a pergunta) e tabela vazia usa as perguntas
//     do código;
//   · planScoreBackfill(): o que o scripts/backfill-scores.mjs corrigiria nos
//     resultados já gravados (cálculo puro, sem escrita).
// Assim o score gravado pelo compute-eligibility é o mesmo que a pessoa viu na tela.
// O teste _shared/quiz-engine.test.ts compara os dois lados (perfis A–F e aleatórios).
// Ao mudar score, opções ou showIf em quiz-questions.ts, atualize este arquivo (e o
// QUESTION_CATALOG de _shared/pathways.ts) no mesmo PR.
//
// Só importa _shared/pathways.ts (módulo puro, sem imports): roda no Deno (Edge
// Functions), no Vitest e no Node (scripts/backfill-scores.mjs).

import { type Answers, normalizeAnswers, QUESTION_CATALOG } from './pathways.ts'

export type FieldType = 'radio' | 'multiselect' | 'select' | 'number' | 'text'

export interface ShowIfCondition {
  questionKey: string
  answerKey?: string | string[]
  answerContains?: string
}

export type ShowIfRule = ShowIfCondition | { any: ShowIfCondition[] } | { all: ShowIfCondition[] }

export interface EngineOption {
  key: string
  score: number
}

export interface EngineQuestion {
  key: string
  fieldType: FieldType
  showIf?: ShowIfRule
  options?: EngineOption[]
}

export type ScoreCategory = 'alta' | 'media' | 'baixa'

export interface EngineScore {
  total: number
  max: number
  percentage: number
  category: ScoreCategory
}

/** Limiares de categoria (iguais aos de computeScore no front). */
export const SCORE_THRESHOLDS = { alta: 60, media: 35 } as const

/** Caso E (perda da nacionalidade): bônus de base somado a total e max. */
export const CASE_E_BONUS = { total: 55, max: 70 } as const

/** Regra que nunca é satisfeita (any vazio), como NEVER_SHOW no front. */
export const NEVER_SHOW: ShowIfRule = { any: [] }

/**
 * Pontos de cada opção, por pergunta — iguais a `score` em QUIZ_QUESTIONS.
 * As chaves, a ordem e o showIf das perguntas vêm do QUESTION_CATALOG (pathways.ts).
 */
export const OPTION_SCORES: Record<string, Record<string, number>> = {
  processo_tipo: { nacionalidade: 0, visto: 0, regularizacao: 0, nao_sei: 0 },
  caso_tipo: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 },
  a1_antepassado: { pai_mae: 40, avo: 30, bisavo: 20, trisavo: 5, nao_sei: 0 },
  a2_documento: { sim: 20, nao: 0 },
  a3_interesse_docs: { sim: 8, nao: 0 },
  a4_lacos: { sim: 15, nao: 0 },
  a5_genealogia: { sim: 5, nao: 0 },
  a6_filiacao: { natural: 0, adotivo: 0 },
  b1_tempo_casamento: { mais_3_anos: 60, menos_3_anos: 15 },
  c1_maior_idade: { sim: 0, nao: 0 },
  c2_mora_portugal: { sim: 5, nao: 0 },
  c3_tempo_portugal: { menos_2: 30, '2_a_4': 50, '5_ou_mais': 75 },
  d1_situacao_legal: { sim: 15, nao: 0 },
  d2_tempo_autorizacao: { menos_5: 25, mais_5: 60 },
  d3_disposto_advogado: { sim: 10, nao: 0 },
  d4_consultou_advogado: { sim: 5, nao: 0 },
  d5_motivo_nao_contratou: { era_caro: 0, sem_firmeza: 0, sozinho: 0, outros: 0 },
  d6_preparado_financeiro: { sim: 10, nao: 0 },
  d7_consultar_agora: { sim: 10, nao: 0 },
  d8_filhos_portugal: { sim: 20, nao: 0 },
  f1_mora_portugal: { sim: 5, nao: 0 },
  f2_quando_mudou: { antes_1974: 65, depois_1974: 20 },
}

/** Perguntas do código (espelho de QUIZ_QUESTIONS), usadas quando o banco não serve. */
export const ENGINE_QUESTIONS: EngineQuestion[] = QUESTION_CATALOG.map((q) => {
  const scores = OPTION_SCORES[q.key] ?? {}
  const question: EngineQuestion = {
    key: q.key,
    fieldType: q.multi ? 'multiselect' : 'radio',
    options: Object.keys(q.options).map((key) => ({ key, score: scores[key] ?? 0 })),
  }
  if (q.showIf) question.showIf = q.showIf
  return question
})

// ─── Visibilidade e score (port de src/data/quiz-questions.ts) ────────────────

function matchesCondition(answers: Answers, cond: ShowIfCondition): boolean {
  const answer = answers[cond.questionKey]
  if (!answer) return false
  if (cond.answerContains) return answer.split(',').includes(cond.answerContains)
  if (cond.answerKey !== undefined) {
    if (Array.isArray(cond.answerKey)) return cond.answerKey.includes(answer)
    return answer === cond.answerKey
  }
  return false
}

/**
 * Perguntas visíveis para estas respostas. Pergunta condicional só aparece se a
 * condição for satisfeita E a pergunta-pai estiver visível; pai inexistente ou ciclo
 * contam como oculto.
 */
export function getVisibleQuestions(
  answers: Answers,
  questions: EngineQuestion[] = ENGINE_QUESTIONS,
): EngineQuestion[] {
  const byKey = new Map(questions.map((q) => [q.key, q]))
  const memo = new Map<string, boolean>()
  const visiting = new Set<string>()

  const isVisible = (key: string): boolean => {
    const cached = memo.get(key)
    if (cached !== undefined) return cached
    const q = byKey.get(key)
    if (!q) return false
    if (!q.showIf) {
      memo.set(key, true)
      return true
    }
    if (visiting.has(key)) return false
    visiting.add(key)

    const holds = (c: ShowIfCondition) => isVisible(c.questionKey) && matchesCondition(answers, c)
    const rule = q.showIf
    const result = 'any' in rule
      ? rule.any.some(holds)
      : 'all' in rule
      ? rule.all.length > 0 && rule.all.every(holds)
      : holds(rule)

    visiting.delete(key)
    memo.set(key, result)
    return result
  }

  return questions.filter((q) => isVisible(q.key))
}

export function scoreCategoryFor(percentage: number): ScoreCategory {
  if (percentage >= SCORE_THRESHOLDS.alta) return 'alta'
  if (percentage >= SCORE_THRESHOLDS.media) return 'media'
  return 'baixa'
}

/** Score igual ao do front: só perguntas visíveis contam (ramos ocultos não pontuam). */
export function computeScore(
  answers: Answers,
  questions: EngineQuestion[] = ENGINE_QUESTIONS,
): EngineScore {
  let total = 0
  let max = 0

  for (const q of getVisibleQuestions(answers, questions)) {
    if (!q.options?.length || q.fieldType === 'multiselect') continue
    max += Math.max(...q.options.map((o) => o.score))
    const answer = answers[q.key]
    if (answer) {
      const opt = q.options.find((o) => o.key === answer)
      if (opt) total += opt.score
    }
  }

  const casos = (answers.caso_tipo || '').split(',').filter(Boolean)
  if (casos.includes('E')) {
    total += CASE_E_BONUS.total
    max += CASE_E_BONUS.max
  }

  const percentage = max > 0 ? Math.round((total / max) * 100) : 0
  return { total, max, percentage, category: scoreCategoryFor(percentage) }
}

// ─── Linhas do banco → EngineQuestion[] (port de src/lib/quiz-conditions.ts) ──

/**
 * Select do PostgREST usado pelo compute-eligibility e pelo backfill. A hint da FK é
 * obrigatória: form_question_options tem 3 FKs para form_questions (question_id,
 * next_question_id, skip_to_question_id) e o embed sem hint devolve PGRST201.
 * Filtros a aplicar junto: is_active=eq.true e form_question_options.is_active=eq.true.
 */
export const QUIZ_SCORING_SELECT =
  'question_key, field_type, display_conditions, sort_order, ' +
  'form_question_options!form_question_options_question_id_fkey(option_key, score, is_active)'

export interface DbScoringOptionRow {
  option_key: string
  score: number | string | null
  is_active?: boolean | null
}

export interface DbScoringQuestionRow {
  question_key: string
  field_type: string
  display_conditions: unknown
  form_question_options?: DbScoringOptionRow[] | null
}

export type ParsedDisplayConditions =
  | { kind: 'none' }
  | { kind: 'rule'; rule: ShowIfRule }
  | { kind: 'invalid'; reason: string }

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function parseCondition(raw: unknown): ShowIfCondition | string {
  if (!isPlainObject(raw)) return 'condição não é um objeto'
  if (!isNonEmptyString(raw.question_key)) return 'question_key ausente'

  const cond: ShowIfCondition = { questionKey: raw.question_key }

  if (raw.answer_contains !== undefined) {
    if (!isNonEmptyString(raw.answer_contains)) return 'answer_contains inválido'
    cond.answerContains = raw.answer_contains
  }

  if (raw.answer_key !== undefined) {
    if (Array.isArray(raw.answer_key)) {
      if (raw.answer_key.length === 0 || !raw.answer_key.every(isNonEmptyString)) {
        return 'answer_key inválido'
      }
      cond.answerKey = raw.answer_key as string[]
    } else if (isNonEmptyString(raw.answer_key)) {
      cond.answerKey = raw.answer_key
    } else {
      return 'answer_key inválido'
    }
  }

  if (cond.answerKey === undefined && cond.answerContains === undefined) {
    return 'sem answer_key nem answer_contains'
  }
  return cond
}

/** Lê display_conditions do banco; condição incompleta vira 'invalid' (nunca "sempre"). */
export function parseDisplayConditions(raw: unknown): ParsedDisplayConditions {
  if (raw === null || raw === undefined) return { kind: 'none' }
  if (!isPlainObject(raw)) return { kind: 'invalid', reason: 'não é um objeto' }

  for (const op of ['any', 'all'] as const) {
    if (op in raw) {
      const list = raw[op]
      if (!Array.isArray(list) || list.length === 0) {
        return { kind: 'invalid', reason: `${op} vazio ou inválido` }
      }
      const conds: ShowIfCondition[] = []
      for (const item of list) {
        const parsed = parseCondition(item)
        if (typeof parsed === 'string') return { kind: 'invalid', reason: `${op}: ${parsed}` }
        conds.push(parsed)
      }
      return { kind: 'rule', rule: op === 'any' ? { any: conds } : { all: conds } }
    }
  }

  if (Object.keys(raw).length === 0) return { kind: 'invalid', reason: 'objeto vazio' }
  const parsed = parseCondition(raw)
  if (typeof parsed === 'string') return { kind: 'invalid', reason: parsed }
  return { kind: 'rule', rule: parsed }
}

export interface BuildEngineQuestionsOptions {
  /** Perguntas do código, usadas para condição incompleta e para banco vazio. */
  fallbackQuestions?: EngineQuestion[]
  /** Chamado para cada pergunta com condição incompleta no banco. */
  onInvalidCondition?: (questionKey: string, reason: string, repairedFromCode: boolean) => void
}

/** Regra de exibição de uma pergunta do banco (condição incompleta → regra do código). */
export function resolveShowIf(
  questionKey: string,
  rawConditions: unknown,
  { fallbackQuestions = ENGINE_QUESTIONS, onInvalidCondition }: BuildEngineQuestionsOptions = {},
): { showIf?: ShowIfRule; repaired: boolean } {
  const parsed = parseDisplayConditions(rawConditions)
  if (parsed.kind === 'none') return { repaired: false }
  if (parsed.kind === 'rule') return { showIf: parsed.rule, repaired: false }

  const fromCode = fallbackQuestions.find((q) => q.key === questionKey)
  onInvalidCondition?.(questionKey, parsed.reason, !!fromCode)
  if (fromCode) return { showIf: fromCode.showIf, repaired: true }
  return { showIf: NEVER_SHOW, repaired: true }
}

function toScore(value: number | string | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

/**
 * Perguntas ativas do banco no formato do motor (como o useQuizQuestions monta no
 * navegador). Sem linhas → perguntas do código, como o front faz com tabela vazia.
 */
export function buildEngineQuestions(
  rows: DbScoringQuestionRow[],
  opts: BuildEngineQuestionsOptions = {},
): EngineQuestion[] {
  const fallbackQuestions = opts.fallbackQuestions ?? ENGINE_QUESTIONS
  if (rows.length === 0) return fallbackQuestions

  return rows.map((row) => {
    const { showIf } = resolveShowIf(row.question_key, row.display_conditions, { ...opts, fallbackQuestions })
    const options = (row.form_question_options ?? [])
      .filter((o) => o.is_active !== false)
      .map((o) => ({ key: o.option_key, score: toScore(o.score) }))
    const question: EngineQuestion = { key: row.question_key, fieldType: row.field_type as FieldType }
    if (showIf) question.showIf = showIf
    if (options.length > 0) question.options = options
    return question
  })
}

export interface AssessmentScore extends EngineScore {
  /** Perguntas cuja condição no banco estava incompleta (usou a regra do código). */
  repairedConditions: string[]
  /** true quando o banco não trouxe perguntas e o motor usou as do código. */
  usedCodeQuestions: boolean
}

/** Score de um assessment: respostas cruas do banco + linhas do quiz (ou o código). */
export function scoreAssessment(rawAnswers: unknown, rows: DbScoringQuestionRow[]): AssessmentScore {
  const repairedConditions: string[] = []
  const questions = buildEngineQuestions(rows, {
    onInvalidCondition: (key) => repairedConditions.push(key),
  })
  return {
    ...computeScore(normalizeAnswers(rawAnswers), questions),
    repairedConditions,
    usedCodeQuestions: rows.length === 0,
  }
}

// ─── Backfill dos scores gravados (scripts/backfill-scores.mjs) ──────────────

/** Linha de assessment_results como o backfill lê (só colunas de score). */
export interface StoredScoreRow {
  assessment_id: string
  score_numeric: number | string | null
  score_category: string | null
  /** true quando a análise de IA já existe (foi gerada com o score antigo). */
  has_analysis?: boolean
}

export interface ScoreBackfillChange {
  assessmentId: string
  before: { scoreNumeric: number | null; scoreCategory: string | null }
  after: { scoreNumeric: number; scoreCategory: ScoreCategory }
  hasAnalysis: boolean
}

export interface ScoreBackfillPlan {
  /** Linhas cujo score ou categoria gravados diferem do motor. */
  changes: ScoreBackfillChange[]
  /** Quantas linhas já estão iguais ao motor. */
  unchanged: number
  /** Resultados sem as respostas do assessment (não são tocados). */
  missingAnswers: string[]
  /** Perguntas com condição incompleta no banco (usou a regra do código). */
  repairedConditions: string[]
  /** true quando o banco não trouxe perguntas e o motor usou as do código. */
  usedCodeQuestions: boolean
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Calcula, sem gravar nada, o que o backfill mudaria: o mesmo score que o
 * compute-eligibility grava hoje, para cada resultado já existente.
 */
export function planScoreBackfill(
  results: StoredScoreRow[],
  answersByAssessment: ReadonlyMap<string, unknown>,
  questionRows: DbScoringQuestionRow[],
): ScoreBackfillPlan {
  const repairedConditions: string[] = []
  const questions = buildEngineQuestions(questionRows, {
    onInvalidCondition: (key) => repairedConditions.push(key),
  })

  const changes: ScoreBackfillChange[] = []
  const missingAnswers: string[] = []
  let unchanged = 0

  for (const row of results) {
    if (!answersByAssessment.has(row.assessment_id)) {
      missingAnswers.push(row.assessment_id)
      continue
    }
    const score = computeScore(normalizeAnswers(answersByAssessment.get(row.assessment_id)), questions)
    const beforeNumeric = toNumberOrNull(row.score_numeric)
    if (beforeNumeric === score.percentage && row.score_category === score.category) {
      unchanged++
      continue
    }
    changes.push({
      assessmentId: row.assessment_id,
      before: { scoreNumeric: beforeNumeric, scoreCategory: row.score_category },
      after: { scoreNumeric: score.percentage, scoreCategory: score.category },
      hasAnalysis: row.has_analysis === true,
    })
  }

  return { changes, unchanged, missingAnswers, repairedConditions, usedCodeQuestions: questionRows.length === 0 }
}
