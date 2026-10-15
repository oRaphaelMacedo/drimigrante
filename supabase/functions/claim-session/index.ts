// claim-session — P0 funnel (2026-06-30)
//
// Post-payment auto-login for the frictionless funnel. After the anonymous
// one-time checkout, /success calls this with the Stripe Checkout session_id.
// We verify the payment with Stripe, resolve the buyer email, and mint a
// one-shot magic-link token. The frontend then exchanges it via
// supabase.auth.verifyOtp({ type:'magiclink', token_hash }) to sign in.
//
// NOTE (deploy): must be deployed with
//   `supabase functions deploy claim-session --no-verify-jwt`
// because the caller is unauthenticated at this point.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  session_id: string
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  if (!body.session_id || typeof body.session_id !== 'string') {
    return jsonResponse({ error: 'Missing session_id' }, 400)
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    // 1. Retrieve and verify the Checkout Session.
    const session = await stripe.checkout.sessions.retrieve(body.session_id)
    if (session.payment_status !== 'paid') {
      return jsonResponse({ error: 'Payment not completed' }, 403)
    }

    // 2. Resolve buyer email (customer_details first, then customer_email fallback).
    const rawEmail = session.customer_details?.email ?? session.customer_email ?? null
    if (!rawEmail) {
      return jsonResponse({ error: 'No email on checkout session' }, 400)
    }
    const email = rawEmail.trim().toLowerCase()

    // 3. Anti-takeover: the checkout email is NOT verified, so we only auto-login
    //    accounts that have never signed in (i.e. created by this purchase).
    //    Accounts already used before get a magic link by email instead — the
    //    owner of the inbox proves ownership. This also makes each session_id
    //    single-use: after the first verifyOtp, last_sign_in_at is set.
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (profile?.id) {
      const { data: existing } = await admin.auth.admin.getUserById(profile.id)
      if (existing?.user?.last_sign_in_at) {
        const appUrl = Deno.env.get('APP_URL') ?? ''
        const { error: otpErr } = await admin.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/callback` },
        })
        if (otpErr) throw otpErr
        return jsonResponse({ status: 'email_sent' })
      }
    }

    // 4. Mint a one-shot magic-link token for this email.
    //    The account is created by stripe-webhook; if the webhook hasn't landed
    //    yet, generateLink for a magiclink also provisions the user, so this is
    //    resilient to ordering.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })
    if (linkErr) throw linkErr
    const tokenHash = (linkData as { properties?: { hashed_token?: string } })
      .properties?.hashed_token
    if (!tokenHash) {
      throw new Error('generateLink returned no hashed_token')
    }

    return jsonResponse({ status: 'token', token_hash: tokenHash })
  } catch (err) {
    console.error('claim-session error:', err)
    // Do not leak internal details to the caller.
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
