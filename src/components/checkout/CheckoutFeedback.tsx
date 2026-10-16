import { Link } from 'react-router-dom'
import { AlertCircle, MailCheck, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui'
import type { CheckoutError, CheckoutPhase } from '@/hooks/useStartCheckout'

export interface CheckoutFeedbackProps {
  phase: CheckoutPhase
  error: CheckoutError | null
  onRetry: () => void
  /** E-mail da compra, para pré-preencher o /login quando a saída é entrar. */
  email?: string | null
}

/**
 * Retorno do botão de compra (DI-032), para ficar logo abaixo dele:
 * erro em português com a próxima ação (tentar de novo, entrar, abrir o painel
 * ou fazer o quiz) ou o aviso de link enviado por e-mail.
 */
export function CheckoutFeedback({ phase, error, onRetry, email }: CheckoutFeedbackProps) {
  if (phase === 'email_sent') {
    return (
      <div
        role="status"
        data-testid="checkout-email-sent"
        className="mt-3 flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/[.06] p-3 text-left"
      >
        <MailCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-foreground [text-wrap:pretty]">
          Enviamos um link de acesso para o seu e-mail. Se você já comprou a análise, use esse link para entrar no
          painel.
        </p>
      </div>
    )
  }

  if (phase !== 'error' || !error) return null

  return (
    <div
      role="alert"
      data-testid="checkout-error"
      className="mt-3 rounded-xl border border-destructive/25 bg-destructive/[.06] p-3 text-left"
    >
      <p className="flex items-start gap-2 text-sm font-medium text-foreground">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span className="[text-wrap:pretty]">{error.message}</span>
      </p>
      <div className="mt-2.5">
        {error.action === 'retry' && (
          <Button variant="secondary" size="sm" className="w-full" onClick={onRetry} data-testid="checkout-retry">
            <RotateCcw aria-hidden="true" />
            Tentar novamente
          </Button>
        )}
        {error.action === 'login' && (
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link to="/login" state={{ returnTo: '/checkout', ...(email ? { email } : {}) }}>
              Entrar com meu e-mail
            </Link>
          </Button>
        )}
        {error.action === 'dashboard' && (
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link to="/dashboard">Abrir meu painel</Link>
          </Button>
        )}
        {error.action === 'quiz' && (
          <Button asChild variant="secondary" size="sm" className="w-full">
            <Link to="/quiz">Fazer o quiz grátis</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
