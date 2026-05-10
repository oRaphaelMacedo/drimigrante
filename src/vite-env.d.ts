/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string
  readonly VITE_STRIPE_PRICE_ONE_TIME: string
  readonly VITE_STRIPE_PRICE_SUBSCRIPTION: string
  readonly VITE_GA_MEASUREMENT_ID: string
  readonly VITE_POSTHOG_KEY: string
  readonly VITE_POSTHOG_HOST: string
  readonly VITE_SENTRY_DSN: string
  readonly VITE_APP_URL: string
  readonly VITE_APP_ENV: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
