import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, Settings2, Sparkles, Sliders, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface AIConfig {
  id: string
  use_case: string
  provider: string
  model: string
  temperature: number
  max_tokens: number
  system_prompt: string
  is_active: boolean
}

export function AdminAiConfigPage() {
  const queryClient = useQueryClient()
  const [savedStatus, setSavedStatus] = useState<string | null>(null)

  const { data: configs = [], isLoading: loading } = useQuery({
    queryKey: ['ai-configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_configurations')
        .select('*')
        .eq('is_active', true)
        .order('use_case')
      
      if (error) throw error
      return data as AIConfig[]
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<AIConfig> }) => {
      const { error } = await supabase
        .from('ai_configurations')
        .update(updates as any)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['ai-configs'] })
      const previousConfigs = queryClient.getQueryData<AIConfig[]>(['ai-configs'])
      
      queryClient.setQueryData<AIConfig[]>(['ai-configs'], old => 
        old?.map(c => c.id === id ? { ...c, ...updates } : c)
      )
      
      return { previousConfigs }
    },
    onError: (err, _variables, context) => {
      console.error('Error updating config:', err)
      if (context?.previousConfigs) {
        queryClient.setQueryData(['ai-configs'], context.previousConfigs)
      }
    },
    onSuccess: (_, variables) => {
      setSavedStatus(variables.id)
      setTimeout(() => setSavedStatus(null), 2000)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-configs'] })
    }
  })

  const handleUpdateConfig = (id: string, updates: Partial<AIConfig>) => {
    updateMutation.mutate({ id, updates })
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">A carregar configurações...</div>
  }

  const useCaseLabels: Record<string, string> = {
    scoring: 'Cálculo de Elegibilidade (Quiz)',
    analysis: 'Análise Completa e Sugestões',
    chat: 'Chat Assistant IA',
    document_extraction: 'Extração de Documentos'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuração de IA</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerencie os modelos, prompts e parâmetros para os diferentes agentes da plataforma.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {configs.map((config) => (
          <div key={config.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">
                    {useCaseLabels[config.use_case] || config.use_case}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <span className="uppercase">{config.provider}</span>
                    <span>•</span>
                    <span>{config.model}</span>
                  </div>
                </div>
                {savedStatus === config.id && (
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    Salvo
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Modelo e Fornecedor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                    <Sparkles className="h-3 w-3 text-brand-500" />
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => handleUpdateConfig(config.id, { model: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                    Provider
                  </label>
                  <select
                    value={config.provider}
                    onChange={(e) => handleUpdateConfig(config.id, { provider: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Google Gemini</option>
                  </select>
                </div>
              </div>

              {/* Sliders (Temp & Tokens) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                    <Sliders className="h-3 w-3 text-amber-500" />
                    Temperature: {config.temperature}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={config.temperature}
                    onChange={(e) => handleUpdateConfig(config.id, { temperature: parseFloat(e.target.value) })}
                    className="w-full accent-brand-600"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                    <span>Preciso</span>
                    <span>Criativo</span>
                  </div>
                </div>
                <div>
                  <label className="mb-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                    Max Tokens
                  </label>
                  <input
                    type="number"
                    value={config.max_tokens}
                    onChange={(e) => handleUpdateConfig(config.id, { max_tokens: parseInt(e.target.value) })}
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-bold text-gray-700">
                  <Settings2 className="h-3 w-3 text-blue-500" />
                  System Prompt
                </label>
                <textarea
                  value={config.system_prompt}
                  onChange={(e) => handleUpdateConfig(config.id, { system_prompt: e.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-500 focus:bg-white focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>
        ))}

        {configs.length === 0 && (
          <div className="col-span-full rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center">
            <Bot className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <h3 className="font-bold text-gray-900">Nenhuma configuração ativa</h3>
            <p className="mt-1 text-sm text-gray-500">As configurações de IA serão mostradas aqui.</p>
          </div>
        )}
      </div>
    </div>
  )
}
