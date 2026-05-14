import { test, expect } from '@playwright/test'

test.describe('Cookie consent (RGPD)', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies()
  })

  test('banner aparece na primeira visita', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('cookie-banner')).toBeVisible()
  })

  test('aceitar persiste consent e activa analytics', async ({ page }) => {
    await page.goto('/')

    const posthogRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('posthog')) posthogRequests.push(req.url())
    })

    await page.getByTestId('cookie-accept').click()
    await expect(page.getByTestId('cookie-banner')).toBeHidden()

    const consent = await page.evaluate(() => localStorage.getItem('di_cookie_consent'))
    expect(consent).toBe('granted')

    // Se PostHog está configurado (VITE_POSTHOG_KEY definido), deve disparar requests.
    // Em dev sem a chave, posthog.init nunca é chamado — toleramos 0 requests nesse caso.
    await page.waitForTimeout(1500)
    const posthogInitialized = await page.evaluate(() => {
      const ph = (window as unknown as { posthog?: { __loaded?: boolean } }).posthog
      return Boolean(ph?.__loaded)
    })
    if (posthogInitialized) {
      expect(posthogRequests.length).toBeGreaterThan(0)
    }
  })

  test('rejeitar bloqueia analytics', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('cookie-reject').click()

    // Após o reject, NÃO devem chegar novos requests de analytics.
    // (Requests anteriores ao click são ignorados — podem ser o pixel
    //  inicial de tag managers carregados antes do consent ter sido decidido.)
    const blockedAfterReject: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('posthog') || url.includes('google-analytics') || url.includes('googletagmanager')) {
        blockedAfterReject.push(url)
      }
    })

    await page.waitForTimeout(2000)

    expect(blockedAfterReject, `requests indevidos após reject: ${blockedAfterReject.join(', ')}`).toEqual([])

    const consent = await page.evaluate(() => localStorage.getItem('di_cookie_consent'))
    expect(consent).toBe('denied')

    // PostHog não deve estar carregado após reject
    const posthogInitialized = await page.evaluate(() => {
      const ph = (window as unknown as { posthog?: { __loaded?: boolean } }).posthog
      return Boolean(ph?.__loaded)
    })
    expect(posthogInitialized).toBe(false)
  })
})
