import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

// Load .env.local so process.env carries SUPABASE_SERVICE_ROLE_KEY,
// INTERNAL_SECRET, etc. into the Playwright runner (the Vite dev server
// reads these on its own, but the test process does not).
loadEnv({ path: '.env.local' })

// Use `||` (not `??`) so empty strings — which is what GitHub Actions injects
// when an unset secret is referenced — fall back to the local dev defaults.
const E2E_BASE_URL = process.env.E2E_BASE_URL || ''

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 4 : '50%',
  reporter: process.env.CI ? [['html'], ['github']] : 'list',
  use: {
    baseURL: E2E_BASE_URL || 'http://localhost:5173',
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
  webServer: E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        port: 5173,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
})
