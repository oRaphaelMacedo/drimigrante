// handler.ts — regras de acesso do e2e-login, sem imports remotos (testável
// com `deno test`). O index.ts injeta a criação real da sessão.
//
// Esta function existe SÓ para testes E2E contra Supabase local ou staging.
// Ela NUNCA entra em deploy de produção (DI-003): além de enabled = false no
// supabase/config.toml, o handler recusa o projeto de produção mesmo que o
// código seja publicado lá por engano.

export const PRODUCTION_PROJECT_REF = 'krjirhlmdnxqqrpzmowz'

/** Únicos e-mails aceitos: os gerados pelo fixture e2e/fixtures/auth.ts. */
export const E2E_EMAIL_PATTERN = /^e2e\+[0-9]+-[a-z0-9]+@drimigrante\.test$/

/** Cabeçalho com o segredo próprio desta function (não é o INTERNAL_SECRET). */
export const SECRET_HEADER = 'x-e2e-login-secret'

/** Segredos curtos demais são tratados como ausentes. */
export const MIN_SECRET_LENGTH = 32

export type EnvGetter = (name: string) => string | undefined

export interface E2ESession {
  access_token: string
  refresh_token: string
  user: { id: string | undefined; email: string | undefined }
}

export type CreateSession = (email: string) => Promise<E2ESession>

export interface HandlerDeps {
  env: EnvGetter
  createSession: CreateSession
  logError?: (message: string) => void
}

const FORBIDDEN = { error: 'Forbidden' }
const BAD_REQUEST = { error: 'Bad request' }
const INTERNAL_ERROR = { error: 'Internal error' }

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export function isProductionUrl(url: string): boolean {
  return url.toLowerCase().includes(PRODUCTION_PROJECT_REF)
}

/**
 * Comparação em tempo constante: compara os SHA-256 dos dois valores, então o
 * tempo não depende do tamanho nem do primeiro byte diferente.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const x = new Uint8Array(hashA)
  const y = new Uint8Array(hashB)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export function createHandler(deps: HandlerDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
      return json(405, { error: 'Method not allowed' })
    }

    // 1. Desligada fora do modo E2E.
    if (deps.env('E2E_MODE') !== 'true') {
      return json(403, FORBIDDEN)
    }

    // 2. Nunca no projeto de produção.
    const supabaseUrl = deps.env('SUPABASE_URL') ?? ''
    if (!supabaseUrl || isProductionUrl(supabaseUrl)) {
      return json(403, FORBIDDEN)
    }

    // 3. Segredo próprio, comparado em tempo constante.
    const expectedSecret = deps.env('E2E_LOGIN_SECRET') ?? ''
    const providedSecret = req.headers.get(SECRET_HEADER) ?? ''
    if (
      expectedSecret.length < MIN_SECRET_LENGTH ||
      !(await timingSafeEqual(providedSecret, expectedSecret))
    ) {
      return json(403, FORBIDDEN)
    }

    // 4. Só e-mails de teste no domínio reservado .test.
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return json(400, BAD_REQUEST)
    }
    const email =
      body && typeof body === 'object' ? (body as { email?: unknown }).email : undefined
    if (typeof email !== 'string' || !E2E_EMAIL_PATTERN.test(email)) {
      return json(400, BAD_REQUEST)
    }

    // 5. Sessão real; detalhes de erro só no log do servidor.
    try {
      const session = await deps.createSession(email)
      return json(200, session)
    } catch (err) {
      deps.logError?.(err instanceof Error ? err.message : String(err))
      return json(500, INTERNAL_ERROR)
    }
  }
}
