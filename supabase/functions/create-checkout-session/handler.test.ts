// Testes do create-checkout-session com Stripe e Supabase falsos
// (W1-03: DI-019, DI-021). Rodar: deno test supabase/functions

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { FakeStripe, FakeSupabase, type Row } from '../_shared/testing/fakes.ts'
import { resolveAppUrl } from '../_shared/origin.ts'
import { createCheckoutHandler, type StripeCheckoutClient } from './handler.ts'

const NOW = new Date('2026-10-16T12:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const ASSESSMENT_ID = '22222222-2222-4222-8222-222222222222'
const APP_URL = 'https://www.drimigrante.com'

function setup() {
  const db = new FakeSupabase({ now: () => NOW })
  db.tables.assessments = [{ id: ASSESSMENT_ID, session_id: 'anon-session-xyz', user_id: null }]
  const stripe = new FakeStripe()
  const tokens = new Map<string, { id: string; email: string }>()
  const handler = createCheckoutHandler({
    stripe: stripe as unknown as StripeCheckoutClient,
    supabase: db.client,
    getUser: (authHeader) => Promise.resolve(tokens.get(authHeader) ?? null),
    resolveAppUrl: (req) => resolveAppUrl(req, (key) => (key === 'APP_URL' ? APP_URL : undefined)),
    prices: { oneTime: 'price_onetime', recurring: 'price_recurring' },
    now: () => NOW,
  })
  const call = async (body: unknown, headers: Record<string, string> = {}) => {
    const res = await handler(
      new Request('http://localhost/functions/v1/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    )
    return { status: res.status, body: await res.json() }
  }
  /** Usuário autenticado: devolve o header Authorization a usar. */
  const login = (email: string, subscription: Row = {}) => {
    const user = db.addUser(email)
    Object.assign(db.rows('subscriptions').find((r) => r.user_id === user.id)!, subscription)
    const header = `Bearer jwt-${user.id}`
    tokens.set(header, { id: user.id, email: user.email })
    return { user, header }
  }
  return { db, stripe, call, login }
}

const anonBody = {
  plan: 'one_time',
  assessmentId: ASSESSMENT_ID,
  sessionId: 'anon-session-xyz',
  email: ' Pessoa@Example.com ',
}

Deno.test('plano inválido → 400', async () => {
  const { call } = setup()
  assertEquals((await call({ plan: 'vitalicio' })).status, 400)
  assertEquals((await call({ ...anonBody, email: 'sem-arroba' })).status, 400)
})

Deno.test('anônimo: sem customer antecipado, cancel_url em /results e metadata sem user_id', async () => {
  const { call, stripe } = setup()
  const res = await call(anonBody, { Origin: 'https://evil.com' })
  assertEquals(res.status, 200)
  assert(String(res.body.url).startsWith('https://checkout.stripe.test/'))

  assertEquals(stripe.createdSessions.length, 1)
  const params = stripe.createdSessions[0]
  assertEquals(params.mode, 'payment')
  assertEquals(params.customer, undefined)
  assertEquals(params.customer_email, 'pessoa@example.com')
  assertEquals(params.customer_creation, 'always')
  // Origin não permitida → APP_URL.
  assertEquals(params.cancel_url, `${APP_URL}/results?checkout=cancelled`)
  assertEquals(params.success_url, `${APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`)
  const metadata = params.metadata as Record<string, string>
  assertEquals(metadata.user_id, undefined)
  assertEquals(metadata.product_type, 'one_time')
  assertEquals(metadata.email, 'pessoa@example.com')
})

Deno.test('anônimo: Origin de preview/localhost permitida vira base dos return URLs', async () => {
  const { call, stripe } = setup()
  await call(anonBody, { Origin: 'http://localhost:34208' })
  assertEquals(stripe.createdSessions[0].cancel_url, 'http://localhost:34208/results?checkout=cancelled')
})

Deno.test('anônimo com assessment de outra sessão → 403', async () => {
  const { call, stripe } = setup()
  const res = await call({ ...anonBody, sessionId: 'outra-sessao' })
  assertEquals(res.status, 403)
  assertEquals(stripe.createdSessions.length, 0)
})

Deno.test('anônimo pedindo o plano recorrente → 401', async () => {
  const { call } = setup()
  assertEquals((await call({ plan: 'recurring' })).status, 401)
})

Deno.test('anônimo com e-mail que já tem acesso vigente → resposta genérica, sem nova cobrança', async () => {
  const { call, stripe, db } = setup()
  const user = db.addUser('pessoa@example.com')
  Object.assign(db.rows('subscriptions').find((r) => r.user_id === user.id)!, {
    one_time_paid: true,
    one_time_access_expires_at: new Date(NOW.getTime() + 5 * DAY_MS).toISOString(),
  })
  const res = await call(anonBody)
  assertEquals(res.status, 200)
  assertEquals(res.body, { status: 'email_sent', url: `${APP_URL}/login` })
  assertEquals(stripe.createdSessions.length, 0)
  assertEquals(db.otpRequests.length, 1)
  assertEquals(db.otpRequests[0].email, 'pessoa@example.com')
  // Nenhuma consulta a profiles (DI-002).
  assertEquals(db.queries.filter((q) => q.table === 'profiles').length, 0)
})

Deno.test('anônimo: falha na checagem de acesso vigente não bloqueia a venda', async () => {
  const { call, stripe, db } = setup()
  db.rpcErrors.get_auth_user_id_by_email = { message: 'function does not exist', code: '42883' }
  const res = await call(anonBody)
  assertEquals(res.status, 200)
  assertEquals(stripe.createdSessions.length, 1)
})

Deno.test('anônimo com e-mail cujo acesso expirou → pode comprar de novo', async () => {
  const { call, stripe, db } = setup()
  const user = db.addUser('pessoa@example.com')
  Object.assign(db.rows('subscriptions').find((r) => r.user_id === user.id)!, {
    one_time_paid: true,
    one_time_access_expires_at: new Date(NOW.getTime() - DAY_MS).toISOString(),
  })
  const res = await call(anonBody)
  assertEquals(res.status, 200)
  assertEquals(stripe.createdSessions.length, 1)
})

Deno.test('autenticado: one_time com acesso vigente → 409 already_active', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('cliente@example.com', {
    one_time_paid: true,
    one_time_access_expires_at: new Date(NOW.getTime() + DAY_MS).toISOString(),
  })
  const res = await call({ plan: 'one_time' }, { Authorization: header })
  assertEquals(res.status, 409)
  assertEquals(res.body.error, 'already_active')
  assertEquals(stripe.createdSessions.length, 0)
})

Deno.test('autenticado: recurring já ativo → 409; sem o €30 → 403', async () => {
  const { call, login, stripe } = setup()
  const active = login('assinante@example.com', { one_time_paid: true, recurring_active: true })
  const res = await call({ plan: 'recurring' }, { Authorization: active.header })
  assertEquals(res.status, 409)
  assertEquals(res.body.error, 'already_active')

  const fresh = login('novo@example.com')
  const denied = await call({ plan: 'recurring' }, { Authorization: fresh.header })
  assertEquals(denied.status, 403)
  assertEquals(denied.body.error, 'one_time_required')
  assertEquals(stripe.createdSessions.length, 0)
})

Deno.test('autenticado recurring: success_url /dashboard?subscribed=1 e sem subscription_data.cancel_at', async () => {
  const { call, login, stripe } = setup()
  const { user, header } = login('cliente@example.com', {
    one_time_paid: true,
    one_time_access_expires_at: new Date(NOW.getTime() - DAY_MS).toISOString(),
    stripe_customer_id: 'cus_existing',
  })
  const res = await call({ plan: 'recurring' }, { Authorization: header })
  assertEquals(res.status, 200)
  const params = stripe.createdSessions[0]
  assertEquals(params.mode, 'subscription')
  assertEquals(params.customer, 'cus_existing')
  assertEquals(params.customer_creation, undefined)
  assertEquals(params.success_url, `${APP_URL}/dashboard?subscribed=1`)
  assertEquals(params.cancel_url, `${APP_URL}/dashboard`)
  const subscriptionData = params.subscription_data as Record<string, unknown>
  assertEquals(subscriptionData.cancel_at, undefined)
  assertEquals((subscriptionData.metadata as Record<string, string>).user_id, user.id)
  assertEquals((params.metadata as Record<string, string>).user_id, user.id)
})

Deno.test('autenticado one_time sem customer: customer_email + customer_creation always', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('cliente@example.com')
  const res = await call({ plan: 'one_time', assessmentId: ASSESSMENT_ID }, { Authorization: header })
  assertEquals(res.status, 200)
  const params = stripe.createdSessions[0]
  assertEquals(params.customer, undefined)
  assertEquals(params.customer_email, 'cliente@example.com')
  assertEquals(params.customer_creation, 'always')
  assertEquals(params.cancel_url, `${APP_URL}/results?checkout=cancelled`)
})
