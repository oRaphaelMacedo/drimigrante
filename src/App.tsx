import { lazy, Suspense, useSyncExternalStore, type ComponentType } from 'react'
import { RouterProvider } from 'react-router-dom'
import type { ToasterProps } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { router } from '@/router'
import { queryClient } from '@/lib/query-client'
import { trackBackgroundImport } from '@/lib/chunk-reload'
import { AuthProvider } from '@/contexts/AuthContext'

// sonner fora do chunk de entrada: os toasts só aparecem depois de uma ação
// numa página (que já é lazy). Se o chunk falhar, segue sem toasts em vez de
// derrubar o app inteiro.
function NoToaster() {
  return null
}
const Toaster = lazy<ComponentType<ToasterProps>>(() =>
  trackBackgroundImport(import('sonner'))
    .then((m) => ({ default: m.Toaster as ComponentType<ToasterProps> }))
    .catch(() => ({ default: NoToaster })),
)

// DI-032: no celular os toasts ficam embaixo, centralizados (no topo cobriam o
// header), acima da safe-area, do banner de cookies e das barras fixas (CTA fixo
// e BottomNav, ~5,5rem). No desktop, canto superior direito abaixo do header.
const MOBILE_QUERY = '(max-width: 767px)'

function subscribeMobile(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined
  const mql = window.matchMedia(MOBILE_QUERY)
  // Safari < 14 só tem addListener/removeListener.
  if (typeof mql.addEventListener !== 'function') {
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches
}

const MOBILE_TOAST_OFFSET = {
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--cookie-banner-h, 0px) + 5.5rem)',
  left: '1rem',
  right: '1rem',
}
const DESKTOP_TOAST_OFFSET = { top: '5rem', right: '1.5rem' }

function AppToaster() {
  const mobile = useSyncExternalStore(subscribeMobile, isMobileViewport, () => false)
  const offset = mobile ? MOBILE_TOAST_OFFSET : DESKTOP_TOAST_OFFSET
  return (
    <Toaster
      richColors
      position={mobile ? 'bottom-center' : 'top-right'}
      offset={offset}
      mobileOffset={offset}
      // z-index da escala do app: toasts (70) acima de sheets (60) e do banner de cookies (50).
      style={{ zIndex: 70 }}
    />
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* AuthProvider above RouterProvider — single auth state for the entire tree */}
      <AuthProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
        <Suspense fallback={null}>
          <AppToaster />
        </Suspense>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </AuthProvider>
    </QueryClientProvider>
  )
}
