import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Sentry } from '@/lib/sentry'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    Sentry.withScope((scope) => {
      scope.setExtras({ componentStack: info.componentStack })
      Sentry.captureException(error)
    })
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (!this.state.hasError) return this.props.children
    if (this.props.fallback) return this.props.fallback

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <h1 className="text-2xl font-bold">Algo correu mal</h1>
        <p className="max-w-md text-muted-foreground">
          Ocorreu um erro inesperado. A nossa equipa foi notificada. Tente recarregar a página.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700"
          >
            Recarregar
          </button>
          <button
            onClick={this.reset}
            className="rounded-lg border border-border bg-background px-5 py-2.5 font-semibold hover:bg-muted"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }
}
