import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import {
  LOCAL_SUPABASE_URL,
  assertSafeTestTarget,
} from './scripts/lib/test-target-guard.mjs'

// E2E nunca toca produção (DI-060).
//
// - Variáveis vêm SÓ do ambiente e do `.env.test.local` (gerado por
//   `npm run supabase:env`). O `.env.local` NÃO é lido aqui: ele pode ter as
//   chaves de produção do desenvolvedor.
// - Sem configuração, o alvo é o Supabase local (`supabase start`).
// - A trava `assertSafeTestTarget` recusa o projeto e os domínios de produção e
//   qualquer host remoto que não esteja em E2E_ALLOWED_REMOTE_HOSTS (staging).
//
// Dois modos (E2E_SUPABASE):
// - `local` (padrão): o app fala com o Supabase local. Roda tudo, menos os
//   testes de MOCKED_SUPABASE_TESTS.
// - `mock`: o app aponta para um host fictício (MOCK_SUPABASE_URL) e roda SÓ
//   MOCKED_SUPABASE_TESTS. Esses testes do spec 06 interceptam as chamadas por
//   `*.supabase.co` e abortam o resto, então nenhuma requisição sai da máquina.
//   Sem service role nem segredos: o .env.test.local não é lido.
//   `npm run test:e2e:mock`.

const MODE = process.env.E2E_SUPABASE === 'mock' ? 'mock' : 'local'

/** Host fictício (não é um ref válido do Supabase: refs não têm hífen). */
const MOCK_SUPABASE_URL = 'https://e2e-mock.supabase.co'

/**
 * Testes do navegador que mockam o Supabase pelo host `*.supabase.co`
 * (e2e/tests/06-quiz-branching.spec.ts). Contra o Supabase local eles não
 * interceptam nada; por isso rodam só no modo `mock`.
 */
const MOCKED_SUPABASE_TESTS = /quiz no navegador — ramificação|admin do quiz — editor/

if (MODE === 'local') {
  loadEnv({ path: '.env.test.local', quiet: true })
} else {
  // Nada de credencial no modo mock, nem herdada do ambiente.
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'E2E_LOGIN_SECRET', 'INTERNAL_SECRET', 'E2E_LOGIN_URL']) {
    delete process.env[key]
  }
}

/**
 * Porta fixa do projeto (a mesma de supabase/config.toml → auth.site_url).
 * E2E_PORT troca a porta quando o dev server já ocupa a 33401.
 */
const PORT = Number(process.env.E2E_PORT) || 33401

// `||` (não `??`): o GitHub Actions injeta string vazia para secret ausente.
const supabaseUrl =
  MODE === 'mock' ? MOCK_SUPABASE_URL : process.env.VITE_SUPABASE_URL || LOCAL_SUPABASE_URL
const externalBaseUrl = process.env.E2E_BASE_URL || ''
const baseURL = externalBaseUrl || `http://localhost:${PORT}`

assertSafeTestTarget({
  supabaseUrl,
  baseUrl: externalBaseUrl,
  loginUrl: process.env.E2E_LOGIN_URL,
  allowedRemoteHosts:
    MODE === 'mock' ? [new URL(MOCK_SUPABASE_URL).hostname] : process.env.E2E_ALLOWED_REMOTE_HOSTS,
})

// Os specs e fixtures leem process.env (ex.: chave da sessão no localStorage):
// todos enxergam o mesmo Supabase que o dev server do teste.
process.env.VITE_SUPABASE_URL = supabaseUrl

// Sem chave anon, specs 100% mockados continuam rodando; os que leem o banco
// local falham com erro de rede (rode `npm run supabase:start` e `supabase:env`).
const supabaseAnonKey =
  (MODE === 'local' && process.env.VITE_SUPABASE_ANON_KEY) || 'e2e-sem-chave-anon'

const modeFilter = MODE === 'mock' ? { grep: MOCKED_SUPABASE_TESTS } : { grepInvert: MOCKED_SUPABASE_TESTS }

export default defineConfig({
  testDir: './e2e/tests',
  // Cada modo com sua pasta: rodar um não apaga os artefatos do outro.
  outputDir: MODE === 'mock' ? 'test-results/mock' : 'test-results/local',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 2 : '50%',
  reporter: process.env.CI
    ? [['html', { open: 'never', outputFolder: `playwright-report/${MODE}` }], ['github']]
    : 'list',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'pt-PT',
    timezoneId: 'Europe/Lisbon',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'], ...modeFilter },
    { name: 'mobile', use: devices['iPhone 14'], ...modeFilter },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npx vite --port ${PORT} --strictPort`,
        url: baseURL,
        // Reaproveitar um dev server já aberto só quando pedido: ele pode estar
        // apontando para o Supabase de produção (.env.local).
        reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
        timeout: 120_000,
        // Variáveis do processo têm prioridade sobre os arquivos .env do Vite.
        env: {
          VITE_SUPABASE_URL: supabaseUrl,
          VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
          VITE_SUPABASE_FUNCTIONS_URL: `${supabaseUrl.replace(/\/+$/, '')}/functions/v1`,
          VITE_APP_URL: baseURL,
          VITE_APP_ENV: 'test',
          // Nada de analytics nem Sentry no E2E.
          VITE_POSTHOG_KEY: '',
          VITE_GA_MEASUREMENT_ID: '',
          VITE_META_PIXEL_ID: '',
          VITE_SENTRY_DSN: '',
        },
      },
})
