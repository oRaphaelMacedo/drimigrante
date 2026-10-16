import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, Loader2, RefreshCw, SearchX } from 'lucide-react'
import { Sentry } from '@/lib/sentry'
import { isChunkLoadError, reloadOnceForStaleChunk } from '@/lib/chunk-reload'

export type ErrorScreenVariant = 'error' | 'updating' | 'stale' | 'not_found'

const COPY: Record<ErrorScreenVariant, { title: string; body: string }> = {
  error: {
    title: 'Algo deu errado',
    body: 'Não conseguimos mostrar esta página agora. Recarregue para tentar de novo. Se o problema continuar, volte ao início.',
  },
  updating: {
    title: 'Atualizando o site',
    body: 'Há uma versão nova do Doutor Imigrante. Estamos carregando a página de novo.',
  },
  stale: {
    title: 'Há uma versão nova do site',
    body: 'Recarregue a página para continuar. Se a mensagem voltar, tente de novo em alguns minutos.',
  },
  not_found: {
    title: 'Página não encontrada',
    body: 'O endereço pode estar errado ou a página mudou de lugar.',
  },
}

const primaryButton =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto'
const secondaryButton =
  'inline-flex h-12 w-full items-center justify-center rounded-xl border border-border bg-card px-6 text-base font-semibold text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto'

interface ErrorScreenProps {
  variant: ErrorScreenVariant
  /** Mensagem técnica — só aparece em desenvolvimento. */
  details?: string
}

/**
 * Tela de erro em tela cheia, usada pelo ErrorBoundary (raiz) e pela
 * RouteErrorPage (errorElement do router). Usa <a href> em vez de <Link>
 * porque pode renderizar fora do RouterProvider.
 */
export function ErrorScreen({ variant, details }: ErrorScreenProps) {
  const { title, body } = COPY[variant]
  const Icon = variant === 'not_found' ? SearchX : variant === 'error' ? AlertTriangle : RefreshCw
  const isUpdating = variant === 'updating'

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-md text-lg font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Doutor Imigrante
        </a>
      </div>

      <main className="flex flex-1 items-center justify-center px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-6">
        <div
          className="w-full max-w-md text-center"
          role={isUpdating ? 'status' : 'alert'}
          aria-live={isUpdating ? 'polite' : 'assertive'}
        >
          {isUpdating ? (
            <Loader2 className="mx-auto h-10 w-10 text-primary motion-safe:animate-spin" aria-hidden />
          ) : (
            <Icon className="mx-auto h-10 w-10 text-primary" aria-hidden />
          )}
          <h1 className="mt-5 text-2xl font-bold tracking-tight [text-wrap:balance] sm:text-3xl">{title}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground [text-wrap:pretty]">{body}</p>

          {!isUpdating && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              {variant !== 'not_found' && (
                <button type="button" onClick={() => window.location.reload()} className={primaryButton}>
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Recarregar página
                </button>
              )}
              <a href="/" className={variant === 'not_found' ? primaryButton : secondaryButton}>
                Voltar ao início
              </a>
            </div>
          )}

          {import.meta.env.DEV && details && (
            <details className="mt-8 rounded-xl border border-border bg-muted p-4 text-left text-sm">
              <summary className="cursor-pointer font-semibold">Detalhes técnicos (só em desenvolvimento)</summary>
              <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">{details}</pre>
            </details>
          )}
        </div>
      </main>
    </div>
  )
}

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
  variant: ErrorScreenVariant
}

/**
 * Última barreira (fora do router). Erros de rota são tratados antes pela
 * RouteErrorPage; aqui chegam falhas do App, dos providers e do próprio router.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, variant: 'error' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error, variant: isChunkLoadError(error) ? 'updating' : 'error' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      if (!reloadOnceForStaleChunk()) {
        this.setState({ variant: 'stale' })
        Sentry.captureMessage('Chunk desatualizado mesmo após recarregar', {
          level: 'warning',
          tags: { ctx: 'error-boundary.chunk' },
        })
      }
      return
    }
    Sentry.captureException(error, {
      tags: { ctx: 'error-boundary' },
      contexts: { react: { componentStack: info.componentStack ?? '' } },
    })
  }

  render() {
    const { error, variant } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return <ErrorScreen variant={variant} details={`${error.name}: ${error.message}`} />
  }
}
