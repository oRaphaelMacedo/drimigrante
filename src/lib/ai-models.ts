// ai-models.ts — limites de configuração de IA aceitos pelo admin.
//
// ESPELHO de supabase/functions/_shared/ai-config.ts: as Edge Functions aplicam a
// mesma allowlist e os mesmos tetos (clamp) ao ler ai_configurations, então um valor
// fora da faixa nunca gera custo inesperado. O teste Deno
// supabase/functions/_shared/ai-config_test.ts confere que as duas listas são iguais.
// Sem imports de propósito: o teste Deno importa este arquivo diretamente.

export const ALLOWED_AI_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano'] as const
export type AllowedAiModel = (typeof ALLOWED_AI_MODELS)[number]
export const DEFAULT_AI_MODEL: AllowedAiModel = 'gpt-4o-mini'

export type AiUseCase = 'scoring' | 'analysis' | 'chat' | 'document_extraction'

export const AI_MAX_TOKENS_LIMITS: Record<AiUseCase, { min: number; max: number }> = {
  scoring: { min: 100, max: 1000 },
  analysis: { min: 256, max: 2000 },
  chat: { min: 100, max: 1000 },
  document_extraction: { min: 100, max: 1000 },
}

export const AI_TEMPERATURE_RANGE = { min: 0, max: 1 } as const
export const AI_SYSTEM_PROMPT_MAX_LENGTH = 4000

export function isAllowedAiModel(model: string): model is AllowedAiModel {
  return (ALLOWED_AI_MODELS as readonly string[]).includes(model)
}

export function maxTokensLimitsFor(useCase: string): { min: number; max: number } {
  return AI_MAX_TOKENS_LIMITS[useCase as AiUseCase] ?? { min: 100, max: 1000 }
}

export interface AiConfigDraft {
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
}

export type AiConfigErrors = Partial<Record<keyof AiConfigDraft, string>>

export function validateAiConfigDraft(useCase: string, draft: AiConfigDraft): AiConfigErrors {
  const errors: AiConfigErrors = {}
  const limits = maxTokensLimitsFor(useCase)

  if (!isAllowedAiModel(draft.model)) {
    errors.model = `Escolha um modelo permitido: ${ALLOWED_AI_MODELS.join(', ')}.`
  }
  if (
    !Number.isFinite(draft.temperature) ||
    draft.temperature < AI_TEMPERATURE_RANGE.min ||
    draft.temperature > AI_TEMPERATURE_RANGE.max
  ) {
    errors.temperature = `A temperatura deve ficar entre ${AI_TEMPERATURE_RANGE.min} e ${AI_TEMPERATURE_RANGE.max}.`
  }
  if (!Number.isInteger(draft.max_tokens) || draft.max_tokens < limits.min || draft.max_tokens > limits.max) {
    errors.max_tokens = `Use um número inteiro entre ${limits.min} e ${limits.max}.`
  }
  if (draft.system_prompt.length > AI_SYSTEM_PROMPT_MAX_LENGTH) {
    errors.system_prompt = `O prompt pode ter no máximo ${AI_SYSTEM_PROMPT_MAX_LENGTH} caracteres.`
  }
  return errors
}
