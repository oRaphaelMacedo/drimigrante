// ResultsAccessCard.tsx — /results para quem já tem conta com acesso (DI-053).
//
// Substitui a oferta quando o getResultsAccessView diz que a pessoa já pagou,
// ou enquanto isso ainda não foi confirmado. Nunca mostra checkout nem preço
// do plano mensal (a oferta de continuidade fica no dashboard).
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react'
import { OFFER } from '@/lib/offer'
import { Button, Card } from '@/components/ui'
import type { ResultsAccessView } from './results-access'

export interface ResultsAccessCardProps {
  view: Exclude<ResultsAccessView, 'none'>
  /** Fim do acesso do €30 (só para `active`; null sem prazo: assinatura ou equipe). */
  expiresAt: Date | null
  /** Recarrega os dados da conta (AuthContext.refreshUser). */
  onRetry: () => Promise<unknown>
}

function formatAccessDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export function ResultsAccessCard({ view, expiresAt, onRetry }: ResultsAccessCardProps) {
  const [retrying, setRetrying] = useState(false)

  if (view === 'checking') {
    return (
      <Card data-testid="results-access-checking" className="flex min-h-40 items-center justify-center">
        <p role="status" className="flex items-center gap-2 text-base text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
          Confirmando o acesso da sua conta…
        </p>
      </Card>
    )
  }

  if (view === 'unknown') {
    const retry = async () => {
      setRetrying(true)
      try {
        await onRetry()
      } finally {
        setRetrying(false)
      }
    }
    return (
      <Card variant="elevated" role="alert" data-testid="results-access-unknown">
        <div className="flex gap-3">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--warning))]" />
          <div className="min-w-0">
            <h2 className="text-h3 font-semibold text-foreground">Não conseguimos confirmar seu acesso agora</h2>
            <p className="mt-1.5 text-base text-muted-foreground">
              Verifique sua conexão e tente de novo. Se você já comprou a análise, ela continua no seu painel.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button size="md" className="w-full sm:w-auto" loading={retrying} onClick={() => void retry()}>
            Tentar de novo
          </Button>
          <Button asChild variant="secondary" size="md" className="w-full sm:w-auto">
            <Link to="/dashboard">Ir para o painel</Link>
          </Button>
        </div>
      </Card>
    )
  }

  if (view === 'expired') {
    return (
      <Card variant="elevated" data-testid="results-paid-expired">
        <h2 className="text-h2 text-foreground">Seu acesso de {OFFER.accessDays} dias terminou</h2>
        <p className="mt-2 text-base text-muted-foreground">
          Seus documentos continuam no painel, e lá você vê as opções para continuar.
        </p>
        <Button asChild size="lg" className="mt-5 w-full">
          <Link to="/dashboard?acesso=expirado">
            Ir para o painel
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </Card>
    )
  }

  return (
    <Card variant="elevated" data-testid="results-paid">
      <h2 className="text-h2 text-foreground">Você já tem acesso à análise completa</h2>
      <p className="mt-2 text-base text-muted-foreground">
        No painel estão a análise de cada caminho, os requisitos, os documentos e os próximos passos.
      </p>
      {expiresAt && (
        <p className="mt-2 text-sm text-muted-foreground" data-testid="results-paid-until">
          Seu acesso vai até {formatAccessDate(expiresAt)}.
        </p>
      )}
      <Button asChild size="lg" className="mt-5 w-full">
        <Link to="/dashboard">
          Ir para o painel
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
      <div className="mt-2 flex justify-center">
        <Button asChild variant="link" size="sm">
          <Link to="/dashboard/analysis">Abrir a análise completa</Link>
        </Button>
      </div>
    </Card>
  )
}
