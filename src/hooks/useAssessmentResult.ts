// useAssessmentResult.ts — resultado do diagnóstico (Supabase + localStorage).
//
// Fontes, nesta ordem:
//  1. Banco: assessment do localStorage (mesmo navegador do quiz) ou, se não
//     houver/não for desta conta, o último assessment vinculado ao usuário
//     (login por link em outro aparelho, onde o localStorage está vazio).
//  2. localStorage `dr_imigrante_quiz_result`, quando o banco falha.
//
// As vias de nacionalidade são RECALCULADAS a partir das respostas do banco
// (suggestVisas), para que outro aparelho mostre exatamente as mesmas vias do
// aparelho original (DI-007). Rótulo da categoria igual ao do /results
// (src/lib/category.ts, DI-029). Colunas sempre explícitas: o cliente não lê
// ia_explanation_full (DI-016); a análise completa vem da RPC
// get_full_analysis (ver fetchFullAnalysis em useAssessment.ts).
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { ASSESSMENT_RESULT_CLIENT_COLUMNS, type AssessmentResultClient } from '@/hooks/useAssessment'
import { QUIZ_RESULT_STORAGE_KEY } from '@/lib/stored-quiz-result'
import { computeScore, pruneAnswers, suggestVisas, type VisaSuggestion } from '@/data/quiz-questions'
import { getCategoryPresentation } from '@/lib/category'
import type { Json } from '@/lib/database.types'

export type PathwayMatch = VisaSuggestion['match']

export interface ResultPathway {
  code: string
  name: string
  match: PathwayMatch
  reason?: string
}

/** Via no formato antigo do localStorage (`match` livre). Mantido por compatibilidade. */
export interface LegacyVisa {
  code: string
  name: string
  match: string
  reason?: string
}

/** De onde vieram as vias exibidas. */
export type PathwaysSource = 'answers' | 'local' | 'none'

/**
 * Resultado do diagnóstico como as telas consomem.
 *
 * Os campos novos são opcionais neste tipo para não quebrar quem monta o
 * objeto à mão (mocks de outras telas); o hook sempre devolve
 * `ResolvedAssessmentResult`, com todos eles preenchidos.
 */
export interface AssessmentResult {
  assessmentId: string
  scoreNumeric: number
  scoreCategory: string
  scoreLabel: string
  scorePercentage: number
  suggestedVisaTypes: Array<{ visa_type_name: string; eligible: boolean; visa_type_code: string }>
  iaExplanationShort: string | null
  /**
   * @deprecated Sempre `null`: o cliente não lê mais a análise completa pela
   * tabela (DI-016). Para saber se ela já foi gerada use `analysisReady`; para
   * o texto, a RPC `get_full_analysis` (fetchFullAnalysis em useAssessment.ts).
   */
  iaExplanationFull?: string | null
  leadName: string | null
  leadEmail: string | null
  completedAt: string | null
  /**
   * @deprecated use `pathways`. Agora traz as mesmas vias de `pathways`
   * (recalculadas das respostas), não só as do localStorage.
   */
  localVisas: LegacyVisa[]
  /** Respostas do quiz (do banco ou deste navegador). */
  answers?: Record<string, string> | null
  /** Vias de nacionalidade (recalculadas das respostas quando possível). */
  pathways?: ResultPathway[]
  pathwaysSource?: PathwaysSource
  /**
   * A análise completa já foi gerada. O generate-explanation grava o resumo e
   * a análise completa juntos, então o resumo (legível pelo cliente) indica
   * que a completa existe sem expor o texto pago.
   */
  analysisReady?: boolean
}

/** O que o hook devolve: todos os campos novos preenchidos. */
export interface ResolvedAssessmentResult extends AssessmentResult {
  iaExplanationFull: null
  localVisas: ResultPathway[]
  answers: Record<string, string> | null
  pathways: ResultPathway[]
  pathwaysSource: PathwaysSource
  analysisReady: boolean
}

interface LocalData {
  assessmentId: string | null
  score: { percentage: number; category: string } | null
  visas: ResultPathway[]
  answers: Record<string, string> | null
  leadInfo: { fullName: string | null; email: string | null } | null
  completedAt: string | null
}

const EMPTY_LOCAL: LocalData = {
  assessmentId: null,
  score: null,
  visas: [],
  answers: null,
  leadInfo: null,
  completedAt: null,
}

const MATCHES: readonly PathwayMatch[] = ['strong', 'possible', 'weak']

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** Normaliza as respostas (Json do banco ou do localStorage) para Record<string, string>. */
export function normalizeAnswers(raw: Json | unknown): Record<string, string> | null {
  if (!isRecord(raw)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value)
    else if (Array.isArray(value)) out[key] = value.filter((v) => typeof v === 'string').join(',')
  }
  return Object.keys(out).length > 0 ? out : null
}

function normalizeVisas(raw: unknown): ResultPathway[] {
  if (!Array.isArray(raw)) return []
  const out: ResultPathway[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    if (typeof item.code !== 'string' || typeof item.name !== 'string') continue
    const match = MATCHES.includes(item.match as PathwayMatch) ? (item.match as PathwayMatch) : 'weak'
    out.push({ code: item.code, name: item.name, match, reason: asString(item.reason) ?? undefined })
  }
  return out
}

function normalizeLocalScore(raw: unknown): LocalData['score'] {
  if (!isRecord(raw)) return null
  const percentage = typeof raw.percentage === 'number' && Number.isFinite(raw.percentage) ? raw.percentage : null
  const category = asString(raw.category)
  return percentage !== null && category ? { percentage, category } : null
}

/** Lê o resultado do quiz deste navegador (nunca lança). */
export function parseLocalQuizResult(raw: string | null | undefined): LocalData {
  if (!raw) return EMPTY_LOCAL
  try {
    const p: unknown = JSON.parse(raw)
    if (!isRecord(p)) return EMPTY_LOCAL
    const lead = isRecord(p.leadInfo) ? p.leadInfo : null
    return {
      assessmentId: asString(p.assessmentId),
      score: normalizeLocalScore(p.score),
      visas: normalizeVisas(p.visas),
      answers: normalizeAnswers(p.answers),
      leadInfo: lead ? { fullName: asString(lead.fullName), email: asString(lead.email) } : null,
      completedAt: asString(p.completedAt),
    }
  } catch {
    return EMPTY_LOCAL
  }
}

function getLocalData(): LocalData {
  try {
    return parseLocalQuizResult(localStorage.getItem(QUIZ_RESULT_STORAGE_KEY))
  } catch {
    return EMPTY_LOCAL
  }
}

/**
 * Rótulo da categoria, o mesmo do /results (CATEGORY_PRESENTATION, DI-029).
 * Categoria desconhecida usa a apresentação neutra de "baixa" (nunca o código cru).
 */
export function categoryLabel(category: string): string {
  return getCategoryPresentation(category).label
}

/** Vias a partir das respostas (sem ramos ocultos), no formato da tela. */
export function pathwaysFromAnswers(answers: Record<string, string> | null): ResultPathway[] {
  if (!answers) return []
  return suggestVisas(pruneAnswers(answers)).map(({ code, name, match, reason }) => ({ code, name, match, reason }))
}

interface ScoreParts {
  dbScore: number | string | null | undefined
  dbCategory: string | null | undefined
  answers: Record<string, string> | null
  /** Score salvo neste navegador para o MESMO assessment. */
  local: LocalData['score']
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Score exibido (DI-007):
 *  1. o do banco, quando é positivo;
 *  2. o deste navegador (mesmo assessment), calculado no fim do quiz;
 *  3. recalculado das respostas, quando falta o localStorage;
 *  4. o 0 do banco só quando não há mais nada.
 * O score 0 do banco (bug antigo do compute-eligibility) nunca sobrepõe os outros.
 */
export function resolveScore({ dbScore, dbCategory, answers, local }: ScoreParts): {
  percentage: number
  category: string
} {
  const db = toNumber(dbScore)
  if (db !== null && db > 0 && dbCategory) return { percentage: Math.round(db), category: dbCategory }
  if (local) return { percentage: Math.round(local.percentage), category: local.category }
  if (answers) {
    const computed = computeScore(pruneAnswers(answers))
    if (computed.max > 0) return { percentage: computed.percentage, category: computed.category }
  }
  if (db !== null && dbCategory) return { percentage: Math.round(db), category: dbCategory }
  return { percentage: 0, category: 'baixa' }
}

export interface AssessmentRow {
  id: string
  full_name: string | null
  email: string | null
  completed_at: string | null
  answers: Json | null
  assessment_results: AssessmentResultClient | AssessmentResultClient[] | null
}

/** Colunas explícitas (nunca `*`): ver ASSESSMENT_RESULT_CLIENT_COLUMNS. */
const ASSESSMENT_COLUMNS = `id, full_name, email, completed_at, answers, assessment_results(${ASSESSMENT_RESULT_CLIENT_COLUMNS})`

async function fetchAssessmentRow(localId: string | null, userId: string | null): Promise<AssessmentRow | null> {
  if (localId) {
    // maybeSingle: assessment anônimo ou de outra conta volta vazio (RLS), não erro.
    const { data, error } = await supabase.from('assessments').select(ASSESSMENT_COLUMNS).eq('id', localId).maybeSingle()
    if (error && !userId) throw error
    if (data) return data as unknown as AssessmentRow
  }
  if (!userId) return null
  const { data, error } = await supabase
    .from('assessments')
    .select(ASSESSMENT_COLUMNS)
    .eq('user_id', userId)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as AssessmentRow | null) ?? null
}

/** O embed 1:1 pode vir como objeto ou como lista, conforme o PostgREST. */
function firstResult(row: AssessmentRow | null): AssessmentResultClient | null {
  const rel = row?.assessment_results ?? null
  return Array.isArray(rel) ? (rel[0] ?? null) : rel
}

/**
 * Junta a linha do banco com o localStorage (função pura, testável).
 * O localStorage só complementa quando é do MESMO assessment do banco (em
 * aparelho compartilhado, o resultado de outra pessoa não se mistura).
 */
export function buildAssessmentResult(row: AssessmentRow | null, local: LocalData): ResolvedAssessmentResult | null {
  const localMatchesRow = !row || !local.assessmentId || local.assessmentId === row.id
  const sameLocal = localMatchesRow ? local : EMPTY_LOCAL
  const assessmentId = row?.id ?? local.assessmentId ?? null

  const dbResult = firstResult(row)

  const answers = normalizeAnswers(row?.answers) ?? sameLocal.answers

  let pathways = pathwaysFromAnswers(answers)
  let pathwaysSource: PathwaysSource = pathways.length > 0 ? 'answers' : 'none'
  if (pathways.length === 0 && sameLocal.visas.length > 0) {
    pathways = sameLocal.visas
    pathwaysSource = 'local'
  }

  if (!row && !sameLocal.score && pathways.length === 0) return null

  const score = resolveScore({
    dbScore: dbResult?.score_numeric,
    dbCategory: dbResult?.score_category,
    answers,
    local: sameLocal.score,
  })
  const iaExplanationShort = dbResult?.ia_explanation_short ?? null

  return {
    assessmentId: assessmentId ?? '',
    scoreNumeric: score.percentage,
    scoreCategory: score.category,
    scoreLabel: categoryLabel(score.category),
    scorePercentage: score.percentage,
    suggestedVisaTypes: Array.isArray(dbResult?.suggested_visa_types)
      ? (dbResult.suggested_visa_types as unknown as AssessmentResult['suggestedVisaTypes'])
      : [],
    iaExplanationShort,
    iaExplanationFull: null,
    leadName: row?.full_name ?? sameLocal.leadInfo?.fullName ?? null,
    leadEmail: row?.email ?? sameLocal.leadInfo?.email ?? null,
    completedAt: row?.completed_at ?? sameLocal.completedAt ?? null,
    localVisas: pathways,
    answers,
    pathways,
    pathwaysSource,
    analysisReady: !!iaExplanationShort?.trim(),
  }
}

export function useAssessmentResult() {
  const local = getLocalData()
  const { authUser } = useAuth()
  const userId = authUser?.user.id ?? null
  const localId = local.assessmentId
  const enabled = !!localId || !!userId

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['assessment-result', localId, userId],
    queryFn: () => fetchAssessmentRow(localId, userId),
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const row = data ?? null
  const result = buildAssessmentResult(row, local)

  return {
    result,
    isLoading: isLoading && enabled,
    /** Há linha em assessment_results para este assessment. */
    hasDbResult: !!firstResult(row),
    error,
    refetch,
    isFetching,
  }
}
