import { test, expect } from '@playwright/test'
import { LandingPage } from '../pages/LandingPage'
import { QuizPage } from '../pages/QuizPage'

test('quiz completo do início ao /results', async ({ page }) => {
  // Mock Supabase calls — the production submit path calls `upsert_anon_assessment`
  // (RPC) and the OpenAI-backed `generate-explanation` edge function, both of which
  // are too slow / flaky for E2E. Stubbing them makes the test deterministic.
  await page.route('**/rest/v1/rpc/upsert_anon_assessment', (route) =>
    route.fulfill({ status: 200, body: '[]', headers: { 'Content-Type': 'application/json' } }),
  )
  await page.route('**/functions/v1/compute-eligibility', (route) =>
    route.fulfill({ status: 200, body: '{}', headers: { 'Content-Type': 'application/json' } }),
  )
  await page.route('**/functions/v1/generate-explanation', (route) =>
    route.fulfill({ status: 200, body: '{}', headers: { 'Content-Type': 'application/json' } }),
  )

  const landing = new LandingPage(page)
  await landing.goto()
  await landing.acceptCookies()
  await landing.startQuiz()

  const quiz = new QuizPage(page)
  await quiz.start()
  await quiz.completeAll()

  await expect(page).toHaveURL(/\/results/)
  await expect(page.getByTestId('results-score')).toBeVisible()
  await expect(page.getByTestId('results-cta-paywall')).toBeVisible()
})
