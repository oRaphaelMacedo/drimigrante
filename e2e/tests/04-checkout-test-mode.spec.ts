import { test as anonTest, expect, type Page, type Route } from '@playwright/test'
import { test as authTest } from '../fixtures/auth'
import { CheckoutPage } from '../pages/CheckoutPage'

// ─────────────────────────────────────────────────────────────────────────────
// Compra em 1 clique (DI-011, DI-026, DI-032, DI-033).
//
// Os testes anônimos são herméticos: NADA chega ao Stripe nem ao Supabase.
// create-checkout-session, claim-session, compute-eligibility e o RPC
// upsert_anon_assessment são mockados com page.route, e `guardNetwork` derruba
// qualquer outra chamada ao Supabase (REST, Auth, Storage, Edge Functions —
// inclusive leituras), o Stripe e o analytics de terceiros. O resultado do quiz
// é semeado no localStorage antes do app carregar.
// ─────────────────────────────────────────────────────────────────────────────

const QUIZ_KEY = 'dr_imigrante_quiz_result'
const ASSESSMENT_ID = '00000000-0000-0000-0000-000000000001'
const NEW_ASSESSMENT_ID = '00000000-0000-0000-0000-0000000000a2'
const SESSION_ID = 'cs_test_e2eMock0001'

type Seed = { assessmentId?: string | null; consent?: 'granted' | 'denied' }

async function seedQuiz(page: Page, { assessmentId = ASSESSMENT_ID, consent = 'denied' }: Seed = {}) {
  await page.addInitScript(
    ([key, id, consentValue]) => {
      // Só na primeira carga da aba: recarregar a página mantém o que o app gravou.
      if (sessionStorage.getItem('__e2e_seeded')) return
      sessionStorage.setItem('__e2e_seeded', '1')
      localStorage.setItem('di_cookie_consent', consentValue as string)
      localStorage.setItem(
        key as string,
        JSON.stringify({
          sessionId: 'e2e-session-0001-anon',
          assessmentId: id,
          answers: { processo_tipo: 'nacionalidade', tempo_residencia: '5_mais' },
          score: { total: 50, max: 100, percentage: 50, category: 'media' },
          visas: [{ code: 'D7', name: 'Visto D7', match: 'possible', reason: 'teaser' }],
          leadInfo: { fullName: 'E2E Tester', email: 'e2e-anon@drimigrante.com' },
          completedAt: new Date().toISOString(),
        }),
      )
    },
    [QUIZ_KEY, assessmentId, consent],
  )
}

const SUPABASE_PATHS = /\/(rest|auth|storage|functions|realtime)\/v1\//
const THIRD_PARTY = /stripe\.com|posthog|googletagmanager|google-analytics|sentry\.io|facebook\.net|connect\.facebook/

/**
 * Rede de segurança: nenhuma chamada ao Supabase (de produção ou não), ao
 * Stripe ou ao analytics passa sem mock. Rotas registradas depois (os mocks de
 * cada teste) têm prioridade sobre esta.
 */
async function guardNetwork(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (url.includes('.supabase.co') || SUPABASE_PATHS.test(url) || THIRD_PARTY.test(url)) {
      return route.abort()
    }
    return route.continue()
  })
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

/** create-checkout-session mockado: devolve a página de sucesso com um session_id falso. */
async function mockCreateCheckout(page: Page, bodies: unknown[] = []) {
  await page.route('**/functions/v1/create-checkout-session', async (route) => {
    bodies.push(route.request().postDataJSON())
    const origin = new URL(page.url()).origin
    await json(route, { url: `${origin}/checkout/success?session_id=${SESSION_ID}`, sessionId: SESSION_ID })
  })
}

async function mockClaim(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route('**/functions/v1/claim-session', handler)
}

async function analyticsLog(page: Page, name: string): Promise<number> {
  return page.evaluate(
    (eventName) =>
      ((window as unknown as { __DI_ANALYTICS_DEBUG__?: Array<{ name: string }> }).__DI_ANALYTICS_DEBUG__ ?? []).filter(
        (e) => e.name === eventName,
      ).length,
    name,
  )
}

// Compra anônima: rede mockada e guardada (ver guardNetwork).
anonTest.describe('compra anônima', () => {
  anonTest.beforeEach(async ({ page }) => {
    await guardNetwork(page)
  })

  // ── Results → Stripe → sucesso ──────────────────────────────────────────────

  anonTest('Results → Stripe direto (funil anônimo) → página de sucesso sem session_id na URL', async ({ page }) => {
    await seedQuiz(page)
    const bodies: unknown[] = []
    await mockCreateCheckout(page, bodies)
    await mockClaim(page, (route) => json(route, { status: 'email_sent' }))

    await page.goto('/results')
    await expect(page.getByTestId('results-cta-paywall')).toBeVisible()
    await page.getByTestId('results-cta-paywall').click()

    await expect(page).toHaveURL(/\/checkout\/success/)
    await expect(page.getByTestId('checkout-success')).toBeVisible()
    await expect(page.getByTestId('checkout-success')).toHaveAttribute('data-state', 'email_sent')
    expect(bodies[0]).toEqual({
      plan: 'one_time',
      assessmentId: ASSESSMENT_ID,
      sessionId: 'e2e-session-0001-anon',
      email: 'e2e-anon@drimigrante.com',
    })

    await expect(page).not.toHaveURL(/session_id/)
    const text = await page.locator('body').innerText()
    expect(text).not.toContain('Ref:')
    expect(text).not.toContain(SESSION_ID)
    await expect(page.getByText('e2•••@drimigrante.com')).toBeVisible()
  })

  anonTest('Results sem assessmentId salva o diagnóstico de novo e segue para o pagamento', async ({ page }) => {
    await seedQuiz(page, { assessmentId: null })
    const bodies: Array<{ assessmentId?: string }> = []
    await mockCreateCheckout(page, bodies)
    await mockClaim(page, (route) => json(route, { status: 'email_sent' }))
    await page.route('**/functions/v1/compute-eligibility', (route) => json(route, {}))
    await page.route('**/rest/v1/rpc/upsert_anon_assessment', (route) =>
      json(route, { id: NEW_ASSESSMENT_ID, session_id: 'e2e-session-0001-anon', user_id: null }),
    )

    await page.goto('/results')
    await page.getByTestId('results-cta-paywall').click()

    await expect(page).toHaveURL(/\/checkout\/success/)
    expect(bodies[0]?.assessmentId).toBe(NEW_ASSESSMENT_ID)
    await expect(page.getByText(/refaça o quiz/i)).toHaveCount(0)
  })

  anonTest.describe('no celular (375×812)', () => {
    anonTest.use({ viewport: { width: 375, height: 812 } })

    anonTest('?checkout=cancelled em /results mostra o aviso neutro acima da dobra', async ({ page }) => {
      await seedQuiz(page)
      await page.goto('/results?checkout=cancelled')

      const notice = page.getByTestId('checkout-cancelled-notice')
      await expect(notice).toBeVisible()
      await expect(notice).toContainText('Nada foi cobrado')
      const box = await notice.boundingBox()
      expect(box && box.y + box.height).toBeLessThanOrEqual(812)
      await expect(page).not.toHaveURL(/checkout=cancelled/)
    })

    anonTest('/checkout?cancelled mostra o banner e o CTA acima da dobra', async ({ page }) => {
      await seedQuiz(page)
      const checkout = new CheckoutPage(page)
      await checkout.gotoCancelled()

      await expect(checkout.cancelledBanner).toBeVisible()
      await expect(checkout.cancelledBanner).toContainText('Pagamento não concluído. Nada foi cobrado.')
      const banner = await checkout.cancelledBanner.boundingBox()
      const cta = await checkout.submit.boundingBox()
      expect(banner && banner.y + banner.height).toBeLessThanOrEqual(812)
      expect(cta && cta.y + cta.height).toBeLessThanOrEqual(812)
    })

    anonTest('function abortada: mensagem em português e "Tentar novamente" perto do CTA', async ({ page }) => {
      await seedQuiz(page)
      await page.route('**/functions/v1/create-checkout-session', (route) => route.abort('failed'))
      const checkout = new CheckoutPage(page)
      await checkout.goto()
      await checkout.pay()

      await expect(checkout.error).toBeVisible()
      await expect(checkout.error).toHaveAttribute('role', 'alert')
      await expect(checkout.error).toContainText(/Não conseguimos falar com o servidor|sem internet/)
      const cta = await checkout.submit.boundingBox()
      const retry = await checkout.retry.boundingBox()
      expect(cta && retry).toBeTruthy()
      expect(retry!.y - (cta!.y + cta!.height)).toBeLessThanOrEqual(120)
      await expect(page).toHaveURL(/\/checkout$/)
    })
  })

  // ── /checkout ───────────────────────────────────────────────────────────────

  anonTest('/checkout anônimo com dados locais: 1 clique, sem passar pelo /login', async ({ page }) => {
    await seedQuiz(page)
    const bodies: unknown[] = []
    await mockCreateCheckout(page, bodies)
    await mockClaim(page, (route) => json(route, { status: 'email_sent' }))

    const checkout = new CheckoutPage(page)
    await checkout.goto()
    await expect(checkout.planOneTime).toBeVisible()
    await expect(page.getByText('Será pedido para entrar')).toHaveCount(0)
    await checkout.pay()

    await expect(page).toHaveURL(/\/checkout\/success/)
    expect(bodies).toHaveLength(1)
    expect(page.url()).not.toContain('/login')
  })

  anonTest('/checkout sem dados locais nem login mostra o estado vazio', async ({ page }) => {
    const checkout = new CheckoutPage(page)
    await checkout.goto()
    await expect(checkout.emptyState).toBeVisible()
    await expect(page.getByRole('link', { name: 'Fazer o quiz grátis' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Já paguei, entrar' })).toBeVisible()
  })

  // ── Página de sucesso ───────────────────────────────────────────────────────

  anonTest('claim-session lento (12 s) não manda para /login', async ({ page }) => {
    anonTest.setTimeout(45_000)
    await seedQuiz(page)
    await mockClaim(page, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 12_000))
      await json(route, { status: 'email_sent' })
    })

    await page.goto(`/checkout/success?session_id=${SESSION_ID}`)
    await expect(page.getByTestId('checkout-success')).toHaveAttribute('data-state', 'verifying')
    await page.waitForTimeout(12_500)
    await expect(page).toHaveURL(/\/checkout\/success/)
    await expect(page.getByTestId('checkout-success')).toHaveAttribute('data-state', 'email_sent')
  })

  anonTest('claim-session 500 mostra o fallback com reenvio e contato', async ({ page }) => {
    await seedQuiz(page)
    await mockClaim(page, (route) => json(route, { error: 'internal_error' }, 500))

    await page.goto(`/checkout/success?session_id=${SESSION_ID}`)
    await expect(page.getByTestId('checkout-success')).toHaveAttribute('data-state', 'fallback')
    await expect(page.getByTestId('checkout-success-resend')).toBeVisible()
    await expect(page.getByRole('link', { name: /@drimigrante\.com/ })).toBeVisible()
    await expect(page.getByText('Pagamento confirmado')).toHaveCount(0)
    await expect(page).not.toHaveURL(/session_id/)
  })

  anonTest('purchase é enviado uma única vez por compra', async ({ page }) => {
    await seedQuiz(page, { consent: 'granted' })
    await mockClaim(page, (route) => json(route, { status: 'email_sent' }))

    await page.goto(`/checkout/success?session_id=${SESSION_ID}`)
    await expect(page.getByTestId('checkout-success')).toHaveAttribute('data-state', 'email_sent')
    expect(await analyticsLog(page, 'purchase')).toBe(1)

    // Recarregar (o session_id agora vem da sessionStorage) não conta de novo.
    await page.reload()
    await expect(page.getByTestId('checkout-success')).toHaveAttribute('data-state', 'email_sent')
    expect(await analyticsLog(page, 'purchase')).toBe(0)
  })

  // ── Analytics do resultado ──────────────────────────────────────────────────

  anonTest('recarregar /results não gera novo results_viewed', async ({ page }) => {
    await seedQuiz(page, { consent: 'granted' })
    await page.goto('/results')
    await expect(page.getByTestId('results-score')).toBeVisible()
    await expect.poll(() => analyticsLog(page, 'results_viewed')).toBe(1)

    await page.reload()
    await expect(page.getByTestId('results-score')).toBeVisible()
    expect(await analyticsLog(page, 'results_viewed')).toBe(0)
  })

  anonTest('com consentimento negado nada é registrado', async ({ page }) => {
    await seedQuiz(page, { consent: 'denied' })
    await page.goto('/results?checkout=cancelled')
    await expect(page.getByTestId('results-score')).toBeVisible()
    await page.getByTestId('results-cta-paywall').scrollIntoViewIfNeeded()
    const total = await page.evaluate(
      () => ((window as unknown as { __DI_ANALYTICS_DEBUG__?: unknown[] }).__DI_ANALYTICS_DEBUG__ ?? []).length,
    )
    expect(total).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Checkout autenticado. Exige a function `e2e-login` num Supabase local/staging
// (o fixture pula o teste contra produção — ver docs/testes.md).
// ─────────────────────────────────────────────────────────────────────────────

authTest('checkout autenticado → página de sucesso', async ({ authedPage: page }) => {
  await page.route('**/functions/v1/create-checkout-session', async (route) => {
    const url = new URL(page.url())
    await json(route, { url: `${url.origin}/checkout/success?session_id=${SESSION_ID}` })
  })

  // Espera o AuthContext carregar a conta antes de clicar.
  const authHydrated = page.waitForResponse((r) => r.url().includes('/rest/v1/subscriptions'))
  await page.goto('/checkout')
  await authHydrated
  await expect(page.getByTestId('checkout-plan-onetime')).toBeVisible()
  await page.getByTestId('checkout-submit').click()

  await expect(page).toHaveURL(/\/checkout\/success/)
  await expect(page.getByTestId('checkout-success')).toBeVisible()
})
