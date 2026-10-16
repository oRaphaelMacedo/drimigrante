// chat-completion/history.ts — regras puras do chat (histórico, acesso e limites).

export const CHAT_HISTORY_LIMIT = 20
export const CHAT_HISTORY_MAX_CHARS = 4000
export const CHAT_MESSAGE_MAX_CHARS = 2000
export const CHAT_LIMIT_PER_HOUR = 30
export const CHAT_LIMIT_PER_DAY = 200

export interface StoredMessage {
  role: string
  content: string | null
  created_at?: string | null
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Histórico enviado à IA: as `limit` mensagens MAIS RECENTES, em ordem cronológica,
 * só user/assistant, sem conteúdo vazio. Aceita linhas em qualquer ordem.
 */
export function buildChatHistory(rows: StoredMessage[], limit = CHAT_HISTORY_LIMIT): HistoryMessage[] {
  const valid = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      (row.role === 'user' || row.role === 'assistant') &&
      typeof row.content === 'string' &&
      row.content.trim() !== ''
    )
    .sort((a, b) => {
      const ta = a.row.created_at ? Date.parse(a.row.created_at) : NaN
      const tb = b.row.created_at ? Date.parse(b.row.created_at) : NaN
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb
      return a.index - b.index
    })
  return valid.slice(Math.max(0, valid.length - limit)).map(({ row }) => ({
    role: row.role as 'user' | 'assistant',
    content: (row.content as string).slice(0, CHAT_HISTORY_MAX_CHARS),
  }))
}

export type MessageValidation =
  | { ok: true; message: string }
  | { ok: false; error: 'empty_message' | 'message_too_long' }

export function validateChatMessage(raw: unknown): MessageValidation {
  if (typeof raw !== 'string') return { ok: false, error: 'empty_message' }
  const message = raw.trim()
  if (!message) return { ok: false, error: 'empty_message' }
  if (message.length > CHAT_MESSAGE_MAX_CHARS) return { ok: false, error: 'message_too_long' }
  return { ok: true, message }
}

export interface ChatSubscription {
  recurring_active: boolean | null
  has_chat_access: boolean | null
  one_time_access_expires_at: string | null
}

/**
 * Gate do chat (espelha AuthContext.hasAccess('chat')):
 * staff sempre; recorrente ativo; ou has_chat_access sem expiração vencida
 * (no instante exato da expiração ainda há acesso).
 */
export function hasChatAccess(sub: ChatSubscription | null, nowMs: number, isStaff: boolean): boolean {
  if (isStaff) return true
  if (!sub) return false
  if (sub.recurring_active) return true
  if (!sub.has_chat_access) return false
  if (sub.one_time_access_expires_at) {
    const expiresAt = Date.parse(sub.one_time_access_expires_at)
    if (!Number.isFinite(expiresAt) || nowMs > expiresAt) return false
  }
  return true
}
