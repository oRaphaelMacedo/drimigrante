import { test, expect, type Page } from '@playwright/test'
import { LandingPage } from '../pages/LandingPage'

/**
 * Landing (DI-034, DI-035, DI-036, DI-076).
 *
 * Nenhuma chamada sai para o backend: as APIs do Supabase (rest/auth/functions/
 * storage) e os analytics são abortados aqui mesmo, então o spec roda contra
 * qualquer alvo local sem gravar nada.
 */
async function blockBackend(page: Page) {
  await page.route(/\/(rest|auth|functions|storage)\/v1\//, (route) => route.abort())
  await page.route(/posthog|googletagmanager|google-analytics|facebook\.net|sentry\.io|stripe\.com/, (route) =>
    route.abort(),
  )
}

/** Simula a escolha de cookies já feita (o banner não aparece). */
async function withConsentDecided(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('di_cookie_consent', 'denied')
    } catch {
      /* armazenamento bloqueado */
    }
  })
}

const DEFAULT_TITLE = 'Doutor Imigrante — Diagnóstico gratuito de nacionalidade portuguesa'

test.beforeEach(async ({ page }) => {
  await blockBackend(page)
})

test.describe('Landing page', () => {
  test('carrega com SEO correto e sobre o mesmo produto', async ({ page }) => {
    const landing = new LandingPage(page)
    await page.goto('/?utm_source=teste&utm_campaign=e2e')

    await expect(page).toHaveTitle(DEFAULT_TITLE)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', DEFAULT_TITLE)
    await expect(page.locator('h1')).toContainText(/nacionalidade portuguesa/i)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.drimigrante.com/')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow')
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      'https://www.drimigrante.com/og-image.jpg',
    )
    await expect(landing.ctaStartQuiz).toBeVisible()

    // A imagem de partilha existe (o mesmo arquivo publicado em produção).
    const ogImage = await page.request.get('/og-image.jpg')
    expect(ogImage.status()).toBe(200)
    expect(ogImage.headers()['content-type']).toContain('image/jpeg')
  })

  test('sem plano mensal nem promessas falsas antes do pagamento', async ({ page }) => {
    await withConsentDecided(page)
    await page.goto('/')
    const text = (await page.locator('main').textContent()) ?? ''

    for (const forbidden of [/4,90/, /válido para sempre/i, /mais popular/i, /20 perguntas/i, /advogados? especializad/i]) {
      expect(text).not.toMatch(forbidden)
    }
    await expect(page.getByTestId('landing-offer')).toContainText('€30')
    await expect(page.getByTestId('cta-pricing-subscription')).toHaveCount(0)
    expect(await page.getByTestId('landing-faq').locator('details').count()).toBeGreaterThanOrEqual(6)
  })

  test('título e robots acompanham a navegação SPA', async ({ page }) => {
    await withConsentDecided(page)
    await page.goto('/')

    await page.locator('footer a[href="/termos"]').click()
    await expect(page.locator('h1')).toContainText(/Termos/)
    await expect(page).toHaveTitle('Termos e condições — Doutor Imigrante')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.drimigrante.com/termos')

    await page.goBack()
    await expect(page).toHaveTitle(DEFAULT_TITLE)

    await page.goto('/results?r=token-de-teste')
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.drimigrante.com/results')
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

test.describe('Landing no celular', () => {
  test('375×667 com o banner de cookies: CTA do hero inteiro visível', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    const banner = page.getByTestId('cookie-banner')
    await expect(banner).toBeVisible()
    const bannerBox = await banner.boundingBox()
    const ctaBox = await page.getByTestId('cta-start-quiz-hero').boundingBox()
    expect(bannerBox && ctaBox).toBeTruthy()
    expect(ctaBox!.y).toBeGreaterThanOrEqual(0)
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(bannerBox!.y)
  })

  test('360px: banner com no máximo 120px e botões iguais de 44px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto('/')

    const bannerBox = await page.getByTestId('cookie-banner').boundingBox()
    expect(bannerBox!.height).toBeLessThanOrEqual(120)

    const reject = page.getByTestId('cookie-reject')
    const accept = page.getByTestId('cookie-accept')
    expect(await reject.getAttribute('class')).toBe(await accept.getAttribute('class'))
    for (const button of [reject, accept]) {
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
    await expect(page.getByRole('button', { name: /fechar/i })).toHaveCount(0)
  })

  for (const width of [360, 375, 390]) {
    test(`${width}px: sem rolagem horizontal`, async ({ page }) => {
      await withConsentDecided(page)
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }

  test('CTA fixo aparece depois do hero e some na seção final', async ({ page }) => {
    await withConsentDecided(page)
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')

    const sticky = page.getByTestId('cta-start-quiz-sticky')
    await expect(sticky).toBeHidden()

    await page.evaluate(() => window.scrollTo(0, document.getElementById('como-funciona')!.offsetTop))
    await expect(sticky).toBeVisible()
    expect((await sticky.boundingBox())!.height).toBeGreaterThanOrEqual(48)

    await page.getByTestId('cta-start-quiz-final').scrollIntoViewIfNeeded()
    await expect(sticky).toBeHidden()

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(sticky).toBeHidden()
  })
})
