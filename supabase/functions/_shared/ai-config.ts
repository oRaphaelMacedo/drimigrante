// _shared/ai-config.ts — leitura segura de ai_configurations.
//
// ESPELHO de src/lib/ai-models.ts (validação do admin). O banco é editável pelo
// admin; aqui o valor vindo dele passa por allowlist de modelo e clamp de
// temperatura/max_tokens, para nunca gerar custo inesperado.
// O teste _shared/ai-config_test.ts confere que as listas continuam iguais.

export const ALLOWED_AI_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano'] as const
export const DEFAULT_AI_MODEL = 'gpt-4o-mini'

export type AiUseCase = 'scoring' | 'analysis' | 'chat' | 'document_extraction'

export const AI_MAX_TOKENS_LIMITS: Record<AiUseCase, { min: number; max: number }> = {
  scoring: { min: 100, max: 1000 },
  analysis: { min: 256, max: 2000 },
  chat: { min: 100, max: 1000 },
  document_extraction: { min: 100, max: 1000 },
}

export const AI_TEMPERATURE_RANGE = { min: 0, max: 1 } as const
export const AI_SYSTEM_PROMPT_MAX_LENGTH = 4000

const DEFAULTS: Record<AiUseCase, { temperature: number; maxTokens: number }> = {
  scoring: { temperature: 0.1, maxTokens: 1000 },
  analysis: { temperature: 0.3, maxTokens: 2000 },
  chat: { temperature: 0.5, maxTokens: 1000 },
  document_extraction: { temperature: 0.1, maxTokens: 1000 },
}

export interface RawAiConfig {
  model?: string | null
  temperature?: number | string | null
  max_tokens?: number | string | null
  system_prompt?: string | null
}

export interface SafeAiConfig {
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string | null
  /** Campos que vieram fora da faixa e foram corrigidos (para log). */
  adjusted: string[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function sanitizeAiConfig(useCase: AiUseCase, raw: RawAiConfig | null | undefined): SafeAiConfig {
  const defaults = DEFAULTS[useCase]
  const limits = AI_MAX_TOKENS_LIMITS[useCase]
  const adjusted: string[] = []

  const rawModel = typeof raw?.model === 'string' ? raw.model.trim() : ''
  let model: string = DEFAULT_AI_MODEL
  if ((ALLOWED_AI_MODELS as readonly string[]).includes(rawModel)) model = rawModel
  else if (rawModel) adjusted.push('model')

  let temperature = defaults.temperature
  if (raw?.temperature !== null && raw?.temperature !== undefined) {
    const t = Number(raw.temperature)
    if (Number.isFinite(t)) {
      temperature = clamp(t, AI_TEMPERATURE_RANGE.min, AI_TEMPERATURE_RANGE.max)
      if (temperature !== t) adjusted.push('temperature')
    } else {
      adjusted.push('temperature')
    }
  }

  let maxTokens = defaults.maxTokens
  if (raw?.max_tokens !== null && raw?.max_tokens !== undefined) {
    const m = Math.floor(Number(raw.max_tokens))
    if (Number.isFinite(m)) {
      maxTokens = clamp(m, limits.min, limits.max)
      if (maxTokens !== Number(raw.max_tokens)) adjusted.push('max_tokens')
    } else {
      adjusted.push('max_tokens')
    }
  }
  maxTokens = Math.min(maxTokens, limits.max)

  let systemPrompt = typeof raw?.system_prompt === 'string' ? raw.system_prompt.trim() : ''
  if (systemPrompt.length > AI_SYSTEM_PROMPT_MAX_LENGTH) {
    systemPrompt = systemPrompt.slice(0, AI_SYSTEM_PROMPT_MAX_LENGTH)
    adjusted.push('system_prompt')
  }

  return { model, temperature, maxTokens, systemPrompt: systemPrompt || null, adjusted }
}
