import type { Page, Locator } from '@playwright/test'

export class LandingPage {
  readonly page: Page
  readonly ctaStartQuiz: Locator
  readonly cookieBanner: Locator
  readonly cookieAccept: Locator
  readonly cookieReject: Locator

  constructor(page: Page) {
    this.page = page
    this.ctaStartQuiz = page.getByTestId('cta-start-quiz-hero')
    this.cookieBanner = page.getByTestId('cookie-banner')
    this.cookieAccept = page.getByTestId('cookie-accept')
    this.cookieReject = page.getByTestId('cookie-reject')
  }

  async goto() {
    await this.page.goto('/')
  }

  async acceptCookies() {
    await this.cookieAccept.click()
  }

  async startQuiz() {
    await this.ctaStartQuiz.click()
    await this.page.waitForURL('**/quiz')
  }
}
