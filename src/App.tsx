import { lazy, Suspense, type ComponentType } from 'react'
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* AuthProvider above RouterProvider — single auth state for the entire tree */}
      <AuthProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
        <Suspense fallback={null}>
          <Toaster richColors position="top-right" />
        </Suspense>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </AuthProvider>
    </QueryClientProvider>
  )
}
