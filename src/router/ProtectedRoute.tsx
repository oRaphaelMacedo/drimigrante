import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { accessDeniedRedirect, routeFeature, type AccessFeature } from '@/lib/access'
import { cn } from '@/lib/utils'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
  /** @deprecated use requireFeature instead — kept for routes that only need any paid access */
  requirePaid?: boolean
  /**
   * Gate de uma funcionalidade (regras em src/lib/access.ts):
   * - 'dashboard' / 'full_analysis' → acesso vigente (€30 no prazo ou assinatura)
   * - 'chat'                        → acesso vigente com chat liberado
   * - 'documents_read'              → também depois de expirar (baixar/apagar os próprios arquivos)
   * - 'documents_upload'            → só com acesso vigente
   */
  requireFeature?: AccessFeature
}

function FullScreenStatus({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-4 text-muted-foreground"
    >
      <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

/**
 * Falha ao carregar assinatura/papéis: não redireciona como se a pessoa não
 * tivesse pago. Mostra o problema e deixa tentar de novo.
 */
function AccountLoadError() {
  const { refreshUser, signOut } = useAuth()
  const [retrying, setRetrying] = useState(false)

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await refreshUser()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="flex min-h-[70dvh] items-center justify-center px-4 py-10">
      <div
        role="alert"
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-center shadow-sm sm:p-6"
      >
        <WifiOff aria-hidden="true" className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground [text-wrap:balance]">
          Não conseguimos carregar sua conta
        </h1>
        <p className="mt-2 text-base text-muted-foreground [text-wrap:pretty]">
          Verifique sua conexão com a internet e tente de novo.
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          aria-busy={retrying}
          className={cn(
            'mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4',
            'text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-70',
          )}
        >
          <RefreshCw aria-hidden="true" className={cn('h-4 w-4', retrying && 'animate-spin')} />
          {retrying ? 'Tentando…' : 'Tentar de novo'}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className={cn(
            'mt-2 flex h-11 w-full items-center justify-center rounded-xl px-4 text-base font-medium',
            'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          Sair da conta
        </button>
      </div>
    </div>
  )
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
  requirePaid = false,
  requireFeature,
}: ProtectedRouteProps) {
  const { authUser, loading, userDataError, isHubUser, hasAccess, access } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullScreenStatus label="Carregando sua conta…" />
  }

  if (!authUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Sem dados confiáveis de assinatura/papéis: nunca decidir acesso no escuro.
  if (userDataError) {
    return <AccountLoadError />
  }

  if (requireAdmin && !isHubUser) {
    return <Navigate to="/dashboard" replace />
  }

  // requireFeature tem precedência sobre o legado requirePaid
  const required: AccessFeature | null = requireFeature ?? (requirePaid ? 'dashboard' : null)
  if (required) {
    const feature = routeFeature(required, location.pathname)
    if (!hasAccess(feature)) {
      return <Navigate to={accessDeniedRedirect(feature, access)} replace />
    }
  }

  return <>{children}</>
}
