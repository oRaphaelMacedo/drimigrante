import type { Page } from '@playwright/test'

export class QuizPage {
  constructor(private readonly page: Page) {}

  async start() {
    await this.page.getByTestId('quiz-intro-start').click()
  }

  async answerWithFirstOption() {
    const firstOption = this.page.locator('[data-testid^="quiz-option-"]').first()
    await firstOption.click()
    const next = this.page.getByTestId('quiz-next')
    await next.click()
  }

  async fillCaptureForm(email: string, name = 'E2E Tester') {
    await this.page.locator('#capture-name').fill(name)
    await this.page.locator('#capture-email').fill(email)
    await this.page.locator('#quiz-submit-btn').click()
  }

  /**
   * Walks intro → questions → capture → processing → /results.
   * Picks the first available option on every question; fills the capture
   * form with the provided email. Bails out when /results is reached.
   */
  async completeAll({ maxQuestions = 25, email = `e2e+${Date.now()}@drimigrante.com` } = {}) {
    for (let i = 0; i < maxQuestions; i++) {
      if (this.page.url().includes('/results')) return

      // Capture form? Fill and submit.
      if (await this.page.locator('#capture-email').isVisible().catch(() => false)) {
        await this.fillCaptureForm(email)
        await this.page.waitForURL('**/results', { timeout: 15_000 })
        return
      }

      // Otherwise, answer a question.
      const hasOption = await this.page
        .locator('[data-testid^="quiz-option-"]')
        .first()
        .isVisible()
        .catch(() => false)
      if (!hasOption) return
      await this.answerWithFirstOption()
    }
  }
}
