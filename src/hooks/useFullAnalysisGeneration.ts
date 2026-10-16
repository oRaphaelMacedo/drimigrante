/**
 * Geração da análise completa sob demanda (DI-018).
 *
 * O quiz só gera o resumo grátis. Quem pagou e abre a análise sem o texto
 * pronto dispara `generate-explanation` com `mode: 'full'` — o supabase-js
 * manda o JWT da sessão — e a página relê a análise pela RPC
 * `get_full_analysis` até ela aparecer.
 *
 * - Dispara sozinho UMA vez por assessment e visita; depois, só pelo botão
 *   ("Tentar de novo"). Nunca entra em loop.
 * - O servidor é idempotente: análise já gravada volta na hora; outra geração
 *   em andamento devolve 202 e a página confere de novo a cada poucos segundos
 *   (polling curto e com limite).
 * - A resposta nunca traz o texto: ele vem sempre pela RPC (paywall no servidor).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getErrorStatus } from '@/lib/errors'

export type FullAnalysisGenerationStatus =
  /** Nada em andamento. */
  | 'idle'
  /** Pedido enviado: a análise está sendo escrita. */
  | 'generating'
  /** Outra geração em andamento (ou a conexão caiu no meio): conferindo de tempos em tempos. */
  | 'waiting'
  /** Muita procura agora (limite por hora do servidor): tentar mais tarde. */
  | 'deferred'
  /** Erro ou tempo esgotado: oferecer "Tentar de novo". */
  | 'failed'
  /** O servidor diz que não há acesso ativo (403). */
  | 'payment_required'
  /** Sessão expirada (401). */
  | 'auth_required'
  /** O assessment não é desta conta (404). */
  | 'not_found'

/** Espera máxima pela resposta da função (a geração costuma levar bem menos). */
export const GENERATION_REQUEST_TIMEOUT_MS = 100_000
/** Polling curto enquanto outra geração termina: 5 s × 24 ≈ 2 min. */
export const GENERATION_POLL_MS = 5_000
export const GENERATION_MAX_POLLS = 24

export interface UseFullAnalysisGenerationOptions {
  assessmentId: string | null
  /** Pode gerar: há acesso, a RPC respondeu sem erro e a análise ainda não existe. */
  enabled: boolean
  /** O texto da análise já chegou: para de conferir. */
  ready: boolean
  /** Relê a análise (RPC get_full_analysis). */
  refetch: () => Promise<unknown>
  pollIntervalMs?: number
  maxPolls?: number
}

export interface UseFullAnalysisGenerationResult {
  status: FullAnalysisGenerationStatus
  /** Pede a geração de novo (botão "Tentar de novo"). Ignorado se já houver um pedido em andamento. */
  retry: () => void
}

type Outcome = FullAnalysisGenerationStatus | 'ready'

function outcomeFromResponse(data: unknown): Outcome {
  const status = (data as { status?: unknown } | null)?.status
  if (status === 'ready') return 'ready'
  if (status === 'deferred') return 'deferred'
  // 'in_progress' (ou resposta inesperada): outra execução está escrevendo.
  return 'waiting'
}

function outcomeFromError(error: unknown): Outcome {
  const status = getErrorStatus(error)
  if (status === 401) return 'auth_required'
  if (status === 403) return 'payment_required'
  if (status === 404) return 'not_found'
  if (status !== null) return 'failed'
  // Sem resposta (rede, tempo esgotado): a geração pode ter continuado no servidor.
  return 'waiting'
}

export function useFullAnalysisGeneration({
  assessmentId,
  enabled,
  ready,
  refetch,
  pollIntervalMs = GENERATION_POLL_MS,
  maxPolls = GENERATION_MAX_POLLS,
}: UseFullAnalysisGenerationOptions): UseFullAnalysisGenerationResult {
  const [status, setStatus] = useState<FullAnalysisGenerationStatus>('idle')
  const mountedRef = useRef(false)
  const inFlightRef = useRef(false)
  const autoStartedForRef = useRef<string | null>(null)
  const refetchRef = useRef(refetch)

  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const start = useCallback(async () => {
    if (!assessmentId || inFlightRef.current) return
    inFlightRef.current = true
    setStatus('generating')
    let outcome: Outcome
    try {
      const { data, error } = await supabase.functions.invoke('generate-explanation', {
        body: { assessment_id: assessmentId, mode: 'full' },
        timeout: GENERATION_REQUEST_TIMEOUT_MS,
      })
      outcome = error ? outcomeFromError(error) : outcomeFromResponse(data)
    } catch (err) {
      outcome = outcomeFromError(err)
    } finally {
      inFlightRef.current = false
    }
    if (!mountedRef.current) return
    // 'ready': a análise foi gravada — o polling relê na hora e para quando o texto chegar.
    setStatus(outcome === 'ready' ? 'waiting' : outcome)
  }, [assessmentId])

  // Disparo automático: uma vez por assessment enquanto a página está aberta.
  useEffect(() => {
    if (!enabled || ready || !assessmentId) return
    if (autoStartedForRef.current === assessmentId) return
    autoStartedForRef.current = assessmentId
    void start()
  }, [enabled, ready, assessmentId, start])

  // Polling curto e limitado enquanto espera o texto aparecer.
  useEffect(() => {
    if (status !== 'waiting' || ready) return
    let polls = 0
    void refetchRef.current()
    const timer = window.setInterval(() => {
      polls += 1
      if (polls > maxPolls) {
        window.clearInterval(timer)
        setStatus('failed')
        return
      }
      void refetchRef.current()
    }, pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [status, ready, pollIntervalMs, maxPolls])

  const retry = useCallback(() => {
    void start()
  }, [start])

  return { status: ready ? 'idle' : status, retry }
}
