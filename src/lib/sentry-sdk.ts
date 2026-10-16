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
  /**
   * Consultado a cada transação (carregamento/navegação): medições de
   * desempenho só com consentimento de estatísticas. O registro de erros não
   * depende dele.
   */
  tracesAllowed: () => boolean
}

const TRACES_SAMPLE_RATE = 0.2

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

/** O que usamos da integração de Replay do SDK 7. */
interface ReplayHandle {
  startBuffering?: () => void
  stop?: () => Promise<void>
  /** Só devolve um id enquanto a gravação está ativa. */
  getReplayId?: () => string | undefined
}

let replayIntegrationInstance: ReplayHandle | null = null
let replayLoading: Promise<void> | null = null
let replayWanted = false
/**
 * O SDK só inicializa o Replay (e já liga o buffer) num setTimeout agendado
 * pelo addIntegration. Até lá, startBuffering/stop agiriam sobre um estado que
 * o próprio SDK vai sobrescrever; o ajuste fica para logo depois.
 */
let replayReady = false

function isReplayRecording(replay: ReplayHandle): boolean {
  return typeof replay.getReplayId?.() === 'string'
}

/**
 * Alinha a gravação com `replayWanted`. Nunca lança: o startBuffering() do SDK
 * lança "Replay recording is already in progress" se a gravação já estiver
 * ativa, e esse erro viraria um evento falso no Sentry (que ainda enviaria o
 * buffer do replay).
 */
function syncReplay(): void {
  const replay = replayIntegrationInstance
  if (!replay || !replayReady) return
  try {
    const recording = isReplayRecording(replay)
    if (replayWanted && !recording) replay.startBuffering?.()
    else if (!replayWanted && recording) void replay.stop?.().catch(() => undefined)
  } catch {
    // O replay nunca pode derrubar o app nem gerar erro próprio no Sentry.
  }
}

export function startSentry(options: StartOptions): void {
  init({
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    sendDefaultPii: false,
    integrations: [browserTracingIntegration()],
    // Desempenho só com consentimento de estatísticas (sem ele, nenhuma
    // transação é enviada; os erros continuam sendo registrados).
    tracesSampler: () => {
      try {
        return options.tracesAllowed() ? TRACES_SAMPLE_RATE : 0
      } catch {
        return 0
      }
    },
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

/**
 * Liga o Session Replay mascarado (texto, inputs e mídia). Idempotente: chamar
 * de novo com o replay já ligado não faz nada.
 */
export function enableReplay(): void {
  const wasWanted = replayWanted
  replayWanted = true
  if (replayIntegrationInstance) {
    // Só uma transição real (desligado → ligado) mexe na gravação.
    if (!wasWanted) syncReplay()
    return
  }
  if (replayLoading) return
  replayLoading = trackBackgroundImport(import('./sentry-replay'))
    .then(({ createReplayIntegration }) => {
      if (!replayWanted) return
      const integration = createReplayIntegration()
      replayIntegrationInstance = integration as unknown as ReplayHandle
      addIntegration(integration)
      // Roda depois da inicialização agendada pelo SDK e corrige o estado se o
      // consentimento mudou nesse meio-tempo.
      window.setTimeout(() => {
        replayReady = true
        syncReplay()
      }, 0)
    })
    .catch(() => {
      // Sem replay: o monitoramento de erros continua funcionando.
    })
    .finally(() => {
      replayLoading = null
    })
}

/** Para a gravação quando o consentimento é retirado. Idempotente. */
export function disableReplay(): void {
  const wasWanted = replayWanted
  replayWanted = false
  if (wasWanted) syncReplay()
}
