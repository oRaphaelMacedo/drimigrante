// chat-completion — Streaming SSE proxy to OpenAI
// Returns text/event-stream chunks to the client, persists final assistant message at end.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError(401, 'Unauthorized')

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) return jsonError(401, 'Unauthorized')

    const body = await req.json()
    const { message, assessmentId } = body
    if (!message || !assessmentId) return jsonError(400, 'message and assessmentId are required')

    const { data: assessment, error: assessmentError } = await supabaseClient
      .from('assessments')
      .select('id, answers')
      .eq('id', assessmentId)
      .eq('user_id', user.id)
      .single()
    if (assessmentError || !assessment) return jsonError(404, 'Assessment not found')

    const { data: assessmentResult } = await supabaseClient
      .from('assessment_results')
      .select('score_numeric, score_category, suggested_visa_types')
      .eq('assessment_id', assessmentId)
      .single()

    const { data: history } = await supabaseClient
      .from('messages')
      .select('role, content')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: true })
      .limit(20)

    const historyMessages = (history ?? []).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    await supabaseClient.from('messages').insert({
      assessment_id: assessmentId,
      user_id: user.id,
      role: 'user',
      content: message,
    })

    const systemPrompt = buildSystemPrompt(assessment, assessmentResult)
    const openaiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiKey) throw new Error('OPENAI_API_KEY not configured')

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: message },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    })

    if (!openAIResponse.ok || !openAIResponse.body) {
      throw new Error(`OpenAI error: ${openAIResponse.status}`)
    }

    let fullText = ''
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = openAIResponse.body!.getReader()
        let buffer = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const data = line.slice(5).trim()
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode('event: done\ndata: [DONE]\n\n'))
                continue
              }
              try {
                const json = JSON.parse(data)
                const delta = json.choices?.[0]?.delta?.content
                if (delta) {
                  fullText += delta
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
                  )
                }
              } catch {
                // ignore malformed chunks
              }
            }
          }

          // Persist full assistant reply after stream completes
          await supabaseClient.from('messages').insert({
            assessment_id: assessmentId,
            user_id: user.id,
            role: 'assistant',
            content: fullText,
          })

          controller.close()
        } catch (err) {
          console.error('stream error:', err)
          controller.error(err)
        }
      },
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('chat-completion error:', error)
    return jsonError(500, 'Internal server error')
  }
})

function jsonError(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function buildSystemPrompt(
  assessment: { answers: unknown },
  result: { score_numeric: number | null; score_category: string | null; suggested_visa_types: unknown } | null,
): string {
  return `Você é o Doutor Imigrante, um assistente especializado em imigração para Portugal.
Está a ajudar um utilizador com base no seu diagnóstico de elegibilidade.

DADOS DO DIAGNÓSTICO:
- Score de elegibilidade: ${result?.score_numeric ?? 'não calculado'}
- Categoria: ${result?.score_category ?? 'não calculada'}
- Vistos sugeridos: ${JSON.stringify(result?.suggested_visa_types ?? [])}
- Respostas do quiz: ${JSON.stringify(assessment.answers ?? {})}

INSTRUÇÕES:
- Responda sempre em português (pt-PT)
- Seja preciso, empático e profissional
- Baseie as suas respostas no contexto do diagnóstico acima
- Não garanta resultados jurídicos — informe e oriente
- Se não souber algo, diga claramente e sugira consultar um advogado`
}
