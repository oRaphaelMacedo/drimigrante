/**
 * auth-user-data — carrega perfil, assinatura e papéis com timeout, retry e
 * backoff (DI-025).
 *
 * Regra principal: falha ao carregar NÃO é "sem assinatura". Se a consulta de
 * `subscriptions` ou de `user_roles` falhar (erro do PostgREST, rede, timeout),
 * a função lança `UserDataLoadError` em vez de devolver `subscription: null`,
 * para que ninguém trate um pagante como não pagante (risco de cobrança dupla).
 *
 * O perfil é tratado como não crítico: um erro só nele vira `profile: null`
 * e é reportado por `onProfileError`.
 *
 * Módulo sem React para poder ser testado isoladamente; o AuthContext injeta
 * as consultas do Supabase.
 */
import type { AppRole, Profile, Subscription } from '@/lib/database.types'

export interface UserDataSnapshot {
  profile: Profile | null
  subscription: Subscription | null
  roles: AppRole[]
}

/** Formato mínimo da resposta do supabase-js (`{ data, error }`). */
export interface QueryResult<T> {
  data: T | null
  error: { message: string; code?: string } | null
}

/**
 * Consultas injetadas. Recebem o `AbortSignal` da tentativa: no timeout a
 * requisição é cancelada de verdade (não fica pendurada consumindo rede).
 * As consultas do Supabase devem usar `.retry(false)` — o retry é feito aqui,
 * com orçamento de tempo conhecido.
 */
export interface UserDataQueries {
  profile: (signal: AbortSignal) => PromiseLike<QueryResult<Profile>>
  subscription: (signal: AbortSignal) => PromiseLike<QueryResult<Subscription>>
  roles: (signal: AbortSignal) => PromiseLike<QueryResult<Array<{ role: AppRole }>>>
}

export interface LoadUserDataOptions {
  /** Número total de tentativas (padrão 3). */
  attempts?: number
  /** Tempo máximo de cada tentativa, em ms (padrão 8000). */
  timeoutMs?: number
  /** Espera antes da 2ª tentativa; dobra a cada nova tentativa (padrão 1000). */
  baseDelayMs?: number
  /** Injetável nos testes. */
  sleep?: (ms: number) => Promise<void>
  /** Chamado a cada tentativa que falhou (para log/Sentry). */
  onAttemptError?: (error: unknown, attempt: number) => void
  /** Chamado quando só o perfil falhou (não é fatal). */
  onProfileError?: (error: unknown) => void
}

export const USER_DATA_DEFAULTS = {
  attempts: 3,
  timeoutMs: 8000,
  baseDelayMs: 1000,
} as const

export class UserDataLoadError extends Error {
  readonly attempts: number
  readonly cause: unknown

  constructor(cause: unknown, attempts: number) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`Falha ao carregar os dados da conta após ${attempts} tentativa(s): ${reason}`)
    this.name = 'UserDataLoadError'
    this.attempts = attempts
    this.cause = cause
  }
}

export class UserDataTimeoutError extends Error {
  constructor(ms: number) {
    super(`Tempo esgotado ao carregar os dados da conta (${ms} ms)`)
    this.name = 'UserDataTimeoutError'
  }
}

class QueryError extends Error {
  readonly code?: string

  constructor(table: string, error: { message: string; code?: string }) {
    super(`${table}: ${error.message}`)
    this.name = 'QueryError'
    this.code = error.code
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function withTimeout<T>(promise: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new UserDataTimeoutError(ms))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

async function loadOnce(
  queries: UserDataQueries,
  timeoutMs: number,
  onProfileError?: (error: unknown) => void,
): Promise<UserDataSnapshot> {
  const controller = new AbortController()
  const { signal } = controller
  const [profileRes, subscriptionRes, rolesRes] = await withTimeout(
    Promise.all([
      Promise.resolve(queries.profile(signal)),
      Promise.resolve(queries.subscription(signal)),
      Promise.resolve(queries.roles(signal)),
    ]),
    timeoutMs,
    controller,
  )

  // Assinatura e papéis decidem o acesso: erro aqui é fatal (vai para retry).
  if (subscriptionRes.error) throw new QueryError('subscriptions', subscriptionRes.error)
  if (rolesRes.error) throw new QueryError('user_roles', rolesRes.error)

  if (profileRes.error) onProfileError?.(new QueryError('profiles', profileRes.error))

  return {
    profile: profileRes.error ? null : (profileRes.data ?? null),
    subscription: subscriptionRes.data ?? null,
    roles: (rolesRes.data ?? []).map((r) => r.role),
  }
}

/**
 * Carrega os dados da conta com retry e backoff exponencial.
 * Resolve com o snapshot ou lança `UserDataLoadError` depois da última tentativa.
 */
export async function loadUserDataWithRetry(
  queries: UserDataQueries,
  options: LoadUserDataOptions = {},
): Promise<UserDataSnapshot> {
  const attempts = Math.max(1, options.attempts ?? USER_DATA_DEFAULTS.attempts)
  const timeoutMs = options.timeoutMs ?? USER_DATA_DEFAULTS.timeoutMs
  const baseDelayMs = options.baseDelayMs ?? USER_DATA_DEFAULTS.baseDelayMs
  const sleep = options.sleep ?? defaultSleep

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await loadOnce(queries, timeoutMs, options.onProfileError)
    } catch (error) {
      lastError = error
      options.onAttemptError?.(error, attempt)
      if (attempt < attempts) await sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
  throw new UserDataLoadError(lastError, attempts)
}

/**
 * Compara dois snapshots para evitar re-render (e reset de formulários) quando
 * um refresh em segundo plano devolve exatamente os mesmos dados.
 */
export function isSameSnapshot(a: UserDataSnapshot, b: UserDataSnapshot): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
