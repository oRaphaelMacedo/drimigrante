// session-id.ts — session_id do quiz anônimo (DI-081).
//
// O session_id prova a posse do assessment anônimo (RPCs upsert_anon_assessment,
// get_anon_assessment e link_anon_assessment_to_user). Por isso precisa ser
// imprevisível: sessões novas usam crypto.randomUUID (ou um UUID v4 montado com
// crypto.getRandomValues, quando randomUUID não existe, como em http:// fora do
// localhost ou no Safari anterior ao 15.4). Math.random só sobra como último
// recurso, para navegadores sem Web Crypto.
//
// SESSION_ID_PATTERN é o MESMO padrão de private.is_valid_quiz_session_id
// (supabase/migrations/20261025000100_anon_rpc_limits.sql), conferido por
// src/lib/session-id.test.ts. Formatos aceitos:
//   - UUID;
//   - legado s_<timestamp>_<aleatório> (sessões antigas continuam valendo);
//   - e2e-<…> (testes E2E);
//   - qualquer um deles com o sufixo -wl (lista de espera).

export const SESSION_ID_PATTERN =
  '^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|s_[0-9]{10,16}_[0-9a-z]{0,16}|e2e-[0-9a-z-]{4,56})(?:-wl)?$'

export const SESSION_ID_MIN_LENGTH = 8
export const SESSION_ID_MAX_LENGTH = 64

const SESSION_ID_RE = new RegExp(SESSION_ID_PATTERN, 'i')

/** Formato aceito pelas RPCs anônimas (8–64 caracteres e um dos formatos acima). */
export function isValidSessionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= SESSION_ID_MIN_LENGTH &&
    value.length <= SESSION_ID_MAX_LENGTH &&
    SESSION_ID_RE.test(value)
  )
}

type CryptoLike = Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string }

function uuidFromRandomBytes(cryptoApi: Pick<Crypto, 'getRandomValues'>): string {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // versão 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** session_id novo e imprevisível (UUID v4). `null` simula um ambiente sem Web Crypto. */
export function createSecureSessionId(
  cryptoApi: CryptoLike | null = (globalThis as { crypto?: CryptoLike }).crypto ?? null,
): string {
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') return uuidFromRandomBytes(cryptoApi)
  // Sem Web Crypto (navegadores muito antigos): formato legado, ainda aceito.
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
