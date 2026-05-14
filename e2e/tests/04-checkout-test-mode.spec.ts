import { test, expect } from '../fixtures/auth'

// Requires the `e2e-login` edge function deployed with E2E_MODE=true,
// and INTERNAL_SECRET exported locally. Skipped otherwise.
test.skip(
  () => !process.env.INTERNAL_SECRET || !process.env.VITE_SUPABASE_URL,
  'INTERNAL_SECRET / VITE_SUPABASE_URL not set — deploy e2e-login and export the secret to run this suite',
)

test('checkout TEST → success page → redirect dashboard', async ({ authedPage: page }) => {
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

  await page.goto('/checkout')
  await page.getByTestId('checkout-plan-onetime').click()
  await page.getByTestId('checkout-submit').click()

  await expect(page).toHaveURL(/\/checkout\/success/)
  await expect(page.getByTestId('checkout-success')).toBeVisible()
})
