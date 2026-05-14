import type { Page, Locator } from '@playwright/test'

export class CheckoutPage {
  readonly page: Page
  readonly planOneTime: Locator
  readonly planSubscription: Locator
  readonly submit: Locator

  constructor(page: Page) {
    this.page = page
    this.planOneTime = page.getByTestId('checkout-plan-onetime')
    this.planSubscription = page.getByTestId('checkout-plan-subscription')
    this.submit = page.getByTestId('checkout-submit')
  }

  async goto() {
    await this.page.goto('/checkout')
  }

  async selectOneTime() {
    await this.planOneTime.click()
  }

  async selectSubscription() {
    await this.planSubscription.click()
  }

  async pay() {
    await this.submit.click()
  }
}
