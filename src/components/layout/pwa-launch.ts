import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { track } from '@/lib/analytics'
import { hasStoredAuthSession } from '@/lib/stored-session'

/**
 * Abertura do app instalado (PWA). O manifest abre em `/?source=pwa`
 * (vite.config.ts, start_url): com sessão, a pessoa vai direto para o painel em
 * vez de cair na landing.
 *
 * - `redirect`: há sessão → o Layout troca a landing por <Navigate to="/dashboard" replace>.
 * - `wait`: há uma sessão guardada no navegador e o AuthContext ainda está
 *   confirmando (ex.: renovando o token). Mostra "Abrindo…" no lugar da landing,
 *   por no máximo PWA_SESSION_WAIT_MS, para não piscar a landing antes do painel.
 * - `stay`: sem sessão → landing normal.
 * - `off`: não é uma abertura do PWA.
 */
export type PwaLaunchStatus = 'off' | 'wait' | 'redirect' | 'stay'

export const PWA_SOURCE_PARAM = 'source'
export const PWA_SOURCE_VALUE = 'pwa'
export const PWA_DASHBOARD_PATH = '/dashboard'
/** Espera máxima pela sessão antes de mostrar a landing. */
export const PWA_SESSION_WAIT_MS = 3000

export function isPwaLaunch(pathname: string, search: string): boolean {
  if (pathname !== '/') return false
  try {
    return new URLSearchParams(search).get(PWA_SOURCE_PARAM) === PWA_SOURCE_VALUE
  } catch {
    return false
  }
}

export function usePwaLaunch(): PwaLaunchStatus {
  const { pathname, search } = useLocation()
  const { session, loading } = useAuth()
  const launch = isPwaLaunch(pathname, search)
  const [mayHaveSession] = useState(() => hasStoredAuthSession())
  const [timedOut, setTimedOut] = useState(false)

  const waiting = launch && !session && !!loading && mayHaveSession && !timedOut
  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(() => setTimedOut(true), PWA_SESSION_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [waiting])

  const status: PwaLaunchStatus = !launch ? 'off' : session ? 'redirect' : waiting ? 'wait' : 'stay'

  // Uma vez por abertura: o pageview de /?source=pwa some no redirecionamento imediato.
  const trackedRef = useRef(false)
  useEffect(() => {
    if (trackedRef.current || (status !== 'redirect' && status !== 'stay')) return
    trackedRef.current = true
    track('pwa_launched', { signed_in: status === 'redirect' })
  }, [status])

  return status
}
