import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ChatRequest {
  assessment_id: string
  message: string
  user_id: string
  history?: { role: string; content: string }[]
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

    const { assessment_id, message, user_id, history = [] }: ChatRequest = await req.json()

    // Verify user has chat access
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('has_chat_access')
      .eq('user_id', user_id)
      .single()

    if (!sub?.has_chat_access) {
      return new Response(JSON.stringify({ error: 'Chat access required. Upgrade to access.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch assessment context
    let context = 'Nenhum contexto de avaliação encontrado.'
    if (assessment_id) {
      const { data: assessmentData } = await supabase
        .from('assessment_results')
        .select('score_category, suggested_visa_types')
        .eq('assessment_id', assessment_id)
        .single()
      
      if (assessmentData) {
        context = `Vistos sugeridos: ${JSON.stringify(assessmentData.suggested_visa_types)}
Categoria: ${assessmentData.score_category}`
      }
    }

    const systemContent = `You are Doutor Imigrante, a highly specialized virtual assistant helping people migrate to Portugal. Provide clear, accurate, and helpful information.
    
Contexto do Utilizador:
${context}
`

    const messages = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content: message },
    ]

    // Call OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.5, max_tokens: 1500, messages }),
    })

    const json = await response.json()
    const assistantContent = json.choices?.[0]?.message?.content ?? ''
    const tokensUsed = json.usage?.total_tokens ?? 0

    return new Response(JSON.stringify({ content: assistantContent, tokens_used: tokensUsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
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
