// Testes do create-portal-session com Stripe e Supabase falsos (DI-052).
// Nenhuma chamada de rede. Rodar: deno test --no-config supabase/functions

import { assert, assertEquals } from '../_shared/test-asserts.ts'
import { FakeSupabase, type Row } from '../_shared/testing/fakes.ts'
import { resolveAppUrl } from '../_shared/origin.ts'
import { createPortalHandler, PORTAL_RETURN_PATH, type PortalSessionCreateParams, type StripePortalClient } from './handler.ts'

const APP_URL = 'https://www.drimigrante.com'

class FakePortalStripe implements StripePortalClient {
  calls: PortalSessionCreateParams[] = []
  failWith: unknown = null
  url: string | null = 'https://billing.stripe.test/p/session_123'

  billingPortal = {
    sessions: {
      create: (params: PortalSessionCreateParams) => {
        this.calls.push(params)
        if (this.failWith) return Promise.reject(this.failWith)
        return Promise.resolve({ id: 'bps_123', url: this.url })
      },
    },
  }
}

function setup() {
  const db = new FakeSupabase()
  const stripe = new FakePortalStripe()
  const tokens = new Map<string, { id: string }>()
  const handler = createPortalHandler({
    stripe,
    supabase: db.client,
    getUser: (authHeader) => Promise.resolve(tokens.get(authHeader) ?? null),
    resolveAppUrl: (req) => resolveAppUrl(req, (key) => (key === 'APP_URL' ? APP_URL : undefined)),
  })
  const call = async (headers: Record<string, string> = {}, method = 'POST') => {
    const res = await handler(
      new Request('http://localhost/functions/v1/create-portal-session', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method === 'POST' ? '{}' : undefined,
      }),
    )
    const text = await res.text()
    let body: Record<string, unknown> | string | null = null
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      body = text
    }
    // deno-lint-ignore no-explicit-any
    return { status: res.status, body: body as any }
  }
  const login = (email: string, subscription: Row = {}) => {
    const user = db.addUser(email)
    Object.assign(db.rows('subscriptions').find((r) => r.user_id === user.id)!, subscription)
    const header = `Bearer jwt-${user.id}`
    tokens.set(header, { id: user.id })
    return { user, header }
  }
  return { db, stripe, call, login }
}

Deno.test('sem Authorization → 401 e o Stripe não é chamado', async () => {
  const { call, stripe } = setup()
  const res = await call()
  assertEquals(res.status, 401)
  assertEquals(res.body.error, 'unauthorized')
  assertEquals(stripe.calls.length, 0)
})

Deno.test('token inválido (ou só a anon key sem usuário) → 401', async () => {
  const { call, stripe } = setup()
  assertEquals((await call({ Authorization: 'Bearer token-que-nao-existe' })).status, 401)
  assertEquals((await call({ Authorization: 'Basic abc' })).status, 401)
  assertEquals(stripe.calls.length, 0)
})

Deno.test('conta sem customer no Stripe → 404 customer_not_found', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('sem-customer@example.com', { stripe_customer_id: null })
  const res = await call({ Authorization: header })
  assertEquals(res.status, 404)
  assertEquals(res.body.error, 'customer_not_found')
  assertEquals(stripe.calls.length, 0)
})

Deno.test('customer com formato inválido no banco não é enviado ao Stripe → 404', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('estranho@example.com', { stripe_customer_id: 'qualquer-coisa' })
  assertEquals((await call({ Authorization: header })).status, 404)
  assertEquals(stripe.calls.length, 0)
})

Deno.test('assinante → 200 com a url do portal; customer vem do banco e o retorno vai para a aba Meu plano', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('assinante@example.com', {
    stripe_customer_id: 'cus_ABC123def',
    recurring_active: true,
  })
  const res = await call({ Authorization: header, Origin: 'https://evil.com' })
  assertEquals(res.status, 200)
  assertEquals(res.body.url, 'https://billing.stripe.test/p/session_123')
  assertEquals(stripe.calls.length, 1)
  assertEquals(stripe.calls[0].customer, 'cus_ABC123def')
  // Origin não permitida → APP_URL (sem open redirect).
  assertEquals(stripe.calls[0].return_url, `${APP_URL}${PORTAL_RETURN_PATH}`)
  assertEquals(stripe.calls[0].locale, 'pt-BR')
})

Deno.test('Origin permitida (localhost) vira o return_url', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('dev@example.com', { stripe_customer_id: 'cus_DEV0001' })
  await call({ Authorization: header, Origin: 'http://localhost:33401' })
  assertEquals(stripe.calls[0].return_url, `http://localhost:33401${PORTAL_RETURN_PATH}`)
})

Deno.test('Stripe recusa (ex.: portal não ativado) → 502 portal_unavailable, sem detalhes', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('assinante@example.com', { stripe_customer_id: 'cus_ABC123def' })
  stripe.failWith = Object.assign(new Error('No configuration provided and your live mode default configuration has not been created.'), {
    type: 'StripeInvalidRequestError',
    statusCode: 400,
  })
  const res = await call({ Authorization: header })
  assertEquals(res.status, 502)
  assertEquals(res.body, { error: 'portal_unavailable' })
})

Deno.test('falha ao ler a assinatura → 500 internal_error', async () => {
  const { call, login, db } = setup()
  const { header } = login('assinante@example.com', { stripe_customer_id: 'cus_ABC123def' })
  db.failNext('subscriptions', 'select')
  const res = await call({ Authorization: header })
  assertEquals(res.status, 500)
  assertEquals(res.body, { error: 'internal_error' })
})

Deno.test('sessão sem url https → 502', async () => {
  const { call, login, stripe } = setup()
  const { header } = login('assinante@example.com', { stripe_customer_id: 'cus_ABC123def' })
  stripe.url = null
  assertEquals((await call({ Authorization: header })).status, 502)
})

Deno.test('GET → 405; OPTIONS → 200', async () => {
  const { call } = setup()
  assertEquals((await call({}, 'GET')).status, 405)
  const options = await call({}, 'OPTIONS')
  assert(options.status === 200)
})
