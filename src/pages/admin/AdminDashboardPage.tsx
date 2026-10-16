// AdminDashboardPage.tsx — visão geral do admin com dados do Supabase:
// leads, conversão, MRR, pagamentos recentes e saúde dos e-mails (DI-014).

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Euro,
  Loader2,
  Mail,
  RefreshCw,
  Target,
  Users,
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

interface EmailHealth {
  sent: number
  failed: number
  lastFailure: {
    triggerKey: string | null
    createdAt: string | null
    message: string | null
  } | null
}

const DAY_MS = 24 * 60 * 60 * 1000

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  succeeded: 'Pago',
  pending: 'Pendente',
  processing: 'Processando',
  failed: 'Falhou',
  refunded: 'Reembolsado',
  disputed: 'Em disputa',
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const currencyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'EUR' })

function formatEuros(cents: number): string {
  return currencyFormat.format(cents / 100)
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

function formatDateTime(iso: string | null): string {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—'
}

/**
 * error_message do email_send_log pode ser JSON ({ code, status, message } no formato
 * novo, ou a resposta crua do Resend no antigo) ou texto. Devolve uma frase curta.
 */
function summarizeEmailError(raw: string | null): string | null {
  if (!raw) return null
  let text = raw
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; code?: unknown; name?: unknown }
    if (typeof parsed.message === 'string' && parsed.message) text = parsed.message
    else if (typeof parsed.code === 'string' && parsed.code) text = parsed.code
    else if (typeof parsed.name === 'string' && parsed.name) text = parsed.name
  } catch {
    // texto puro
  }
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 180 ? `${flat.slice(0, 179)}…` : flat
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  trendLabel,
  tone = 'brand',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  trend?: 'up' | 'down' | 'neutral'
  trendLabel?: string
  tone?: 'brand' | 'emerald' | 'amber' | 'violet'
}) {
  const toneMap = {
    brand: 'bg-brand-50 text-brand-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    violet: 'bg-violet-50 text-violet-700',
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', toneMap[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <p className="mb-1 text-3xl font-extrabold text-foreground">{value}</p>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      {trendLabel && (
        <div
          className={cn(
            'mt-3 flex items-center gap-1 text-sm font-medium',
            trend === 'up' && 'text-emerald-700',
            trend === 'down' && 'text-red-700',
            (trend === 'neutral' || !trend) && 'text-muted-foreground',
          )}
        >
          {trend === 'up' && <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}
          {trend === 'down' && <ArrowDownRight className="h-4 w-4" aria-hidden="true" />}
          {trendLabel}
        </div>
      )}
    </div>
  )
}

// ─── Saúde dos e-mails (DI-014) ──────────────────────────────────────────────

function useEmailHealth() {
  const [health, setHealth] = useState<EmailHealth | null>(null)
  const [failedToLoad, setFailedToLoad] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since = new Date(Date.now() - 7 * DAY_MS).toISOString()
      try {
        const [sentRes, failedRes, lastRes] = await Promise.all([
          supabase
            .from('email_send_log')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('created_at', since),
          supabase
            .from('email_send_log')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'failed')
            .gte('created_at', since),
          supabase
            .from('email_send_log')
            .select('error_message, created_at, email_templates(trigger_key)')
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (sentRes.error || failedRes.error || lastRes.error) {
          throw sentRes.error ?? failedRes.error ?? lastRes.error
        }
        const last = lastRes.data as {
          error_message: string | null
          created_at: string | null
          email_templates: { trigger_key: string } | Array<{ trigger_key: string }> | null
        } | null
        const template = Array.isArray(last?.email_templates) ? last?.email_templates[0] : last?.email_templates
        if (!cancelled) {
          setHealth({
            sent: sentRes.count ?? 0,
            failed: failedRes.count ?? 0,
            lastFailure: last
              ? {
                  triggerKey: template?.trigger_key ?? null,
                  createdAt: last.created_at,
                  message: summarizeEmailError(last.error_message),
                }
              : null,
          })
        }
      } catch (err) {
        console.error('[AdminDashboard] email health:', err)
        if (!cancelled) setFailedToLoad(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { health, failedToLoad }
}

function EmailHealthCard() {
  const { health, failedToLoad } = useEmailHealth()

  let status: { tone: 'ok' | 'warn' | 'idle'; text: string } | null = null
  if (health) {
    if (health.failed > 0) status = { tone: 'warn', text: 'Há falhas de envio nos últimos 7 dias' }
    else if (health.sent > 0) status = { tone: 'ok', text: 'Envios funcionando nos últimos 7 dias' }
    else status = { tone: 'idle', text: 'Nenhum envio nos últimos 7 dias' }
  }

  return (
    <section
      aria-labelledby="email-health-title"
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="mb-5 flex items-center gap-2">
        <Mail className="h-4 w-4 text-brand-700" aria-hidden="true" />
        <h2 id="email-health-title" className="font-bold text-foreground">
          Saúde dos e-mails
        </h2>
      </div>

      {failedToLoad && (
        <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico de envios.</p>
      )}

      {!failedToLoad && !health && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando…
        </div>
      )}

      {health && status && (
        <div className="space-y-4">
          <p
            className={cn(
              'flex items-center gap-2 text-sm font-semibold',
              status.tone === 'warn' && 'text-red-700',
              status.tone === 'ok' && 'text-emerald-700',
              status.tone === 'idle' && 'text-muted-foreground',
            )}
          >
            {status.tone === 'warn' ? (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {status.text}
          </p>

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted p-4">
              <dt className="text-sm text-muted-foreground">Enviados (7 dias)</dt>
              <dd className="mt-1 text-2xl font-extrabold text-foreground">{health.sent}</dd>
            </div>
            <div className="rounded-xl bg-muted p-4">
              <dt className="text-sm text-muted-foreground">Falhas (7 dias)</dt>
              <dd className={cn('mt-1 text-2xl font-extrabold', health.failed > 0 ? 'text-red-700' : 'text-foreground')}>
                {health.failed}
              </dd>
            </div>
          </dl>

          {health.lastFailure && (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-foreground">Último erro</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {health.lastFailure.triggerKey ?? 'modelo desconhecido'} · {formatDateTime(health.lastFailure.createdAt)}
              </p>
              {health.lastFailure.message && (
                <p className="mt-2 break-words text-sm text-foreground">{health.lastFailure.message}</p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

async function countRows(build: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await build()
  if (error) throw error
  return count ?? 0
}

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
        const now = Date.now()
        const thisWeekStart = new Date(now - 7 * DAY_MS).toISOString()
        const lastWeekStart = new Date(now - 14 * DAY_MS).toISOString()

        const [
          totalLeads,
          leadsThisWeek,
          leadsLastWeek,
          completedQuizzes,
          oneTimePaidCount,
          recurringCount,
          recentPayments,
        ] = await Promise.all([
          countRows(() => supabase.from('assessments').select('id', { count: 'exact', head: true })),
          countRows(() =>
            supabase.from('assessments').select('id', { count: 'exact', head: true }).gte('created_at', thisWeekStart),
          ),
          countRows(() =>
            supabase
              .from('assessments')
              .select('id', { count: 'exact', head: true })
              .gte('created_at', lastWeekStart)
              .lt('created_at', thisWeekStart),
          ),
          countRows(() =>
            supabase.from('assessments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
          ),
          countRows(() =>
            supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('one_time_paid', true),
          ),
          countRows(() =>
            supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('recurring_active', true),
          ),
          supabase
            .from('payments')
            .select('id, user_id, product, amount_cents, currency, paid_at, status')
            .order('paid_at', { ascending: false })
            .limit(8),
        ])

        const paidUsers = oneTimePaidCount + recurringCount
        const conversionRate = totalLeads > 0 ? Math.round((paidUsers / totalLeads) * 1000) / 10 : 0

        setStats({
          totalLeads,
          leadsThisWeek,
          leadsLastWeek,
          completedQuizzes,
          paidUsers,
          mrrCents: recurringCount * 490,
          oneTimePaidCount,
          recurringCount,
          conversionRate,
        })
        setPayments((recentPayments.data as RecentPayment[] | null) ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar os dados.')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-label="Carregando">
        <Loader2 className="h-7 w-7 animate-spin text-brand-700" aria-hidden="true" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800" role="alert">
        <p className="mb-1 font-semibold">Erro ao carregar o painel</p>
        <p>{error}</p>
      </div>
    )
  }

  const s = stats!
  const leadsWeekTrend: 'up' | 'down' | 'neutral' =
    s.leadsThisWeek > s.leadsLastWeek ? 'up' : s.leadsThisWeek < s.leadsLastWeek ? 'down' : 'neutral'

  const leadsWeekDiff = s.leadsThisWeek - s.leadsLastWeek
  const leadsWeekLabel =
    leadsWeekDiff === 0
      ? 'Igual à semana passada'
      : `${leadsWeekDiff > 0 ? '+' : ''}${leadsWeekDiff} em relação à semana passada`

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Painel do admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">Visão geral em tempo real do Doutor Imigrante</p>
      </div>

      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total de leads"
          value={s.totalLeads}
          sub={`${s.completedQuizzes} com quiz completo`}
          icon={Users}
          trend={leadsWeekTrend}
          trendLabel={leadsWeekLabel}
          tone="brand"
        />
        <StatCard
          label="Usuários pagantes"
          value={s.paidUsers}
          sub={`${s.oneTimePaidCount} pagamento único · ${s.recurringCount} mensal`}
          icon={CreditCard}
          trend="neutral"
          trendLabel="Total acumulado"
          tone="emerald"
        />
        <StatCard
          label="MRR"
          value={formatEuros(s.mrrCents)}
          sub={plural(s.recurringCount, 'assinatura ativa', 'assinaturas ativas')}
          icon={Euro}
          tone="violet"
        />
        <StatCard
          label="Taxa de conversão"
          value={`${s.conversionRate.toLocaleString('pt-BR')}%`}
          sub="Leads → pagamento"
          icon={Target}
          trend={s.conversionRate > 5 ? 'up' : 'neutral'}
          trendLabel={s.conversionRate > 5 ? 'Acima de 5%' : 'Em acompanhamento'}
          tone="amber"
        />
      </div>

      {/* Funnel, payments and e-mail health */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Funnel */}
        <section aria-labelledby="funnel-title" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand-700" aria-hidden="true" />
            <h2 id="funnel-title" className="font-bold text-foreground">
              Funil de conversão
            </h2>
          </div>
          <div className="space-y-4">
            {[
              { label: 'Leads capturados', value: s.totalLeads, max: s.totalLeads, color: 'bg-brand-500' },
              { label: 'Quiz completo', value: s.completedQuizzes, max: s.totalLeads, color: 'bg-brand-700' },
              { label: 'Usuários pagantes', value: s.paidUsers, max: s.totalLeads, color: 'bg-emerald-600' },
            ].map(({ label, value, max, color }) => {
              const pct = max > 0 ? Math.round((value / max) * 100) : 0
              return (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-bold text-foreground">
                      {value} <span className="font-normal text-muted-foreground">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Recent payments */}
        <section aria-labelledby="payments-title" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <h2 id="payments-title" className="font-bold text-foreground">
              Pagamentos recentes
            </h2>
          </div>

          {payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CreditCard className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nenhum pagamento ainda</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => {
                const isRecurring = p.product === 'recurring_monthly'
                const succeeded = p.status === 'succeeded'
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        isRecurring ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700',
                      )}
                    >
                      {isRecurring ? (
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {isRecurring ? 'Mensal €4,90' : 'Análise €30'}
                      </p>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDateTime(p.paid_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-foreground">{formatEuros(p.amount_cents)}</p>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
                          succeeded ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900',
                        )}
                      >
                        {succeeded && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                        {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <EmailHealthCard />
      </div>

      {/* Quick links */}
      <section aria-labelledby="quick-links-title" className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 id="quick-links-title" className="mb-4 font-bold text-foreground">
          Ações rápidas
        </h2>
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Ver todos os leads', to: '/admin/leads' },
            { label: 'Pipeline de casos', to: '/admin/pipeline' },
            { label: 'Configurar IA', to: '/admin/ai-config' },
          ].map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {label}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
