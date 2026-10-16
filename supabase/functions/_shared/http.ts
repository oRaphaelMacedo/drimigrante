// _shared/http.ts — utilitários HTTP e de log das Edge Functions de IA/e-mail.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

export type LogLevel = 'info' | 'warn' | 'error'
export type Logger = (level: LogLevel, event: string, data?: Record<string, unknown>) => void

/**
 * Log estruturado em uma linha JSON (fácil de filtrar nos logs do Supabase).
 * Nunca passe e-mail, nome, telefone, tokens ou conteúdo de mensagens em `data`.
 */
export function createLogger(fn: string): Logger {
  return (level, event, data = {}) => {
    const line = JSON.stringify({ fn, event, level, ...data, ts: new Date().toISOString() })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  }
}

/** Lê o corpo JSON sem lançar exceção (corpo inválido → null). */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function errorCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; name?: unknown }
    if (typeof e.code === 'string' && e.code) return e.code
    if (typeof e.name === 'string' && e.name) return e.name
  }
  return 'unknown'
}
