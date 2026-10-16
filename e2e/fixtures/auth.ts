import { randomBytes } from 'node:crypto'
import { test as base, type Page, type TestInfo } from '@playwright/test'

export type AuthedUser = { id: string; email: string }

type AuthedFixtures = {
  authedPage: Page
  authedUser: AuthedUser
}

/**
 * Projeto Supabase de PRODUÇÃO. Os testes autenticados nunca rodam contra ele
 * (DI-003): o fixture pula o teste e a function e2e-login recusa o pedido.
 */
const PRODUCTION_PROJECT_REF = 'krjirhlmdnxqqrpzmowz'

type E2ELoginConfig =
  | { ok: true; supabaseUrl: string; loginUrl: string; secret: string }
  | { ok: false; reason: string }

/**
 * Lê a configuração dos testes autenticados. Sem Supabase local/staging
 * configurado, os testes que dependem deste fixture (specs 04-autenticado e 05)
 * ficam em skip com o motivo — ver docs/testes.md.
 */
function resolveE2ELoginConfig(): E2ELoginConfig {
  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? ''
  const secret = process.env.E2E_LOGIN_SECRET ?? ''
  const loginUrl = process.env.E2E_LOGIN_URL || `${supabaseUrl}/functions/v1/e2e-login`

  if (!supabaseUrl || !secret) {
    return {
      ok: false,
      reason:
        'Testes autenticados exigem Supabase local/staging: defina VITE_SUPABASE_URL e ' +
        'E2E_LOGIN_SECRET (ver docs/testes.md).',
    }
  }
  if (supabaseUrl.includes(PRODUCTION_PROJECT_REF) || loginUrl.includes(PRODUCTION_PROJECT_REF)) {
    return {
      ok: false,
      reason:
        'VITE_SUPABASE_URL aponta para PRODUÇÃO. Testes autenticados só rodam contra ' +
        'Supabase local/staging (ver docs/testes.md).',
    }
  }
  return { ok: true, supabaseUrl, loginUrl, secret }
}

/**
 * Chave do localStorage onde o supabase-js guarda a sessão. Mesma regra do
 * SDK: `sb-${hostname.split('.')[0]}-auth-token` (127.0.0.1 → sb-127-auth-token).
 */
function storageKeyFromUrl(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

/** E-mail aceito pela allowlist da e2e-login (domínio reservado .test). */
function e2eEmail(): string {
  return `e2e+${Date.now()}-${randomBytes(4).toString('hex')}@drimigrante.test`
}

async function login(page: Page, testInfo: TestInfo): Promise<AuthedUser> {
  const config = resolveE2ELoginConfig()
  if (!config.ok) {
    testInfo.skip(true, config.reason)
    throw new Error(config.reason) // inalcançável: skip interrompe o teste
  }

  const email = e2eEmail()
  const response = await page.request.post(config.loginUrl, {
    headers: { 'x-e2e-login-secret': config.secret },
    data: { email },
  })
  if (!response.ok()) {
    const text = await response.text().catch(() => '<sem corpo>')
    throw new Error(`e2e-login falhou (${response.status()}): ${text}`)
  }
  const body = (await response.json()) as {
    access_token: string
    refresh_token: string
    user: { id: string; email: string }
  }

  // Monta a Session completa que o supabase-js espera. Guardar só
  // { access_token, refresh_token } NÃO basta: o SDK precisa de expires_at + user.
  const payload = JSON.parse(
    Buffer.from(body.access_token.split('.')[1], 'base64').toString('utf-8'),
  ) as {
    sub: string
    email: string
    exp: number
    iat: number
    aud: string
    role: string
    app_metadata?: Record<string, unknown>
    user_metadata?: Record<string, unknown>
  }

  const session = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    token_type: 'bearer',
    expires_in: payload.exp - payload.iat,
    expires_at: payload.exp,
    user: {
      id: payload.sub,
      aud: payload.aud,
      role: payload.role,
      email: payload.email,
      app_metadata: payload.app_metadata ?? {},
      user_metadata: payload.user_metadata ?? {},
      identities: [],
      created_at: new Date(payload.iat * 1000).toISOString(),
      updated_at: new Date(payload.iat * 1000).toISOString(),
    },
  }

  const storageKey = storageKeyFromUrl(config.supabaseUrl)

  await page.goto('/')
  await page.evaluate(
    ({ key, sess }) => localStorage.setItem(key, JSON.stringify(sess)),
    { key: storageKey, sess: session },
  )
  await page.reload()

  return body.user
}

export const test = base.extend<AuthedFixtures>({
  authedUser: async ({ page }, use, testInfo) => {
    const user = await login(page, testInfo)
    await use(user)
  },
  authedPage: async ({ page, authedUser }, use) => {
    // authedUser dispara `login(page)`; aqui `page` já está autenticada.
    void authedUser
    await use(page)
  },
})

export { expect } from '@playwright/test'
