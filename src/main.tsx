import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { router } from '@/router'
import { initSentry } from '@/lib/sentry'
import { initAnalytics, startPageviewTracking } from '@/lib/analytics'
import { captureAttribution } from '@/lib/attribution'
import { installPreloadErrorHandler } from '@/lib/chunk-reload'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './index.css'

// 1. UTMs da URL de entrada, antes de qualquer navegação limpar a query.
captureAttribution()
// 2. Aba aberta durante um deploy: chunk velho → recarrega uma vez.
installPreloadErrorHandler()
// 3. Monitoramento (SDK baixado em idle) e analytics (só com consentimento).
initSentry()
initAnalytics()
startPageviewTracking(router)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
