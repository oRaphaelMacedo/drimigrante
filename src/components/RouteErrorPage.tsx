import { useEffect, useState } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { ErrorScreen, type ErrorScreenVariant } from '@/components/ErrorBoundary'
import { Sentry } from '@/lib/sentry'
import { canReloadForStaleChunk, isChunkLoadError, isChunkReloadInFlight, reloadOnceForStaleChunk } from '@/lib/chunk-reload'

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}

/**
 * errorElement dos layouts (público, dashboard e admin).
 * - Erro de chunk após deploy → recarrega uma vez e mostra "Atualizando".
 * - Se recarregar não resolveu → pede para recarregar manualmente.
 * - 404 lançado por rota → "Página não encontrada".
 * - Qualquer outro erro → tela em pt-BR + Sentry (sem stack trace na tela).
 */
export function RouteErrorPage() {
  const error = useRouteError()
  const chunkError = isChunkLoadError(error)
  const reloadInFlight = isChunkReloadInFlight()
  const notFound = isRouteErrorResponse(error) && error.status === 404

  // Decisão pura no render; o reload em si acontece no efeito.
  const [shouldReload] = useState(() => chunkError && !reloadInFlight && canReloadForStaleChunk())
  const [reloadFailed, setReloadFailed] = useState(false)

  let variant: ErrorScreenVariant = 'error'
  if (notFound) variant = 'not_found'
  else if (reloadInFlight || (shouldReload && !reloadFailed)) variant = 'updating'
  else if (chunkError) variant = 'stale'

  useEffect(() => {
    if (shouldReload) {
      if (!reloadOnceForStaleChunk()) setReloadFailed(true)
      return
    }
    if (reloadInFlight || notFound) return
    if (chunkError) {
      Sentry.captureMessage('Chunk desatualizado mesmo após recarregar', {
        level: 'warning',
        tags: { ctx: 'router.errorElement.chunk' },
      })
      return
    }
    if (isRouteErrorResponse(error)) {
      if (error.status >= 500) {
        Sentry.captureMessage(`Erro de rota ${error.status}`, { level: 'error', tags: { ctx: 'router.errorElement' } })
      }
      return
    }
    Sentry.captureException(error, { tags: { ctx: 'router.errorElement' } })
  }, [error, chunkError, notFound, reloadInFlight, shouldReload])

  return <ErrorScreen variant={variant} details={describe(error)} />
}
