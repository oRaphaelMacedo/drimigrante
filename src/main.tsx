import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { initSentry } from '@/lib/sentry'
import { initAnalytics } from '@/lib/analytics'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import './index.css'

initSentry()
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
