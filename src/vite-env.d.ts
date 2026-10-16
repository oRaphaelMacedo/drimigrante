/// <reference types="vite/client" />

/**
 * Variáveis VITE_* (públicas: entram no bundle). Validação em src/lib/env.ts,
 * exemplos em .env.example; `npm run check-env` confere que as três listas batem.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPABASE_FUNCTIONS_URL?: string
  readonly VITE_APP_URL?: string
  readonly VITE_APP_ENV?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_POSTHOG_KEY?: string
  readonly VITE_POSTHOG_HOST?: string
  readonly VITE_GA_MEASUREMENT_ID?: string
  readonly VITE_META_PIXEL_ID?: string
  readonly VITE_AUTH_EMAIL_CODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
