// AdminAiConfigPage.tsx — configuração dos modelos e prompts de IA.
// Edição local com botão Salvar (nada é gravado a cada tecla) e validação com os
// mesmos limites que as Edge Functions aplicam (src/lib/ai-models.ts ↔ _shared/ai-config.ts).

import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CheckCircle2, Loader2, Settings2, Sliders, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  AI_SYSTEM_PROMPT_MAX_LENGTH,
  AI_TEMPERATURE_RANGE,
  ALLOWED_AI_MODELS,
  type AiConfigDraft,
  isAllowedAiModel,
  maxTokensLimitsFor,
  validateAiConfigDraft,
} from '@/lib/ai-models'

interface AIConfig {
  id: string
  use_case: string
  provider: string
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string | null
  is_active: boolean
  updated_at: string | null
}

interface DraftState {
  model: string
  temperature: number
  maxTokens: string
  systemPrompt: string
}

const USE_CASE_LABELS: Record<string, string> = {
  scoring: 'Cálculo de elegibilidade (quiz)',
  analysis: 'Análise completa',
  chat: 'Chat com IA',
  document_extraction: 'Extração de documentos',
}

const USE_CASE_HINTS: Record<string, string> = {
  analysis: 'Usado pela função generate-explanation (resumo e análise completa).',
  chat: 'Usado pela função chat-completion.',
}

const inputClass =
  'w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none transition focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 aria-[invalid=true]:border-destructive'

function toDraft(config: AIConfig): DraftState {
  return {
    model: config.model,
    temperature: Number(config.temperature),
    maxTokens: String(config.max_tokens),
    systemPrompt: config.system_prompt ?? '',
  }
}

function toPayload(draft: DraftState): AiConfigDraft {
  const trimmed = draft.maxTokens.trim()
  return {
    model: draft.model,
    temperature: Math.round(draft.temperature * 100) / 100,
    max_tokens: trimmed === '' ? Number.NaN : Number(trimmed),
    system_prompt: draft.systemPrompt.trim(),
  }
}

function isSameDraft(a: DraftState, b: DraftState): boolean {
  return (
    a.model === b.model &&
    a.temperature === b.temperature &&
    a.maxTokens.trim() === b.maxTokens.trim() &&
    a.systemPrompt.trim() === b.systemPrompt.trim()
  )
}

function AiConfigCard({
  config,
  onSaved,
  justSaved,
}: {
  config: AIConfig
  onSaved: (id: string) => void
  justSaved: boolean
}) {
  const queryClient = useQueryClient()
  const baseId = useId()
  const initial = toDraft(config)
  const [draft, setDraft] = useState<DraftState>(initial)

  const limits = maxTokensLimitsFor(config.use_case)
  const payload = toPayload(draft)
  // Validação ao vivo: valores inválidos vindos do banco também aparecem logo.
  const errors = validateAiConfigDraft(config.use_case, payload)
  const hasErrors = Object.keys(errors).length > 0
  const dirty = !isSameDraft(draft, initial)

  const mutation = useMutation({
    mutationFn: async (values: AiConfigDraft) => {
      const { data, error } = await supabase
        .from('ai_configurations')
        .update({
          model: values.model,
          temperature: values.temperature,
          max_tokens: values.max_tokens,
          system_prompt: values.system_prompt || null,
        })
        .eq('id', config.id)
        .select('id')
      if (error) throw error
      // RLS sem permissão não dá erro: só não altera nenhuma linha.
      if (!data || data.length === 0) throw new Error('Nenhuma linha alterada')
    },
    onSuccess: async () => {
      onSaved(config.id)
      await queryClient.invalidateQueries({ queryKey: ['ai-configs'] })
    },
    onError: (err) => {
      console.error('[AdminAiConfig] save error:', err)
    },
  })

  const update = (patch: Partial<DraftState>) => setDraft((prev) => ({ ...prev, ...patch }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hasErrors || !dirty || mutation.isPending) return
    mutation.mutate(payload)
  }

  const ids = {
    model: `${baseId}-model`,
    modelError: `${baseId}-model-error`,
    temperature: `${baseId}-temperature`,
    maxTokens: `${baseId}-max-tokens`,
    maxTokensHint: `${baseId}-max-tokens-hint`,
    maxTokensError: `${baseId}-max-tokens-error`,
    prompt: `${baseId}-prompt`,
    promptHint: `${baseId}-prompt-hint`,
    promptError: `${baseId}-prompt-error`,
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card shadow-sm" noValidate>
      <div className="border-b border-border p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[.08] text-primary">
            <Bot className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-foreground">{USE_CASE_LABELS[config.use_case] ?? config.use_case}</h2>
            <p className="text-sm text-muted-foreground">
              {USE_CASE_HINTS[config.use_case] ?? 'Não usado pelas funções atuais.'}
            </p>
          </div>
          {justSaved && !dirty && (
            <span className="flex items-center gap-1 text-sm font-semibold text-success" role="status">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Salvo
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.model} className="mb-1 flex items-center gap-1 text-sm font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Modelo
            </label>
            <select
              id={ids.model}
              value={draft.model}
              onChange={(e) => update({ model: e.target.value })}
              aria-invalid={!!errors.model}
              aria-describedby={errors.model ? ids.modelError : undefined}
              className={cn(inputClass, 'h-12')}
            >
              {!isAllowedAiModel(config.model) && (
                <option value={config.model}>{config.model} (fora da lista permitida)</option>
              )}
              {ALLOWED_AI_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {errors.model && (
              <p id={ids.modelError} className="mt-1 text-sm text-destructive">
                {errors.model}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-foreground">Provedor</p>
            <p className="flex h-12 items-center rounded-xl bg-muted px-3 text-base text-foreground">OpenAI</p>
            <p className="mt-1 text-sm text-muted-foreground">As funções de IA usam somente a OpenAI.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={ids.temperature}
              className="mb-1 flex items-center gap-1 text-sm font-semibold text-foreground"
            >
              <Sliders className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Temperatura: {draft.temperature.toFixed(2)}
            </label>
            <input
              id={ids.temperature}
              type="range"
              min={AI_TEMPERATURE_RANGE.min}
              max={AI_TEMPERATURE_RANGE.max}
              step="0.05"
              value={draft.temperature}
              onChange={(e) => update({ temperature: Number(e.target.value) })}
              className="h-11 w-full accent-primary"
            />
            <div className="flex justify-between text-sm text-muted-foreground" aria-hidden="true">
              <span>Preciso</span>
              <span>Criativo</span>
            </div>
          </div>
          <div>
            <label htmlFor={ids.maxTokens} className="mb-1 block text-sm font-semibold text-foreground">
              Máximo de tokens
            </label>
            <input
              id={ids.maxTokens}
              type="number"
              inputMode="numeric"
              min={limits.min}
              max={limits.max}
              step={1}
              value={draft.maxTokens}
              onChange={(e) => update({ maxTokens: e.target.value })}
              aria-invalid={!!errors.max_tokens}
              aria-describedby={
                errors.max_tokens ? `${ids.maxTokensHint} ${ids.maxTokensError}` : ids.maxTokensHint
              }
              className={cn(inputClass, 'h-12')}
            />
            <p id={ids.maxTokensHint} className="mt-1 text-sm text-muted-foreground">
              Entre {limits.min} e {limits.max}. Valores fora da faixa são corrigidos pelo servidor.
            </p>
            {errors.max_tokens && (
              <p id={ids.maxTokensError} className="mt-1 text-sm text-destructive">
                {errors.max_tokens}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={ids.prompt} className="mb-1 flex items-center gap-1 text-sm font-semibold text-foreground">
            <Settings2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Prompt de sistema (tom e estilo)
          </label>
          <textarea
            id={ids.prompt}
            value={draft.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
            rows={5}
            aria-invalid={!!errors.system_prompt}
            aria-describedby={
              errors.system_prompt ? `${ids.promptHint} ${ids.promptError}` : ids.promptHint
            }
            className={cn(inputClass, 'resize-y py-2')}
          />
          <p id={ids.promptHint} className="mt-1 text-sm text-muted-foreground">
            As regras fixas (português do Brasil, sem personagem, sem promessas) ficam no código e valem sempre.{' '}
            {draft.systemPrompt.length}/{AI_SYSTEM_PROMPT_MAX_LENGTH} caracteres.
          </p>
          {errors.system_prompt && (
            <p id={ids.promptError} className="mt-1 text-sm text-destructive">
              {errors.system_prompt}
            </p>
          )}
        </div>

        {mutation.isError && (
          <p className="rounded-xl bg-destructive/[.08] px-3 py-2 text-sm text-destructive" role="alert">
            Não foi possível salvar. Confira sua conexão e tente de novo.
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(initial)
              mutation.reset()
            }}
            disabled={!dirty || mutation.isPending}
          >
            Descartar alterações
          </Button>
          <Button type="submit" disabled={!dirty || hasErrors} loading={mutation.isPending}>
            Salvar alterações
          </Button>
        </div>
      </div>
    </form>
  )
}

export function AdminAiConfigPage() {
  const [savedId, setSavedId] = useState<string | null>(null)

  const { data: configs = [], isLoading, isError } = useQuery({
    queryKey: ['ai-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_configurations')
        .select('id, use_case, provider, model, temperature, max_tokens, system_prompt, is_active, updated_at')
        .eq('is_active', true)
        .order('use_case')
      if (error) throw error
      return data as AIConfig[]
    },
  })

  function handleSaved(id: string) {
    setSavedId(id)
    window.setTimeout(() => setSavedId((current) => (current === id ? null : current)), 3000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        Carregando configurações…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuração de IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Modelos, limites e prompts de cada uso de IA da plataforma. As alterações só valem depois de salvar.
        </p>
      </div>

      {isError && (
        <p className="rounded-xl bg-destructive/[.08] px-4 py-3 text-sm text-destructive" role="alert">
          Não foi possível carregar as configurações.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {configs.map((config) => (
          <AiConfigCard
            key={`${config.id}:${config.updated_at ?? ''}`}
            config={config}
            onSaved={handleSaved}
            justSaved={savedId === config.id}
          />
        ))}

        {!isError && configs.length === 0 && (
          <div className="col-span-full rounded-lg border-2 border-dashed border-border p-8 text-center">
            <Bot className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="font-bold text-foreground">Nenhuma configuração ativa</h2>
            <p className="mt-1 text-sm text-muted-foreground">As configurações de IA aparecem aqui.</p>
          </div>
        )}
      </div>
    </div>
  )
}
