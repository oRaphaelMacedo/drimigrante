// create-checkout-session — entrada da Edge Function (Day 4 + P0 + W1-03)
//
// A lógica e o contrato de respostas estão em ./handler.ts (testados em
// ./handler.test.ts com Stripe e Supabase falsos).
//
// DEPLOY (ação do dono): depois da migration 20261016000100 (usa o RPC
// get_auth_user_id_by_email), com
//   `supabase functions deploy create-checkout-session --no-verify-jwt`
// para que chamadas anônimas (sem JWT) cheguem ao handler.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { resolveAppUrl } from '../_shared/origin.ts'
import { createCheckoutHandler, type StripeCheckoutClient } from './handler.ts'

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const handler =
  stripeKey && supabaseUrl && serviceRoleKey
    ? createCheckoutHandler({
      stripe: new Stripe(stripeKey, { apiVersion: '2023-10-16' }) as unknown as StripeCheckoutClient,
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
    })
    : null

serve((req) => {
  if (!handler) {
    console.error('create-checkout-session: STRIPE_SECRET_KEY/SUPABASE_* ausentes')
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    })
  }
  return handler(req)
})
