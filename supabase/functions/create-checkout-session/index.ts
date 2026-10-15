// create-checkout-session — Day 4 + P0 funnel (2026-06-30)
// Creates a Stripe Checkout Session for either:
//  (a) ANON one-time payment (€30) — frictionless funnel: no account yet.
//      Body: { plan:'one_time', assessmentId, sessionId, email }
//      Validated server-side via get_anon_assessment(assessmentId, sessionId).
//      Account is created later by stripe-webhook on checkout.session.completed.
//  (b) AUTHENTICATED recurring subscription (€4,90/mês) — upsell, requires JWT
//      AND subscriptions.one_time_paid === true (sequential commercial model).
//      Subscription is capped at 12 cycles via subscription_data.cancel_at.
//
// NOTE (deploy): the anon branch requires this function to be deployed with
//   `supabase functions deploy create-checkout-session --no-verify-jwt`
// so that requests without a valid JWT reach the handler.

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
  // anon one_time only:
  sessionId?: string | null
  email?: string | null
}

// Subscription cap: 12 monthly cycles ≈ 365 days (decisão Raphael 2026-06-30)
const RECURRING_CAP_DAYS = 365

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
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

  if (!stripeKey) {
    return jsonResponse({ error: 'Stripe not configured' }, 500)
  }

  let bodyRaw: RequestBody
  try {
    bodyRaw = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }
  const { plan, assessmentId, sessionId, email } = bodyRaw

  // Service-role client (ignores RLS) — used for assessment validation + customer lookup.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // ── Resolve the authenticated user (if any) ──────────────────────────────────
  // The function may be deployed with --no-verify-jwt, so the JWT is optional here:
  // its presence selects the authenticated flow; its absence selects the anon flow.
  let user: { id: string; email?: string | null } | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user: authedUser } } = await anonClient.auth.getUser()
    if (authedUser) user = { id: authedUser.id, email: authedUser.email }
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })

  // ── Price IDs from env (set in Supabase dashboard secrets) ──────────────────
  // STRIPE_PRICE_ONE_TIME  — one-time price (€30)
  // STRIPE_PRICE_RECURRING — recurring price (€4,90/mês)
  const priceId =
    plan === 'one_time'
      ? Deno.env.get('STRIPE_PRICE_ONE_TIME')
      : Deno.env.get('STRIPE_PRICE_RECURRING')

  if (!priceId) {
    return jsonResponse({ error: `Price ID not configured for plan: ${plan}` }, 500)
  }

  try {
    // ───────────────────────────────────────────────────────────────────────────
    // FLOW (a): ANON one-time — no JWT, validate assessment ownership server-side
    // ───────────────────────────────────────────────────────────────────────────
    if (!user) {
      if (plan !== 'one_time') {
        // Only the one-time gateway product can be bought anonymously.
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
      if (!assessmentId || !sessionId || !email) {
        return jsonResponse(
          { error: 'Missing assessmentId, sessionId or email for anonymous checkout' },
          400,
        )
      }

      // Validate the assessment belongs to this anon session and is not yet linked.
      const { data: assessments, error: rpcError } = await supabase.rpc('get_anon_assessment', {
        p_id: assessmentId,
        p_session_id: sessionId,
      })
      if (rpcError || !assessments || (Array.isArray(assessments) && assessments.length === 0)) {
        return jsonResponse({ error: 'Assessment not found or already claimed' }, 403)
      }

      // Find or create a Stripe customer by email (no user_id yet).
      let customerId: string | undefined
      const existing = await stripe.customers.list({ email, limit: 1 })
      if (existing.data.length > 0) {
        customerId = existing.data[0].id
      } else {
        const customer = await stripe.customers.create({
          email,
          metadata: { assessment_id: assessmentId, session_id: sessionId },
        })
        customerId = customer.id
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/checkout?cancelled=true`,
        // metadata WITHOUT user_id (account created post-payment by stripe-webhook).
        metadata: {
          product_type: 'one_time',
          assessment_id: assessmentId,
          session_id: sessionId,
          email,
        },
        locale: 'pt',
        allow_promotion_codes: true,
      })

      return jsonResponse({ url: session.url, sessionId: session.id })
    }

    // ───────────────────────────────────────────────────────────────────────────
    // FLOW (b): AUTHENTICATED — recurring (upsell) or one_time fallback
    // ───────────────────────────────────────────────────────────────────────────

    // Sequential commercial model guard: €4,90/mês only sells to one_time payers.
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, one_time_paid')
      .eq('user_id', user.id)
      .maybeSingle()

    if (plan === 'recurring' && !sub?.one_time_paid) {
      return jsonResponse(
        { error: 'A subscrição mensal só está disponível após a compra da análise (€30).' },
        403,
      )
    }

    // Fetch or create Stripe customer linked to this user.
    let customerId = sub?.stripe_customer_id ?? undefined
    if (!customerId) {
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
      locale: 'pt',
      allow_promotion_codes: true,
    }

    if (plan === 'recurring') {
      // Cap the subscription at 12 cycles (≈365 days). Stripe cancels automatically
      // at this timestamp; cancellation before then keeps access until period end.
      const cancelAt = Math.floor(Date.now() / 1000) + RECURRING_CAP_DAYS * 24 * 60 * 60
      sessionParams.subscription_data = {
        cancel_at: cancelAt,
        metadata: {
          user_id: user.id,
          assessment_id: assessmentId ?? '',
        },
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return jsonResponse({ url: session.url, sessionId: session.id })
  } catch (err) {
    console.error('create-checkout-session error:', err)
    // B03-A07: never leak internal error details to the caller
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
