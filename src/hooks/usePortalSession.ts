/**
 * usePortalSession — abre o portal do cliente Stripe (DI-052).
 *
 * Chama a edge function create-portal-session (JWT anexado pelo supabase-js)
 * e redireciona para a URL https devolvida. Em qualquer falha (sem customer,
 * portal ainda não ativado/deployado, rede), devolve uma mensagem em pt-BR —
 * a tela mostra junto o caminho pelo suporte, para a pessoa nunca ficar sem
 * como cancelar.
 *
 * Evento: portal_clicked { placement } (sem PII).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '@/lib/analytics'
import { toUserError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

export const PORTAL_TIMEOUT_MS = 15_000

const PORTAL_CODE_MESSAGES: Record<string, string> = {
  customer_not_found: 'Não encontramos uma assinatura para gerenciar nesta conta.',
  portal_unavailable: 'O portal de pagamentos não está disponível agora.',
}

function isSafePortalUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export interface PortalSession {
  open: (placement: string) => Promise<void>
  isPending: boolean
  /** Mensagem da última falha (null quando não houve). */
  error: string | null
}

export function usePortalSession(): PortalSession {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pendingRef = useRef(false)

  // Voltou do portal pelo "voltar": a página vem do bfcache com o botão ocupado.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      pendingRef.current = false
      setIsPending(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const open = useCallback(async (placement: string) => {
    if (pendingRef.current) return
    pendingRef.current = true
    setIsPending(true)
    setError(null)
    track('portal_clicked', { placement })

    let leaving = false
    try {
      const { data, error: invokeError } = await supabase.functions.invoke<{ url?: string }>('create-portal-session', {
        body: {},
        timeout: PORTAL_TIMEOUT_MS,
      })
      if (invokeError) throw invokeError
      if (!isSafePortalUrl(data?.url)) throw new Error('portal_url_missing')
      leaving = true
      window.location.assign(data.url)
    } catch (err) {
      const userError = await toUserError(err, {
        fallback: 'Não foi possível abrir o portal de pagamentos.',
        codeMessages: PORTAL_CODE_MESSAGES,
      })
      // 404 sem código = function ainda não publicada: mesma saída do "sem customer".
      setError(userError.status === 404 && !userError.code ? PORTAL_CODE_MESSAGES.portal_unavailable : userError.message)
    } finally {
      if (!leaving) {
        pendingRef.current = false
        setIsPending(false)
      }
    }
  }, [])

  return { open, isPending, error }
}
