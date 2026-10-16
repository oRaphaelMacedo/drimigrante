// 08-success-autologin.spec.ts — volta do Stripe com login automático (DI-086, DI-026).
//
// Fluxo da página /checkout/success (src/pages/checkout/SuccessPage.tsx):
//   claim-session (session_id do Stripe) → token_hash → verifyOtp (magiclink)
//   → conta carregada → acesso liberado → painel, sem passar pelo /login.
//
// Hermético: claim-session, /auth/v1/verify e as leituras da conta são
// respondidos no navegador por e2e/fixtures/mock-backend.ts; escrita sem mock ou
// requisição para fora da máquina reprova o teste. Roda no modo mock:
//   npm run test:e2e:mock -- e2e/tests/08-success-autologin.spec.ts
import type { Page } from '@playwright/test'
import {
  AUTH_STORAGE_KEY,
  DEFAULT_BACKEND_OPTIONS,
  MOCK_TOKEN_HASH,
  MOCK_USER,
  expect,
  storedSession,
  test,
  type MockBackendOptions,
} from '../fixtures/mock-backend'
import { subscriptionFor } from '../fixtures/seeded'
import { SUPPORT_EMAIL } from '../../src/config/contact'

const SESSION_ID = 'cs_test_e2eAutoLogin0001'
const SUCCESS_URL = `/checkout/success?session_id=${SESSION_ID}`
/** session_id guardado só nesta aba (CHECKOUT_SESSION_STORAGE_KEY). */
const CHECKOUT_SESSION_KEY = 'di_checkout_session_id'

/** Comprador anônimo que acabou de pagar: sem sessão, com o quiz salvo neste navegador. */
const buyer = (extra: Partial<MockBackendOptions> = {}): { backendOptions: MockBackendOptions } => ({
  backendOptions: {
    ...DEFAULT_BACKEND_OPTIONS,
    scenario: 'one_time_active',
    signedIn: false,
    storedQuiz: true,
    claim: { kind: 'token' },
    ...extra,
  },
})

/** Registra todas as URLs por onde o frame principal passou. */
function trackNavigations(page: Page): string[] {
  const urls: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) urls.push(frame.url())
  })
  return urls
}

const successHeading = (page: Page) => page.getByTestId('checkout-success')

/** Primeira visita a cada página lazy no dev server do teste (lento a frio). */
const NAV_TIMEOUT = 20_000

test.describe('página de sucesso — login automático', { tag: '@mock-backend' }, () => {
  // Sucesso → painel: duas páginas lazy e o polling de 2 s do acesso.
  test.slow()

  test.describe('comprador sem sessão', () => {
    test.use(buyer())

    test('token_hash válido: entra sozinho e abre o painel, sem /login e sem session_id na URL', async ({
      page,
      backend,
    }) => {
      const urls = trackNavigations(page)
      await page.goto(SUCCESS_URL)

      // O session_id sai da URL ao montar e nunca aparece na tela.
      await expect(page).not.toHaveURL(/session_id/, { timeout: NAV_TIMEOUT })
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: NAV_TIMEOUT })
      await expect(page.getByTestId('access-chip')).toBeVisible()

      expect(backend.bodiesOf('fn:claim-session')).toEqual([{ session_id: SESSION_ID }])
      const verify = backend.bodiesOf('auth:verify')
      expect(verify).toHaveLength(1)
      expect(verify[0]).toMatchObject({ token_hash: MOCK_TOKEN_HASH, type: 'magiclink' })

      // Sessão do supabase-js gravada e session_id esquecido da aba.
      expect((await storedSession(page))?.access_token).toBe(backend.session.access_token)
      expect(await page.evaluate((key) => sessionStorage.getItem(key), CHECKOUT_SESSION_KEY)).toBeNull()

      expect(urls.some((url) => url.includes('/login'))).toBe(false)
      // A URL de chegada do Stripe é a única com o session_id; o painel nunca o recebe.
      expect(urls.filter((url) => url.includes('/dashboard') && url.includes('session_id'))).toEqual([])
      await expect(page.locator('body')).not.toContainText(SESSION_ID)
    })

    test('webhook atrasado: confirma o acesso por polling e então abre o painel', async ({ page, backend }) => {
      // As duas primeiras leituras da conta ainda não têm o pagamento (webhook a caminho).
      const unpaid = subscriptionFor('none', MOCK_USER.id)
      backend.subscriptionQueue.push(unpaid, unpaid)

      await page.goto(SUCCESS_URL)
      await expect(successHeading(page)).toHaveAttribute('data-state', 'confirming', { timeout: NAV_TIMEOUT })
      await expect(page).toHaveURL(/\/checkout\/success$/)

      await expect(page).toHaveURL(/\/dashboard$/, { timeout: NAV_TIMEOUT })
      await expect(page.getByTestId('access-chip')).toBeVisible()
      expect(backend.callsTo('rest:subscriptions').filter((call) => call.authenticated).length).toBeGreaterThanOrEqual(3)
      expect(backend.callsTo('fn:claim-session')).toHaveLength(1)
    })

    test('token_hash vencido: mostra a saída alternativa sem mandar para /login', async ({ page, backend }) => {
      backend.verifyStatus = 'expired'
      const urls = trackNavigations(page)

      await page.goto(SUCCESS_URL)
      await expect(successHeading(page)).toHaveAttribute('data-state', 'fallback', { timeout: NAV_TIMEOUT })
      await expect(page.getByTestId('checkout-success-resend')).toBeVisible()
      await expect(page.getByRole('link', { name: SUPPORT_EMAIL })).toBeVisible()
      await expect(page).toHaveURL(/\/checkout\/success$/)

      expect(backend.callsTo('auth:verify')).toHaveLength(1)
      expect(await storedSession(page)).toBeNull()
      expect(urls.some((url) => url.includes('/login'))).toBe(false)
      await expect(page.getByText('Pagamento confirmado')).toHaveCount(0)
    })
  })

  test.describe('comprador já logado', () => {
    test.use(buyer({ signedIn: true }))

    test('com o acesso liberado, abre o painel sem chamar o claim-session', async ({ page, backend }) => {
      await page.goto(SUCCESS_URL)
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: NAV_TIMEOUT })
      await expect(page.getByTestId('access-chip')).toBeVisible()
      expect(backend.callsTo('fn:claim-session')).toEqual([])
      expect(backend.callsTo('auth:verify')).toEqual([])
      expect(await page.evaluate((key) => localStorage.getItem(key), AUTH_STORAGE_KEY)).not.toBeNull()
    })
  })
})
