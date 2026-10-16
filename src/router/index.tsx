import { createBrowserRouter } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { RouteErrorPage } from '@/components/RouteErrorPage'
// Landing eager: a primeira tela (a mais acessada, no celular) não depende de
// um segundo chunk + spinner.
import { LandingPage } from '@/pages/LandingPage'
import { ProtectedRoute } from './ProtectedRoute'

// Pages — lazy loaded for performance
import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

const withSuspense = (Component: React.LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}>
    <Component />
  </Suspense>
)

// Public
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })))

// Auth
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const AuthCallbackPage = lazy(() => import('@/pages/auth/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage })))

// Quiz
const QuizPage = lazy(() => import('@/pages/quiz/QuizPage').then((m) => ({ default: m.QuizPage })))
const ResultsPage = lazy(() => import('@/pages/quiz/ResultsPage').then((m) => ({ default: m.ResultsPage })))

// Checkout
const CheckoutPage = lazy(() => import('@/pages/checkout/CheckoutPage').then((m) => ({ default: m.CheckoutPage })))
const SuccessPage = lazy(() => import('@/pages/checkout/SuccessPage').then((m) => ({ default: m.SuccessPage })))

// Legal
const TermsPage = lazy(() => import('@/pages/legal/TermsPage').then((m) => ({ default: m.TermsPage })))
const PrivacyPage = lazy(() => import('@/pages/legal/PrivacyPage').then((m) => ({ default: m.PrivacyPage })))
const CookiesPage = lazy(() => import('@/pages/legal/CookiesPage').then((m) => ({ default: m.CookiesPage })))

// Dashboard
const DashboardHomePage = lazy(() => import('@/pages/dashboard/DashboardHomePage').then((m) => ({ default: m.DashboardHomePage })))
const AnalysisPage = lazy(() => import('@/pages/dashboard/AnalysisPage').then((m) => ({ default: m.AnalysisPage })))
const ChatPage = lazy(() => import('@/pages/dashboard/ChatPage').then((m) => ({ default: m.ChatPage })))
const DocumentsPage = lazy(() => import('@/pages/dashboard/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const SettingsPage = lazy(() => import('@/pages/dashboard/SettingsPage').then((m) => ({ default: m.SettingsPage })))

// Admin
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })))
const AdminLeadsPage = lazy(() => import('@/pages/admin/AdminLeadsPage').then((m) => ({ default: m.AdminLeadsPage })))
const AdminPipelinePage = lazy(() => import('@/pages/admin/AdminPipelinePage').then((m) => ({ default: m.AdminPipelinePage })))
const AdminAiConfigPage = lazy(() => import('@/pages/admin/AdminAiConfigPage').then((m) => ({ default: m.AdminAiConfigPage })))
const AdminTenantsPage = lazy(() => import('@/pages/admin/AdminTenantsPage').then((m) => ({ default: m.AdminTenantsPage })))
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })))
const AdminQuizPage = lazy(() => import('@/pages/admin/AdminQuizPage').then((m) => ({ default: m.AdminQuizPage })))
const AdminQuizHistoryPage = lazy(() => import('@/pages/admin/AdminQuizHistoryPage').then((m) => ({ default: m.AdminQuizHistoryPage })))

export const router = createBrowserRouter([
  // Public routes
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/quiz', element: withSuspense(QuizPage) },
      { path: '/results', element: withSuspense(ResultsPage) },
      { path: '/checkout', element: withSuspense(CheckoutPage) },
      { path: '/checkout/success', element: withSuspense(SuccessPage) },
      { path: '/login', element: withSuspense(LoginPage) },
      { path: '/auth/callback', element: withSuspense(AuthCallbackPage) },
      { path: '/termos', element: withSuspense(TermsPage) },
      { path: '/privacidade', element: withSuspense(PrivacyPage) },
      { path: '/cookies', element: withSuspense(CookiesPage) },
      { path: '*', element: withSuspense(NotFoundPage) },
    ],
  },
  // Dashboard routes (authenticated)
  {
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/dashboard', element: withSuspense(DashboardHomePage) },
      {
        path: '/dashboard/analysis',
        // B06-A01: full_analysis is included in both one-time and subscription plans
        element: (
          <ProtectedRoute requireFeature="full_analysis">
            {withSuspense(AnalysisPage)}
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/chat',
        // B06-A01: chat is subscription-only — must gate on 'chat', not generic 'dashboard'
        element: (
          <ProtectedRoute requireFeature="chat">
            {withSuspense(ChatPage)}
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/documents',
        element: (
          <ProtectedRoute requireFeature="dashboard">
            {withSuspense(DocumentsPage)}
          </ProtectedRoute>
        ),
      },
      { path: '/dashboard/settings', element: withSuspense(SettingsPage) },
    ],
  },
  // Admin routes (hub users only)
  {
    element: (
      <ProtectedRoute requireAdmin>
        <AdminLayout />
      </ProtectedRoute>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/admin', element: withSuspense(AdminDashboardPage) },
      { path: '/admin/leads', element: withSuspense(AdminLeadsPage) },
      { path: '/admin/pipeline', element: withSuspense(AdminPipelinePage) },
      { path: '/admin/quiz', element: withSuspense(AdminQuizPage) },
      { path: '/admin/quiz/history', element: withSuspense(AdminQuizHistoryPage) },
      { path: '/admin/tenants', element: withSuspense(AdminTenantsPage) },
      { path: '/admin/ai-config', element: withSuspense(AdminAiConfigPage) },
      { path: '/admin/settings', element: withSuspense(AdminSettingsPage) },
    ],
  },
], {
  // Comportamentos do React Router v7 já ativados (somem os avisos do console
  // e a migração futura fica sem surpresas). v7_startTransition fica no App.
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
})
