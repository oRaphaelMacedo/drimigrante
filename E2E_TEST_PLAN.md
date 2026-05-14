# Plano de Testes E2E — Playwright (TypeScript)

> **Como usar este documento:** abra uma nova sessão Claude Code na raiz de `/Users/rmb/drImigrante/` e diga:
> *"Implementa a Fase 1 deste plano: `E2E_TEST_PLAN.md`."*
> O documento é auto-contido — não precisa de contexto da sessão anterior.

---

## 1. Contexto do projecto (para o agente que ler isto)

- **Stack:** Vite + React 18 + TypeScript + Tailwind + shadcn/ui + Supabase + Stripe + OpenAI
- **Branch principal:** `main` (já em produção: https://www.drimigrante.com)
- **Auth:** Supabase Magic Link (passwordless via email)
- **Pagamento:** Stripe Hosted Checkout, actualmente em **TEST mode**
- **Chat IA:** SSE streaming de `chat-completion` edge function
- **Analytics:** PostHog + GA4 + Sentry, todos consent-gated (cookie banner RGPD)
- **Páginas-chave:**
  - `/` (landing) · `/quiz` · `/results` · `/checkout` · `/checkout/success`
  - `/dashboard` · `/dashboard/analysis` · `/dashboard/chat` · `/dashboard/documents`
  - `/termos` · `/privacidade` · `/cookies` · `/login` · `/auth/callback`
- **Linguagem dos testes:** **TypeScript** (justificação: partilha tipos com `src/lib/database.types.ts`, reusa `@supabase/supabase-js` já instalado, um único toolchain `npm`)

---

## 2. Setup inicial

```bash
npm i -D @playwright/test
npx playwright install --with-deps chromium
mkdir -p e2e/{tests,pages,fixtures,utils}
```

Adicionar scripts ao `package.json`:
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report"
  }
}
```

Criar `playwright.config.ts` na raiz (ver §6).

---

## 3. Estrutura de pastas

```
e2e/
├── tests/
│   ├── 01-landing.spec.ts
│   ├── 02-cookie-consent.spec.ts
│   ├── 03-quiz-full-flow.spec.ts
│   ├── 04-checkout-test-mode.spec.ts
│   └── 05-dashboard-and-chat.spec.ts
├── pages/                          # Page Object Model
│   ├── LandingPage.ts
│   ├── QuizPage.ts
│   ├── ResultsPage.ts
│   ├── CheckoutPage.ts
│   └── DashboardPage.ts
├── fixtures/
│   ├── auth.ts                     # fixture authedPage (dev-login)
│   └── seeded.ts                   # cria assessment + result via Supabase admin
└── utils/
    ├── stripe-test-cards.ts
    └── supabase-admin.ts
```

---

## 4. Best practices (não negociáveis)

1. **Selectors:** **só `data-testid`** — nunca `:text("…")`, `.classe`, ou XPath. Adicione `data-testid` aos componentes (ver §5.1).
2. **Page Object Model:** uma classe por página com métodos de alto nível (`landingPage.startQuiz()`), nunca acções soltas no spec.
3. **Isolamento:** cada teste começa com `localStorage`/`cookies` limpos (Playwright faz por default com `context` novo).
4. **Sem `sleep`:** usar `expect(...).toBeVisible({ timeout })` e `page.waitForURL()`.
5. **Mock APIs externas em CI:** Stripe Checkout e OpenAI são frágeis; mockar via `page.route()`.
6. **Trace só em falha:** `trace: 'on-first-retry'` (CI) / `'retain-on-failure'` (local).
7. **Paralelismo:** `fullyParallel: true`, 4 workers em CI.
8. **Determinismo:** semear dados via Supabase admin (service role), nunca depender de estado externo.
9. **CI:** workflow em `.github/workflows/e2e.yml`, sharded em 3 paralelas.

---

## 5. Pré-requisito no código da app: `data-testid`

Antes de escrever os testes, adicione `data-testid` a estes componentes (são os pontos de teste essenciais):

### 5.1 Lista de testids a adicionar

| Componente / página | testid |
|---|---|
| `src/pages/LandingPage.tsx` — CTA hero | `cta-start-quiz-hero` |
| `src/pages/LandingPage.tsx` — CTA pricing | `cta-pricing-onetime`, `cta-pricing-subscription` |
| `src/components/CookieBanner.tsx` — banner root | `cookie-banner` |
| `src/components/CookieBanner.tsx` — botão aceitar | `cookie-accept` |
| `src/components/CookieBanner.tsx` — botão rejeitar | `cookie-reject` |
| `src/components/quiz/QuizIntro.tsx` — botão start | `quiz-intro-start` |
| `src/components/quiz/QuizQuestion.tsx` — card pergunta | `quiz-question` |
| `src/components/quiz/QuizQuestion.tsx` — cada opção | `quiz-option-{value}` |
| `src/components/quiz/QuizQuestion.tsx` — botão próxima | `quiz-next` |
| `src/pages/quiz/ResultsPage.tsx` — score card | `results-score` |
| `src/pages/quiz/ResultsPage.tsx` — CTA paywall | `results-cta-paywall` |
| `src/pages/checkout/CheckoutPage.tsx` — escolha plano | `checkout-plan-onetime`, `checkout-plan-subscription` |
| `src/pages/checkout/CheckoutPage.tsx` — submit | `checkout-submit` |
| `src/pages/checkout/SuccessPage.tsx` — h1 | `checkout-success` |
| `src/pages/dashboard/DashboardHomePage.tsx` — cards | `dashboard-card-analysis`, `dashboard-card-chat` |
| `src/pages/dashboard/ChatPage.tsx` — input | `chat-input` |
| `src/pages/dashboard/ChatPage.tsx` — botão enviar | `chat-send` |
| `src/pages/dashboard/ChatPage.tsx` — bubble user | `chat-bubble-user` |
| `src/pages/dashboard/ChatPage.tsx` — bubble assistant | `chat-bubble-assistant` |
| `src/pages/dashboard/ChatPage.tsx` — cursor a piscar | `chat-streaming-cursor` |

> ⚠️ **Não usar `data-testid` no código de produção apenas para CSS** — só para testes. Se for útil para outra coisa (analytics, accessibility), adicionar atributo dedicado.

---

## 6. `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 4 : '50%',
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'mobile', use: devices['iPhone 14'] },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
```

---

## 7. Fixtures (`e2e/fixtures/`)

### 7.1 `e2e/utils/supabase-admin.ts`

```ts
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !serviceRoleKey) throw new Error('Missing Supabase admin env vars')

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function cleanupE2EData() {
  await supabaseAdmin.from('assessments').delete().ilike('email', '%e2e@%')
  // adicionar outras tabelas conforme necessário
}
```

### 7.2 `e2e/utils/stripe-test-cards.ts`

```ts
export const STRIPE_CARDS = {
  success: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  requires3DS: '4000 0027 6000 3184',
  exp: '12 / 30',
  cvc: '123',
  zip: '1000-001',
}
```

### 7.3 `e2e/fixtures/auth.ts`

> **Pré-requisito no código:** adicionar suporte a `?e2e=1` em `LoginPage.tsx` que aceita um body JSON `{ email }` e cria sessão directamente via `supabase.auth.signInWithIdToken` ou um endpoint `/api/e2e-login` protegido por `INTERNAL_SECRET`.
>
> **Alternativa simpler (recomendada):** criar uma edge function `e2e-login` que recebe um secret + email, gera um magic link e retorna o token de sessão. Activa apenas se `process.env.E2E === 'true'`.

```ts
import { test as base, type Page } from '@playwright/test'

type AuthedFixtures = {
  authedPage: Page
}

export const test = base.extend<AuthedFixtures>({
  authedPage: async ({ page }, use) => {
    const email = `e2e+${Date.now()}@drimigrante.com`
    // Chama a edge function de E2E login
    const response = await page.request.post(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/e2e-login`,
      {
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET! },
        data: { email },
      },
    )
    const { access_token, refresh_token } = await response.json()

    // Injecta a sessão no localStorage do Supabase
    await page.goto('/')
    await page.evaluate(
      ([at, rt]) => {
        localStorage.setItem(
          'sb-krjirhlmdnxqqrpzmowz-auth-token',
          JSON.stringify({ access_token: at, refresh_token: rt }),
        )
      },
      [access_token, refresh_token],
    )
    await page.reload()
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

### 7.4 `e2e/fixtures/seeded.ts`

```ts
import { test as base } from './auth'
import { supabaseAdmin } from '../utils/supabase-admin'

type SeededFixtures = {
  paidUser: { page: Page; userId: string; assessmentId: string }
}

export const test = base.extend<SeededFixtures>({
  paidUser: async ({ authedPage }, use) => {
    // 1. Apanhar o user actual da sessão
    const userId = await authedPage.evaluate(() => {
      const raw = localStorage.getItem('sb-krjirhlmdnxqqrpzmowz-auth-token')
      return raw ? JSON.parse(raw).user?.id : null
    })

    // 2. Criar assessment + result via service role
    const { data: assessment } = await supabaseAdmin
      .from('assessments')
      .insert({ user_id: userId, email: `e2e+seeded@drimigrante.com`, answers: { /* ... */ } })
      .select()
      .single()

    await supabaseAdmin.from('assessment_results').insert({
      assessment_id: assessment!.id,
      score_numeric: 85,
      score_category: 'alta',
      suggested_visa_types: ['D7'],
    })

    // 3. Marcar subscription como paga
    await supabaseAdmin.from('subscriptions').upsert({
      user_id: userId,
      tier: 'recurring',
      recurring_active: true,
      has_dashboard_access: true,
      has_chat_access: true,
      has_full_analysis: true,
    })

    await use({ page: authedPage, userId, assessmentId: assessment!.id })

    // Cleanup
    await supabaseAdmin.from('messages').delete().eq('assessment_id', assessment!.id)
    await supabaseAdmin.from('assessment_results').delete().eq('assessment_id', assessment!.id)
    await supabaseAdmin.from('assessments').delete().eq('id', assessment!.id)
  },
})
```

---

## 8. Page Object Model — exemplos

### 8.1 `e2e/pages/LandingPage.ts`

```ts
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
```

### 8.2 `e2e/pages/QuizPage.ts`

```ts
import type { Page } from '@playwright/test'

export class QuizPage {
  constructor(private readonly page: Page) {}

  async start() {
    await this.page.getByTestId('quiz-intro-start').click()
  }

  async answerWithFirstOption() {
    const options = this.page.locator('[data-testid^="quiz-option-"]')
    await options.first().click()
    await this.page.getByTestId('quiz-next').click()
  }

  async completeAll(maxQuestions = 10) {
    for (let i = 0; i < maxQuestions; i++) {
      if (await this.page.url().includes('/results')) return
      await this.answerWithFirstOption()
    }
  }
}
```

---

## 9. Casos de teste — código completo

### 9.1 `e2e/tests/01-landing.spec.ts`

```ts
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
```

### 9.2 `e2e/tests/02-cookie-consent.spec.ts`

```ts
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

    // PostHog deve disparar ao menos um pageview após accept
    await page.waitForTimeout(1500)
    expect(posthogRequests.length).toBeGreaterThan(0)
  })

  test('rejeitar bloqueia analytics', async ({ page }) => {
    const blockedRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('posthog') || req.url().includes('google-analytics')) {
        blockedRequests.push(req.url())
      }
    })

    await page.goto('/')
    await page.getByTestId('cookie-reject').click()
    await page.waitForTimeout(2000)

    expect(blockedRequests.length).toBe(0)

    const consent = await page.evaluate(() => localStorage.getItem('di_cookie_consent'))
    expect(consent).toBe('denied')
  })
})
```

### 9.3 `e2e/tests/03-quiz-full-flow.spec.ts`

```ts
import { test, expect } from '@playwright/test'
import { LandingPage } from '../pages/LandingPage'
import { QuizPage } from '../pages/QuizPage'

test('quiz completo do início ao /results', async ({ page }) => {
  const landing = new LandingPage(page)
  await landing.goto()
  await landing.acceptCookies()
  await landing.startQuiz()

  const quiz = new QuizPage(page)
  await quiz.start()
  await quiz.completeAll()

  await expect(page).toHaveURL(/\/results/)
  await expect(page.getByTestId('results-score')).toBeVisible()
  await expect(page.getByTestId('results-cta-paywall')).toBeVisible()
})

test('refresh em /results mantém resultado', async ({ page }) => {
  // ... cenário com localStorage seedado
})
```

### 9.4 `e2e/tests/04-checkout-test-mode.spec.ts` (com mock)

```ts
import { test, expect } from '../fixtures/auth'

test('checkout TEST → success page → redirect dashboard', async ({ authedPage: page }) => {
  // Mock da edge function create-checkout-session para evitar Stripe real
  await page.route('**/create-checkout-session', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        url: `${page.url()}/checkout/success?session_id=cs_test_mock_e2e`,
      }),
    })
  })

  await page.goto('/checkout')
  await page.getByTestId('checkout-plan-onetime').click()
  await page.getByTestId('checkout-submit').click()

  await expect(page).toHaveURL(/\/checkout\/success/)
  await expect(page.getByTestId('checkout-success')).toBeVisible()
})

test.describe('Stripe real (smoke, runs em cron semanal)', () => {
  test.skip(({ }, testInfo) => !testInfo.project.name.includes('smoke'), 'só roda em CI smoke')

  test('Stripe Hosted Checkout com 4242', async ({ authedPage: page }) => {
    // ... preencher iframe Stripe com STRIPE_CARDS.success
  })
})
```

### 9.5 `e2e/tests/05-dashboard-and-chat.spec.ts`

```ts
import { test, expect } from '../fixtures/seeded'

test('dashboard mostra cards após pagamento', async ({ paidUser: { page } }) => {
  await page.goto('/dashboard')
  await expect(page.getByTestId('dashboard-card-analysis')).toBeVisible()
  await expect(page.getByTestId('dashboard-card-chat')).toBeVisible()
})

test('chat streaming → tokens aparecem progressivamente', async ({ paidUser: { page } }) => {
  await page.goto('/dashboard/chat')

  await page.getByTestId('chat-input').fill('Olá, qual é o melhor visto para mim?')
  await page.getByTestId('chat-send').click()

  // 1. Bubble do user aparece imediatamente
  await expect(page.getByTestId('chat-bubble-user').last()).toContainText('Olá, qual é o melhor visto')

  // 2. Cursor a piscar enquanto stream
  await expect(page.getByTestId('chat-streaming-cursor')).toBeVisible({ timeout: 3_000 })

  // 3. Texto cresce ao longo do tempo
  const assistantBubble = page.getByTestId('chat-bubble-assistant').last()
  await expect(assistantBubble).not.toBeEmpty({ timeout: 5_000 })

  const initialLength = (await assistantBubble.textContent())?.length ?? 0
  await page.waitForTimeout(2_000)
  const laterLength = (await assistantBubble.textContent())?.length ?? 0
  expect(laterLength).toBeGreaterThan(initialLength)

  // 4. Cursor desaparece quando stream acaba
  await expect(page.getByTestId('chat-streaming-cursor')).toBeHidden({ timeout: 30_000 })
})
```

---

## 10. CI (`.github/workflows/e2e.yml`)

```yaml
name: E2E Tests

on:
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  test:
    timeout-minutes: 15
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3]
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run Playwright tests (shard ${{ matrix.shard }}/3)
        run: npx playwright test --shard=${{ matrix.shard }}/3
        env:
          E2E_BASE_URL: ${{ secrets.E2E_BASE_URL }}
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          INTERNAL_SECRET: ${{ secrets.INTERNAL_SECRET }}

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-shard-${{ matrix.shard }}
          path: playwright-report/
          retention-days: 7
```

**GitHub secrets a configurar:**
- `E2E_BASE_URL` (URL do Vercel preview ou produção)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` ⚠️ **service role — sensível**
- `INTERNAL_SECRET` (para a edge function `e2e-login`)

---

## 11. Edge function `e2e-login` (pré-requisito)

Criar `supabase/functions/e2e-login/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Só responde se E2E mode estiver activo
  if (Deno.env.get('E2E_MODE') !== 'true') {
    return new Response('Disabled', { status: 403 })
  }

  const callerSecret = req.headers.get('x-internal-secret')
  if (callerSecret !== Deno.env.get('INTERNAL_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  const { email } = await req.json()
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Cria utilizador se não existir, gera sessão
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  // ... gerar magic link e converter para sessão
  // (implementação completa precisa de admin.generateLink + signInWithIdToken)

  return new Response(JSON.stringify({ access_token: '...', refresh_token: '...' }))
})
```

> ⚠️ **Esta função só pode ser deployed com `E2E_MODE=true` em ambientes não-produção.** Em produção real, `E2E_MODE` fica unset e a função retorna 403.

---

## 12. Faseamento (sugerido para implementação)

### Fase 1 — Setup + smoke (≈ 30 min)
- [ ] Instalar Playwright e configurar `playwright.config.ts`
- [ ] Adicionar `data-testid` aos componentes Landing + CookieBanner + Footer
- [ ] Implementar `e2e/pages/LandingPage.ts`
- [ ] Implementar `e2e/tests/01-landing.spec.ts` e `02-cookie-consent.spec.ts`
- [ ] `npm run test:e2e` passa localmente

### Fase 2 — Quiz + Checkout mock (≈ 45 min)
- [ ] Adicionar `data-testid` aos componentes do quiz e checkout
- [ ] Implementar `QuizPage` e `CheckoutPage` POMs
- [ ] Implementar `03-quiz-full-flow.spec.ts`
- [ ] Implementar `04-checkout-test-mode.spec.ts` com mock
- [ ] Criar edge function `e2e-login` + fixture `auth.ts`

### Fase 3 — Dashboard, chat streaming, CI (≈ 45 min)
- [ ] Adicionar `data-testid` ao dashboard e chat
- [ ] Implementar fixture `seeded.ts` (paidUser)
- [ ] Implementar `05-dashboard-and-chat.spec.ts`
- [ ] Adicionar `.github/workflows/e2e.yml`
- [ ] Configurar GitHub secrets
- [ ] Validar 1ª corrida no CI

---

## 13. Comandos úteis durante implementação

```bash
# Correr todos os testes (Chromium + Mobile)
npm run test:e2e

# Só desktop, watch mode
npx playwright test --project=chromium --ui

# Debug um teste específico
npx playwright test e2e/tests/03-quiz-full-flow.spec.ts --debug

# Gerar selectors interactivamente (codegen)
npx playwright codegen http://localhost:5173

# Ver último relatório HTML
npx playwright show-report

# Atualizar screenshots/snapshots
npx playwright test --update-snapshots
```

---

## 14. Decisões em aberto (resolver durante implementação)

1. **Mock vs E2E real para Stripe:** plano default = mock para CI por velocidade + estabilidade. Pode adicionar suite `smoke` semanal contra Stripe TEST real se quiser cobrir regressões do redirect.
2. **Onde correr CI:** plano default = `npm run dev` localmente em CI (mais rápido, testa código actual). Alternativa = contra Vercel preview pós-deploy (mais lento, mas testa build de produção).
3. **Visual regression:** não incluído nesta fase. Adicionar com `toHaveScreenshot()` quando layout estabilizar.

---

## 15. Como abrir noutra sessão Claude Code

```bash
cd /Users/rmb/drImigrante
claude  # ou abrir Claude Code IDE extension
```

Mensagem inicial para o agente:
> *"Implementa a Fase 1 do plano `E2E_TEST_PLAN.md` — só Fase 1 por agora. No fim, corre `npm run test:e2e` e mostra-me que passa."*

Quando Fase 1 terminar:
> *"Implementa a Fase 2."*

E assim por diante.
