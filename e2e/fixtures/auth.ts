import { test as base, type Page } from '@playwright/test'

export type AuthedUser = { id: string; email: string }

type AuthedFixtures = {
  authedPage: Page
  authedUser: AuthedUser
}

/**
 * Derives Supabase's localStorage auth key (`sb-{ref}-auth-token`) from the
 * project URL. The ref is the subdomain before `.supabase.co`.
 */
function storageKeyFromUrl(url: string): string {
  const m = url.match(/^https?:\/\/([^.]+)\./)
  if (!m) throw new Error(`Cannot derive Supabase ref from URL: ${url}`)
  return `sb-${m[1]}-auth-token`
}

async function login(page: Page): Promise<AuthedUser> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const internalSecret = process.env.INTERNAL_SECRET
  if (!supabaseUrl || !internalSecret) {
    throw new Error(
      'authedPage fixture requires VITE_SUPABASE_URL and INTERNAL_SECRET env vars. ' +
        'Deploy the `e2e-login` edge function and set E2E_MODE=true + INTERNAL_SECRET in Supabase, ' +
        'then export the same INTERNAL_SECRET locally.',
    )
  }

  const email = `e2e+${Date.now()}@drimigrante.com`
  const response = await page.request.post(
    `${supabaseUrl}/functions/v1/e2e-login`,
    {
      headers: { 'x-internal-secret': internalSecret },
      data: { email },
    },
  )
  if (!response.ok()) {
    const text = await response.text().catch(() => '<no body>')
    throw new Error(`e2e-login failed (${response.status()}): ${text}`)
  }
  const body = (await response.json()) as {
    access_token: string
    refresh_token: string
    user: { id: string; email: string }
  }

  // Decode the JWT to build the full Session object supabase-js expects.
  // Just storing { access_token, refresh_token } is NOT enough — the SDK
  // needs at minimum expires_at + user to consider the session valid.
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

  const storageKey = storageKeyFromUrl(supabaseUrl)

  await page.goto('/')
  await page.evaluate(
    ({ key, sess }) => localStorage.setItem(key, JSON.stringify(sess)),
    { key: storageKey, sess: session },
  )
  await page.reload()

  return body.user
}

export const test = base.extend<AuthedFixtures>({
  authedUser: async ({ page }, use) => {
    const user = await login(page)
    await use(user)
  },
  authedPage: async ({ page, authedUser }, use) => {
    // authedUser triggers `login(page)`; `page` is now authenticated.
    void authedUser
    await use(page)
  },
})

export { expect } from '@playwright/test'
