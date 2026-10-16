// generate-explanation — resumo (grátis) e análise completa (paga) do diagnóstico.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { assessment_id: uuid, session_id?: string }
// Posse: JWT do dono OU session_id do assessment ainda anônimo → senão 404.
// Respostas: 200 { status: 'ready', short } · 202 { status: 'deferred' | 'in_progress' }
//            404 not_found · 409 eligibility_not_computed · 502 ai_unavailable.
// A análise completa NUNCA volta na resposta: o front lê de assessment_results (RLS).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, INTERNAL_SECRET, APP_URL,
//      AI_HOURLY_CAP (opcional; padrão 60 gerações/hora em toda a plataforma).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/http.ts'
import { createGenerateExplanationHandler, parseHourlyCap } from './handler.ts'
import { createExplanationRepo } from './repo.ts'

const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const internalSecret = Deno.env.get('INTERNAL_SECRET') ?? ''

const handler = createGenerateExplanationHandler({
  repo: createExplanationRepo(supabase),
  fetch: (input, init) => fetch(input, init),
  async sendWelcomeEmail(body) {
    const { error } = await supabase.functions.invoke('send-email', {
      body,
      headers: { 'x-internal-secret': internalSecret },
    })
    return { error: error ?? null }
  },
  log: createLogger('generate-explanation'),
  now: () => Date.now(),
  env: {
    openaiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined,
    serviceRoleKey,
    hourlyCap: parseHourlyCap(Deno.env.get('AI_HOURLY_CAP')),
    appUrl: Deno.env.get('APP_URL') ?? 'https://www.drimigrante.com',
  },
})

serve(handler)
