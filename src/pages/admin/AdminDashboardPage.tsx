// AdminDashboardPage.tsx — Day 4
// Real admin dashboard with live stats from Supabase:
// leads count, conversion rate, MRR, and recent activity feed.

import { useEffect, useState } from 'react'
import {
  Users,
  CreditCard,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  Loader2,
  BarChart3,
  Euro,
  Target,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Stats {
  totalLeads: number
  leadsThisWeek: number
  leadsLastWeek: number
  completedQuizzes: number
  paidUsers: number
  mrrCents: number
  oneTimePaidCount: number
  recurringCount: number
  conversionRate: number
}

interface RecentPayment {
  id: string
  user_id: string | null
  product: string
  amount_cents: number
  currency: string
  paid_at: string | null
  status: string
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendLabel,
  accent = 'brand',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  accent?: 'brand' | 'emerald' | 'amber' | 'violet'
}) {
  const accentMap = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', accentMap[accent])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mb-1 text-3xl font-extrabold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      {trendLabel && (
        <div
          className={cn(
            'mt-3 flex items-center gap-1 text-xs font-medium',
            trend === 'up' && 'text-emerald-600',
            trend === 'down' && 'text-red-500',
            trend === 'neutral' && 'text-gray-400',
          )}
        >
          {trend === 'up' && <ArrowUpRight className="h-3.5 w-3.5" />}
          {trend === 'down' && <ArrowDownRight className="h-3.5 w-3.5" />}
          {trendLabel}
        </div>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [payments, setPayments] = useState<RecentPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      setError(null)

      try {
        // Total assessments (leads)
        const { count: totalLeads } = await supabase
          .from('assessments')
          .select('*', { count: 'exact', head: true })

        // Leads this week
        const thisWeekStart = new Date()
        thisWeekStart.setDate(thisWeekStart.getDate() - 7)
        const { count: leadsThisWeek } = await supabase
          .from('assessments')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thisWeekStart.toISOString())

        // Leads last week
        const lastWeekStart = new Date()
        lastWeekStart.setDate(lastWeekStart.getDate() - 14)
        const lastWeekEnd = new Date()
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 7)
        const { count: leadsLastWeek } = await supabase
          .from('assessments')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', lastWeekStart.toISOString())
          .lt('created_at', lastWeekEnd.toISOString())

        // Completed quizzes
        const { count: completedQuizzes } = await supabase
          .from('assessments')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'completed')

        // One-time paid
        const { count: oneTimePaidCount } = await supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('one_time_paid', true)

        // Recurring active
        const { count: recurringCount } = await supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('recurring_active', true)

        const paidUsers = (oneTimePaidCount ?? 0) + (recurringCount ?? 0)
        const mrrCents = (recurringCount ?? 0) * 490
        const conversionRate =
          totalLeads && totalLeads > 0
            ? Math.round(((paidUsers) / totalLeads) * 100 * 10) / 10
            : 0

        setStats({
          totalLeads: totalLeads ?? 0,
          leadsThisWeek: leadsThisWeek ?? 0,
          leadsLastWeek: leadsLastWeek ?? 0,
          completedQuizzes: completedQuizzes ?? 0,
          paidUsers,
          mrrCents,
          oneTimePaidCount: oneTimePaidCount ?? 0,
          recurringCount: recurringCount ?? 0,
          conversionRate,
        })

        // Recent payments
        const { data: recentPayments } = await (supabase as any)
          .from('payments')
          .select('id, user_id, product, amount_cents, currency, paid_at, status')
          .order('paid_at', { ascending: false })
          .limit(8)

        setPayments(recentPayments ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dados.')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-700">
        <p className="mb-1 font-semibold">Erro ao carregar dashboard</p>
        <p>{error}</p>
      </div>
    )
  }

  const s = stats!
  const leadsWeekTrend: 'up' | 'down' | 'neutral' =
    s.leadsThisWeek > s.leadsLastWeek
      ? 'up'
      : s.leadsThisWeek < s.leadsLastWeek
        ? 'down'
        : 'neutral'

  const leadsWeekDiff = s.leadsThisWeek - s.leadsLastWeek
  const leadsWeekLabel =
    leadsWeekDiff === 0
      ? 'Igual à semana passada'
      : `${leadsWeekDiff > 0 ? '+' : ''}${leadsWeekDiff} vs semana passada`

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Dashboard Admin</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visão geral em tempo real — Doutor Imigrante
        </p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total de Leads"
          value={s.totalLeads}
          sub={`${s.completedQuizzes} com quiz completo`}
          icon={Users}
          trend={leadsWeekTrend}
          trendLabel={leadsWeekLabel}
          accent="brand"
        />
        <StatCard
          label="Utilizadores Pagos"
          value={s.paidUsers}
          sub={`${s.oneTimePaidCount} one-time · ${s.recurringCount} mensal`}
          icon={CreditCard}
          trend="neutral"
          trendLabel="Total acumulado"
          accent="emerald"
        />
        <StatCard
          label="MRR"
          value={`€${(s.mrrCents / 100).toFixed(2)}`}
          sub={`${s.recurringCount} subscritores ativos`}
          icon={Euro}
          accent="violet"
        />
        <StatCard
          label="Taxa de Conversão"
          value={`${s.conversionRate}%`}
          sub="Leads → Pagamento"
          icon={Target}
          trend={s.conversionRate > 5 ? 'up' : 'neutral'}
          trendLabel={s.conversionRate > 5 ? 'Acima da média' : 'A monitorizar'}
          accent="amber"
        />
      </div>

      {/* Funnel breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand-600" />
            <h2 className="font-bold text-gray-900">Funil de Conversão</h2>
          </div>
          <div className="space-y-4">
            {[
              {
                label: 'Leads capturados',
                value: s.totalLeads,
                max: s.totalLeads,
                color: 'bg-brand-500',
              },
              {
                label: 'Quiz completo',
                value: s.completedQuizzes,
                max: s.totalLeads,
                color: 'bg-brand-600',
              },
              {
                label: 'Utilizadores pagos',
                value: s.paidUsers,
                max: s.totalLeads,
                color: 'bg-emerald-500',
              },
            ].map(({ label, value, max, color }) => {
              const pct = max > 0 ? Math.round((value / max) * 100) : 0
              return (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-bold text-gray-900">
                      {value}{' '}
                      <span className="font-normal text-gray-400">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={cn('h-full rounded-full transition-all', color)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent payments */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" />
            <h2 className="font-bold text-gray-900">Pagamentos Recentes</h2>
          </div>

          {payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CreditCard className="mb-3 h-8 w-8 text-gray-200" />
              <p className="text-sm text-gray-400">Nenhum pagamento ainda</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {payments.map((p) => {
                const isRecurring = p.product === 'recurring_monthly'
                const date = p.paid_at
                  ? new Intl.DateTimeFormat('pt-PT', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(p.paid_at))
                  : '—'

                return (
                  <div key={p.id} className="flex items-center gap-3 py-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        isRecurring
                          ? 'bg-violet-100 text-violet-600'
                          : 'bg-emerald-100 text-emerald-600',
                      )}
                    >
                      {isRecurring ? '↻' : '✓'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {isRecurring ? 'Mensal €4,90' : 'Análise €30'}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" />
                        {date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">
                        €{(p.amount_cents / 100).toFixed(2)}
                      </p>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                          p.status === 'succeeded'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-amber-50 text-amber-600',
                        )}
                      >
                        {p.status === 'succeeded' && <CheckCircle2 className="h-2.5 w-2.5" />}
                        {p.status}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-gray-900">Acções Rápidas</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Ver todos os leads', href: '/admin/leads' },
            { label: 'Pipeline de casos', href: '/admin/pipeline' },
            { label: 'Configurar IA', href: '/admin/ai-config' },
          ].map(({ label, href }) => (
            <a
              key={href}
              href={href}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              {label}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
