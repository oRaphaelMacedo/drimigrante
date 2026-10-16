/**
 * Link de retomada do resultado entre aparelhos (DI-024).
 *
 * `/results?r=<token>` abre o pré-resultado em qualquer navegador. O token é
 * opaco e só de LEITURA (coluna assessments.resume_token, migration
 * 20261025000200_resume_token.sql): a RPC get_assessment_by_resume_token não
 * devolve id nem session_id, então quem tem o link não grava no assessment.
 *
 * No aparelho que abriu o link:
 *  - o resultado é recalculado das respostas (computeScore/suggestVisas), com o
 *    score já calculado no servidor quando existe;
 *  - fica salvo no localStorage com um session_id NOVO e sem assessmentId; ao
 *    comprar, o useStartCheckout salva um assessment novo para este aparelho
 *    (mesmo fluxo de quando o quiz não conseguiu gravar) e segue para o Stripe;
 *  - o token é guardado para o botão "Guardar meu resultado".
 *
 * No aparelho do quiz, o token vem de get_anon_assessment(id, session_id), que
 * devolve a linha inteira (inclui resume_token depois da migration).
 *
 * Privacidade: o token é um segredo do portador. A ResultsPage tira `r` da URL
 * antes de qualquer pageview e src/lib/url-sanitize.ts remove `r` do que vai
 * para analytics e Sentry. Nunca use o token como chave ou propriedade de evento.
 */
import { supabase } from '@/lib/supabase'
import { createSessionId, QUIZ_RESULT_KEY } from '@/lib/quiz-submission'
import { isScoreCategory, type ScoreCategory } from '@/lib/category'
import { computeScore, pruneAnswers, suggestVisas, type VisaSuggestion } from '@/data/quiz-questions'

export const RESUME_PARAM = 'r'

const TOKEN_RE = /^[0-9a-f]{64}$/

/** Tempo máximo esperando a RPC antes de mostrar "tentar de novo". */
export const RESUME_TIMEOUT_MS = 10_000

export function isValidResumeToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

/** Link para abrir o resultado em outro aparelho. */
export function buildResumeUrl(token: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/results?${RESUME_PARAM}=${encodeURIComponent(token)}`
}

/** `search` sem as chaves pedidas (com `?` quando sobra algo). */
export function withoutParams(search: string, keys: readonly string[]): string {
  const params = new URLSearchParams(search)
  for (const key of keys) params.delete(key)
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

// ── RPC ──────────────────────────────────────────────────────────────────────

interface RpcError {
  code?: string
  message?: string
}

/** As RPCs novas ainda não estão em database.types.ts (gerado do banco de produção). */
type UntypedRpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: RpcError | null }>

function rpc(fn: string, args: Record<string, unknown>) {
  const call = supabase.rpc.bind(supabase) as unknown as UntypedRpc
  return call(fn, args)
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export interface ResumedAssessment {
  answers: Record<string, string>
  fullName: string | null
  email: string | null
  completedAt: string | null
  /** Score calculado no servidor (assessment_results), quando existe. */
  scorePercentage: number | null
  scoreCategory: ScoreCategory | null
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asAnswers(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value
    else if (typeof value === 'number' || typeof value === 'boolean') out[key] = String(value)
    else if (Array.isArray(value)) out[key] = value.filter((v) => typeof v === 'string').join(',')
  }
  return Object.keys(out).length > 0 ? out : null
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Linha da RPC → dados do resultado (ou `null` se faltar o essencial). */
export function parseResumeRow(row: unknown): ResumedAssessment | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const answers = asAnswers(r.answers)
  if (!answers) return null
  const email = asText(r.email)
  return {
    answers,
    fullName: asText(r.full_name),
    email: email && email.includes('@') ? email : null,
    completedAt: asText(r.completed_at),
    scorePercentage: asNumber(r.score_numeric),
    scoreCategory: isScoreCategory(r.score_category) ? r.score_category : null,
  }
}

export type ResumeFetchResult =
  | { kind: 'ok'; data: ResumedAssessment }
  /** Token inexistente, vencido ou a RPC não existe (migration não aplicada). */
  | { kind: 'not_found' }
  /** Rede/servidor: vale tentar de novo. */
  | { kind: 'error' }

/** Lê o resultado pelo token (nunca lança). */
export async function fetchAssessmentByResumeToken(token: string): Promise<ResumeFetchResult> {
  if (!isValidResumeToken(token)) return { kind: 'not_found' }
  try {
    const { data, error } = await withTimeout(
      rpc('get_assessment_by_resume_token', { p_token: token }),
      RESUME_TIMEOUT_MS,
    )
    if (error) return typeof error.code === 'string' && error.code ? { kind: 'not_found' } : { kind: 'error' }
    const row = Array.isArray(data) ? data[0] : data
    const parsed = parseResumeRow(row)
    return parsed ? { kind: 'ok', data: parsed } : { kind: 'not_found' }
  } catch {
    return { kind: 'error' }
  }
}

/**
 * Token do resultado deste aparelho, provando a posse pelo session_id
 * (get_anon_assessment devolve a linha inteira). `null` se não houver.
 */
export async function fetchOwnResumeToken(assessmentId: string, sessionId: string): Promise<string | null> {
  try {
    const { data, error } = await withTimeout(
      rpc('get_anon_assessment', { p_id: assessmentId, p_session_id: sessionId }),
      RESUME_TIMEOUT_MS,
    )
    if (error) return null
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined
    const token = row?.resume_token
    return isValidResumeToken(token) ? token : null
  } catch {
    return null
  }
}

// ── localStorage ─────────────────────────────────────────────────────────────

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readStoredRecord(): Record<string, unknown> | null {
  try {
    const raw = storage()?.getItem(QUIZ_RESULT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function writeStoredRecord(record: Record<string, unknown>): boolean {
  try {
    const s = storage()
    if (!s) return false
    s.setItem(QUIZ_RESULT_KEY, JSON.stringify(record))
    return true
  } catch {
    return false
  }
}

/** Score do resultado retomado: o do servidor quando positivo; senão, recalculado das respostas. */
export function resolveResumedScore(data: ResumedAssessment): {
  total: number
  max: number
  percentage: number
  category: ScoreCategory
} {
  const computed = computeScore(pruneAnswers(data.answers))
  // Mesma regra do resolveScore do painel: o 0 do banco (bug antigo) não vale.
  if (data.scorePercentage !== null && data.scorePercentage > 0 && data.scoreCategory) {
    return {
      total: computed.total,
      max: computed.max,
      percentage: Math.round(data.scorePercentage),
      category: data.scoreCategory,
    }
  }
  return { total: computed.total, max: computed.max, percentage: computed.percentage, category: computed.category }
}

export interface ResumedRecordOptions {
  now?: Date
  createId?: () => string
}

/** Registro do localStorage para o resultado aberto pelo link (função pura). */
export function buildResumedRecord(
  data: ResumedAssessment,
  token: string,
  { now = new Date(), createId = createSessionId }: ResumedRecordOptions = {},
): Record<string, unknown> {
  const answers = pruneAnswers(data.answers)
  const visas: VisaSuggestion[] = suggestVisas(answers)
  return {
    // session_id novo: este aparelho nunca escreve no assessment original.
    sessionId: createId(),
    assessmentId: null,
    answers,
    score: resolveResumedScore(data),
    visas,
    leadInfo: data.email ? { fullName: data.fullName ?? '', email: data.email } : null,
    completedAt: data.completedAt ?? now.toISOString(),
    resume: { token, assessmentId: null },
    resumedAt: now.toISOString(),
  }
}

/**
 * Grava o resultado aberto pelo link neste aparelho (substitui o anterior) e
 * devolve o registro — a tela usa o registro mesmo se o storage falhar.
 */
export function storeResumedResult(
  data: ResumedAssessment,
  token: string,
  options?: ResumedRecordOptions,
): Record<string, unknown> {
  const record = buildResumedRecord(data, token, options)
  writeStoredRecord(record)
  return record
}

/**
 * Token já guardado para o resultado atual deste aparelho, ou `null`.
 * Só vale se foi guardado para o mesmo assessmentId (ou para o resultado aberto
 * pelo link, ainda sem assessmentId).
 */
export function readStoredResumeToken(): string | null {
  const record = readStoredRecord()
  const resume = record?.resume as { token?: unknown; assessmentId?: unknown } | undefined
  if (!resume || !isValidResumeToken(resume.token)) return null
  const current = typeof record?.assessmentId === 'string' ? record.assessmentId : null
  const savedFor = typeof resume.assessmentId === 'string' ? resume.assessmentId : null
  if (savedFor === current || savedFor === null) return resume.token
  return null
}

/** Guarda o token do resultado atual (não grava se o resultado mudou nesse meio-tempo). */
export function rememberResumeToken(token: string, assessmentId: string): void {
  const record = readStoredRecord()
  if (!record || record.assessmentId !== assessmentId) return
  writeStoredRecord({ ...record, resume: { token, assessmentId } })
}
