import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { accessDeniedRedirect, routeFeature, type AccessFeature } from '@/lib/access'

interface ProtectedRouteProps {
  children: React.ReactNode
  requireAdmin?: boolean
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
        <Button className="mt-5 w-full" onClick={handleRetry} loading={retrying}>
          {!retrying && <RefreshCw aria-hidden="true" />}
          {retrying ? 'Tentando…' : 'Tentar de novo'}
        </Button>
        <Button variant="ghost" className="mt-2 w-full text-muted-foreground" onClick={() => void signOut()}>
          Sair da conta
        </Button>
      </div>
    </div>
  )
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
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

  if (requireFeature) {
    const feature = routeFeature(requireFeature, location.pathname)
    if (!hasAccess(feature)) {
      return <Navigate to={accessDeniedRedirect(feature, access)} replace />
    }
  }

  return <>{children}</>
}
