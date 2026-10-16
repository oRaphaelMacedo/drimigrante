// stripe-webhook — entrada da Edge Function (W1-03)
//
// A lógica está em ./handler.ts (testada em ./handler.test.ts com Stripe e
// Supabase falsos). Aqui só ligamos os clientes reais.
//
// DEPLOY (ação do dono, nesta ordem):
//  1. migrations 20261016000100 (resolver de e-mail) e 20261016000150
//     (chat no €30 + subscriptions.recurring_cancel_at) aplicadas antes;
//  2. `supabase functions deploy stripe-webhook --no-verify-jwt` (o Stripe não
//     manda JWT; a autenticidade vem da assinatura stripe-signature);
//  3. no endpoint do Stripe, assinar também: checkout.session.async_payment_succeeded,
//     checkout.session.async_payment_failed, charge.refunded,
//     charge.dispute.created e customer.subscription.updated.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { getAppUrl } from '../_shared/origin.ts'
import { createStripeWebhookHandler, type StripeWebhookClient } from './handler.ts'

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const handler =
  stripeKey && webhookSecret && supabaseUrl && serviceRoleKey
    ? createStripeWebhookHandler({
      stripe: new Stripe(stripeKey, { apiVersion: '2023-10-16' }) as unknown as StripeWebhookClient,
      supabase: createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      webhookSecret,
      appUrl: getAppUrl(),
      internalSecret: Deno.env.get('INTERNAL_SECRET') ?? '',
    })
    : null

serve((req) => {
  if (!handler) {
    console.error('stripe-webhook: STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/SUPABASE_* ausentes')
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return handler(req)
})
