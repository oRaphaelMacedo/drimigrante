/**
 * Regras puras da página de sucesso do pagamento (DI-026).
 *
 * Estados (máquina em SuccessPage.tsx):
 *   init        → aguardando a sessão do Supabase carregar
 *   verifying   → claim-session (troca o session_id do Stripe por login)
 *   signing_in  → verifyOtp com o token_hash recebido
 *   confirming  → logado; polling de refreshUser a cada 2 s, até 30 s, até ter acesso
 *   ready       → acesso liberado (vai para o painel)
 *   email_sent  → pagamento confirmado; link de acesso enviado por e-mail
 *   processing  → pagamento ainda em processamento no Stripe (claim 403)
 *   delayed     → logado, mas o acesso não foi liberado em 30 s
 *   fallback    → claim/login falhou (500, 404, rede…): e-mail + reenvio + contato
 *   missing     → sem session_id e sem login: não há o que confirmar
 */
import type { UserFacingError } from '@/lib/errors'

export type SuccessState =
  | 'init'
  | 'verifying'
  | 'signing_in'
  | 'confirming'
  | 'ready'
  | 'email_sent'
  | 'processing'
  | 'delayed'
  | 'fallback'
  | 'missing'

/** session_id do Stripe guardado fora da URL (só nesta aba). */
export const CHECKOUT_SESSION_STORAGE_KEY = 'di_checkout_session_id'

/** Polling do acesso depois do login. */
export const CONFIRM_POLL_MS = 2_000
export const CONFIRM_TIMEOUT_MS = 30_000
/** Nova consulta automática enquanto o pagamento está em processamento. */
export const PROCESSING_RETRY_MS = 5_000
export const PROCESSING_MAX_RETRIES = 6
/** Tempo máximo de uma chamada ao claim-session. */
export const CLAIM_TIMEOUT_MS = 20_000
/** Espera entre reenvios do link de acesso. */
export const RESEND_COOLDOWN_S = 60

// Mesmo formato aceito pelo claim-session.
const SESSION_ID_RE = /^cs_(?:test|live)_[A-Za-z0-9]+$/

export function isStripeSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 255 && SESSION_ID_RE.test(value)
}

/** `joao.silva@gmail.com` → `jo•••@gmail.com` (o domínio fica visível para a pessoa se reconhecer). */
export function maskEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null
  const trimmed = email.trim()
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return null
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)
  return `${visible}•••@${domain}`
}

export type ClaimOutcome =
  | { kind: 'token'; tokenHash: string }
  | { kind: 'email_sent' }
  | { kind: 'processing' }
  | { kind: 'failed'; reason: string }

/** Interpreta a resposta do claim-session (ver supabase/functions/claim-session/handler.ts). */
export function classifyClaim(data: unknown, error: UserFacingError | null): ClaimOutcome {
  if (error) {
    if (error.code === 'payment_not_completed' || (error.status === 403 && !error.code)) {
      return { kind: 'processing' }
    }
    return { kind: 'failed', reason: error.code ?? (error.status ? `http_${error.status}` : error.kind) }
  }
  const body = data && typeof data === 'object' ? (data as { status?: unknown; token_hash?: unknown }) : null
  if (!body) return { kind: 'failed', reason: 'empty_response' }
  if (typeof body.token_hash === 'string' && body.token_hash && (body.status === 'token' || body.status === undefined)) {
    return { kind: 'token', tokenHash: body.token_hash }
  }
  if (body.status === 'email_sent') return { kind: 'email_sent' }
  return { kind: 'failed', reason: 'unexpected_response' }
}

/**
 * Chave do `trackOnce('purchase', …)`: hash curto do session_id, para o id do
 * Stripe não ficar guardado no controle de eventos já enviados.
 */
export function purchaseOnceKey(sessionId: string): string {
  // FNV-1a 32 bits
  let hash = 0x811c9dc5
  for (let i = 0; i < sessionId.length; i++) {
    hash ^= sessionId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `cs-${hash.toString(16).padStart(8, '0')}`
}

/** Lê o session_id da URL (e guarda na sessionStorage) ou o já guardado nesta aba. */
export function takeCheckoutSessionId(params: URLSearchParams, storage: Pick<Storage, 'getItem' | 'setItem'> | null): string | null {
  const fromUrl = params.get('session_id')
  if (isStripeSessionId(fromUrl)) {
    try {
      storage?.setItem(CHECKOUT_SESSION_STORAGE_KEY, fromUrl)
    } catch {
      // sem storage: vale só enquanto a página estiver aberta
    }
    return fromUrl
  }
  try {
    const stored = storage?.getItem(CHECKOUT_SESSION_STORAGE_KEY) ?? null
    return isStripeSessionId(stored) ? stored : null
  } catch {
    return null
  }
}
