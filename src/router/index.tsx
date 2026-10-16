import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { RouteErrorPage } from '@/components/RouteErrorPage'
import type { RouteSeoHandle, SeoMeta } from '@/hooks/useSEO'
// Landing eager: a primeira tela (a mais acessada, no celular) não depende de
// um segundo chunk + spinner.
import { LandingPage } from '@/pages/LandingPage'
import { ProtectedRoute } from './ProtectedRoute'
import { RouteMeta } from './RouteMeta'

// Pages — lazy loaded for performance
import { lazy, Suspense } from 'react'
import { Loader2 } from 'lucide-react'

const withSuspense = (Component: React.LazyExoticComponent<() => JSX.Element>) => (
  <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>}>
    <Component />
  </Suspense>
)

/**
 * SEO por rota (DI-076): o RouteMeta junta o `handle.seo` das rotas casadas (a
 * mais interna vence). Sem handle = padrão do site (useSEO.ts / index.html).
 * `noindex` em tudo que é privado, do funil pós-quiz ou 404; o robots.txt não
 * bloqueia essas rotas, para que o noindex seja lido.
 */
const seo = (meta: SeoMeta): RouteSeoHandle => ({ seo: meta })

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

const routes: RouteObject[] = [
  // Public routes
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        path: '/quiz',
        element: withSuspense(QuizPage),
        handle: seo({
          title: 'Diagnóstico gratuito de nacionalidade',
          description:
            'Responda ao diagnóstico gratuito, sem criar conta, e veja na hora o pré-resultado do seu perfil para a nacionalidade portuguesa.',
        }),
      },
      { path: '/results', element: withSuspense(ResultsPage), handle: seo({ title: 'Seu pré-resultado', noindex: true }) },
      { path: '/checkout', element: withSuspense(CheckoutPage), handle: seo({ title: 'Análise completa', noindex: true }) },
      { path: '/checkout/success', element: withSuspense(SuccessPage), handle: seo({ title: 'Pagamento confirmado', noindex: true }) },
      { path: '/login', element: withSuspense(LoginPage), handle: seo({ title: 'Entrar', noindex: true }) },
      { path: '/auth/callback', element: withSuspense(AuthCallbackPage), handle: seo({ title: 'Entrando', noindex: true }) },
      // Mesmos valores do useSEO() das páginas legais.
      {
        path: '/termos',
        element: withSuspense(TermsPage),
        handle: seo({ title: 'Termos e condições', description: 'Termos e condições de uso do Doutor Imigrante.' }),
      },
      {
        path: '/privacidade',
        element: withSuspense(PrivacyPage),
        handle: seo({ title: 'Política de Privacidade', description: 'Como tratamos os seus dados pessoais.' }),
      },
      {
        path: '/cookies',
        element: withSuspense(CookiesPage),
        handle: seo({ title: 'Política de Cookies', description: 'Política e gestão de cookies.' }),
      },
      { path: '*', element: withSuspense(NotFoundPage), handle: seo({ title: 'Página não encontrada', noindex: true }) },
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
    handle: seo({ title: 'Meu painel', noindex: true }),
    children: [
      { path: '/dashboard', element: withSuspense(DashboardHomePage) },
      {
        path: '/dashboard/analysis',
        handle: seo({ title: 'Sua análise completa' }),
        // B06-A01: full_analysis is included in both one-time and subscription plans
        element: (
          <ProtectedRoute requireFeature="full_analysis">
            {withSuspense(AnalysisPage)}
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/chat',
        handle: seo({ title: 'Chat IA' }),
        // B06-A01: chat is subscription-only — must gate on 'chat', not generic 'dashboard'
        element: (
          <ProtectedRoute requireFeature="chat">
            {withSuspense(ChatPage)}
          </ProtectedRoute>
        ),
      },
      {
        path: '/dashboard/documents',
        handle: seo({ title: 'Meus documentos' }),
        element: (
          <ProtectedRoute requireFeature="dashboard">
            {withSuspense(DocumentsPage)}
          </ProtectedRoute>
        ),
      },
      { path: '/dashboard/settings', element: withSuspense(SettingsPage), handle: seo({ title: 'Configurações' }) },
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
    handle: seo({ title: 'Administração', noindex: true }),
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
]

export const router = createBrowserRouter([
  // Rota raiz só de SEO (sem caminho e sem layout): aplica o handle.seo.
  { element: <RouteMeta />, errorElement: <RouteErrorPage />, children: routes },
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
