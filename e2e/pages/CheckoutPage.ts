import type { Page, Locator } from '@playwright/test'

/**
 * /checkout — resumo único do €30 (DI-011). Não há mais escolha de plano:
 * `planOneTime` é o card do resumo (o testid foi mantido).
 */
export class CheckoutPage {
  readonly page: Page
  readonly planOneTime: Locator
  readonly submit: Locator
  readonly cancelledBanner: Locator
  readonly emptyState: Locator
  readonly error: Locator
  readonly retry: Locator

  constructor(page: Page) {
    this.page = page
    this.planOneTime = page.getByTestId('checkout-plan-onetime')
    this.submit = page.getByTestId('checkout-submit')
    this.cancelledBanner = page.getByTestId('checkout-cancelled-banner')
    this.emptyState = page.getByTestId('checkout-empty')
    this.error = page.getByTestId('checkout-error')
    this.retry = page.getByTestId('checkout-retry')
  }

  async goto() {
    await this.page.goto('/checkout')
  }

  /** Volta do Stripe sem pagar (cancel_url legado do /checkout). */
  async gotoCancelled() {
    await this.page.goto('/checkout?cancelled=1')
  }

  async pay() {
    await this.submit.click()
  }
}
