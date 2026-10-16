/**
 * env — variáveis de ambiente do front (VITE_*), validadas com zod (DI-084).
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
 * As chaves ficam declaradas em .env.example e src/vite-env.d.ts;
 * `npm run check-env` confere que código e exemplos batem.
 */
import { z } from 'zod'

const SETUP_HINT = 'Copie .env.example para .env.local (ou rode `npm run supabase:env`) — veja o README.md.'

/** Vazio ou só espaços conta como ausente. */
function blankToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const httpUrl = z
  .string()
  .url('precisa ser uma URL completa')
  .refine((value) => /^https?:\/\//i.test(value), 'precisa começar com http:// ou https://')
  .transform((value) => value.replace(/\/+$/, ''))

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

const anonKey = z.string().superRefine((value, ctx) => {
  if (value.startsWith('sb_secret_') || jwtRole(value) === 'service_role') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'é uma chave SECRETA (service role). No front use só a chave anon/publishable.',
    })
  }
})

const requiredSchema = z.object({
  VITE_SUPABASE_URL: z.preprocess(
    blankToUndefined,
    z.string({ required_error: 'obrigatória' }).pipe(httpUrl),
  ),
  VITE_SUPABASE_ANON_KEY: z.preprocess(
    blankToUndefined,
    z.string({ required_error: 'obrigatória' }).pipe(anonKey),
  ),
})

const optionalSchemas = {
  VITE_SUPABASE_FUNCTIONS_URL: httpUrl,
  VITE_APP_URL: httpUrl,
  VITE_APP_ENV: z.string().transform((value) => value.toLowerCase()),
  VITE_SENTRY_DSN: httpUrl,
  VITE_POSTHOG_KEY: z.string(),
  VITE_POSTHOG_HOST: httpUrl,
  VITE_GA_MEASUREMENT_ID: z.string().regex(/^G-[A-Z0-9]+$/i, 'formato esperado: G-XXXXXXX'),
  VITE_META_PIXEL_ID: z.string().regex(/^\d+$/, 'só dígitos'),
  VITE_AUTH_EMAIL_CODE: z.enum(['true', 'false'], {
    errorMap: () => ({ message: 'use true ou false' }),
  }),
} as const

type OptionalKey = keyof typeof optionalSchemas

/** Todas as variáveis VITE_* que o app lê (o check-env confere esta lista). */
export const CLIENT_ENV_KEYS = [
  ...(Object.keys(requiredSchema.shape) as (keyof typeof requiredSchema.shape)[]),
  ...(Object.keys(optionalSchemas) as OptionalKey[]),
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

function issuesOf(key: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const field = issue.path.length > 0 ? String(issue.path[0]) : key
    return `${field}: ${issue.message}`
  })
}

/** Valida um objeto de variáveis (ex.: `import.meta.env`). Função pura, testável. */
export function parseClientEnv(raw: Record<string, unknown>): ClientEnvResult {
  const warnings: string[] = []
  const optional: Partial<Record<OptionalKey, string>> = {}

  for (const key of Object.keys(optionalSchemas) as OptionalKey[]) {
    const value = blankToUndefined(raw[key])
    if (value === undefined) continue
    const parsed = optionalSchemas[key].safeParse(value)
    if (parsed.success) optional[key] = parsed.data
    else warnings.push(`${issuesOf(key, parsed.error).join('; ')} (ignorada)`)
  }

  const required = requiredSchema.safeParse(raw)
  if (!required.success) {
    return { ok: false, errors: issuesOf('env', required.error), warnings }
  }

  const supabaseUrl = required.data.VITE_SUPABASE_URL
  return {
    ok: true,
    warnings,
    env: {
      supabaseUrl,
      supabaseAnonKey: required.data.VITE_SUPABASE_ANON_KEY,
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
