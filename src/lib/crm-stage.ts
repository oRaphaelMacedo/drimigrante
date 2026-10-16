/**
 * Fases do CRM dos leads (coluna `assessments.crm_stage`, texto livre no banco).
 *
 * Compartilhado pela tabela de leads e pelo kanban do admin. Os valores gravados
 * no banco são os identificadores abaixo (sem acento, como na migration); os
 * rótulos são só da interface, em pt-BR.
 */
import type { Json } from '@/lib/database.types'

export const CRM_STAGES = ['novo', 'contactado', 'proposta', 'convertido'] as const

export type CrmStage = (typeof CRM_STAGES)[number]

/** Valor padrão do banco para leads sem fase definida. */
export const DEFAULT_CRM_STAGE: CrmStage = 'novo'

/** Tons do Badge (`@/components/ui`) usados por fase. */
export type CrmStageTone = 'primary' | 'warning' | 'neutral' | 'success'

export interface CrmStageMeta {
  /** Rótulo no singular (badge de um lead). */
  label: string
  /** Rótulo no plural (filtros e colunas). */
  pluralLabel: string
  tone: CrmStageTone
}

export const CRM_STAGE_META: Record<CrmStage, CrmStageMeta> = {
  novo: { label: 'Novo', pluralLabel: 'Novos', tone: 'primary' },
  contactado: { label: 'Contatado', pluralLabel: 'Contatados', tone: 'warning' },
  proposta: { label: 'Proposta enviada', pluralLabel: 'Proposta enviada', tone: 'neutral' },
  convertido: { label: 'Convertido', pluralLabel: 'Convertidos', tone: 'success' },
}

export function isCrmStage(value: unknown): value is CrmStage {
  return typeof value === 'string' && (CRM_STAGES as readonly string[]).includes(value)
}

/** Fase do lead; valores desconhecidos ou vazios contam como "novo". */
export function parseCrmStage(value: unknown): CrmStage {
  return isCrmStage(value) ? value : DEFAULT_CRM_STAGE
}

/** Quantidade de leads por fase (todas as fases presentes, mesmo com zero). */
export function countByCrmStage(leads: ReadonlyArray<{ crm_stage: string | null }>): Record<CrmStage, number> {
  const counts: Record<CrmStage, number> = { novo: 0, contactado: 0, proposta: 0, convertido: 0 }
  for (const lead of leads) counts[parseCrmStage(lead.crm_stage)] += 1
  return counts
}

// ─── Temperatura do lead ─────────────────────────────────────────────────────

export type LeadTemperature = 'frio' | 'morno' | 'quente'

export const LEAD_TEMPERATURE_META: Record<LeadTemperature, { label: string; tone: 'primary' | 'warning' | 'danger' }> = {
  frio: { label: 'Frio', tone: 'primary' },
  morno: { label: 'Morno', tone: 'warning' },
  quente: { label: 'Quente', tone: 'danger' },
}

/** Temperatura pela porcentagem do quiz respondida (100% = quente, ≥50% = morno). */
export function leadTemperature(completionPercentage: number | null | undefined): LeadTemperature {
  if (!completionPercentage) return 'frio'
  if (completionPercentage >= 100) return 'quente'
  if (completionPercentage >= 50) return 'morno'
  return 'frio'
}

// ─── Respostas do quiz ───────────────────────────────────────────────────────

/** Lê um campo de texto de `assessments.answers` (JSON) sem cast para `any`. */
export function readAnswerText(answers: Json | null | undefined, key: string): string | null {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null
  const value = answers[key]
  return typeof value === 'string' && value.trim() ? value : null
}

// ─── Exportação CSV ──────────────────────────────────────────────────────────

const FORMULA_START = /^[=@\t\r]/
const SIGNED_START = /^[+-]/
const PHONE_LIKE = /^[+-]?[\d\s().-]+$/

/**
 * Campo de CSV com aspas duplas escapadas (RFC 4180) e protegido contra
 * injeção de fórmula: nome e e-mail vêm do visitante, e uma célula que começa
 * com `=`, `@`, `+` ou `-` vira fórmula no Excel/Sheets. Telefones (`+351 912…`)
 * ficam como estão.
 */
export function csvField(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (FORMULA_START.test(text) || (SIGNED_START.test(text) && !PHONE_LIKE.test(text))) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}
