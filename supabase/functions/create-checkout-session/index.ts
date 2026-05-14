// create-checkout-session — Day 4
// Creates a Stripe Checkout Session for either one-time payment (€30) or recurring subscription (€4,90/mês)
// Called from CheckoutPage after the user is authenticated.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  plan: 'one_time' | 'recurring'
  assessmentId?: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

  if (!stripeKey) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify JWT and extract user
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Verify user via anon client with JWT
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: userError } = await anonClient.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { plan, assessmentId } = (await req.json()) as RequestBody

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

  // ── Price IDs from env (set in Supabase dashboard secrets) ──────────────────
  // STRIPE_PRICE_ONE_TIME  — one-time price (€30)
  // STRIPE_PRICE_RECURRING — recurring price (€4,90/mês)
  const priceId =
    plan === 'one_time'
      ? Deno.env.get('STRIPE_PRICE_ONE_TIME')
      : Deno.env.get('STRIPE_PRICE_RECURRING')

  if (!priceId) {
    // Fallback: create price inline if no env vars set (test mode convenience)
    // In production, always use env vars pointing to pre-created Stripe prices
    return new Response(
      JSON.stringify({ error: `Price ID not configured for plan: ${plan}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }

  try {
    // Fetch or create Stripe customer linked to this user
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let customerId = sub?.stripe_customer_id

    if (!customerId) {
      // Fetch user profile for name
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle()

      const customer = await stripe.customers.create({
        email: user.email ?? profile?.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { user_id: user.id },
      })
      customerId = customer.id
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: plan === 'recurring' ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout?cancelled=true`,
      metadata: {
        user_id: user.id,
        product_type: plan,
        assessment_id: assessmentId ?? '',
      },
      // Locale
      locale: 'pt',
      // Allow promotion codes
      allow_promotion_codes: true,
    }

    if (plan === 'recurring') {
      sessionParams.subscription_data = {
        metadata: {
          user_id: user.id,
          assessment_id: assessmentId ?? '',
        },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('create-checkout-session error:', err)
    // B03-A07: never leak internal error details to the caller
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
