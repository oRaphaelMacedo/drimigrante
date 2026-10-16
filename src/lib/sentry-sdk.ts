/**
 * Carregado SOB DEMANDA por src/lib/sentry.ts (import dinâmico em idle).
 * Nenhum outro módulo deve importar este arquivo nem '@sentry/react'
 * diretamente: isso colocaria o SDK de volta no chunk de entrada.
 */
import {
  addBreadcrumb,
  addEventProcessor,
  addIntegration,
  browserTracingIntegration,
  captureException,
  captureMessage,
  init,
  setTag,
  setUser,
} from '@sentry/react'
import type { Breadcrumb, Event } from '@sentry/react'
import { trackBackgroundImport } from './chunk-reload'
import { sanitizeUrl, scrubDeep, scrubText } from './url-sanitize'

export { addBreadcrumb, captureException, captureMessage, setTag, setUser }

export interface StartOptions {
  dsn: string
  environment: string
  release?: string
  /** Liga o replay mascarado já na inicialização (consentimento dado). */
  replay: boolean
}

function scrubRequest(event: Event): void {
  const request = event.request
  if (!request) return
  if (request.url) request.url = sanitizeUrl(request.url)
  if (request.query_string) delete request.query_string
  if (request.cookies) delete request.cookies
  if (request.headers) {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(request.headers)) {
      const lower = key.toLowerCase()
      if (lower === 'authorization' || lower === 'cookie' || lower === 'apikey') continue
      headers[key] = lower === 'referer' ? sanitizeUrl(value) : value
    }
    request.headers = headers
  }
}

/** Remove tokens, e-mails e IDs sensíveis de qualquer evento (erro, transação, replay). */
export function scrubEvent<T extends Event>(event: T): T {
  scrubRequest(event)
  if (event.user) {
    // Só o id (UUID) pode seguir; e-mail, IP e nome nunca.
    event.user = event.user.id ? { id: event.user.id } : undefined
  }
  scrubDeep(event as unknown as Record<string, unknown>)
  return event
}

const URL_ONLY_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/)\S*$/i

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Logs de console podem conter qualquer coisa (inclusive respostas de API)
  if (breadcrumb.category === 'console' && breadcrumb.level !== 'error') return null
  if (breadcrumb.message) {
    // Mensagem que é só uma URL: remove params/fragmento. Texto livre (que pode
    // conter uma URL no meio): só mascara valores, sem reescrever o texto.
    breadcrumb.message = URL_ONLY_RE.test(breadcrumb.message)
      ? sanitizeUrl(breadcrumb.message)
      : scrubText(breadcrumb.message)
  }
  if (breadcrumb.data) scrubDeep(breadcrumb.data)
  return breadcrumb
}

let replayIntegrationInstance: { startBuffering?: () => void; stop?: () => Promise<void> } | null = null
let replayLoading: Promise<void> | null = null
let replayWanted = false

export function startSentry(options: StartOptions): void {
  init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    sendDefaultPii: false,
    integrations: [browserTracingIntegration()],
    tracesSampleRate: 0.2,
    // Replay só grava em buffer e só é enviado quando acontece um erro —
    // e só existe depois do consentimento (ver enableReplay).
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Navegação interrompida pelo próprio usuário / rede móvel instável
      'AbortError: The user aborted a request',
    ],
    denyUrls: [/^chrome-extension:\/\//i, /^moz-extension:\/\//i, /^safari-(web-)?extension:\/\//i],
  })

  // Rede de segurança: roda para TODOS os eventos, inclusive replay_event,
  // que não passa por beforeSend.
  addEventProcessor((event) => scrubEvent(event))

  if (options.replay) enableReplay()
}

/** Liga o Session Replay mascarado (texto, inputs e mídia). Idempotente. */
export function enableReplay(): void {
  replayWanted = true
  if (replayIntegrationInstance) {
    replayIntegrationInstance.startBuffering?.()
    return
  }
  if (replayLoading) return
  replayLoading = trackBackgroundImport(import('./sentry-replay'))
    .then(({ createReplayIntegration }) => {
      if (!replayWanted) return
      const integration = createReplayIntegration()
      replayIntegrationInstance = integration as unknown as typeof replayIntegrationInstance
      addIntegration(integration)
    })
    .catch(() => {
      // Sem replay: o monitoramento de erros continua funcionando.
    })
    .finally(() => {
      replayLoading = null
    })
}

/** Para a gravação quando o consentimento é retirado. */
export function disableReplay(): void {
  replayWanted = false
  void replayIntegrationInstance?.stop?.().catch(() => undefined)
}
