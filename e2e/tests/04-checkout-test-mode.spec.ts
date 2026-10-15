import { test as anonTest, expect } from '@playwright/test'
import { test as authTest } from '../fixtures/auth'

// ─────────────────────────────────────────────────────────────────────────────
// P0 funnel (2026-06-30): primary flow is Results → Stripe directly (anonymous).
// "Desbloquear €30" on /results calls create-checkout-session with the anon body
// { plan:'one_time', assessmentId, sessionId, email } and redirects to the URL.
// This test stubs the edge function and seeds the quiz result localStorage so the
// button has the data it needs, then asserts we land on /checkout/success.
// ─────────────────────────────────────────────────────────────────────────────

anonTest('Results → Stripe direto (funnel anónimo) → success page', async ({ page }) => {
  // Seed the quiz result the funnel reads (sessionId + assessmentId + leadInfo.email)
  // before any app code runs.
  await page.addInitScript(() => {
    localStorage.setItem(
      'dr_imigrante_quiz_result',
      JSON.stringify({
        sessionId: 'e2e-session-0001-anon',
        assessmentId: '00000000-0000-0000-0000-000000000001',
        answers: {},
        score: { total: 50, max: 100, percentage: 50, category: 'media' },
        visas: [{ code: 'D7', name: 'Visto D7', match: 'possible', reason: 'teaser' }],
        leadInfo: { fullName: 'E2E Tester', email: 'e2e-anon@drimigrante.com' },
        completedAt: new Date().toISOString(),
      }),
    )
  })

  // Stub create-checkout-session → returns a URL pointing at /checkout/success.
  await page.route('**/functions/v1/create-checkout-session', async (route) => {
    const origin = new URL(page.url()).origin
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${origin}/checkout/success?session_id=cs_test_mock_e2e`,
        sessionId: 'cs_test_mock_e2e',
      }),
    })
  })

  // claim-session is invoked by SuccessPage when anonymous — stub it as a no-op
  // (no token_hash → SuccessPage falls back to its countdown/CTA without erroring).
  await page.route('**/functions/v1/claim-session', (route) =>
    route.fulfill({ status: 200, body: '{}', headers: { 'Content-Type': 'application/json' } }),
  )

  await page.goto('/results')
  await expect(page.getByTestId('results-cta-paywall')).toBeVisible()
  await page.getByTestId('results-cta-paywall').click()

  await expect(page).toHaveURL(/\/checkout\/success/)
  await expect(page.getByTestId('checkout-success')).toBeVisible()
})

// ─────────────────────────────────────────────────────────────────────────────
// Fallback flow: authenticated user still completes checkout via /checkout.
// Requires the `e2e-login` edge function (E2E_MODE=true) + INTERNAL_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

authTest.skip(
  () => !process.env.INTERNAL_SECRET || !process.env.VITE_SUPABASE_URL,
  'INTERNAL_SECRET / VITE_SUPABASE_URL not set — deploy e2e-login and export the secret to run this suite',
)

authTest('checkout autenticado (fallback) → success page', async ({ authedPage: page }) => {
  // Stub the edge function so the test does not hit Stripe.
  await page.route('**/functions/v1/create-checkout-session', async (route) => {
    const url = new URL(page.url())
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${url.origin}/checkout/success?session_id=cs_test_mock_e2e`,
      }),
    })
  })

  // Wait for AuthContext to hydrate (profile + subscription loaded); clicking
  // before that sees authUser=null and CheckoutPage redirects to /login.
  const authHydrated = page.waitForResponse((r) => r.url().includes('/rest/v1/subscriptions'))
  await page.goto('/checkout')
  await authHydrated
  await page.getByTestId('checkout-plan-onetime').click()
  await page.getByTestId('checkout-submit').click()

  await expect(page).toHaveURL(/\/checkout\/success/)
  await expect(page.getByTestId('checkout-success')).toBeVisible()
})
