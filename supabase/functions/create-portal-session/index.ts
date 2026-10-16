// create-portal-session — entrada da Edge Function (DI-052)
//
// Abre o Customer Portal do Stripe para o usuário logado (cancelar a assinatura
// de €4,90/mês, trocar o cartão, ver faturas). A lógica e o contrato de
// respostas estão em ./handler.ts (testados em ./handler_test.ts com Stripe e
// Supabase falsos — nenhuma chamada real).
//
// CORS: allowlist de _shared/cors.ts (chamada pela aba "Meu plano" da Conta).
// O return_url segue _shared/origin.ts (Origin permitida ou APP_URL).
// Observabilidade: _shared/observability.ts (5xx e exceções no Sentry, sem PII).
//
// JWT: verify_jwt fica no padrão (true) — não precisa de entrada no config.toml.
// O handler confere o token de novo e lê o customer só da linha do próprio usuário.
//
// AÇÕES DO DONO (nada disso foi feito por este código):
//  1. Ativar o Customer Portal no painel do Stripe (modo live e test):
//     https://dashboard.stripe.com/settings/billing/portal — permitir cancelar a
//     assinatura, atualizar a forma de pagamento e ver o histórico de faturas.
//  2. Deploy: `supabase functions deploy create-portal-session`
//     (secrets já usados pelo checkout: STRIPE_SECRET_KEY, SUPABASE_URL,
//     SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY e APP_URL).
// Sem o deploy, o botão "Gerenciar assinatura" mostra o cancelamento pelo suporte.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import Stripe from 'npm:stripe@14.14.0'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { resolveAppUrl } from '../_shared/origin.ts'
import { createPortalHandler, type StripePortalClient } from './handler.ts'

const obs = createObservability('create-portal-session')
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const handler =
  stripeKey && supabaseUrl && serviceRoleKey && anonKey
    ? createPortalHandler({
      stripe: new Stripe(stripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
      }) as unknown as StripePortalClient,
      supabase: createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      getUser: async (authHeader) => {
        const client = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { autoRefreshToken: false, persistSession: false },
        })
        const { data, error } = await client.auth.getUser()
        if (error || !data.user) return null
        return { id: data.user.id }
      },
      resolveAppUrl: (req) => resolveAppUrl(req),
    })
    : null

if (!handler) {
  obs.log('error', 'config_missing', {
    keys: 'STRIPE_SECRET_KEY/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY',
  })
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
