// claim-session — entrada da Edge Function (P0 + W1-03)
//
// A lógica e as regras de elegibilidade do token estão em ./handler.ts
// (testado em ./handler.test.ts com Stripe e Supabase falsos).
//
// CORS: allowlist de _shared/cors.ts (chamada pela página de sucesso do checkout).
// Observabilidade: _shared/observability.ts — 5xx e exceções vão para o Sentry com
// SENTRY_DSN_BACKEND. Runbook: docs/operacao/runbook-pagamentos.md.
//
// DEPLOY (ação do dono): depois das migrations 20261016000100 (RPC
// get_auth_user_id_by_email) e 20261016000400 (checkout_claims), com
//   `supabase functions deploy claim-session --no-verify-jwt`
// porque quem chama ainda não está autenticado.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import Stripe from 'npm:stripe@14.14.0'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { resolveAppUrl } from '../_shared/origin.ts'
import { createClaimSessionHandler, type StripeClaimClient } from './handler.ts'

const obs = createObservability('claim-session')
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const handler =
  stripeKey && supabaseUrl && serviceRoleKey
    ? createClaimSessionHandler({
      stripe: new Stripe(stripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
      }) as unknown as StripeClaimClient,
      supabase: createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      resolveAppUrl: (req) => resolveAppUrl(req),
    })
    : null

if (!handler) {
  obs.log('error', 'config_missing', { keys: 'STRIPE_SECRET_KEY/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY' })
}

Deno.serve(
  withCors(
    obs.wrap((req) =>
      handler
        ? handler(req)
        : new Response(JSON.stringify({ error: 'internal_error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
    ),
    { onRejected: (origin, method) => obs.log('warn', 'cors_rejected', { origin, method }) },
  ),
)
