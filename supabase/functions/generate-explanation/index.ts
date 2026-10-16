// generate-explanation — resumo (grátis) e análise completa (paga) do diagnóstico.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { assessment_id: uuid, session_id?: string, mode?: 'short' | 'full' }  (padrão: 'short')
//
// mode 'short' — fim do quiz (useQuiz). Gera SÓ o resumo grátis (+ welcome_free, no máximo um).
//   Posse: JWT do dono OU session_id do assessment ainda anônimo → senão 404.
//   200 { status: 'ready', short, cached? }
// mode 'full' — AnalysisPage, sob demanda, depois do pagamento (DI-018).
//   Exige JWT do dono (session_id não vale) e has_active_access(dono, 'full_analysis').
//   200 { status: 'ready', cached? } — o texto NUNCA volta na resposta: o front lê pela RPC
//   get_full_analysis (DI-016). 401 auth_required · 403 payment_required.
// Comuns: 202 { status: 'deferred' (disjuntor AI_HOURLY_CAP) | 'in_progress' (outra geração) }
//         400 invalid_request · 404 not_found · 409 eligibility_not_computed
//         502/503 ai_unavailable · 500 internal_error.
//
// ORDEM DE RELEASE: o modo full chama a RPC has_active_access, criada em
// 20261020000000_full_analysis_paywall.sql → aplicar essa migration ANTES do deploy desta
// versão, e publicar o front novo (AnalysisPage que pede o modo full) DEPOIS do deploy.
// Quem pagou antes desta versão e ainda não tem a análise completa recebe-a ao abrir a página.
//
// CORS: allowlist de _shared/cors.ts (chamada pelo navegador: fim do quiz e AnalysisPage).
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
