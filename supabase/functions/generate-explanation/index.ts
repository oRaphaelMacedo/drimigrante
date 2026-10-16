// generate-explanation — resumo (grátis) e análise completa (paga) do diagnóstico.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { assessment_id: uuid, session_id?: string }
// Posse: JWT do dono OU session_id do assessment ainda anônimo → senão 404.
// Respostas: 200 { status: 'ready', short } · 202 { status: 'deferred' | 'in_progress' }
//            404 not_found · 409 eligibility_not_computed · 502 ai_unavailable.
// A análise completa NUNCA volta na resposta: o front lê de assessment_results (RLS).
//
// CORS: allowlist de _shared/cors.ts (chamada pelo navegador, no fim do quiz).
// Observabilidade: _shared/observability.ts (logs JSON e Sentry com SENTRY_DSN_BACKEND).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, INTERNAL_SECRET, APP_URL,
//      AI_HOURLY_CAP (opcional; padrão 60 gerações/hora em toda a plataforma);
//      opcionais CORS_ALLOWED_ORIGINS, SENTRY_DSN_BACKEND, SENTRY_ENVIRONMENT, SENTRY_RELEASE.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { createGenerateExplanationHandler, parseHourlyCap } from './handler.ts'
import { createExplanationRepo } from './repo.ts'

const obs = createObservability('generate-explanation')
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
  log: obs.log,
  now: () => Date.now(),
  env: {
    openaiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined,
    serviceRoleKey,
    hourlyCap: parseHourlyCap(Deno.env.get('AI_HOURLY_CAP')),
    appUrl: Deno.env.get('APP_URL') ?? 'https://www.drimigrante.com',
  },
})

// Os erros 5xx do handler já saem pelo logger observado (explanation_failed...).
Deno.serve(
  withCors(obs.wrap(handler, { reportServerErrors: false }), {
    onRejected: (origin, method) => obs.log('warn', 'cors_rejected', { origin, method }),
  }),
)
