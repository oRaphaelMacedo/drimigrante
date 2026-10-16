// quiz-conditions.ts — conversão entre as linhas do banco (form_themes,
// form_questions, form_question_options) e o modelo QuizQuestion do quiz.
//
// Módulo puro (só importa tipos), para ser usado pelo hook useQuizQuestions,
// pelo editor do admin, pelo script scripts/generate-quiz-seed.mjs e pelos
// testes sem depender do cliente Supabase.
//
// Formato de display_conditions no banco (jsonb):
//   { "question_key": "a1_antepassado", "answer_key": "sim" | ["a", "b"] }
//   { "question_key": "caso_tipo", "answer_contains": "A" }        (multiselect)
//   { "any": [ <condição>, ... ] }  |  { "all": [ <condição>, ... ] }

import type {
  FieldType,
  QuizQuestion,
  ShowIfCondition,
  ShowIfRule,
} from '@/data/quiz-questions'

// `type` (e não `interface`) para ser atribuível ao tipo Json do Supabase.
export type DbShowIfCondition = {
  question_key: string
  answer_key?: string | string[]
  answer_contains?: string
}

export type DbDisplayConditions =
  | DbShowIfCondition
  | { any: DbShowIfCondition[] }
  | { all: DbShowIfCondition[] }

export type ParsedDisplayConditions =
  | { kind: 'none' }
  | { kind: 'rule'; rule: ShowIfRule }
  | { kind: 'invalid'; reason: string }

/** Regra que nunca é satisfeita (any vazio). Usada quando não há regra segura. */
export const NEVER_SHOW: ShowIfRule = { any: [] }

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

/**
 * Lê display_conditions vindo do banco. Condições incompletas (ex.: só
 * `{question_key}` ou `{}`) são marcadas como inválidas em vez de virarem
 * "mostrar sempre que o pai tiver resposta".
 */
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

function toDbCondition(c: ShowIfCondition): DbShowIfCondition {
  const out: DbShowIfCondition = { question_key: c.questionKey }
  if (c.answerKey !== undefined) out.answer_key = c.answerKey
  if (c.answerContains !== undefined) out.answer_contains = c.answerContains
  return out
}

/** Converte a regra do código para o formato de display_conditions do banco. */
export function toDisplayConditions(rule: ShowIfRule | null | undefined): DbDisplayConditions | null {
  if (!rule) return null
  if ('any' in rule) return { any: rule.any.map(toDbCondition) }
  if ('all' in rule) return { all: rule.all.map(toDbCondition) }
  return toDbCondition(rule)
}

/** Resumo legível da regra para o admin (ex.: "caso_tipo inclui A"). */
export function describeShowIf(rule: ShowIfRule): string {
  const one = (c: ShowIfCondition) => {
    if (c.answerContains) return `${c.questionKey} inclui ${c.answerContains}`
    if (Array.isArray(c.answerKey)) return `${c.questionKey} ∈ {${c.answerKey.join(', ')}}`
    if (c.answerKey !== undefined) return `${c.questionKey} = ${c.answerKey}`
    return `${c.questionKey} (incompleta)`
  }
  if ('any' in rule) return rule.any.length ? rule.any.map(one).join(' OU ') : 'nunca'
  if ('all' in rule) return rule.all.length ? rule.all.map(one).join(' E ') : 'nunca'
  return one(rule)
}

// ─── Modelo do editor de condições (admin) ───────────────────────────────────
// Cada linha é exatamente uma condição: "igual a" (answer_key, 1+ respostas)
// ou "inclui" (answer_contains, 1 resposta, para múltipla escolha). Mais de uma
// linha vira any/all. A ida e volta regra → linhas → regra não perde dados.

export type ConditionOperator = 'equals' | 'contains'
export type ConditionCombinator = 'any' | 'all'

export interface ConditionRow {
  id: number
  questionKey: string
  operator: ConditionOperator
  answerKeys: string[]
}

let rowSeq = 0
const nextRowId = () => ++rowSeq

export function newConditionRow(): ConditionRow {
  return { id: nextRowId(), questionKey: '', operator: 'equals', answerKeys: [] }
}

function conditionToRow(c: ShowIfCondition): ConditionRow {
  if (c.answerContains) {
    return { id: nextRowId(), questionKey: c.questionKey, operator: 'contains', answerKeys: [c.answerContains] }
  }
  const keys = Array.isArray(c.answerKey) ? [...c.answerKey] : c.answerKey ? [c.answerKey] : []
  return { id: nextRowId(), questionKey: c.questionKey, operator: 'equals', answerKeys: keys }
}

export function ruleToConditionRows(rule?: ShowIfRule): {
  rows: ConditionRow[]
  combinator: ConditionCombinator
} {
  if (!rule) return { rows: [], combinator: 'any' }
  if ('any' in rule) return { rows: rule.any.map(conditionToRow), combinator: 'any' }
  if ('all' in rule) return { rows: rule.all.map(conditionToRow), combinator: 'all' }
  return { rows: [conditionToRow(rule)], combinator: 'any' }
}

function rowToCondition(row: ConditionRow): ShowIfCondition {
  if (row.operator === 'contains') {
    return { questionKey: row.questionKey, answerContains: row.answerKeys[0] }
  }
  return {
    questionKey: row.questionKey,
    answerKey: row.answerKeys.length === 1 ? row.answerKeys[0] : [...row.answerKeys],
  }
}

export function conditionRowsToDisplayConditions(
  rows: ConditionRow[],
  combinator: ConditionCombinator,
): DbDisplayConditions | null {
  if (rows.length === 0) return null
  const conds = rows.map(rowToCondition)
  const rule: ShowIfRule =
    conds.length === 1 ? conds[0] : combinator === 'all' ? { all: conds } : { any: conds }
  return toDisplayConditions(rule)
}

// ─── Linhas do banco → QuizQuestion[] ─────────────────────────────────────────

export interface ThemeRow {
  id: string
  code: string
  name_pt: string
  color: string | null
  icon: string | null
  sort_order: number
}

export interface QuestionRow {
  id: string
  theme_id: string
  question_key: string
  question_text_pt: string
  question_text_en: string | null
  help_text: string | null
  field_type: FieldType
  display_conditions: unknown
  validation_rules: { min?: number; max?: number } | null
  placeholder: string | null
  is_required: boolean
  sort_order: number
}

export interface OptionRow {
  id: string
  question_id: string
  option_key: string
  option_text_pt: string
  option_text_en: string | null
  score: number
  is_eliminatory: boolean
  sort_order: number
}

export interface MapQuizRowsOptions {
  /** Perguntas do código, usadas quando a condição do banco está incompleta. */
  fallbackQuestions?: QuizQuestion[]
  /** Chamado uma vez por pergunta com condição incompleta. */
  onInvalidCondition?: (questionKey: string, reason: string, repairedFromCode: boolean) => void
}

/**
 * Resolve a regra de exibição de uma pergunta do banco. Se a condição estiver
 * incompleta, usa a regra da pergunta de mesma key no código; sem equivalente
 * no código, a pergunta fica oculta (nunca mostrar ramo errado).
 */
export function resolveShowIf(
  questionKey: string,
  rawConditions: unknown,
  { fallbackQuestions = [], onInvalidCondition }: MapQuizRowsOptions = {},
): { showIf?: ShowIfRule; repaired: boolean } {
  const parsed = parseDisplayConditions(rawConditions)
  if (parsed.kind === 'none') return { repaired: false }
  if (parsed.kind === 'rule') return { showIf: parsed.rule, repaired: false }

  const fromCode = fallbackQuestions.find((q) => q.key === questionKey)
  onInvalidCondition?.(questionKey, parsed.reason, !!fromCode)
  if (fromCode) return { showIf: fromCode.showIf, repaired: true }
  return { showIf: NEVER_SHOW, repaired: true }
}

export function mapQuizRows(
  themes: ThemeRow[],
  questions: QuestionRow[],
  options: OptionRow[],
  opts: MapQuizRowsOptions = {},
): QuizQuestion[] {
  const themeById = new Map(themes.map((t) => [t.id, t]))
  const optionsByQ = new Map<string, OptionRow[]>()
  for (const o of options) {
    const list = optionsByQ.get(o.question_id) ?? []
    list.push(o)
    optionsByQ.set(o.question_id, list)
  }

  return questions.map<QuizQuestion>((q) => {
    const theme = themeById.get(q.theme_id)
    const opts2 = optionsByQ.get(q.id) ?? []
    const { showIf, repaired } = resolveShowIf(q.question_key, q.display_conditions, opts)
    return {
      key: q.question_key,
      themeCode: theme?.code ?? 'unknown',
      themeName: theme?.name_pt ?? '—',
      themeColor: theme?.color ?? '#3b62f6',
      themeIcon: theme?.icon ?? undefined,
      text: q.question_text_pt,
      textEn: q.question_text_en ?? undefined,
      helpText: q.help_text ?? undefined,
      fieldType: q.field_type,
      isRequired: q.is_required,
      placeholder: q.placeholder ?? undefined,
      min: q.validation_rules?.min,
      max: q.validation_rules?.max,
      showIf,
      ...(repaired ? { showIfRepaired: true } : {}),
      options: opts2.length
        ? opts2.map((o) => ({
            key: o.option_key,
            label: o.option_text_pt,
            labelEn: o.option_text_en ?? undefined,
            score: o.score,
            isEliminatory: o.is_eliminatory,
          }))
        : undefined,
    }
  })
}
