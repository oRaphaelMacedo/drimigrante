/**
 * returning-visit — regras puras do banner de visitante que voltou (DI-053).
 *
 * Quem fez o quiz e volta ao site sem login vê "Maria, seu pré-diagnóstico de
 * 16/10 está guardado neste aparelho" com o atalho para /results. O banner:
 *  - só aparece com um resultado válido no localStorage (o mesmo que o /results
 *    consegue abrir: score com percentual numérico);
 *  - não aparece nas etapas do funil nem no login (lá ele só atrapalha);
 *  - pode ser dispensado por 7 dias; um resultado novo (outro envio do quiz)
 *    volta a mostrar o banner.
 *
 * Nada daqui vai para o analytics: nome e data ficam só na tela deste aparelho.
 * O banner não fala de e-mail: o navegador não sabe se o e-mail de boas-vindas
 * foi enviado, e aviso de e-mail só aparece com envio confirmado pelo servidor.
 */
import { QUIZ_RESULT_STORAGE_KEY } from '@/lib/stored-quiz-result'

export const RETURNING_BANNER_DISMISS_KEY = 'di_returning_banner_v1:dismissed'
export const RETURNING_BANNER_DISMISS_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000
/** Nome muito longo (ou colado com sobrenomes) quebra o banner: saudação neutra. */
const MAX_FIRST_NAME_LENGTH = 24

/** Rotas sem banner: etapas do funil, login e callback de autenticação. */
export const RETURNING_BANNER_HIDDEN_PREFIXES = ['/quiz', '/results', '/checkout', '/login', '/auth'] as const

export interface ReturningVisit {
  /** Identifica o envio do quiz (para dispensar só este resultado). */
  key: string
  firstName: string | null
  completedAt: Date | null
}

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'getItem' | 'setItem'>

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function defaultStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function firstNameFrom(fullName: unknown): string | null {
  const first = asText(fullName)?.split(/\s+/)[0] ?? null
  return first && first.length <= MAX_FIRST_NAME_LENGTH ? first : null
}

function parseDate(value: unknown): Date | null {
  const text = asText(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Resultado guardado pelo quiz → dados do banner (ou `null` se não abre no /results). */
export function parseReturningVisit(raw: string | null | undefined): ReturningVisit | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  const score = record.score as { percentage?: unknown } | null | undefined
  if (!score || typeof score.percentage !== 'number' || !Number.isFinite(score.percentage)) return null

  const completedAt = parseDate(record.completedAt)
  const lead = record.leadInfo as { fullName?: unknown } | null | undefined
  return {
    key: asText(record.sessionId) ?? asText(record.assessmentId) ?? completedAt?.toISOString() ?? 'local',
    firstName: firstNameFrom(lead?.fullName),
    completedAt,
  }
}

export function readReturningVisit(storage: StorageReader | null = defaultStorage()): ReturningVisit | null {
  try {
    return parseReturningVisit(storage?.getItem(QUIZ_RESULT_STORAGE_KEY))
  } catch {
    return null
  }
}

/** O banner vale para esta rota? */
export function isReturningBannerRoute(pathname: string): boolean {
  return !RETURNING_BANNER_HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

interface DismissRecord {
  key: string
  at: number
}

function readDismiss(storage: StorageReader | null): DismissRecord | null {
  try {
    const raw = storage?.getItem(RETURNING_BANNER_DISMISS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object') return null
    const { key, at } = parsed as { key?: unknown; at?: unknown }
    return typeof key === 'string' && typeof at === 'number' && Number.isFinite(at) ? { key, at } : null
  } catch {
    return null
  }
}

/** Dispensado para este resultado há menos de 7 dias? */
export function isReturningBannerDismissed(
  visit: Pick<ReturningVisit, 'key'>,
  storage: StorageReader | null = defaultStorage(),
  now: number = Date.now(),
): boolean {
  const record = readDismiss(storage)
  if (!record || record.key !== visit.key) return false
  // Relógio voltou no tempo (record no futuro): continua dispensado até o prazo.
  return now - record.at < RETURNING_BANNER_DISMISS_DAYS * DAY_MS
}

export function dismissReturningBanner(
  visit: Pick<ReturningVisit, 'key'>,
  storage: StorageWriter | null = defaultStorage(),
  now: number = Date.now(),
): void {
  try {
    storage?.setItem(RETURNING_BANNER_DISMISS_KEY, JSON.stringify({ key: visit.key, at: now }))
  } catch {
    // sem storage: o banner some só nesta visita
  }
}

/** "16/10" no ano corrente; "16/10/2025" em outro ano. */
export function formatVisitDate(date: Date, now: Date = new Date()): string {
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

/** Frase do banner sem o nome (o nome entra em destaque na tela). */
export function returningBannerText(visit: Pick<ReturningVisit, 'firstName' | 'completedAt'>, now: Date = new Date()): string {
  const date = visit.completedAt ? ` de ${formatVisitDate(visit.completedAt, now)}` : ''
  const subject = visit.firstName ? 'seu pré-diagnóstico' : 'Seu pré-diagnóstico'
  return `${subject}${date} está guardado neste aparelho.`
}

/** Dia local (AAAA-MM-DD) para o returning_banner_viewed contar uma vez por dia. */
export function dayStamp(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
