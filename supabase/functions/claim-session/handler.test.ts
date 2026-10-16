// Testes do claim-session com Stripe e Supabase falsos (W1-03: DI-002, DI-022).
// Rodar: deno test supabase/functions

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { FakeStripe, FakeSupabase, type Row } from '../_shared/testing/fakes.ts'
import { CLAIM_TOKEN_WINDOW_SECONDS, createClaimSessionHandler, type StripeClaimClient } from './handler.ts'

const NOW = new Date('2026-10-16T12:00:00Z')
const NOW_S = Math.floor(NOW.getTime() / 1000)
const SESSION_ID = 'cs_test_a1B2c3D4e5'

function paidAnonSession(overrides: Row = {}): Row {
  return {
    id: SESSION_ID,
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    created: NOW_S - 120,
    customer_email: 'buyer@example.com',
    customer_details: { email: 'Buyer@Example.com' },
    metadata: { product_type: 'one_time', assessment_id: 'a', session_id: 's', email: 'buyer@example.com' },
    ...overrides,
  }
}

function setup(session: Row | null = paidAnonSession()) {
  const db = new FakeSupabase({ now: () => NOW })
  const stripe = new FakeStripe()
  if (session) stripe.sessionsStore.set(String(session.id), session)
  const handler = createClaimSessionHandler({
    stripe: stripe as unknown as StripeClaimClient,
    supabase: db.client,
    resolveAppUrl: () => 'https://app.test',
    now: () => NOW,
  })
  const claim = async (sessionId: unknown = SESSION_ID) => {
    const res = await handler(
      new Request('http://localhost/functions/v1/claim-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      }),
    )
    return { status: res.status, body: await res.json() }
  }
  return { db, stripe, claim }
}

/** Conta criada pelo webhook para esta compra (ainda sem login). */
function seedBuyerFromWebhook(db: FakeSupabase, extra: Record<string, unknown> = {}) {
  return db.addUser('buyer@example.com', {
    app_metadata: { signup_source: 'checkout', checkout_session_id: SESSION_ID },
    ...extra,
  })
}

Deno.test('session_id ausente ou fora do formato → 400', async () => {
  const { claim, db } = setup()
  assertEquals((await claim(null)).status, 400)
  assertEquals((await claim(123)).status, 400)
  assertEquals((await claim('cs_test_../../x')).status, 400)
  assertEquals((await claim('pi_123')).status, 400)
  assertEquals(db.generateLinkCalls.length, 0)
})

Deno.test('sessão inexistente → 404', async () => {
  const { claim } = setup(null)
  assertEquals((await claim()).status, 404)
})

Deno.test('pagamento não concluído → 403 e nada é emitido', async () => {
  const { claim, db } = setup(paidAnonSession({ payment_status: 'unpaid' }))
  const res = await claim()
  assertEquals(res.status, 403)
  assertEquals(db.generateLinkCalls.length, 0)
  assertEquals(db.otpRequests.length, 0)
})

Deno.test('compra anônima nova → token; a segunda chamada com o mesmo session_id não devolve token', async () => {
  const { claim, db } = setup()
  const user = seedBuyerFromWebhook(db)

  const first = await claim()
  assertEquals(first.status, 200)
  assertEquals(first.body.status, 'token')
  assert(typeof first.body.token_hash === 'string' && first.body.token_hash.length > 0)
  assertEquals(db.rows('checkout_claims').length, 1)
  assertEquals(db.rows('checkout_claims')[0].user_id, user.id)

  const second = await claim()
  assertEquals(second.status, 200)
  assertEquals(second.body.status, 'email_sent')
  assertEquals(second.body.token_hash, undefined)
  assertEquals(db.generateLinkCalls.length, 1)
  assertEquals(db.otpRequests.length, 1)
  assertEquals(db.otpRequests[0].email, 'buyer@example.com')
  assertEquals(
    (db.otpRequests[0].options as Record<string, unknown>).emailRedirectTo,
    'https://app.test/auth/callback',
  )
})

Deno.test('webhook ainda não chegou: cria a conta marcada com a compra e devolve token', async () => {
  const { claim, db } = setup()
  const res = await claim()
  assertEquals(res.body.status, 'token')
  assertEquals(db.users.length, 1)
  assertEquals(db.users[0].app_metadata.checkout_session_id, SESSION_ID)
})

Deno.test('sessão com mais de 24h → sem token (link por e-mail)', async () => {
  const { claim, db } = setup(paidAnonSession({ created: NOW_S - CLAIM_TOKEN_WINDOW_SECONDS - 1 }))
  seedBuyerFromWebhook(db)
  const res = await claim()
  assertEquals(res.body.status, 'email_sent')
  assertEquals(db.generateLinkCalls.length, 0)
  assertEquals(db.rows('checkout_claims').length, 0)
})

Deno.test('sessão autenticada (metadata.user_id) → sem token', async () => {
  const { claim, db } = setup(
    paidAnonSession({ metadata: { product_type: 'one_time', user_id: 'user-x', assessment_id: '' } }),
  )
  seedBuyerFromWebhook(db)
  const res = await claim()
  assertEquals(res.body.status, 'email_sent')
  assertEquals(db.generateLinkCalls.length, 0)
})

Deno.test('sessão de assinatura → sem token', async () => {
  const { claim, db } = setup(paidAnonSession({ mode: 'subscription', metadata: { product_type: 'recurring' } }))
  seedBuyerFromWebhook(db)
  assertEquals((await claim()).body.status, 'email_sent')
  assertEquals(db.generateLinkCalls.length, 0)
})

Deno.test('anti-takeover: conta preexistente (não criada por esta compra) → só link por e-mail', async () => {
  const { claim, db } = setup()
  db.addUser('buyer@example.com') // conta antiga, sem checkout_session_id desta compra
  const res = await claim()
  assertEquals(res.body.status, 'email_sent')
  assertEquals(db.generateLinkCalls.length, 0)
  assertEquals(db.createUserCalls.length, 0)
})

Deno.test('conta criada pela compra mas que já fez login → só link por e-mail', async () => {
  const { claim, db } = setup()
  seedBuyerFromWebhook(db, { last_sign_in_at: new Date(NOW.getTime() - 60_000).toISOString() })
  assertEquals((await claim()).body.status, 'email_sent')
  assertEquals(db.generateLinkCalls.length, 0)
})

Deno.test('falha no generateLink → 500 e a reivindicação é liberada', async () => {
  const { claim, db } = setup()
  seedBuyerFromWebhook(db)
  db.generateLinkError = { message: 'boom' }
  assertEquals((await claim()).status, 500)
  assertEquals(db.rows('checkout_claims').length, 0)

  db.generateLinkError = null
  assertEquals((await claim()).body.status, 'token')
})

Deno.test('limite de envio do Auth (429) ainda responde email_sent', async () => {
  const { claim, db } = setup(paidAnonSession({ created: NOW_S - CLAIM_TOKEN_WINDOW_SECONDS - 10 }))
  seedBuyerFromWebhook(db)
  db.otpError = { message: 'For security purposes, you can only request this after 30 seconds', status: 429 }
  const res = await claim()
  assertEquals(res.status, 200)
  assertEquals(res.body.status, 'email_sent')
})

Deno.test('DI-002: claim-session não consulta profiles', async () => {
  const { claim, db } = setup()
  seedBuyerFromWebhook(db)
  await claim()
  await claim()
  assertEquals(db.queries.filter((q) => q.table === 'profiles').length, 0)
  assert(db.rpcCalls.every((c) => c.name === 'get_auth_user_id_by_email'))
})
