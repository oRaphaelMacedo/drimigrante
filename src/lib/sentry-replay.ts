/**
 * Session Replay do Sentry em chunk próprio: só é baixado depois do
 * consentimento de estatísticas (ver enableReplay em sentry-sdk.ts).
 */
import { replayIntegration } from '@sentry/react'
import { sanitizeUrl, scrubDeep } from './url-sanitize'

interface RecordingEventLike {
  type?: number
  data?: unknown
}

export function createReplayIntegration() {
  return replayIntegration({
    maskAllText: true,
    maskAllInputs: true,
    blockAllMedia: true,
    // Nunca gravar corpo nem cabeçalhos de requisições
    networkDetailAllowUrls: [],
    beforeAddRecordingEvent: (event) => {
      const recording = event as RecordingEventLike
      // type 4 = Meta (traz o href da página)
      if (recording.type === 4 && recording.data && typeof recording.data === 'object') {
        const data = recording.data as { href?: unknown }
        if (typeof data.href === 'string') data.href = sanitizeUrl(data.href)
        return event
      }
      // Demais eventos (snapshots, breadcrumbs, spans de rede): atributos e
      // payloads podem trazer URLs com token — sanitiza tudo.
      scrubDeep(recording.data)
      return event
    },
  })
}
