// stripe-webhook — entrada da Edge Function (W1-03)
//
// A lógica está em ./handler.ts (testada em ./handler.test.ts com Stripe e
// Supabase falsos). Aqui só ligamos os clientes reais.
//
// Sem CORS (_shared/cors.ts → withoutCors): quem chama é o Stripe, nunca o navegador.
// Observabilidade (DI-082): cada evento gera uma linha JSON {fn, outcome, status...};
// com SENTRY_DSN_BACKEND, toda resposta 5xx (evento que o Stripe vai reenviar), toda
// exceção e o 400 de assinatura inválida (evento 'webhook_signature_invalid': quase
// sempre STRIPE_WEBHOOK_SECRET errado, e aí NENHUM pagamento libera acesso) vão para o
// Sentry. Reenvio de evento e concessão manual de acesso: docs/operacao/runbook-pagamentos.md.
//
// DEPLOY (ação do dono, nesta ordem):
//  1. migrations 20261016000100 (resolver de e-mail) e 20261016000150
//     (chat no €30 + subscriptions.recurring_cancel_at) aplicadas antes;
//  2. `supabase functions deploy stripe-webhook --no-verify-jwt` (o Stripe não
//     manda JWT; a autenticidade vem da assinatura stripe-signature);
//  3. no endpoint do Stripe, assinar também: checkout.session.async_payment_succeeded,
//     checkout.session.async_payment_failed, charge.refunded,
//     charge.dispute.created e customer.subscription.updated.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import Stripe from 'npm:stripe@14.14.0'
import { withoutCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { getAppUrl } from '../_shared/origin.ts'
import { createStripeWebhookHandler, type StripeWebhookClient } from './handler.ts'

const obs = createObservability('stripe-webhook')
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const handler =
  stripeKey && webhookSecret && supabaseUrl && serviceRoleKey
    ? createStripeWebhookHandler({
      stripe: new Stripe(stripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
      }) as unknown as StripeWebhookClient,
      supabase: createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      webhookSecret,
      appUrl: getAppUrl(),
      internalSecret: Deno.env.get('INTERNAL_SECRET') ?? '',
    })
    : null

if (!handler) {
  obs.log('error', 'config_missing', {
    keys: 'STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY',
  })
}

// 400 COM stripe-signature = o Stripe chamou e a assinatura não bateu com o segredo.
// Sem o cabeçalho (varredura de bots) fica só a linha de log 4xx.
const alertOnInvalidSignature = (req: Request, res: Response) =>
  res.status === 400 && req.method === 'POST' && req.headers.has('stripe-signature')
    ? 'webhook_signature_invalid'
    : null

Deno.serve(
  withoutCors(
    obs.wrap(
      (req) =>
        handler
          ? handler(req)
          : new Response(JSON.stringify({ error: 'Stripe not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
      { alertOn: alertOnInvalidSignature },
    ),
  ),
)
