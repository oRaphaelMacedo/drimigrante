import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

type Feature = 'dashboard' | 'chat' | 'full_analysis'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  /** @deprecated use requireFeature instead — kept for routes that only need any paid access */
  requirePaid?: boolean
  /**
   * B06-A01 / B04-A08: gate a specific feature rather than generic "paid".
   * - 'dashboard'    → has_dashboard_access (any paid plan)
   * - 'full_analysis'→ has_full_analysis    (any paid plan)
   * - 'chat'         → has_chat_access      (subscription only)
   */
  requireFeature?: Feature
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requirePaid = false,
  requireFeature,
}: ProtectedRouteProps) {
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

  // requireFeature takes precedence over the legacy requirePaid flag
  const feature: Feature | null = requireFeature ?? (requirePaid ? 'dashboard' : null)
  if (feature && !hasAccess(feature)) {
    // Chat is subscription-only → send to /checkout so they can upgrade
    const redirectTo = feature === 'chat' ? '/checkout' : '/results'
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
