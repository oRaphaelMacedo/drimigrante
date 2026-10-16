import { test, expect } from '@playwright/test'
import { test as mockTest, expect as mockExpect } from '../fixtures/mock-backend'
import { LandingPage } from '../pages/LandingPage'
import { QuizPage } from '../pages/QuizPage'

// O primeiro teste lê as perguntas do Supabase local (modo `local`). O bloco
// @mock-backend roda só com `npm run test:e2e:mock`: tudo simulado no navegador
// (o banco vazio faz o quiz usar as perguntas do código), nenhuma escrita.

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

  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(page).toHaveURL(/\/results/)
  await expect(page.getByTestId('results-score')).toBeVisible()
  await expect(page.getByTestId('results-cta-paywall')).toBeVisible()
  // P0 (modelo sequencial): o €4,90/mês não é vendido antes do pagamento de €30.
  await expect(page.locator('#results-subscribe-btn')).toHaveCount(0)
  await expect(page.getByText('€4,90')).toHaveCount(0)
})

mockTest.describe('quiz — "Nenhuma destas situações" (DI-075)', { tag: '@mock-backend' }, () => {
  mockTest('é exclusiva, libera o "Próximo" e leva direto ao contato', async ({ page }) => {
    await page.goto('/quiz')
    await mockExpect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
    await page.getByTestId('quiz-intro-start').click()
    await page.getByTestId('quiz-option-nacionalidade').click() // escolha única: avança sozinha

    const none = page.getByTestId('quiz-option-nenhum')
    const caseA = page.getByTestId('quiz-option-A')
    await mockExpect(none).toHaveText('Nenhuma destas situações')
    await caseA.click()
    await none.click()
    await mockExpect(none).toHaveAttribute('aria-checked', 'true')
    await mockExpect(caseA).toHaveAttribute('aria-checked', 'false')

    // Sem perguntas de caso depois dela: o botão já pede o resultado.
    await mockExpect(page.getByTestId('quiz-next')).toHaveText(/Ver meu resultado/)
    await page.getByTestId('quiz-next').click()
    await mockExpect(page.locator('#capture-email')).toBeVisible()
  })
})
