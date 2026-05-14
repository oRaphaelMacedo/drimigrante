// DashboardHomePage.tsx — Supabase + localStorage hybrid data loading

import { Link } from 'react-router-dom'

interface CachedResult {
  score: { percentage: number; category: string; label: string }
  visas: Array<{ code: string; name: string; match: string }>
  leadInfo: { fullName: string; email: string } | null
  completedAt: string
  assessmentId?: string | null
}

import {
  FileText,
  MessageSquare,
  ArrowRight,
  CheckCircle,
  Clock,
  Lock,
  BarChart3,
  Zap,
  User,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult } from '@/hooks/useAssessmentResult'
import { cn } from '@/lib/utils'

export function DashboardHomePage() {
  const { authUser, hasAccess } = useAuth()
  const { result: assessmentResult } = useAssessmentResult()
  const firstName = authUser?.profile?.full_name?.split(' ')[0]
    ?? assessmentResult?.leadName?.split(' ')[0]
    ?? 'bem-vindo'

  const hasPaid = hasAccess('dashboard')
  const hasQuizResult = !!assessmentResult

  // Adapt to the shape the existing sub-components expect
  const cachedResult = assessmentResult
    ? {
        score: {
          percentage: assessmentResult.scorePercentage,
          category: assessmentResult.scoreCategory,
          label: assessmentResult.scoreLabel,
        },
        visas: assessmentResult.localVisas,
        leadInfo: assessmentResult.leadName
          ? { fullName: assessmentResult.leadName, email: assessmentResult.leadEmail ?? '' }
          : null,
        completedAt: assessmentResult.completedAt ?? '',
        assessmentId: assessmentResult.assessmentId || null,
      }
    : null

  return (
    <div className="space-y-8">
      {/* ── Welcome Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Olá, {firstName}! 👋
          </h1>
          <p className="mt-1 text-gray-500">
            {hasPaid
              ? 'Bem-vindo ao seu painel de imigração.'
              : 'Complete o pagamento para desbloquear a análise completa.'}
          </p>
        </div>
        {!hasPaid && hasQuizResult && (
          <Link
            to="/checkout"
            state={{ plan: 'one_time', assessmentId: cachedResult?.assessmentId }}
            className="hidden shrink-0 items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:bg-brand-600 sm:flex"
          >
            <Zap className="h-4 w-4" />
            Desbloquear €30
          </Link>
        )}
      </div>

      {/* ── Quiz Result Summary (if exists) ── */}
      {hasQuizResult ? (
        <QuizResultBanner result={cachedResult!} hasPaid={hasPaid} />
      ) : (
        <NoQuizBanner />
      )}

      {/* ── Feature Cards ── */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
          O seu espaço
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={FileText}
            label="Minha Análise"
            description="Diagnóstico jurídico completo do seu perfil."
            href="/dashboard/analysis"
            locked={!hasPaid}
            color="brand"
            testid="dashboard-card-analysis"
          />
          <FeatureCard
            icon={MessageSquare}
            label="Chat IA"
            description="Tire dúvidas com a nossa IA especializada."
            href="/dashboard/chat"
            locked={!hasPaid}
            color="purple"
            testid="dashboard-card-chat"
          />
          <FeatureCard
            icon={User}
            label="Perfil"
            description="Actualize os seus dados e preferências."
            href="/dashboard/settings"
            locked={false}
            color="gray"
          />
        </div>
      </div>

      {/* ── Unlock CTA (mobile, if no paid) ── */}
      {!hasPaid && hasQuizResult && (
        <div className="rounded-2xl border-2 border-brand-600 bg-brand-700 p-6 text-white sm:hidden">
          <p className="mb-3 text-sm font-medium text-blue-200">
            Desbloqueie o diagnóstico completo
          </p>
          <Link
            to="/checkout"
            state={{ plan: 'one_time', assessmentId: cachedResult?.assessmentId }}
            className="flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-bold text-brand-700"
          >
            Desbloquear por €30 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* ── Timeline / Status ── */}
      <ProcessTimeline hasPaid={hasPaid} hasQuizResult={hasQuizResult} />
    </div>
  )
}

// ── QuizResultBanner ─────────────────────────────────────────────────────────

function QuizResultBanner({ result, hasPaid }: { result: CachedResult; hasPaid: boolean }) {
  const categoryConfig = {
    alta: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', emoji: '🌟' },
    media: { color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', emoji: '⚡' },
    baixa: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', emoji: '🔍' },
  }
  const config = categoryConfig[result.score.category as keyof typeof categoryConfig] ?? categoryConfig.media

  return (
    <div className={cn('rounded-2xl border p-5 sm:p-6', config.bg)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Score */}
        <div className="flex items-center gap-4">
          <div className="text-4xl">{config.emoji}</div>
          <div>
            <p className="text-xs font-medium text-gray-500">Resultado do Quiz</p>
            <p className={cn('text-lg font-bold', config.color)}>{result.score.label}</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/60">
                <div
                  className={cn(
                    'h-full rounded-full',
                    result.score.category === 'alta' && 'bg-emerald-500',
                    result.score.category === 'media' && 'bg-amber-500',
                    result.score.category === 'baixa' && 'bg-blue-500',
                  )}
                  style={{ width: `${result.score.percentage}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-gray-600">{result.score.percentage}%</span>
            </div>
          </div>
        </div>

        {/* Visas teaser */}
        <div className="flex-1 sm:text-right">
          <p className="mb-1.5 text-xs text-gray-500">
            {result.visas?.length ?? 0} visto(s) identificado(s)
          </p>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {(result.visas ?? []).slice(0, 3).map((v: { code: string; name: string; match: string }) => (
              <span
                key={v.code}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  hasPaid
                    ? 'bg-white text-gray-700 border border-gray-200'
                    : 'border border-gray-200 bg-white/80 text-gray-400 blur-[2px]',
                )}
              >
                {hasPaid ? v.name : '██████████'}
              </span>
            ))}
          </div>
        </div>

        {/* CTA */}
        {hasPaid ? (
          <Link
            to="/dashboard/analysis"
            className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm transition hover:shadow"
          >
            Ver análise <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <Link
            to="/checkout"
            state={{ plan: 'one_time', assessmentId: result.assessmentId }}
            className="hidden shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-500 sm:flex"
          >
            <Lock className="h-3.5 w-3.5" /> Desbloquear
          </Link>
        )}
      </div>
    </div>
  )
}

// ── NoQuizBanner ─────────────────────────────────────────────────────────────

function NoQuizBanner() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 text-center">
      <BarChart3 className="mx-auto mb-3 h-8 w-8 text-gray-300" />
      <h3 className="mb-1 font-semibold text-gray-700">Ainda não fez o quiz</h3>
      <p className="mb-4 text-sm text-gray-500">
        Complete o quiz de elegibilidade para ver o seu diagnóstico de imigração.
      </p>
      <Link
        to="/quiz"
        className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-600"
      >
        Fazer o quiz <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}

// ── FeatureCard ───────────────────────────────────────────────────────────────

function FeatureCard({
  icon: Icon,
  label,
  description,
  href,
  locked,
  color,
  testid,
}: {
  icon: React.ElementType
  label: string
  description: string
  href: string
  locked: boolean
  color: 'brand' | 'purple' | 'gray'
  testid?: string
}) {
  const colorMap = {
    brand: 'bg-brand-50 border-brand-200 text-brand-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  }

  return (
    <Link
      to={locked ? '/checkout' : href}
      data-testid={testid}
      className={cn(
        'group relative rounded-xl border p-5 transition hover:shadow-sm',
        locked ? 'opacity-70 hover:opacity-100' : '',
        colorMap[color],
      )}
    >
      {locked && (
        <Lock className="absolute right-4 top-4 h-3.5 w-3.5 text-gray-300" />
      )}
      <Icon className="mb-3 h-5 w-5" />
      <h3 className="font-semibold text-gray-900">{label}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
      <div className="mt-3 flex items-center gap-1 text-xs font-medium">
        {locked ? (
          <span className="text-gray-400">Requer desbloqueio</span>
        ) : (
          <>
            <span>Abrir</span>
            <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
          </>
        )}
      </div>
    </Link>
  )
}

// ── ProcessTimeline ───────────────────────────────────────────────────────────

function ProcessTimeline({
  hasPaid,
  hasQuizResult,
}: {
  hasPaid: boolean
  hasQuizResult: boolean
}) {
  const steps = [
    {
      id: 1,
      label: 'Quiz de elegibilidade',
      desc: 'Avaliação do seu perfil de imigração',
      done: hasQuizResult,
    },
    {
      id: 2,
      label: 'Desbloqueio da análise',
      desc: 'Pagamento do diagnóstico completo',
      done: hasPaid,
    },
    {
      id: 3,
      label: 'Análise jurídica em curso',
      desc: 'A nossa equipa analisa o seu perfil',
      done: false,
      pending: hasPaid,
    },
    {
      id: 4,
      label: 'Resultado disponível',
      desc: 'Dashboard com vistos e documentos',
      done: false,
    },
  ]

  return (
    <div>
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Estado do processo
      </h2>
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-4">
              {/* Icon + line */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
                    step.done
                      ? 'bg-emerald-100 text-emerald-600'
                      : step.pending
                        ? 'bg-amber-100 text-amber-600'
                        : 'bg-gray-100 text-gray-400',
                  )}
                >
                  {step.done ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : step.pending ? (
                    <Clock className="h-4 w-4" />
                  ) : (
                    <span className="text-xs">{step.id}</span>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-0.5 flex-1 my-1',
                      step.done ? 'bg-emerald-200' : 'bg-gray-100',
                    )}
                    style={{ minHeight: '20px' }}
                  />
                )}
              </div>
              {/* Content */}
              <div className="pb-5 min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-medium',
                    step.done ? 'text-gray-900' : 'text-gray-400',
                  )}
                >
                  {step.label}
                  {step.pending && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      Em curso
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
