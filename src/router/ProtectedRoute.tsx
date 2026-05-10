import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  requirePaid?: boolean
}

export function ProtectedRoute({ children, requireAdmin = false, requirePaid = false }: ProtectedRouteProps) {
  const { authUser, loading, isHubUser, hasAccess } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    )
  }

  if (!authUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireAdmin && !isHubUser) {
    return <Navigate to="/dashboard" replace />
  }

  if (requirePaid && !hasAccess('dashboard')) {
    return <Navigate to="/results" replace />
  }

  return <>{children}</>
}
