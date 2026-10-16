/**
 * Assinatura de €4,90/mês a partir do dashboard (DI-013, DI-047).
 *
 * - `useSubscribeCheckout()`: abre o Stripe Checkout do plano recorrente pela
 *   edge function create-checkout-session (JWT anexado pelo supabase-js).
 *   Só deve ser oferecido a quem já pagou o €30 (`canOfferRecurring`); o
 *   servidor confere de novo (403 one_time_required / 409 already_active).
 * - `useSubscriptionConfirmation()`: na volta do Stripe (`/dashboard?subscribed=1`)
 *   recarrega a conta a cada 2 s, por até 20 s, até a assinatura aparecer
 *   ativa (o webhook pode levar alguns segundos).
 *
 * Mensagens de erro em pt-BR, sem detalhes técnicos. Eventos só via track().
 * A chamada tem limite de 15 s, e o botão volta ao normal se a pessoa voltar
 * do Stripe pelo "voltar" do navegador (página restaurada do bfcache).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/analytics'
import { Sentry } from '@/lib/sentry'
import { useAuth } from '@/hooks/useAuth'

// ── Abrir o checkout ─────────────────────────────────────────────────────────

interface CheckoutErrorBody {
  error?: string
  message?: string
}

async function readErrorBody(error: FunctionsHttpError): Promise<{ status: number; body: CheckoutErrorBody }> {
  const response = error.context as Response | undefined
  const status = response?.status ?? 0
  try {
    const body = (await response?.json()) as CheckoutErrorBody | undefined
    return { status, body: body ?? {} }
  } catch {
    return { status, body: {} }
  }
}

/** Limite de espera pela function antes de mostrar o erro. */
export const SUBSCRIBE_TIMEOUT_MS = 15_000

/** O fetch foi abortado pelo `timeout` (DOMException nem sempre herda de Error). */
function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('name' in error)) return false
  const { name } = error as { name?: unknown }
  return name === 'AbortError' || name === 'TimeoutError'
}

/** Só segue para URLs https (a sessão do Stripe). */
function isSafeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export interface SubscribeCheckout {
  /** Abre o checkout. `placement` identifica de onde veio o clique (analytics). */
  subscribe: (placement: string) => Promise<void>
  isPending: boolean
}

export function useSubscribeCheckout(assessmentId?: string | null): SubscribeCheckout {
  const { refreshUser } = useAuth()
  const [isPending, setIsPending] = useState(false)
  const pendingRef = useRef(false)

  // Voltou do Stripe pelo "voltar": a página vem do bfcache com o botão ocupado.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      pendingRef.current = false
      setIsPending(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const subscribe = useCallback(
    async (placement: string) => {
      if (pendingRef.current) return
      pendingRef.current = true
      setIsPending(true)
      track('upsell_clicked', { placement })
      track('checkout_started', { plan: 'recurring', currency: 'EUR' })

      let leaving = false
      try {
        const { data, error } = await supabase.functions.invoke<{ url?: string }>('create-checkout-session', {
          body: { plan: 'recurring', assessmentId: assessmentId || null },
          timeout: SUBSCRIBE_TIMEOUT_MS,
        })
        if (error) throw error
        if (!isSafeCheckoutUrl(data?.url)) throw new Error('checkout_url_missing')
        leaving = true
        window.location.assign(data.url)
      } catch (err) {
        if (err instanceof FunctionsHttpError) {
          const { status, body } = await readErrorBody(err)
          track('checkout_failed', { plan: 'recurring', status, reason: body.error ?? 'http_error' })
          if (body.error === 'already_active') {
            // Já assina (ex.: pagou em outra aba): atualiza a conta em vez de cobrar de novo.
            void refreshUser()
            toast.success('Sua assinatura já está ativa.')
          } else if (status === 401) {
            toast.error('Sua sessão expirou', { description: 'Entre de novo para assinar.' })
          } else if (body.error === 'one_time_required') {
            toast.error('Assinatura indisponível', {
              description: 'A assinatura mensal fica disponível depois da compra da análise.',
            })
          } else {
            toast.error('Não foi possível abrir o pagamento', {
              description: 'Tente de novo em instantes.',
            })
          }
        } else if (err instanceof FunctionsFetchError) {
          const timedOut = isAbortError(err.context)
          track('checkout_failed', { plan: 'recurring', reason: timedOut ? 'timeout' : 'network' })
          toast.error(timedOut ? 'A conexão está lenta' : 'Sem conexão', {
            description: 'Verifique sua internet e tente de novo.',
          })
        } else {
          track('checkout_failed', { plan: 'recurring', reason: 'unexpected' })
          Sentry.captureException(err, { tags: { ctx: 'checkout.recurring' } })
          toast.error('Não foi possível abrir o pagamento', {
            description: 'Tente de novo em instantes.',
          })
        }
      } finally {
        // Indo para o Stripe, o botão continua ocupado até a página trocar.
        if (!leaving) {
          pendingRef.current = false
          setIsPending(false)
        }
      }
    },
    [assessmentId, refreshUser],
  )

  return { subscribe, isPending }
}

// ── Confirmar na volta do Stripe ─────────────────────────────────────────────

/** Intervalo entre as consultas e tempo máximo de espera pela confirmação. */
export const SUBSCRIPTION_POLL_INTERVAL_MS = 2_000
export const SUBSCRIPTION_POLL_TIMEOUT_MS = 20_000

/**
 * - `idle`: nada em andamento.
 * - `confirming`: voltou do Stripe e estamos esperando o webhook.
 * - `confirmed`: assinatura ativa.
 * - `pending`: o prazo de espera acabou sem confirmação (pode levar alguns minutos).
 */
export type SubscriptionConfirmationStatus = 'idle' | 'confirming' | 'confirmed' | 'pending'

export interface SubscriptionConfirmation {
  status: SubscriptionConfirmationStatus
  /** Começa a esperar a confirmação (chamado ao ler `?subscribed=1`). */
  start: () => void
  /** Nova tentativa manual depois do prazo. */
  retry: () => Promise<void>
}

export function useSubscriptionConfirmation(): SubscriptionConfirmation {
  const { authUser, refreshUser } = useAuth()
  const [status, setStatus] = useState<SubscriptionConfirmationStatus>('idle')
  const deadlineRef = useRef(0)
  const alreadyRecurring = authUser?.subscription?.recurring_active === true

  const start = useCallback(() => {
    deadlineRef.current = Date.now() + SUBSCRIPTION_POLL_TIMEOUT_MS
    setStatus((current) => (current === 'idle' || current === 'pending' ? 'confirming' : current))
  }, [])

  // A assinatura apareceu (pelo polling ou por um refresh em segundo plano).
  useEffect(() => {
    if (!alreadyRecurring) return
    if (status !== 'confirming' && status !== 'pending') return
    setStatus('confirmed')
    toast.success('Assinatura confirmada', {
      description: 'Seu painel, a análise e os documentos continuam disponíveis.',
    })
  }, [alreadyRecurring, status])

  useEffect(() => {
    if (status !== 'confirming' || alreadyRecurring) return
    let cancelled = false
    let timer: number | undefined

    const tick = async () => {
      const user = await refreshUser()
      if (cancelled) return
      if (user?.subscription?.recurring_active === true) return // o efeito acima confirma
      if (Date.now() + SUBSCRIPTION_POLL_INTERVAL_MS > deadlineRef.current) {
        setStatus('pending')
        return
      }
      timer = window.setTimeout(() => void tick(), SUBSCRIPTION_POLL_INTERVAL_MS)
    }
    void tick()

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [status, alreadyRecurring, refreshUser])

  const retry = useCallback(async () => {
    const user = await refreshUser()
    if (user?.subscription?.recurring_active === true) return
    toast('Ainda sem confirmação', {
      description: 'Se o pagamento foi concluído, a assinatura aparece aqui em alguns minutos.',
    })
  }, [refreshUser])

  return { status, start, retry }
}
