// Testes Deno: allowlist/clamp de ai_configurations e paridade com o admin (src/lib/ai-models.ts).

import { assertEquals } from './test-asserts.ts'
import {
  AI_MAX_TOKENS_LIMITS,
  AI_SYSTEM_PROMPT_MAX_LENGTH,
  AI_TEMPERATURE_RANGE,
  ALLOWED_AI_MODELS,
  DEFAULT_AI_MODEL,
  sanitizeAiConfig,
} from './ai-config.ts'
import * as admin from '../../../src/lib/ai-models.ts'

Deno.test('allowlist e limites iguais aos do admin', () => {
  assertEquals([...ALLOWED_AI_MODELS], [...admin.ALLOWED_AI_MODELS])
  assertEquals(DEFAULT_AI_MODEL, admin.DEFAULT_AI_MODEL)
  assertEquals(AI_MAX_TOKENS_LIMITS, admin.AI_MAX_TOKENS_LIMITS)
  assertEquals(AI_TEMPERATURE_RANGE, admin.AI_TEMPERATURE_RANGE)
  assertEquals(AI_SYSTEM_PROMPT_MAX_LENGTH, admin.AI_SYSTEM_PROMPT_MAX_LENGTH)
})

Deno.test('modelo fora da allowlist volta ao padrão e max_tokens respeita o teto', () => {
  const chat = sanitizeAiConfig('chat', { model: 'gpt-4o', temperature: 1.7, max_tokens: 1500, system_prompt: ' x ' })
  assertEquals(chat.model, 'gpt-4o-mini')
  assertEquals(chat.temperature, 1)
  assertEquals(chat.maxTokens, 1000)
  assertEquals(chat.systemPrompt, 'x')
  assertEquals(chat.adjusted, ['model', 'temperature', 'max_tokens'])

  const analysis = sanitizeAiConfig('analysis', { model: 'gpt-4.1-mini', temperature: '0.3', max_tokens: 99999 })
  assertEquals(analysis.model, 'gpt-4.1-mini')
  assertEquals(analysis.temperature, 0.3)
  assertEquals(analysis.maxTokens, 2000)
})

Deno.test('sem configuração no banco usa padrões baratos', () => {
  const cfg = sanitizeAiConfig('chat', null)
  assertEquals(cfg, { model: 'gpt-4o-mini', temperature: 0.5, maxTokens: 1000, systemPrompt: null, adjusted: [] })
})

Deno.test('validação do admin recusa modelo e max_tokens fora da faixa', () => {
  const errors = admin.validateAiConfigDraft('chat', {
    model: 'gpt-4o',
    temperature: 0.5,
    max_tokens: 1500.5,
    system_prompt: '',
  })
  assertEquals(Object.keys(errors).sort(), ['max_tokens', 'model'])
  assertEquals(
    admin.validateAiConfigDraft('analysis', {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 2000,
      system_prompt: 'ok',
    }),
    {},
  )
})
