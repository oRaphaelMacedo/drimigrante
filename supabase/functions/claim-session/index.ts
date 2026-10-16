// claim-session — entrada da Edge Function (P0 + W1-03)
//
// A lógica e as regras de elegibilidade do token estão em ./handler.ts
// (testado em ./handler.test.ts com Stripe e Supabase falsos).
//
// DEPLOY (ação do dono): depois das migrations 20261016000100 (RPC
// get_auth_user_id_by_email) e 20261016000400 (checkout_claims), com
//   `supabase functions deploy claim-session --no-verify-jwt`
// porque quem chama ainda não está autenticado.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'
import { resolveAppUrl } from '../_shared/origin.ts'
import { createClaimSessionHandler, type StripeClaimClient } from './handler.ts'

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const handler =
  stripeKey && supabaseUrl && serviceRoleKey
    ? createClaimSessionHandler({
      stripe: new Stripe(stripeKey, { apiVersion: '2023-10-16' }) as unknown as StripeClaimClient,
      supabase: createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
      resolveAppUrl: (req) => resolveAppUrl(req),
    })
    : null

serve((req) => {
  if (!handler) {
    console.error('claim-session: STRIPE_SECRET_KEY/SUPABASE_* ausentes')
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    })
  }
  return handler(req)
})
