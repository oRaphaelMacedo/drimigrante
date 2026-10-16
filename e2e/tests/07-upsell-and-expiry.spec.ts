// 07-upsell-and-expiry.spec.ts — modelo P0 no painel: €30 com chat incluso,
// oferta de €4,90/mês só para quem já pagou, aviso de fim de prazo e
// expiração dos 30 dias (DI-086; regras em src/lib/access.ts, DI-012, DI-046,
// DI-047, DI-013).
//
// Hermético: Supabase (REST, Auth, Edge Functions), Stripe e terceiros são
// respondidos no navegador por e2e/fixtures/mock-backend.ts. Escrita sem mock
// ou requisição para fora da máquina reprova o teste. Roda no modo mock:
//   npm run test:e2e:mock -- e2e/tests/07-upsell-and-expiry.spec.ts
import type { Page } from '@playwright/test'
import {
  DEFAULT_BACKEND_OPTIONS,
  MOCK_ASSESSMENT_ID,
  MOCK_CHAT_REPLY,
  STRIPE_CHECKOUT_MOCK_URL,
  SUPABASE_URL,
  dayMonth,
  daysLeftUntil,
  expect,
  test,
  type MockBackend,
  type MockBackendOptions,
} from '../fixtures/mock-backend'
import { SEED_ANSWERS, type AccessScenario } from '../fixtures/seeded'
import { pruneAnswers, suggestVisas } from '../../src/data/quiz-questions'
import { OFFER } from '../../src/lib/offer'

const RECURRING_LABEL = OFFER.recurring.priceLabel // €4,90/mês
const RECURRING_AMOUNT = RECURRING_LABEL.split('/')[0] // €4,90
const ONE_TIME_LABEL = OFFER.priceLabel // €30

function scenario(name: AccessScenario, extra: Partial<MockBackendOptions> = {}): { backendOptions: MockBackendOptions } {
  return { backendOptions: { ...DEFAULT_BACKEND_OPTIONS, scenario: name, ...extra } }
}

/** Fim do acesso de 30 dias do cenário atual. */
function expiresAt(backend: MockBackend): Date {
  const value = backend.subscription.one_time_access_expires_at
  if (!value) throw new Error('cenário sem prazo de acesso')
  return new Date(value)
}

/**
 * Espera de navegação: a primeira visita a cada página carrega o chunk lazy no
 * dev server do teste (lento a frio, com vários workers).
 */
const NAV_TIMEOUT = 20_000

/** Abre o Início do painel e espera os dados da conta carregarem. */
async function openDashboard(page: Page, path = '/dashboard') {
  await page.goto(path)
  await expect(page.getByTestId('dashboard-card-chat')).toBeVisible({ timeout: NAV_TIMEOUT })
}

/** Espera o Stripe (simulado) abrir com o plano recorrente da pessoa logada. */
async function expectRecurringCheckout(page: Page, backend: MockBackend) {
  await page.waitForURL(STRIPE_CHECKOUT_MOCK_URL)
  await expect(page.getByTestId('stripe-checkout-mock')).toBeVisible()
  const calls = backend.callsTo('fn:create-checkout-session')
  expect(calls).toHaveLength(1)
  expect(calls[0].body).toEqual({ plan: 'recurring', assessmentId: MOCK_ASSESSMENT_ID })
  expect(calls[0].authenticated).toBe(true)
}

/** A página terminou de aplicar o parâmetro da URL (o sheet abre logo depois). */
async function settle(page: Page) {
  await page.waitForTimeout(500)
}

test.describe('modelo P0 — upsell e expiração', { tag: '@mock-backend' }, () => {
  // Fluxos que passam por 2–3 páginas lazy: tempo triplicado só para o dev server frio.
  test.slow()

  // ── €30 dentro do prazo (chat incluso — opção A do DI-012) ─────────────────
  test.describe('pagamento único ativo', () => {
    test.use(scenario('one_time_active'))

    test('mostra o prazo e libera análise, documentos e chat, sem oferta de €4,90 antes de abrir a análise', async ({
      page,
      backend,
    }) => {
      await openDashboard(page)
      const end = expiresAt(backend)

      const chip = page.getByTestId('access-chip')
      await expect(chip).toContainText(`Acesso até ${dayMonth(end)}`)
      await expect(chip).toContainText(`(${daysLeftUntil(end)} dias)`)

      // Tudo liberado: os cards são links (bloqueado vira botão que abre a oferta).
      await expect(page.getByTestId('dashboard-card-analysis')).toHaveAttribute('href', '/dashboard/analysis')
      await expect(page.getByTestId('dashboard-card-chat')).toHaveAttribute('href', '/dashboard/chat')
      await expect(page.getByTestId('dashboard-card-documents')).toHaveAttribute('href', '/dashboard/documents')

      // DI-047: o €4,90 só aparece depois que a análise foi aberta.
      await expect(page.getByTestId('subscription-upsell-card')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText(RECURRING_AMOUNT)
    })

    test('o chat IA abre direto e responde, sem passar por oferta', async ({ page, backend }) => {
      await openDashboard(page)
      await page.getByTestId('dashboard-card-chat').click()
      await expect(page).toHaveURL(/\/dashboard\/chat$/)

      const question = 'Quais documentos devo reunir primeiro?'
      await page.getByTestId('chat-input').fill(question)
      await page.getByTestId('chat-send').click()

      await expect(page.getByTestId('chat-bubble-user').last()).toContainText(question, { timeout: 10_000 })
      await expect(page.getByTestId('chat-bubble-assistant').last()).toContainText(MOCK_CHAT_REPLY, {
        timeout: 10_000,
      })
      const calls = backend.callsTo('fn:chat-completion')
      expect(calls).toHaveLength(1)
      expect(calls[0].authenticated).toBe(true)
      expect(calls[0].body).toMatchObject({ message: question, assessmentId: MOCK_ASSESSMENT_ID })
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })

    test('?upsell=chat não abre oferta para quem já tem o chat', async ({ page }) => {
      await openDashboard(page, '/dashboard?upsell=chat')
      await expect(page).toHaveURL(/\/dashboard$/)
      await settle(page)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })

    test('depois de abrir a análise, a oferta discreta de €4,90 leva ao checkout recorrente', async ({
      page,
      backend,
    }) => {
      await page.goto('/dashboard/analysis')
      await expect(page).toHaveURL(/\/dashboard\/analysis$/)
      await expect.poll(() => backend.callsTo('rpc:get_full_analysis').length, { timeout: NAV_TIMEOUT }).toBeGreaterThan(0)

      await openDashboard(page)
      const card = page.getByTestId('subscription-upsell-card')
      await expect(card).toBeVisible()
      await expect(card).toContainText(RECURRING_LABEL)
      await expect(card).toContainText(`até ${OFFER.recurring.maxCycles} meses`)
      await expect(card).toContainText('cancelamento pelo suporte')

      await card.getByTestId('dashboard-subscribe-btn').click()
      await expectRecurringCheckout(page, backend)
    })
  })

  // ── Perto de expirar (≤ 7 dias) ───────────────────────────────────────────
  test.describe('acesso perto do fim', () => {
    test.use(scenario('one_time_expiring'))

    test('avisa a data e os dias restantes; "Manter acesso" abre o checkout de €4,90', async ({ page, backend }) => {
      await openDashboard(page)
      const end = expiresAt(backend)

      const banner = page.getByTestId('access-banner-expiring')
      await expect(banner).toBeVisible()
      await expect(banner).toContainText(`Seu acesso termina em ${dayMonth(end)}`)
      await expect(banner).toContainText(`Faltam ${daysLeftUntil(end)} dias`)

      // Ainda dentro do prazo: o chat do €30 continua liberado.
      await expect(page.getByTestId('dashboard-card-chat')).toHaveAttribute('href', '/dashboard/chat')

      const subscribe = banner.getByTestId('access-banner-subscribe')
      await expect(subscribe).toHaveText(`Manter acesso por ${RECURRING_LABEL}`)
      await subscribe.click()
      await expectRecurringCheckout(page, backend)
    })
  })

  // ── Expirado (30 dias acabaram, sem assinatura) ───────────────────────────
  test.describe('acesso expirado', () => {
    test.use(scenario('one_time_expired'))

    test('mostra o fim do acesso, os caminhos e a renovação por €4,90 como ação principal', async ({
      page,
      backend,
    }) => {
      await openDashboard(page)
      const end = expiresAt(backend)

      const banner = page.getByTestId('access-banner-expired')
      await expect(banner).toBeVisible()
      await expect(banner).toContainText(`Seu acesso terminou em ${dayMonth(end)}`)
      for (const { name } of suggestVisas(pruneAnswers(SEED_ANSWERS))) {
        await expect(banner).toContainText(name)
      }

      const subscribe = banner.getByTestId('access-banner-subscribe')
      await expect(subscribe).toHaveText(`Assinar por ${RECURRING_LABEL}`)
      await expect(subscribe).toHaveAttribute('data-primary-cta', '')

      const oneTime = banner.getByTestId('access-banner-one-time')
      await expect(oneTime).toHaveText(`Comprar mais ${OFFER.accessDays} dias por ${ONE_TIME_LABEL}`)
      await expect(oneTime).toHaveAttribute('href', '/checkout')

      // Análise e chat bloqueados (abrem a oferta); documentos seguem abertos para baixar/apagar.
      await expect(page.getByTestId('dashboard-card-chat')).toHaveAttribute('aria-haspopup', 'dialog')
      await expect(page.getByTestId('dashboard-card-chat')).toContainText(`Na assinatura ${RECURRING_LABEL}`)
      await expect(page.getByTestId('dashboard-card-analysis')).toHaveAttribute('aria-haspopup', 'dialog')
      await expect(page.getByTestId('dashboard-card-documents')).toHaveAttribute('href', '/dashboard/documents')
      await expect(page.getByTestId('access-chip')).toHaveCount(0)

      await subscribe.click()
      await expectRecurringCheckout(page, backend)
    })

    for (const path of ['/dashboard/chat', '/dashboard/analysis']) {
      test(`link direto para ${path} volta ao painel com o aviso de expiração`, async ({ page, backend }) => {
        await page.goto(path)
        // ProtectedRoute → /dashboard?acesso=expirado → o parâmetro sai da URL.
        await expect(page).toHaveURL(/\/dashboard$/, { timeout: NAV_TIMEOUT })
        await expect(page.getByTestId('access-banner-expired')).toBeVisible()
        await expect(page.getByTestId('chat-input')).toHaveCount(0)
        expect(backend.callsTo('rpc:get_full_analysis')).toEqual([])
        expect(backend.callsTo('fn:chat-completion')).toEqual([])
      })
    }

    test('documentos continuam acessíveis depois de expirar', async ({ page, backend }) => {
      await page.goto('/dashboard/documents')
      await expect.poll(() => backend.callsTo('rest:user_documents').length, { timeout: NAV_TIMEOUT }).toBeGreaterThan(0)
      await expect(page).toHaveURL(/\/dashboard\/documents$/)
    })

    test('o chat bloqueado abre a oferta de renovação; "voltar" fecha o sheet', async ({ page, backend }) => {
      await openDashboard(page)
      await page.getByTestId('dashboard-card-chat').click()

      const sheet = page.getByRole('dialog', { name: 'Volte a usar o chat IA' })
      await expect(sheet).toBeVisible()
      await expect(sheet).toContainText(`Seu acesso de ${OFFER.accessDays} dias terminou em ${dayMonth(expiresAt(backend))}`)
      await expect(sheet.getByTestId('upsell-terms')).toContainText(`até ${OFFER.recurring.maxCycles} meses`)
      await expect(sheet.getByRole('link', { name: `Comprar mais ${OFFER.accessDays} dias por ${ONE_TIME_LABEL}` })).toBeVisible()

      // Voltar do Android/navegador fecha o sheet e mantém a pessoa no painel.
      await page.goBack()
      await expect(sheet).toHaveCount(0)
      await expect(page).toHaveURL(/\/dashboard$/)

      await page.getByTestId('dashboard-card-chat').click()
      const subscribe = page.getByRole('dialog').getByTestId('upsell-subscribe-btn')
      await expect(subscribe).toHaveText(`Assinar por ${RECURRING_LABEL}`)
      await subscribe.click()
      await expectRecurringCheckout(page, backend)
    })
  })

  // ── Assinante de €4,90/mês ────────────────────────────────────────────────
  test.describe('assinatura ativa', () => {
    test.use(scenario('recurring'))

    test('sem nenhuma oferta: chip de assinatura ativa e tudo liberado', async ({ page }) => {
      await openDashboard(page)
      await expect(page.getByTestId('access-chip')).toHaveText('Assinatura ativa')
      await expect(page.getByTestId('dashboard-card-chat')).toHaveAttribute('href', '/dashboard/chat')
      await expect(page.getByTestId('dashboard-card-analysis')).toHaveAttribute('href', '/dashboard/analysis')

      await expect(page.getByTestId('subscription-upsell-card')).toHaveCount(0)
      await expect(page.getByTestId('access-banner-expired')).toHaveCount(0)
      await expect(page.getByTestId('access-banner-expiring')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText(RECURRING_AMOUNT)
    })

    test('?upsell=chat não abre oferta e o chat abre direto', async ({ page }) => {
      await openDashboard(page, '/dashboard?upsell=chat')
      await expect(page).toHaveURL(/\/dashboard$/)
      await settle(page)
      await expect(page.getByRole('dialog')).toHaveCount(0)

      await page.goto('/dashboard/chat')
      await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: NAV_TIMEOUT })
      await expect(page).toHaveURL(/\/dashboard\/chat$/)
    })
  })

  // ── A trava do backend simulado ───────────────────────────────────────────
  test.describe('trava de rede', () => {
    test.use(scenario('one_time_active'))

    test('escrita sem mock e host externo são abortados no navegador', async ({ page, backend }) => {
      await openDashboard(page)
      const attempt = (url: string, method: string) =>
        page.evaluate(
          async ([target, verb]) => {
            try {
              await fetch(target, { method: verb, headers: { 'content-type': 'application/json' }, body: '{}' })
              return 'enviado'
            } catch {
              return 'abortado'
            }
          },
          [url, method] as const,
        )

      expect(await attempt(`${SUPABASE_URL}/rest/v1/assessments`, 'POST')).toBe('abortado')
      expect(await attempt('https://example.com/coleta', 'POST')).toBe('abortado')
      expect(backend.blockedWrites).toEqual(['POST rest/v1/assessments', 'POST https://example.com/coleta'])
      expect(backend.externalRequests).toEqual(['POST https://example.com/coleta'])

      // A trava funcionou; o fixture exige as listas vazias ao fim do teste.
      backend.blockedWrites.length = 0
      backend.externalRequests.length = 0
    })
  })

  // ── Logado sem ter pago ───────────────────────────────────────────────────
  test.describe('conta sem pagamento', () => {
    test.use(scenario('none'))

    test('o chat bloqueado leva à oferta de €30, nunca à de €4,90', async ({ page }) => {
      await page.goto('/dashboard/chat')
      // ProtectedRoute → /dashboard?upsell=chat → sheet do €30 com a URL já limpa.
      const sheet = page.getByRole('dialog', { name: 'O chat IA faz parte da análise completa' })
      await expect(sheet).toBeVisible({ timeout: NAV_TIMEOUT })
      await expect(page).toHaveURL(/\/dashboard$/)

      const buy = sheet.getByTestId('upsell-one-time-btn')
      await expect(buy).toContainText(ONE_TIME_LABEL)
      await expect(buy).toHaveAttribute('href', '/checkout')
      await expect(page.locator('body')).not.toContainText(RECURRING_AMOUNT)
      await expect(page.getByTestId('upsell-subscribe-btn')).toHaveCount(0)
    })
  })
})
