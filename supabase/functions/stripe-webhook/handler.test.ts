// Testes do stripe-webhook com Stripe e Supabase falsos (W1-03).
// Rodar: deno test supabase/functions

import {
  assert,
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { FakeStripe, FakeSupabase, type Row } from '../_shared/testing/fakes.ts'
import { addCalendarMonthsUtc } from '../_shared/payments.ts'
import {
  computeSubscriptionCap,
  createStripeWebhookHandler,
  type StripeEvent,
  type StripeWebhookClient,
  summarizeEvent,
} from './handler.ts'

const NOW = new Date('2026-10-16T12:00:00Z')
const NOW_S = Math.floor(NOW.getTime() / 1000)
const SECRET = 'whsec_test'
const ASSESSMENT_ID = '11111111-1111-4111-8111-111111111111'
const DAY_MS = 24 * 60 * 60 * 1000

let eventSeq = 0
function makeEvent(type: string, object: Row, created = NOW_S - 60): StripeEvent {
  eventSeq++
  return { id: `evt_test_${eventSeq}`, type, created, livemode: false, data: { object } }
}

function anonSession(overrides: Row = {}): Row {
  return {
    id: 'cs_test_anon1',
    object: 'checkout.session',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 3000,
    currency: 'eur',
    customer: 'cus_anon1',
    customer_email: 'buyer@example.com',
    customer_details: { email: 'Buyer@Example.com', name: 'Fulano de Tal', phone: '+351900000000' },
    payment_intent: 'pi_anon1',
    subscription: null,
    metadata: {
      product_type: 'one_time',
      assessment_id: ASSESSMENT_ID,
      session_id: 'anon-session-123',
      email: 'buyer@example.com',
    },
    ...overrides,
  }
}

function setup(opts: { emailDryRun?: boolean } = {}) {
  const db = new FakeSupabase({ now: () => NOW })
  db.tables.assessments = [{ id: ASSESSMENT_ID, session_id: 'anon-session-123', user_id: null }]
  const stripe = new FakeStripe()
  const handler = createStripeWebhookHandler({
    stripe: stripe as unknown as StripeWebhookClient,
    supabase: db.client,
    webhookSecret: SECRET,
    appUrl: 'https://app.test',
    internalSecret: 'internal-secret',
    emailDryRun: opts.emailDryRun,
    now: () => NOW,
  })
  const send = (event: StripeEvent, signature = stripe.signatureFor(SECRET)) =>
    handler(
      new Request('http://localhost/functions/v1/stripe-webhook', {
        method: 'POST',
        headers: { 'stripe-signature': signature },
        body: JSON.stringify(event),
      }),
    )
  return { db, stripe, send }
}

function subscriptionOf(db: FakeSupabase, userId: string): Row {
  const row = db.rows('subscriptions').find((r) => r.user_id === userId)
  assertExists(row)
  return row
}

/** Usuário que já pagou o €30 (acesso vigente até `expiresAt`). */
function seedOneTimeBuyer(db: FakeSupabase, expiresAt: string, extra: Row = {}) {
  const user = db.addUser('cliente@example.com')
  Object.assign(subscriptionOf(db, user.id), {
    tier: 'one_time',
    one_time_paid: true,
    one_time_access_expires_at: expiresAt,
    stripe_payment_intent_id: 'pi_onetime_seed',
    stripe_customer_id: 'cus_seed',
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
    ...extra,
  })
  return user
}

Deno.test('assinatura inválida → 400 e nada é gravado', async () => {
  const { db, send } = setup()
  const res = await send(makeEvent('checkout.session.completed', anonSession()), 'forjada')
  assertEquals(res.status, 400)
  assertEquals(db.rows('payment_events').length, 0)
  assertEquals(db.users.length, 0)
})

Deno.test('checkout anônimo pago: conta criada pela compra, assessment vinculado, chat liberado por 30 dias', async () => {
  const { db, send } = setup()
  const event = makeEvent('checkout.session.completed', anonSession())
  const res = await send(event)
  assertEquals(res.status, 200)

  assertEquals(db.users.length, 1)
  const user = db.users[0]
  assertEquals(user.email, 'buyer@example.com')
  assertEquals(user.app_metadata.checkout_session_id, 'cs_test_anon1')

  assertEquals(db.rows('assessments')[0].user_id, user.id)

  const sub = subscriptionOf(db, user.id)
  assertEquals(sub.one_time_paid, true)
  assertEquals(sub.has_chat_access, true) // DI-012
  assertEquals(sub.has_dashboard_access, true)
  assertEquals(sub.has_full_analysis, true)
  assertEquals(sub.tier, 'one_time')
  assertEquals(
    sub.one_time_access_expires_at,
    new Date(event.created * 1000 + 30 * DAY_MS).toISOString(),
  )

  const payments = db.rows('payments')
  assertEquals(payments.length, 1)
  assertEquals(payments[0].status, 'succeeded')
  assertEquals(payments[0].amount_cents, 3000)
  assertEquals(payments[0].stripe_payment_intent_id, 'pi_anon1')

  assertEquals(db.invocations.length, 1)
  assertEquals(db.invocations[0].name, 'send-email')
  assertEquals(db.invocations[0].headers?.['x-internal-secret'], 'internal-secret')

  // DI-002: nenhuma consulta a profiles para achar o comprador.
  assertEquals(db.queries.filter((q) => q.table === 'profiles').length, 0)
  assert(db.rpcCalls.some((c) => c.name === 'get_auth_user_id_by_email'))
})

Deno.test('payment_events guarda só o payload mínimo, sem PII', async () => {
  const { db, send } = setup()
  const event = makeEvent('checkout.session.completed', anonSession())
  await send(event)

  const logged = db.rows('payment_events')
  assertEquals(logged.length, 1)
  assertEquals(logged[0].status, 'processed')
  assertEquals(logged[0].stripe_object_id, 'cs_test_anon1')
  assertEquals(logged[0].amount, 30)
  assertEquals(logged[0].user_id, db.users[0].id)
  assertEquals(Object.keys(logged[0].payload as Row).sort(), [
    'amount',
    'currency',
    'id',
    'livemode',
    'object_id',
    'type',
  ])
  const serialized = JSON.stringify(logged[0])
  assert(!serialized.toLowerCase().includes('buyer@example.com'))
  assert(!serialized.includes('Fulano'))
  assertEquals(summarizeEvent(event).amount, 3000)
})

Deno.test('mesmo evento 2x → 1 linha em payments e 1 e-mail', async () => {
  const { db, send } = setup()
  const event = makeEvent('checkout.session.completed', anonSession())
  assertEquals((await send(event)).status, 200)
  const second = await send(event)
  assertEquals(second.status, 200)
  assertEquals((await second.json()).duplicate, true)
  assertEquals(db.rows('payments').length, 1)
  assertEquals(db.invocations.length, 1)
  assertEquals(db.users.length, 1)
})

Deno.test("evento com 'unpaid' não altera subscriptions; async_payment_succeeded concede", async () => {
  const { db, send } = setup()
  const pending = makeEvent('checkout.session.completed', anonSession({ payment_status: 'unpaid' }))
  assertEquals((await send(pending)).status, 200)
  assertEquals(db.users.length, 0)
  assertEquals(db.rows('subscriptions').length, 0)
  assertEquals(db.rows('payments').length, 0)

  const failed = makeEvent('checkout.session.async_payment_failed', anonSession({ payment_status: 'unpaid' }))
  assertEquals((await send(failed)).status, 200)
  assertEquals(db.rows('subscriptions').length, 0)

  const paid = makeEvent('checkout.session.async_payment_succeeded', anonSession())
  assertEquals((await send(paid)).status, 200)
  assertEquals(db.users.length, 1)
  assertEquals(subscriptionOf(db, db.users[0].id).one_time_paid, true)
})

Deno.test('DI-002: e-mail trocado em profiles não desvia a compra', async () => {
  const { db, send } = setup()
  // Atacante trocou o próprio profiles.email para o e-mail da vítima.
  const attacker = db.addUser('atacante@example.com')
  db.rows('profiles').find((p) => p.id === attacker.id)!.email = 'buyer@example.com'

  assertEquals((await send(makeEvent('checkout.session.completed', anonSession()))).status, 200)

  const buyer = db.users.find((u) => u.email === 'buyer@example.com')
  assertExists(buyer)
  assert(buyer.id !== attacker.id)
  assertEquals(subscriptionOf(db, buyer.id).one_time_paid, true)
  assertEquals(subscriptionOf(db, attacker.id).one_time_paid, undefined)
})

Deno.test('comprador já cadastrado é resolvido por auth.users, sem criar conta', async () => {
  const { db, send } = setup()
  const existing = db.addUser('buyer@example.com')
  assertEquals((await send(makeEvent('checkout.session.completed', anonSession()))).status, 200)
  assertEquals(db.users.length, 1)
  assertEquals(db.createUserCalls.length, 0)
  assertEquals(subscriptionOf(db, existing.id).has_chat_access, true)
})

Deno.test('erro no upsert de subscriptions → 500, evento liberado; reenvio gera 1 linha em payments', async () => {
  const { db, send } = setup()
  db.failNext('subscriptions', 'upsert')
  const event = makeEvent('checkout.session.completed', anonSession())

  const first = await send(event)
  assertEquals(first.status, 500)
  assertEquals((await first.json()).error, 'Internal server error')
  assertEquals(db.rows('payment_events').length, 0)

  const retry = await send(event)
  assertEquals(retry.status, 200)
  assertEquals(db.rows('payments').length, 1)
  assertEquals(db.rows('payment_events').length, 1)
})

Deno.test('erro no upsert de payments → 500', async () => {
  const { db, send } = setup()
  db.failNext('payments', 'upsert')
  assertEquals((await send(makeEvent('checkout.session.completed', anonSession()))).status, 500)
  assertEquals(db.rows('payment_events').length, 0)
})

Deno.test('falha do send-email → 500 (o Stripe reenvia) e o reenvio não duplica payments', async () => {
  const { db, send } = setup()
  db.invokeError = { message: 'Edge Function returned a non-2xx status code' }
  const event = makeEvent('checkout.session.completed', anonSession())
  assertEquals((await send(event)).status, 500)

  db.invokeError = null
  assertEquals((await send(event)).status, 200)
  assertEquals(db.rows('payments').length, 1)
})

Deno.test('evento ainda em processamento → 409; reivindicação abandonada é retomada', async () => {
  const { db, send } = setup()
  const event = makeEvent('checkout.session.completed', anonSession())
  db.rows('payment_events').push({
    stripe_event_id: event.id,
    status: 'processing',
    created_at: new Date(NOW.getTime() - 60_000).toISOString(),
  })
  assertEquals((await send(event)).status, 409)
  assertEquals(db.rows('payments').length, 0)

  db.rows('payment_events')[0].created_at = new Date(NOW.getTime() - 11 * 60_000).toISOString()
  assertEquals((await send(event)).status, 200)
  assertEquals(db.rows('payments').length, 1)
  assertEquals(db.rows('payment_events').length, 1)
  assertEquals(db.rows('payment_events')[0].status, 'processed')
})

Deno.test('linha legada de payment_events (status NULL) conta como já processada', async () => {
  const { db, send } = setup()
  const event = makeEvent('checkout.session.completed', anonSession())
  db.rows('payment_events').push({ stripe_event_id: event.id, status: null })
  const res = await send(event)
  assertEquals(res.status, 200)
  assertEquals((await res.json()).duplicate, true)
  assertEquals(db.users.length, 0)
})

Deno.test('charge.refunded total revoga o €30; reembolso parcial não', async () => {
  const { db, send } = setup()
  await send(makeEvent('checkout.session.completed', anonSession()))
  const userId = db.users[0].id

  const partial = makeEvent('charge.refunded', {
    id: 'ch_1',
    payment_intent: 'pi_anon1',
    refunded: false,
    amount: 3000,
    amount_refunded: 1000,
    currency: 'eur',
  })
  assertEquals((await send(partial)).status, 200)
  assertEquals(subscriptionOf(db, userId).one_time_paid, true)
  assertEquals(db.rows('payments')[0].status, 'succeeded')

  const full = makeEvent('charge.refunded', {
    id: 'ch_1',
    payment_intent: 'pi_anon1',
    refunded: true,
    amount: 3000,
    amount_refunded: 3000,
    currency: 'eur',
  })
  assertEquals((await send(full)).status, 200)
  const sub = subscriptionOf(db, userId)
  assertEquals(sub.one_time_paid, false)
  assertEquals(sub.has_dashboard_access, false)
  assertEquals(sub.has_chat_access, false)
  assertEquals(sub.has_full_analysis, false)
  assertEquals(sub.tier, 'free')
  assertEquals(sub.one_time_access_expires_at, NOW.toISOString())
  assertEquals(db.rows('payments')[0].status, 'refunded')
  assertEquals(db.rows('payments')[0].refunded_at, NOW.toISOString())
})

Deno.test('charge.dispute.created revoga o €30 e marca o pagamento como disputed', async () => {
  const { db, send } = setup()
  await send(makeEvent('checkout.session.completed', anonSession()))
  const userId = db.users[0].id

  const dispute = makeEvent('charge.dispute.created', {
    id: 'dp_1',
    charge: 'ch_1',
    payment_intent: 'pi_anon1',
    amount: 3000,
    currency: 'eur',
  })
  assertEquals((await send(dispute)).status, 200)
  assertEquals(subscriptionOf(db, userId).one_time_paid, false)
  assertEquals(subscriptionOf(db, userId).has_chat_access, false)
  assertEquals(db.rows('payments')[0].status, 'disputed')
})

function seedRecurringCheckout(db: FakeSupabase, stripe: FakeStripe) {
  const user = seedOneTimeBuyer(db, new Date(NOW.getTime() + 10 * DAY_MS).toISOString())
  const startDate = Date.UTC(2026, 0, 31, 10, 30, 0) / 1000 // 31/jan/2026 10:30 UTC
  stripe.subscriptionsStore.set('sub_1', {
    id: 'sub_1',
    status: 'active',
    cancel_at: null,
    start_date: startDate,
    billing_cycle_anchor: startDate,
    latest_invoice: { id: 'in_1', payment_intent: 'pi_sub_first' },
  })
  const session = {
    id: 'cs_test_sub1',
    object: 'checkout.session',
    mode: 'subscription',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 490,
    currency: 'eur',
    customer: 'cus_seed',
    payment_intent: null,
    subscription: 'sub_1',
    metadata: { user_id: user.id, product_type: 'recurring', assessment_id: '' },
  }
  return { user, startDate, session }
}

Deno.test('DI-021: checkout da assinatura aplica cancel_at = início + 12 meses; reprocessar não muda', async () => {
  const { db, stripe, send } = setup()
  const { user, startDate, session } = seedRecurringCheckout(db, stripe)
  const expectedCap = Date.UTC(2027, 0, 31, 10, 30, 0) / 1000

  assertEquals((await send(makeEvent('checkout.session.completed', session))).status, 200)
  assertEquals(stripe.updateCalls.length, 1)
  assertEquals(stripe.updateCalls[0].params.cancel_at, expectedCap)
  assertEquals(stripe.updateCalls[0].params.proration_behavior, 'none')

  const sub = subscriptionOf(db, user.id)
  assertEquals(sub.recurring_active, true)
  assertEquals(sub.tier, 'recurring')
  assertEquals(sub.has_chat_access, true)
  assertEquals(sub.stripe_subscription_id, 'sub_1')
  assertEquals(sub.recurring_cancel_at, new Date(expectedCap * 1000).toISOString())
  assertEquals(sub.recurring_started_at, new Date(startDate * 1000).toISOString())
  assertEquals(sub.one_time_paid, true) // o €30 continua registrado

  const payments = db.rows('payments')
  assertEquals(payments.length, 1)
  assertEquals(payments[0].product, 'recurring_monthly')
  assertEquals(payments[0].stripe_payment_intent_id, 'pi_sub_first')

  // Reprocessar (novo evento da mesma sessão) e o subscription.updated gerado
  // pelo próprio cap não chamam o Stripe de novo nem duplicam o pagamento.
  assertEquals((await send(makeEvent('checkout.session.completed', session))).status, 200)
  const capped = stripe.subscriptionsStore.get('sub_1')!
  assertEquals((await send(makeEvent('customer.subscription.updated', { ...capped }))).status, 200)
  assertEquals(stripe.updateCalls.length, 1)
  assertEquals(db.rows('payments').length, 1)
  assertEquals(subscriptionOf(db, user.id).recurring_cancel_at, new Date(expectedCap * 1000).toISOString())
})

Deno.test('DI-021: cancelamento já agendado antes do limite não é adiado', async () => {
  const { db, stripe, send } = setup()
  const { session, startDate } = seedRecurringCheckout(db, stripe)
  const earlier = startDate + 40 * 24 * 3600
  stripe.subscriptionsStore.get('sub_1')!.cancel_at = earlier
  assertEquals((await send(makeEvent('checkout.session.completed', session))).status, 200)
  assertEquals(stripe.updateCalls.length, 0)
})

Deno.test('customer.subscription.updated: ativa sem cancel_at reaplica o limite; cancelada revoga', async () => {
  const { db, stripe, send } = setup()
  const { user, session } = seedRecurringCheckout(db, stripe)
  await send(makeEvent('checkout.session.completed', session))
  assertEquals(stripe.updateCalls.length, 1)

  // "Renovar" no portal remove o cancel_at → o webhook recoloca o limite.
  const renewed = { ...stripe.subscriptionsStore.get('sub_1')!, cancel_at: null }
  stripe.subscriptionsStore.get('sub_1')!.cancel_at = null
  assertEquals((await send(makeEvent('customer.subscription.updated', renewed))).status, 200)
  assertEquals(stripe.updateCalls.length, 2)
  assert(subscriptionOf(db, user.id).recurring_cancel_at)

  const canceled = { ...stripe.subscriptionsStore.get('sub_1')!, status: 'canceled' }
  assertEquals((await send(makeEvent('customer.subscription.updated', canceled))).status, 200)
  const sub = subscriptionOf(db, user.id)
  assertEquals(sub.recurring_active, false)
  assertEquals(sub.tier, 'one_time')
  assertEquals(sub.has_chat_access, true) // o €30 ainda está nos 30 dias
})

Deno.test('invoice.payment_failed só revoga na última tentativa', async () => {
  const { db, send } = setup()
  const user = seedOneTimeBuyer(db, new Date(NOW.getTime() - DAY_MS).toISOString(), {
    tier: 'recurring',
    recurring_active: true,
    stripe_subscription_id: 'sub_9',
  })
  const invoice = {
    id: 'in_9',
    subscription: 'sub_9',
    customer: 'cus_seed',
    billing_reason: 'subscription_cycle',
    amount_paid: 0,
    amount_due: 490,
    currency: 'eur',
    payment_intent: 'pi_renew_9',
  }

  const retrying = makeEvent('invoice.payment_failed', { ...invoice, next_payment_attempt: NOW_S + 3 * 86400 })
  assertEquals((await send(retrying)).status, 200)
  assertEquals(subscriptionOf(db, user.id).recurring_active, true)
  assertEquals(subscriptionOf(db, user.id).has_chat_access, true)

  const final = makeEvent('invoice.payment_failed', { ...invoice, next_payment_attempt: null })
  assertEquals((await send(final)).status, 200)
  const sub = subscriptionOf(db, user.id)
  assertEquals(sub.recurring_active, false)
  assertEquals(sub.has_chat_access, false) // €30 já expirado
  assertEquals(sub.tier, 'one_time')
})

Deno.test('invoice.payment_succeeded de renovação registra 1 pagamento e reativa', async () => {
  const { db, send } = setup()
  const user = seedOneTimeBuyer(db, new Date(NOW.getTime() - DAY_MS).toISOString(), {
    tier: 'one_time',
    recurring_active: false,
    has_chat_access: false,
    stripe_subscription_id: 'sub_9',
  })
  const invoice = {
    id: 'in_10',
    subscription: 'sub_9',
    customer: 'cus_seed',
    billing_reason: 'subscription_cycle',
    amount_paid: 490,
    currency: 'eur',
    payment_intent: 'pi_renew_10',
    next_payment_attempt: null,
    status_transitions: { paid_at: NOW_S - 30 },
  }
  assertEquals((await send(makeEvent('invoice.payment_succeeded', invoice))).status, 200)
  assertEquals((await send(makeEvent('invoice.payment_succeeded', invoice))).status, 200)
  assertEquals(db.rows('payments').length, 1)
  assertEquals(subscriptionOf(db, user.id).recurring_active, true)
  assertEquals(subscriptionOf(db, user.id).has_chat_access, true)

  // A primeira cobrança fica com o checkout.session.completed.
  const first = makeEvent('invoice.payment_succeeded', {
    ...invoice,
    id: 'in_first',
    billing_reason: 'subscription_create',
    payment_intent: 'pi_first',
  })
  assertEquals((await send(first)).status, 200)
  assertEquals(db.rows('payments').length, 1)
})

Deno.test('disputa em mensalidade cancela a assinatura no Stripe e revoga o recorrente', async () => {
  const { db, stripe, send } = setup()
  const { user, session } = seedRecurringCheckout(db, stripe)
  await send(makeEvent('checkout.session.completed', session))

  const dispute = makeEvent('charge.dispute.created', {
    id: 'dp_2',
    charge: 'ch_sub',
    payment_intent: 'pi_sub_first',
    amount: 490,
    currency: 'eur',
  })
  assertEquals((await send(dispute)).status, 200)
  assertEquals(stripe.cancelCalls, ['sub_1'])
  const sub = subscriptionOf(db, user.id)
  assertEquals(sub.recurring_active, false)
  assertEquals(sub.one_time_paid, true) // o €30 não foi contestado
  assertEquals(db.rows('payments')[0].status, 'disputed')
})

Deno.test('disputa em mensalidade de assinatura já removida no Stripe não gera reenvio infinito', async () => {
  const { db, stripe, send } = setup()
  const { user, session } = seedRecurringCheckout(db, stripe)
  await send(makeEvent('checkout.session.completed', session))
  stripe.subscriptionsStore.delete('sub_1')

  const dispute = makeEvent('charge.dispute.created', {
    id: 'dp_3',
    payment_intent: 'pi_sub_first',
    amount: 490,
    currency: 'eur',
  })
  assertEquals((await send(dispute)).status, 200)
  assertEquals(stripe.cancelCalls.length, 0)
  assertEquals(subscriptionOf(db, user.id).recurring_active, false)
})

Deno.test('customer.subscription.deleted mantém o chat só se o €30 estiver vigente', async () => {
  const { db, send } = setup()
  const user = seedOneTimeBuyer(db, new Date(NOW.getTime() - DAY_MS).toISOString(), {
    tier: 'recurring',
    recurring_active: true,
    stripe_subscription_id: 'sub_7',
  })
  const deleted = makeEvent('customer.subscription.deleted', {
    id: 'sub_7',
    status: 'canceled',
    cancel_at: null,
    canceled_at: NOW_S - 10,
    ended_at: NOW_S - 10,
    start_date: NOW_S - 90 * 86400,
  })
  assertEquals((await send(deleted)).status, 200)
  const sub = subscriptionOf(db, user.id)
  assertEquals(sub.recurring_active, false)
  assertEquals(sub.has_chat_access, false)
  assertEquals(sub.recurring_cancelled_at, new Date((NOW_S - 10) * 1000).toISOString())
})

// ── subscription_cancelled (DI-077) ──────────────────────────────────────────

function seedRecurringBuyer(db: FakeSupabase) {
  return seedOneTimeBuyer(db, new Date(NOW.getTime() + 10 * DAY_MS).toISOString(), {
    tier: 'recurring',
    recurring_active: true,
    stripe_subscription_id: 'sub_9',
  })
}

function deletedEvent() {
  return makeEvent('customer.subscription.deleted', {
    id: 'sub_9',
    status: 'canceled',
    cancel_at: null,
    canceled_at: NOW_S - 10,
    ended_at: NOW_S - 10,
    start_date: NOW_S - 90 * 86400,
  })
}

const cancelledInvocations = (db: FakeSupabase) =>
  db.invocations.filter((i) => (i.body as Row | undefined)?.trigger_key === 'subscription_cancelled')

Deno.test('DI-077: subscription_cancelled não sai em dry-run (padrão)', async () => {
  const { db, send } = setup()
  seedRecurringBuyer(db)
  assertEquals((await send(deletedEvent())).status, 200)
  assertEquals(cancelledInvocations(db).length, 0)
})

Deno.test('DI-077: com o envio ligado, customer.subscription.deleted manda um subscription_cancelled', async () => {
  const { db, send } = setup({ emailDryRun: false })
  const user = seedRecurringBuyer(db)
  assertEquals((await send(deletedEvent())).status, 200)
  const calls = cancelledInvocations(db)
  assertEquals(calls.length, 1)
  assertEquals(calls[0].name, 'send-email')
  assertEquals(calls[0].headers?.['x-internal-secret'], 'internal-secret')
  assertEquals(calls[0].body, {
    trigger_key: 'subscription_cancelled',
    user_id: user.id,
    variables: { dashboard_link: 'https://app.test/dashboard', dedupe_key: 'subscription_cancelled:sub_9' },
  })
  assertEquals(subscriptionOf(db, user.id).recurring_active, false)
})

Deno.test('DI-077: subscription_cancelled já registrado não é reenviado; falha no e-mail não reenvia o evento', async () => {
  const already = setup({ emailDryRun: false })
  seedRecurringBuyer(already.db)
  already.db.tables.email_send_log = [
    { id: 'log-1', status: 'sent', variables_used: { dedupe_key: 'subscription_cancelled:sub_9' } },
  ]
  assertEquals((await already.send(deletedEvent())).status, 200)
  assertEquals(cancelledInvocations(already.db).length, 0)

  const failing = setup({ emailDryRun: false })
  const user = seedRecurringBuyer(failing.db)
  failing.db.invokeError = { message: 'Edge Function returned a non-2xx status code' }
  const res = await failing.send(deletedEvent())
  // 200: o acesso já foi atualizado; o aviso por e-mail não justifica reprocessar.
  assertEquals(res.status, 200)
  assertEquals(subscriptionOf(failing.db, user.id).recurring_active, false)
  assertEquals(failing.db.rows('payment_events')[0].status, 'processed')
})

Deno.test('payment_confirmed leva o valor no formato pt-BR (€30,00)', async () => {
  const { db, send } = setup()
  await send(makeEvent('checkout.session.completed', anonSession()))
  const body = db.invocations[0].body as { trigger_key: string; variables: Record<string, string> }
  assertEquals(body.trigger_key, 'payment_confirmed')
  assertEquals(body.variables.amount, '€30,00')
})

Deno.test('computeSubscriptionCap usa a âncora de cobrança + 12 meses de calendário', () => {
  const feb29 = Date.UTC(2028, 1, 29, 8, 0, 0) / 1000
  assertEquals(
    computeSubscriptionCap({ id: 's', status: 'active', cancel_at: null, start_date: feb29 }),
    Date.UTC(2029, 1, 28, 8, 0, 0) / 1000,
  )
  assertEquals(addCalendarMonthsUtc(Date.UTC(2026, 2, 31) / 1000, 1), Date.UTC(2026, 3, 30) / 1000)
})
