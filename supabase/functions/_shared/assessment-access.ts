// _shared/assessment-access.ts — prova de posse de um assessment (DI-004).
//
// Quem pode acionar funções sobre um assessment:
//   1. o dono autenticado (JWT de usuário cujo id = assessments.user_id); ou
//   2. quem tem o session_id do quiz, enquanto o assessment ainda é anônimo (user_id nulo); ou
//   3. chamadas internas com a service role key (scripts operacionais do dono).
// Qualquer outro caso responde 404 (não revela se o id existe).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Mesmo limite do RPC upsert_anon_assessment (8–64), só ASCII visível.
const SESSION_ID_RE = /^[\x21-\x7e]{8,64}$/

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isValidSessionId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID_RE.test(value)
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') ?? req.headers.get('authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/**
 * Lê o claim `role` do JWT SEM validar a assinatura. Serve só para evitar uma ida
 * ao Auth quando o token é a anon key; a validação real é feita por auth.getUser().
 */
export function unverifiedJwtRole(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { role?: unknown }
    return typeof payload.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

/** Comparação em tempo constante (para segredos). */
export function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface OwnedRecord {
  user_id: string | null
  session_id: string | null
}

export interface CallerIdentity {
  userId: string | null
  sessionId: string | null
  isServiceRole?: boolean
}

export interface ResolveCallerOptions {
  serviceRoleKey?: string
  /** Valida o JWT no Auth (auth.getUser) e devolve o id do usuário, ou null. */
  getUserIdFromToken: (token: string) => Promise<string | null>
}

export async function resolveCaller(
  token: string | null,
  sessionId: unknown,
  opts: ResolveCallerOptions,
): Promise<CallerIdentity> {
  const isServiceRole = !!token && !!opts.serviceRoleKey && safeEqual(token, opts.serviceRoleKey)
  let userId: string | null = null
  if (token && !isServiceRole && unverifiedJwtRole(token) === 'authenticated') {
    try {
      userId = await opts.getUserIdFromToken(token)
    } catch {
      userId = null
    }
  }
  return {
    userId,
    sessionId: isValidSessionId(sessionId) ? sessionId : null,
    isServiceRole,
  }
}

export function canAccessAssessment(record: OwnedRecord, caller: CallerIdentity): boolean {
  if (caller.isServiceRole) return true
  if (caller.userId && record.user_id && record.user_id === caller.userId) return true
  if (
    caller.sessionId &&
    record.user_id === null &&
    record.session_id !== null &&
    safeEqual(record.session_id, caller.sessionId)
  ) {
    return true
  }
  return false
}
