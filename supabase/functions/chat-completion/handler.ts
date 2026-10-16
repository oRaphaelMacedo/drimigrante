// chat-completion/handler.ts — lógica do chat com streaming SSE (sem imports remotos, testável).
//
// DI-017: gate de pagamento lido no servidor (service role), mensagem de 1 a 2000
// caracteres, limites de 30/hora e 200/dia por usuário (429), histórico com as 20
// mensagens mais recentes em ordem cronológica (só user/assistant), inserts feitos
// pelo servidor, resposta vazia não é gravada e max_tokens do banco com teto de 1000.
//
// Protocolo de saída (inalterado para o front): `data: {"delta":"..."}` por pedaço e
// `event: done\ndata: [DONE]` no fim.

import { buildAnalysisContext } from '../_shared/analysis-context.ts'
import { type RawAiConfig, sanitizeAiConfig } from '../_shared/ai-config.ts'
import { extractBearerToken, isUuid } from '../_shared/assessment-access.ts'
import { corsHeaders, errorCode, jsonResponse, type Logger, readJsonBody } from '../_shared/http.ts'
import { buildChatSystemPrompt } from '../_shared/prompts.ts'
import {
  buildChatHistory,
  CHAT_HISTORY_LIMIT,
  CHAT_LIMIT_PER_DAY,
  CHAT_LIMIT_PER_HOUR,
  type ChatSubscription,
  hasChatAccess,
  type StoredMessage,
  validateChatMessage,
} from './history.ts'

export const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'

export interface ChatRepo {
  getUserIdFromToken(token: string): Promise<string | null>
  getOwnedAssessment(assessmentId: string, userId: string): Promise<{ id: string; answers: unknown } | null>
  getResultSummary(
    assessmentId: string,
  ): Promise<{ score_numeric: number | string | null; score_category: string | null } | null>
  getSubscription(userId: string): Promise<ChatSubscription | null>
  isStaff(userId: string, nowIso: string): Promise<boolean>
  countUserMessagesSince(userId: string, sinceIso: string): Promise<number>
  /** As mensagens mais recentes primeiro (o handler reordena). */
  getRecentMessages(assessmentId: string, userId: string, limit: number): Promise<StoredMessage[]>
  insertMessage(row: { assessment_id: string; user_id: string; role: 'user' | 'assistant'; content: string }): Promise<void>
  getAiConfig(useCase: 'chat'): Promise<RawAiConfig | null>
}

export interface ChatDeps {
  repo: ChatRepo
  fetch: typeof fetch
  log: Logger
  now(): number
  env: { openaiKey?: string }
}

const HOUR_MS = 60 * 60 * 1000

export function createChatHandler(deps: ChatDeps) {
  const { repo, log } = deps

  return async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return jsonResponse(405, { error: 'method_not_allowed' })

    try {
      const token = extractBearerToken(req)
      if (!token) return jsonResponse(401, { error: 'unauthorized' })
      const userId = await repo.getUserIdFromToken(token)
      if (!userId) return jsonResponse(401, { error: 'unauthorized' })

      const body = await readJsonBody(req)
      const validation = validateChatMessage(body?.message)
      if (!validation.ok) return jsonResponse(400, { error: validation.error })
      const assessmentId = body?.assessmentId
      if (!isUuid(assessmentId)) return jsonResponse(400, { error: 'invalid_request' })
      const message = validation.message

      const assessment = await repo.getOwnedAssessment(assessmentId, userId)
      if (!assessment) return jsonResponse(404, { error: 'not_found' })

      const nowMs = deps.now()
      const nowIso = new Date(nowMs).toISOString()
      const [subscription, isStaff] = await Promise.all([
        repo.getSubscription(userId),
        repo.isStaff(userId, nowIso),
      ])
      if (!hasChatAccess(subscription, nowMs, isStaff)) {
        return jsonResponse(403, { error: 'no_access' })
      }

      const [lastHour, lastDay] = await Promise.all([
        repo.countUserMessagesSince(userId, new Date(nowMs - HOUR_MS).toISOString()),
        repo.countUserMessagesSince(userId, new Date(nowMs - 24 * HOUR_MS).toISOString()),
      ])
      if (lastHour >= CHAT_LIMIT_PER_HOUR || lastDay >= CHAT_LIMIT_PER_DAY) {
        const window = lastHour >= CHAT_LIMIT_PER_HOUR ? 'hour' : 'day'
        log('warn', 'chat_rate_limited', { window })
        return jsonResponse(429, {
          error: 'rate_limited',
          window,
          limit: window === 'hour' ? CHAT_LIMIT_PER_HOUR : CHAT_LIMIT_PER_DAY,
        })
      }

      if (!deps.env.openaiKey) {
        log('error', 'config_missing', { key: 'OPENAI_API_KEY' })
        return jsonResponse(503, { error: 'ai_unavailable' })
      }

      // Histórico ANTES de gravar a nova mensagem (senão ela entraria duplicada).
      const [recent, resultSummary, rawConfig] = await Promise.all([
        repo.getRecentMessages(assessmentId, userId, CHAT_HISTORY_LIMIT),
        repo.getResultSummary(assessmentId),
        repo.getAiConfig('chat'),
      ])
      const history = buildChatHistory(recent, CHAT_HISTORY_LIMIT)
      const config = sanitizeAiConfig('chat', rawConfig)
      if (config.adjusted.length > 0) {
        log('warn', 'ai_config_adjusted', { use_case: 'chat', fields: config.adjusted })
      }
      const systemPrompt = buildChatSystemPrompt(
        config.systemPrompt,
        buildAnalysisContext(assessment.answers, resultSummary),
      )

      await repo.insertMessage({ assessment_id: assessmentId, user_id: userId, role: 'user', content: message })

      const openAIResponse = await deps.fetch(OPENAI_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deps.env.openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          stream: true,
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: message },
          ],
        }),
      })

      if (!openAIResponse.ok || !openAIResponse.body) {
        log('error', 'openai_failed', { status: openAIResponse.status })
        return jsonResponse(502, { error: 'ai_unavailable' })
      }

      const upstream = openAIResponse.body
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      let clientGone = false

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Se o cliente desconectar, continua lendo para gravar a resposta completa.
          const send = (chunk: string) => {
            if (clientGone) return
            try {
              controller.enqueue(encoder.encode(chunk))
            } catch {
              clientGone = true
            }
          }
          const reader = upstream.getReader()
          let buffer = ''
          let fullText = ''
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                if (!line.startsWith('data:')) continue
                const data = line.slice(5).trim()
                if (!data || data === '[DONE]') continue
                try {
                  const json = JSON.parse(data)
                  const delta = json.choices?.[0]?.delta?.content
                  if (typeof delta === 'string' && delta) {
                    fullText += delta
                    send(`data: ${JSON.stringify({ delta })}\n\n`)
                  }
                } catch {
                  // pedaço malformado: ignora
                }
              }
            }

            if (fullText.trim()) {
              await repo.insertMessage({
                assessment_id: assessmentId,
                user_id: userId,
                role: 'assistant',
                content: fullText,
              })
            } else {
              log('warn', 'chat_empty_completion', {})
            }
            send('event: done\ndata: [DONE]\n\n')
            if (!clientGone) controller.close()
          } catch (err) {
            log('error', 'chat_stream_failed', { code: errorCode(err) })
            if (!clientGone) {
              try {
                controller.error(err)
              } catch {
                // já fechado
              }
            }
          }
        },
        cancel() {
          clientGone = true
        },
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    } catch (err) {
      log('error', 'chat_failed', { code: errorCode(err) })
      return jsonResponse(500, { error: 'internal_error' })
    }
  }
}
