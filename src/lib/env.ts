/**
 * env — variáveis de ambiente do front (VITE_*), validadas na inicialização (DI-084).
 *
 * Fonte única do que o navegador recebe. Tudo que começa com VITE_ vai para o
 * bundle público: aqui só entram URL e chave anon do Supabase e IDs públicos de
 * analytics/monitoramento. NUNCA coloque service role, chaves do Stripe, da
 * OpenAI ou do Resend em VITE_*.
 *
 * - Obrigatórias ausentes ou inválidas → `EnvValidationError` (falha cedo, em
 *   `src/lib/supabase.ts`), com mensagem que não mostra os valores.
 * - Opcionais inválidas → ignoradas com aviso (um ID de analytics errado na
 *   Vercel não pode derrubar o site).
 *
 * Sem zod de propósito: este módulo roda na primeira carga de toda página, e a
 * biblioteca pesaria no chunk de entrada só para meia dúzia de checagens (DI-055).
 *
 * As chaves ficam declaradas em .env.example e src/vite-env.d.ts;
 * `npm run check-env` confere que código e exemplos batem.
 */

const SETUP_HINT = 'Copie .env.example para .env.local (ou rode `npm run supabase:env`) — veja o README.md.'

type ValidationResult = { value: string } | { error: string }
type Validator = (value: string) => ValidationResult

/** Vazio ou só espaços conta como ausente. */
function blankToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const httpUrl: Validator = (value) => {
  try {
    new URL(value)
  } catch {
    return { error: 'precisa ser uma URL completa' }
  }
  if (!/^https?:\/\//i.test(value)) return { error: 'precisa começar com http:// ou https://' }
  return { value: value.replace(/\/+$/, '') }
}

/** Lê o campo `role` de um JWT sem validar a assinatura (só para detectar engano). */
function jwtRole(token: string): string | undefined {
  const [, payload] = token.split('.')
  if (!payload) return undefined
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')))
    return typeof json?.role === 'string' ? json.role : undefined
  } catch {
    return undefined
  }
}

const anonKey: Validator = (value) =>
  value.startsWith('sb_secret_') || jwtRole(value) === 'service_role'
    ? { error: 'é uma chave SECRETA (service role). No front use só a chave anon/publishable.' }
    : { value }

const anyText: Validator = (value) => ({ value })

const matching =
  (pattern: RegExp, error: string): Validator =>
  (value) =>
    pattern.test(value) ? { value } : { error }

const requiredValidators = {
  VITE_SUPABASE_URL: httpUrl,
  VITE_SUPABASE_ANON_KEY: anonKey,
} satisfies Record<string, Validator>

const optionalValidators = {
  VITE_SUPABASE_FUNCTIONS_URL: httpUrl,
  VITE_APP_URL: httpUrl,
  VITE_APP_ENV: (value) => ({ value: value.toLowerCase() }),
  VITE_SENTRY_DSN: httpUrl,
  VITE_POSTHOG_KEY: anyText,
  VITE_POSTHOG_HOST: httpUrl,
  VITE_GA_MEASUREMENT_ID: matching(/^G-[A-Z0-9]+$/i, 'formato esperado: G-XXXXXXX'),
  VITE_META_PIXEL_ID: matching(/^\d+$/, 'só dígitos'),
  VITE_AUTH_EMAIL_CODE: matching(/^(true|false)$/, 'use true ou false'),
} satisfies Record<string, Validator>

type RequiredKey = keyof typeof requiredValidators
type OptionalKey = keyof typeof optionalValidators

/** Todas as variáveis VITE_* que o app lê (o check-env confere esta lista). */
export const CLIENT_ENV_KEYS = [
  ...(Object.keys(requiredValidators) as RequiredKey[]),
  ...(Object.keys(optionalValidators) as OptionalKey[]),
] as const

export interface ClientEnv {
  supabaseUrl: string
  supabaseAnonKey: string
  /** VITE_SUPABASE_FUNCTIONS_URL ou `<supabaseUrl>/functions/v1`. */
  supabaseFunctionsUrl: string
  appUrl?: string
  appEnv?: string
  sentryDsn?: string
  posthogKey?: string
  posthogHost?: string
  gaMeasurementId?: string
  metaPixelId?: string
  /** Login por código de 6 dígitos (VITE_AUTH_EMAIL_CODE=true). */
  authEmailCode: boolean
}

export type ClientEnvResult =
  | { ok: true; env: ClientEnv; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] }

function validate(value: unknown, validator: Validator): ValidationResult {
  return typeof value === 'string' ? validator(value) : { error: 'precisa ser um texto' }
}

/** Valida um objeto de variáveis (ex.: `import.meta.env`). Função pura, testável. */
export function parseClientEnv(raw: Record<string, unknown>): ClientEnvResult {
  const warnings: string[] = []
  const optional: Partial<Record<OptionalKey, string>> = {}

  for (const key of Object.keys(optionalValidators) as OptionalKey[]) {
    const value = blankToUndefined(raw[key])
    if (value === undefined) continue
    const result = validate(value, optionalValidators[key])
    if ('error' in result) warnings.push(`${key}: ${result.error} (ignorada)`)
    else optional[key] = result.value
  }

  const errors: string[] = []
  const required: Partial<Record<RequiredKey, string>> = {}

  for (const key of Object.keys(requiredValidators) as RequiredKey[]) {
    const value = blankToUndefined(raw[key])
    if (value === undefined) {
      errors.push(`${key}: obrigatória`)
      continue
    }
    const result = validate(value, requiredValidators[key])
    if ('error' in result) errors.push(`${key}: ${result.error}`)
    else required[key] = result.value
  }

  const { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_ANON_KEY: supabaseAnonKey } = required
  if (!supabaseUrl || !supabaseAnonKey) return { ok: false, errors, warnings }

  return {
    ok: true,
    warnings,
    env: {
      supabaseUrl,
      supabaseAnonKey,
      supabaseFunctionsUrl: optional.VITE_SUPABASE_FUNCTIONS_URL ?? `${supabaseUrl}/functions/v1`,
      appUrl: optional.VITE_APP_URL,
      appEnv: optional.VITE_APP_ENV,
      sentryDsn: optional.VITE_SENTRY_DSN,
      posthogKey: optional.VITE_POSTHOG_KEY,
      posthogHost: optional.VITE_POSTHOG_HOST,
      gaMeasurementId: optional.VITE_GA_MEASUREMENT_ID,
      metaPixelId: optional.VITE_META_PIXEL_ID,
      authEmailCode: optional.VITE_AUTH_EMAIL_CODE === 'true',
    },
  }
}

export class EnvValidationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(`Variáveis de ambiente inválidas:\n- ${errors.join('\n- ')}\n${SETUP_HINT}`)
    this.name = 'EnvValidationError'
    this.errors = errors
  }
}

/** Valida e devolve o env, ou lança `EnvValidationError`. */
export function loadClientEnv(raw: Record<string, unknown>): ClientEnv {
  const result = parseClientEnv(raw)
  if (result.warnings.length > 0 && import.meta.env.DEV) {
    console.warn(`[env] ${result.warnings.join('\n[env] ')}`)
  }
  if (!result.ok) throw new EnvValidationError(result.errors)
  return result.env
}

let cached: ClientEnv | null = null

/** Env do build atual (`import.meta.env`), validado uma vez. */
export function getClientEnv(): ClientEnv {
  cached ??= loadClientEnv(import.meta.env as unknown as Record<string, unknown>)
  return cached
}
