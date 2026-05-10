import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!stripeKey || !webhookSecret) {
    return new Response('Stripe not configured', { status: 500 })
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  try {
    const signature = req.headers.get('stripe-signature')
    if (!signature) throw new Error('No stripe-signature header')

    const body = await req.text()
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)

    // Log event
    await supabase.from('payment_events').insert({
      stripe_event_id: event.id,
      stripe_event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
      processed_at: new Date().toISOString(),
    })

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.user_id
        const productType = session.metadata?.product_type // 'one_time' | 'subscription'
        const assessmentId = session.metadata?.assessment_id ?? null

        if (!userId) {
          console.error('No user_id in session metadata')
          break
        }

        if (productType === 'one_time' || session.mode === 'payment') {
          // 1. Update subscription access flags
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            tier: 'one_time',
            one_time_paid: true,
            one_time_paid_at: new Date().toISOString(),
            one_time_payment_amount: session.amount_total ? session.amount_total / 100 : null,
            stripe_customer_id: session.customer as string,
            stripe_payment_intent_id: session.payment_intent as string,
            has_dashboard_access: true,
            has_full_analysis: true,
          }, { onConflict: 'user_id' })

          // 2. Record payment
          await supabase.from('payments').upsert({
            user_id: userId,
            assessment_id: assessmentId,
            stripe_payment_intent_id: session.payment_intent as string,
            stripe_customer_id: session.customer as string,
            product: 'one_time_analysis',
            amount_cents: session.amount_total ?? 3000,
            currency: session.currency ?? 'eur',
            status: 'succeeded',
            paid_at: new Date().toISOString(),
            metadata: { checkout_session_id: session.id },
          }, { onConflict: 'stripe_payment_intent_id' })

          // 3. Trigger welcome email
          await supabase.functions.invoke('send-email', {
            body: {
              trigger_key: 'payment_confirmed',
              user_id: userId,
              variables: {
                amount: `€${((session.amount_total ?? 0) / 100).toFixed(2)}`,
                dashboard_link: `${Deno.env.get('APP_URL')}/dashboard`,
              },
            },
          })
        }

        if (productType === 'subscription' || session.mode === 'subscription') {
          // 1. Update subscription access flags
          await supabase.from('subscriptions').upsert({
            user_id: userId,
            tier: 'recurring',
            recurring_active: true,
            recurring_started_at: new Date().toISOString(),
            recurring_amount: session.amount_total ? session.amount_total / 100 : null,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            has_dashboard_access: true,
            has_chat_access: true,
            has_full_analysis: true,
          }, { onConflict: 'user_id' })

          // 2. Record payment
          await supabase.from('payments').insert({
            user_id: userId,
            assessment_id: assessmentId,
            stripe_subscription_id: session.subscription as string,
            stripe_customer_id: session.customer as string,
            product: 'recurring_monthly',
            amount_cents: session.amount_total ?? 490,
            currency: session.currency ?? 'eur',
            status: 'succeeded',
            paid_at: new Date().toISOString(),
            metadata: { checkout_session_id: session.id },
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await supabase
          .from('subscriptions')
          .update({
            recurring_active: false,
            recurring_cancelled_at: new Date().toISOString(),
            has_chat_access: false,
            tier: 'one_time', // keeps one_time_paid access
          })
          .eq('stripe_subscription_id', subscription.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.warn('Payment failed for subscription:', invoice.subscription)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
