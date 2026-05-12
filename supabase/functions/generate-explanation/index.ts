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

    // Build prompt context from actual quiz answer keys
    const processoTipo = answers.processo_tipo ?? 'nacionalidade'
    const casos = Array.isArray(answers.caso)
      ? (answers.caso as string[]).join(', ')
      : (answers.caso as string | undefined) ?? 'Não indicado'

    const antepassadoMap: Record<string, string> = {
      pai_mae: 'Pai ou Mãe',
      avos: 'Avós',
      bisavos: 'Bisavós',
      trisavos: 'Trisavós ou mais distante',
      nao_sei: 'Incerto',
    }
    const casamentoMap: Record<string, string> = {
      menos_1_ano: 'Menos de 1 ano',
      '1_3_anos': 'Entre 1 e 3 anos',
      mais_3_anos: 'Mais de 3 anos',
    }
    const residenciaMap: Record<string, string> = {
      menos_2: 'Menos de 2 anos',
      '2_5_anos': 'Entre 2 e 5 anos',
      '5_ou_mais': '5 anos ou mais',
    }

    const context = `
Cliente: ${assessment.full_name ?? 'Utilizador anónimo'}
Email: ${assessment.email ?? 'Não indicado'}
Processo pretendido: ${processoTipo === 'nacionalidade' ? 'Obter Nacionalidade Portuguesa' : processoTipo}
Casos selecionados: ${casos}
Grau do antepassado português: ${antepassadoMap[answers.a1_antepassado as string] ?? (answers.a1_antepassado as string | undefined) ?? 'Não aplicável'}
Grau de parentesco: ${answers.a2_grau_parentesco ?? 'Não aplicável'}
Tempo de casamento com português(a): ${casamentoMap[answers.b1_casamento_anos as string] ?? 'Não aplicável'}
Tempo de residência em Portugal: ${residenciaMap[answers.d1_residencia_anos as string] ?? 'Não aplicável'}
Já teve advogado/processo anterior: ${answers.d3_ja_teve_advogado === 'sim' ? 'Sim' : (answers.d3_ja_teve_advogado === 'nao' ? 'Não' : 'Não aplicável')}
Tem familiares portugueses: ${answers.tem_familia_portuguesa ?? 'Não informado'}
Score de elegibilidade: ${result.score_numeric}/100 (categoria: ${result.score_category})
Visto/via mais adequado(a): ${topVisa?.visa_type_name ?? 'Nacionalidade Portuguesa'}
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

    // B03-A03: check response before parsing — rate limits / 5xx return non-JSON bodies
    if (!shortRes.ok) {
      throw new Error(`OpenAI short explanation error: ${shortRes.status}`)
    }
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

    // B03-A03: same guard for full explanation call
    if (!fullRes.ok) {
      throw new Error(`OpenAI full explanation error: ${fullRes.status}`)
    }
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

    // Trigger welcome_free email (best-effort — quiz result notification)
    const internalSecret = Deno.env.get('INTERNAL_SECRET') ?? ''
    const appUrl = Deno.env.get('APP_URL') ?? 'https://www.drimigrante.com'
    if (assessment.email) {
      try {
        await supabase.functions.invoke('send-email', {
          body: {
            trigger_key: 'welcome_free',
            recipient_email: assessment.email,
            variables: {
              name: assessment.full_name ?? 'Cliente',
              score_category: result.score_category ?? 'média',
              cta_link: `${appUrl}/checkout`,
            },
          },
          headers: { 'x-internal-secret': internalSecret },
        })
      } catch (emailErr) {
        console.warn('[generate-explanation] welcome_free email failed:', emailErr)
      }
    }

    return new Response(JSON.stringify({
      short: shortText,
      full: fullText,
      tokens_used: shortTokens + fullTokens,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    // B03-A07: never leak internal error details to the caller
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
