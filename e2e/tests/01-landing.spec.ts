import { test, expect } from '@playwright/test'
import { LandingPage } from '../pages/LandingPage'

test.describe('Landing page', () => {
  test('carrega com SEO correcto', async ({ page }) => {
    const landing = new LandingPage(page)
    await landing.goto()

    await expect(page).toHaveTitle(/Doutor Imigrante/)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Doutor Imigrante/)
    await expect(landing.ctaStartQuiz).toBeVisible()
  })

  test('footer com links legais', async ({ page }) => {
    await page.goto('/')

    // Dismiss the cookie banner — on mobile viewports it overlays the footer
    // and intercepts link clicks. Cookie behaviour is covered by
    // 02-cookie-consent.spec.ts; here we only care about the legal routes.
    await page
      .getByTestId('cookie-accept')
      .click({ timeout: 5_000 })
      .catch(() => {
        /* banner may already be dismissed */
      })

    for (const [path, h1Text] of [
      ['/termos', /Termos/],
      ['/privacidade', /Privacidade/],
      ['/cookies', /Cookies/],
    ] as const) {
      const link = page.locator(`footer a[href="${path}"]`)
      await expect(link).toBeVisible()
      await link.click()
      await expect(page.locator('h1')).toContainText(h1Text)
      await page.goBack()
    }
  })
})
