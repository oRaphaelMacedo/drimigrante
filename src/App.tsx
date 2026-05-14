import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'
import { router } from '@/router'
import { queryClient } from '@/lib/query-client'
import { AuthProvider } from '@/contexts/AuthContext'

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* AuthProvider above RouterProvider — single auth state for the entire tree */}
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-right" />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </AuthProvider>
    </QueryClientProvider>
  )
}
