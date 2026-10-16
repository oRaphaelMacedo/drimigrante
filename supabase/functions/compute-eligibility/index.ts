// compute-eligibility — calcula score e regras de elegibilidade de um assessment.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { assessment_id: uuid, session_id?: string }
// Posse: JWT do dono OU session_id do assessment ainda anônimo → senão 404.
// Resposta: 200 { result } só com colunas de score (nunca as análises de IA).
// Score: _shared/quiz-engine.ts, o mesmo cálculo do front (DI-006). Query com erro → 500
// sem gravar nada. Para corrigir resultados antigos: scripts/backfill-scores.mjs (dono).
//
// CORS: allowlist de _shared/cors.ts (chamada pelo navegador, no fim do quiz).
// Observabilidade: _shared/observability.ts (logs JSON e Sentry com SENTRY_DSN_BACKEND).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; opcionais APP_URL, CORS_ALLOWED_ORIGINS,
//      SENTRY_DSN_BACKEND, SENTRY_ENVIRONMENT, SENTRY_RELEASE.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { createComputeEligibilityHandler } from './handler.ts'
import { createEligibilityRepo } from './repo.ts'

const obs = createObservability('compute-eligibility')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const handler = createComputeEligibilityHandler({
  repo: createEligibilityRepo(supabase),
  log: obs.log,
  now: () => Date.now(),
  env: { serviceRoleKey },
})

Deno.serve(
  withCors(obs.wrap(handler, { reportServerErrors: false }), {
    onRejected: (origin, method) => obs.log('warn', 'cors_rejected', { origin, method }),
  }),
)
