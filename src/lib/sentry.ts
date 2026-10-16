/**
 * Fachada do Sentry — o SDK NÃO entra no chunk de entrada.
 *
 * - `Sentry.captureException` / `Sentry.captureMessage` (contrato com o
 *   AuthContext e demais módulos) funcionam desde o primeiro instante: as
 *   chamadas ficam numa fila curta até o SDK carregar.
 * - O SDK é baixado por import() em requestIdleCallback (ou antes, no primeiro
 *   erro capturado).
 * - Session Replay só depois do consentimento de estatísticas, com texto,
 *   inputs e mídia mascarados, e enviado só quando há erro. Transações de
 *   desempenho também só com esse consentimento; erros, sempre.
 * - Tudo passa por sanitização: sem e-mails, tokens da URL, JWT ou session_id.
 *
 * Nunca importe '@sentry/react' fora de src/lib/sentry-sdk.ts e sentry-replay.ts.
 */
import type { Breadcrumb } from '@sentry/react'
import { choiceAllows, hasConsent, onConsentChange } from './consent'
import { isChunkLoadError, trackBackgroundImport } from './chunk-reload'
import { getMonitoringEnvironment, getRuntimeEnv, isErrorMonitoringEnvironment } from './runtime-env'

type SentrySdkModule = typeof import('./sentry-sdk')
type SentryReact = typeof import('@sentry/react')
export type CaptureExceptionHint = Parameters<SentryReact['captureException']>[1]
export type CaptureMessageContext = Parameters<SentryReact['captureMessage']>[1]

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined
const MAX_QUEUE = 30

type QueuedCall = (sdk: SentrySdkModule) => void

/** null = initSentry ainda não rodou; false = desligado neste ambiente */
let enabled: boolean | null = null
let sdk: SentrySdkModule | null = null
let loading: Promise<void> | null = null
const queue: QueuedCall[] = []
let removeEarlyHandlers: (() => void) | null = null
/**
 * Último consentimento de estatísticas aplicado ao Replay. Só uma mudança real
 * (sem → com, com → sem) mexe no Replay: regravar a mesma permissão em /cookies
 * ('granted' → 'analytics', 'all' → 'analytics'…) não faz nada.
 */
let replayConsent = false

function devLog(kind: string, payload: unknown): void {
  if (import.meta.env.DEV) {
    // Em desenvolvimento o Sentry fica desligado; mostra no console.
    console.error(`[sentry:${kind}]`, payload)
  }
}

/**
 * `urgent` (erros e mensagens) antecipa o download do SDK; breadcrumbs, tags e
 * usuário só esperam na fila e deixam espaço reservado para os erros.
 */
function enqueue(call: QueuedCall, urgent = false): void {
  if (sdk) {
    try {
      call(sdk)
    } catch {
      // o monitoramento nunca pode derrubar o app
    }
    return
  }
  if (enabled === false) return
  const limit = urgent ? MAX_QUEUE : MAX_QUEUE - 10
  if (queue.length < limit) queue.push(call)
  if (urgent && enabled === true) void loadSdk()
}

function flushQueue(): void {
  if (!sdk) return
  const pending = queue.splice(0, queue.length)
  for (const call of pending) {
    try {
      call(sdk)
    } catch {
      // ignora
    }
  }
}

function loadSdk(): Promise<void> {
  if (loading) return loading
  loading = trackBackgroundImport(import('./sentry-sdk'))
    .then((mod) => {
      replayConsent = hasConsent('analytics')
      mod.startSentry({
        dsn: DSN as string,
        environment: getMonitoringEnvironment(),
        replay: replayConsent,
        tracesAllowed: () => hasConsent('analytics'),
      })
      sdk = mod
      removeEarlyHandlers?.()
      removeEarlyHandlers = null
      flushQueue()
    })
    .catch(() => {
      // Falha ao baixar o SDK (rede, deploy novo…): segue sem monitoramento.
      enabled = false
      queue.length = 0
      removeEarlyHandlers?.()
      removeEarlyHandlers = null
    })
  return loading
}

/**
 * Captura erros globais que acontecem ANTES de o SDK carregar (o SDK instala
 * os próprios handlers ao iniciar).
 */
function installEarlyHandlers(): () => void {
  const onError = (event: ErrorEvent) => {
    if (event.error instanceof Error && !isChunkLoadError(event.error)) {
      const error = event.error
      enqueue((s) => s.captureException(error, { tags: { ctx: 'global.early' } }), true)
    }
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason
    if (reason instanceof Error && !isChunkLoadError(reason)) {
      enqueue((s) => s.captureException(reason, { tags: { ctx: 'global.early.unhandledrejection' } }), true)
    }
  }
  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}

function scheduleIdle(task: () => void): void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(task, { timeout: 4000 })
  } else {
    window.setTimeout(task, 2000)
  }
}

/** Chamado uma vez no main.tsx. */
export function initSentry(): void {
  if (enabled !== null) return
  if (!DSN || !isErrorMonitoringEnvironment(getRuntimeEnv())) {
    enabled = false
    queue.length = 0
    return
  }
  enabled = true
  removeEarlyHandlers = installEarlyHandlers()

  replayConsent = hasConsent('analytics')
  onConsentChange((choice) => {
    const next = choiceAllows(choice, 'analytics')
    if (next === replayConsent) return
    replayConsent = next
    if (!sdk) return // ao carregar, o SDK lê o consentimento atual
    try {
      if (next) sdk.enableReplay()
      else sdk.disableReplay()
    } catch {
      // o monitoramento nunca pode derrubar o app
    }
  })

  // erro já na fila (capturado antes do init) → baixa já; senão, em idle
  if (queue.length > 0) void loadSdk()
  else scheduleIdle(() => void loadSdk())
}

/**
 * API estável usada pelo app (`import { Sentry } from '@/lib/sentry'`).
 * Mesma assinatura do SDK para captureException/captureMessage.
 */
export const Sentry = {
  captureException(exception: unknown, hint?: CaptureExceptionHint): void {
    if (enabled === false) {
      devLog('exception', exception)
      return
    }
    enqueue((s) => {
      s.captureException(exception, hint)
    }, true)
  },

  captureMessage(message: string, context?: CaptureMessageContext): void {
    if (enabled === false) {
      devLog('message', message)
      return
    }
    enqueue((s) => {
      s.captureMessage(message, context)
    }, true)
  },

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    if (enabled === false) return
    enqueue((s) => s.addBreadcrumb(breadcrumb))
  },

  /** Só o id do usuário (UUID) — nunca e-mail ou nome. `null` limpa. */
  setUser(user: { id: string } | null): void {
    if (enabled === false) return
    enqueue((s) => s.setUser(user ? { id: user.id } : null))
  },

  setTag(key: string, value: string): void {
    if (enabled === false) return
    enqueue((s) => s.setTag(key, value))
  },
}
