import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExplanationRequest {
  assessment_id: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )
    const openaiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiKey) throw new Error('OPENAI_API_KEY not configured')

    const { assessment_id }: ExplanationRequest = await req.json()

    // Fetch assessment + result
    const { data: assessment } = await supabase
      .from('assessments')
      .select('*, assessment_results(*)')
      .eq('id', assessment_id)
      .single()

    if (!assessment) {
      return new Response(JSON.stringify({ error: 'Assessment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const result = Array.isArray(assessment.assessment_results)
      ? assessment.assessment_results[0]
      : assessment.assessment_results

    if (!result) {
      return new Response(JSON.stringify({ error: 'Run compute-eligibility first' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch AI config
    const { data: aiConfig } = await supabase
      .from('ai_configurations')
      .select('*')
      .eq('use_case', 'analysis')
      .eq('is_active', true)
      .single()

    const model = aiConfig?.model ?? 'gpt-4o-mini'
    const systemPrompt = aiConfig?.system_prompt ?? 'You are a Portuguese immigration law expert.'
    const temperature = aiConfig?.temperature ?? 0.3

    const suggestedVisas = (result.suggested_visa_types as Array<{ visa_type_name: string; eligible: boolean }>) ?? []
    const topVisa = suggestedVisas.find((v) => v.eligible) ?? suggestedVisas[0]
    const answers = assessment.answers as Record<string, unknown>

    // Build prompt context
    const context = `
Cliente: ${assessment.full_name ?? 'Utilizador anónimo'}
Nacionalidade: ${answers.nationality ?? 'Não informado'}
Rendimento mensal: ${answers.monthly_income ?? 'Não informado'} EUR
Fonte de rendimento: ${answers.income_source ?? 'Não informado'}
Poupanças: ${answers.has_savings === 'yes' ? `Sim (${answers.savings_amount ?? ''})` : 'Não'}
Família portuguesa: ${answers.has_portuguese_family === 'yes' ? 'Sim' : 'Não'}
Nível de português: ${answers.portuguese_language ?? 'Não informado'}
Objetivo em Portugal: ${answers.main_goal ?? 'Não informado'}
Score de elegibilidade: ${result.score_numeric}/100 (${result.score_category})
Visto mais adequado: ${topVisa?.visa_type_name ?? 'A determinar'}
`.trim()

    // Generate short explanation (pre-result — free)
    const shortRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: 150,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Com base neste perfil de imigração, escreve uma análise curta (máximo 60 palavras) em português europeu. Seja encorajador e menciona o score ${result.score_category}.\n\n${context}`,
          },
        ],
      }),
    })

    const shortJson = await shortRes.json()
    const shortText = shortJson.choices?.[0]?.message?.content ?? ''
    const shortTokens = shortJson.usage?.total_tokens ?? 0

    // Generate full explanation (paid)
    const fullRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: aiConfig?.max_tokens ?? 2000,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Escreve uma análise jurídica completa (400-500 palavras) em português europeu para este perfil de imigração. Inclui: 1) Avaliação geral da elegibilidade, 2) Visto mais adequado e porquê, 3) Requisitos principais a cumprir, 4) Desafios potenciais, 5) Próximos passos recomendados. Usa parágrafos claros, linguagem acessível mas profissional.\n\n${context}`,
          },
        ],
      }),
    })

    const fullJson = await fullRes.json()
    const fullText = fullJson.choices?.[0]?.message?.content ?? ''
    const fullTokens = fullJson.usage?.total_tokens ?? 0

    // Update assessment_results
    await supabase
      .from('assessment_results')
      .update({
        ia_explanation_short: shortText,
        ia_explanation_full: fullText,
        ia_model_used: model,
        ia_tokens_used: shortTokens + fullTokens,
      })
      .eq('assessment_id', assessment_id)

    return new Response(JSON.stringify({
      short: shortText,
      full: fullText,
      tokens_used: shortTokens + fullTokens,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
