// create-checkout-session — entrada da Edge Function (Day 4 + P0 + W1-03)
//
// A lógica e o contrato de respostas estão em ./handler.ts (testados em
// ./handler.test.ts com Stripe e Supabase falsos).
//
// CORS: allowlist de _shared/cors.ts (chamada pelo resultado do quiz, pelo /checkout
// e pelo painel). Os success_url/cancel_url continuam vindo de _shared/origin.ts.
// Observabilidade: _shared/observability.ts — 5xx e exceções vão para o Sentry com
// SENTRY_DSN_BACKEND. Runbook: docs/operacao/runbook-pagamentos.md.
//
// Apresentação do Checkout (DI-087, ./checkout-options.ts), secrets opcionais:
//   STRIPE_LOCALE                 idioma do Checkout (padrão pt-BR; valor inválido
//                                 volta para pt-BR e gera o aviso config_invalid)
//   STRIPE_ALLOW_PROMOTION_CODES  true só durante campanha com códigos criados no
//                                 painel do Stripe (padrão: campo de código oculto)
// O texto ao lado do botão de pagar vem da oferta (espelho de src/lib/offer.ts).
//
// DEPLOY (ação do dono): depois da migration 20261016000100 (usa o RPC
// get_auth_user_id_by_email), com
//   `supabase functions deploy create-checkout-session --no-verify-jwt`
// para que chamadas anônimas (sem JWT) cheguem ao handler.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import Stripe from 'npm:stripe@14.14.0'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { resolveAppUrl } from '../_shared/origin.ts'
import { resolveCheckoutPresentation } from './checkout-options.ts'
import { createCheckoutHandler, type StripeCheckoutClient } from './handler.ts'

const obs = createObservability('create-checkout-session')
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const { presentation, warnings } = resolveCheckoutPresentation((key) => Deno.env.get(key))
// Só a chave e o padrão aplicado: o valor lido não vai para o log.
for (const warning of warnings) obs.log('warn', 'config_invalid', { ...warning })

const handler =
  stripeKey && supabaseUrl && serviceRoleKey
    ? createCheckoutHandler({
      stripe: new Stripe(stripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
      }) as unknown as StripeCheckoutClient,
      supabase: createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      getUser: async (authHeader) => {
        const client = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data } = await client.auth.getUser()
        return data.user ? { id: data.user.id, email: data.user.email } : null
      },
      resolveAppUrl: (req) => resolveAppUrl(req),
      // STRIPE_PRICE_ONE_TIME — €30 · STRIPE_PRICE_RECURRING — €4,90/mês
      prices: {
        oneTime: Deno.env.get('STRIPE_PRICE_ONE_TIME'),
        recurring: Deno.env.get('STRIPE_PRICE_RECURRING'),
      },
      presentation,
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
