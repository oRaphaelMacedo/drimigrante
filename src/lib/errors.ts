/**
 * Mensagens de erro para o usuário (DI-032).
 *
 * Regra: nenhum `err.message` cru chega à tela. Erros técnicos (em inglês, com
 * detalhes internos) viram uma frase curta em português, com o que a pessoa
 * pode fazer em seguida.
 *
 * - `toUserMessage(error)` — síncrono; usa o tipo do erro e o status HTTP.
 * - `toUserError(error)` — assíncrono; lê também o corpo JSON das Edge
 *   Functions (`{ error: 'already_active', message }`) para escolher a mensagem
 *   pelo código do servidor.
 *
 * Reconhece os erros do supabase-js (`FunctionsHttpError` com a Response em
 * `context`, `FunctionsFetchError` e `FunctionsRelayError`), timeouts
 * (`TimeoutError`/`AbortError`) e a falta de conexão (`navigator.onLine`).
 */

export type UserErrorKind = 'offline' | 'timeout' | 'network' | 'http' | 'relay' | 'unknown'

export interface UserFacingError {
  kind: UserErrorKind
  /** Status HTTP da resposta, quando houve resposta. */
  status: number | null
  /** Código devolvido pelo servidor no corpo (`{ error: '...' }`), quando houver. */
  code: string | null
  /** Frase em português pronta para exibir. */
  message: string
  /** Vale a pena oferecer "Tentar novamente". */
  retryable: boolean
}

export interface ToUserErrorOptions {
  /** Mensagem quando nada mais específico se aplica. */
  fallback?: string
  /** Mensagens por código do servidor (sobrepõem as padrão). */
  codeMessages?: Partial<Record<string, string>>
}

export const DEFAULT_ERROR_MESSAGE = 'Algo deu errado. Tente novamente em instantes.'

const KIND_MESSAGES: Record<Exclude<UserErrorKind, 'http' | 'unknown'>, string> = {
  offline: 'Você está sem internet. Conecte-se e tente novamente.',
  timeout: 'O servidor demorou para responder. Verifique sua conexão e tente novamente.',
  network: 'Não conseguimos falar com o servidor. Verifique sua conexão e tente novamente.',
  relay: 'Não conseguimos falar com o servidor. Tente novamente em instantes.',
}

/** Mensagens padrão pelos códigos que as Edge Functions devolvem. */
export const SERVER_CODE_MESSAGES: Readonly<Record<string, string>> = {
  already_active: 'Você já tem acesso ativo. Abra seu painel para ver sua análise.',
  assessment_not_found:
    'Não encontramos seu diagnóstico. Se você já tem conta, entre com o e-mail usado no quiz.',
  unauthorized: 'Sua sessão expirou. Entre de novo para continuar.',
  invalid_request: 'Alguns dados não conferem. Atualize a página e tente novamente.',
  payment_not_completed: 'O pagamento ainda não foi confirmado.',
  one_time_required: 'Esta opção fica disponível depois da compra da análise completa.',
  rate_limited: 'Muitas tentativas seguidas. Aguarde um minuto e tente novamente.',
}

function statusMessage(status: number): string | null {
  if (status === 400) return SERVER_CODE_MESSAGES.invalid_request
  if (status === 401) return SERVER_CODE_MESSAGES.unauthorized
  if (status === 403) return 'Não foi possível confirmar seus dados para esta ação.'
  if (status === 404) return 'Não encontramos o que você procurava.'
  if (status === 408) return KIND_MESSAGES.timeout
  if (status === 409) return SERVER_CODE_MESSAGES.already_active
  if (status === 429) return SERVER_CODE_MESSAGES.rate_limited
  if (status >= 500) return 'Tivemos um problema do nosso lado. Tente novamente em instantes.'
  return null
}

/** Erro de tempo esgotado (use em `controller.abort(new TimeoutError())`). */
export class TimeoutError extends Error {
  constructor(message = 'Tempo esgotado') {
    super(message)
    this.name = 'TimeoutError'
  }
}

function errorName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const name = (value as { name?: unknown }).name
  return typeof name === 'string' ? name : null
}

function errorContext(value: unknown): unknown {
  if (!value || typeof value !== 'object') return undefined
  return (value as { context?: unknown }).context
}

/** Erro de cancelamento/timeout (direto ou dentro de um `FunctionsFetchError`). */
export function isAbortError(error: unknown): boolean {
  const names = [errorName(error), errorName(errorContext(error))]
  return names.some((name) => name === 'AbortError' || name === 'TimeoutError')
}

function isOffline(): boolean {
  try {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  } catch {
    return false
  }
}

interface ResponseLike {
  status: number
  clone?: () => ResponseLike
  json?: () => Promise<unknown>
  bodyUsed?: boolean
}

function asResponseLike(value: unknown): ResponseLike | null {
  if (!value || typeof value !== 'object') return null
  const status = (value as { status?: unknown }).status
  return typeof status === 'number' ? (value as ResponseLike) : null
}

/** Status HTTP de um erro (FunctionsHttpError, PostgrestError com `status`…), se houver. */
export function getErrorStatus(error: unknown): number | null {
  if (errorName(error) === 'FunctionsHttpError') return asResponseLike(errorContext(error))?.status ?? null
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

function classify(error: unknown): { kind: UserErrorKind; status: number | null } {
  if (isAbortError(error)) return { kind: 'timeout', status: null }
  const name = errorName(error)
  if (name === 'FunctionsHttpError') return { kind: 'http', status: getErrorStatus(error) }
  if (name === 'FunctionsRelayError') return { kind: 'relay', status: null }
  if (isOffline()) return { kind: 'offline', status: null }
  // fetch() rejeita com TypeError ("Failed to fetch", "Load failed"…) sem rede.
  if (name === 'FunctionsFetchError' || error instanceof TypeError) return { kind: 'network', status: null }
  const status = getErrorStatus(error)
  if (status !== null) return { kind: 'http', status }
  return { kind: 'unknown', status: null }
}

/** Falhas de rede/tempo e erros 5xx/408/429 costumam passar numa nova tentativa; 4xx não. */
function isRetryable(kind: UserErrorKind, status: number | null): boolean {
  if (kind !== 'http' || status === null) return true
  return status === 408 || status === 429 || status >= 500
}

function buildMessage(
  kind: UserErrorKind,
  status: number | null,
  code: string | null,
  options: ToUserErrorOptions,
): string {
  const fallback = options.fallback ?? DEFAULT_ERROR_MESSAGE
  if (code) {
    const byCode = options.codeMessages?.[code] ?? SERVER_CODE_MESSAGES[code]
    if (byCode) return byCode
  }
  if (kind === 'http') return (status !== null && statusMessage(status)) || fallback
  if (kind === 'unknown') return fallback
  return KIND_MESSAGES[kind]
}

/**
 * Frase em português para um erro qualquer (síncrono, sem ler o corpo da
 * resposta). Nunca devolve a mensagem técnica original.
 */
export function toUserMessage(error: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string {
  const { kind, status } = classify(error)
  return buildMessage(kind, status, null, { fallback })
}

async function readServerCode(error: unknown): Promise<string | null> {
  if (errorName(error) !== 'FunctionsHttpError') return null
  const response = asResponseLike(errorContext(error))
  if (!response || typeof response.json !== 'function') return null
  try {
    const source = typeof response.clone === 'function' && !response.bodyUsed ? response.clone() : response
    if (source.bodyUsed || typeof source.json !== 'function') return null
    const body = (await source.json()) as { error?: unknown } | null
    const code = body && typeof body === 'object' ? body.error : null
    return typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) ? code : null
  } catch {
    return null
  }
}

/**
 * Descreve o erro para a interface, lendo o código do servidor no corpo das
 * Edge Functions quando houver. Nunca lança.
 */
export async function toUserError(error: unknown, options: ToUserErrorOptions = {}): Promise<UserFacingError> {
  const { kind, status } = classify(error)
  const code = kind === 'http' ? await readServerCode(error) : null
  return {
    kind,
    status,
    code,
    message: buildMessage(kind, status, code, options),
    retryable: isRetryable(kind, status),
  }
}
