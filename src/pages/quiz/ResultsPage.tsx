// ResultsPage.tsx — Day 2: Quiz Engine I — Pre-result + CTA
// Day 3: Updated CTAs to route to /checkout
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle, Lock, RotateCcw, Star, TrendingUp, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuizResult } from '@/hooks/useQuiz'
import type { VisaSuggestion } from '@/data/quiz-questions'
import { track } from '@/lib/analytics'

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [result, setResult] = useState<QuizResult | null>(null)
  const [assessmentId, setAssessmentId] = useState<string | null>(null)

  useEffect(() => {
    // Try router state first (direct from quiz), then localStorage fallback
    if (location.state?.result) {
      setResult(location.state.result as QuizResult)
      if (location.state?.assessmentId) setAssessmentId(location.state.assessmentId as string)
      return
    }
    try {
      const stored = localStorage.getItem('dr_imigrante_quiz_result')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.assessmentId) setAssessmentId(parsed.assessmentId)
        setResult({
          score: {
            total: parsed.score.total,
            max: parsed.score.max,
            percentage: parsed.score.percentage,
            category: parsed.score.category,
            label: categoryLabel(parsed.score.category).label,
            sublabel: categoryLabel(parsed.score.category).sublabel,
            color: categoryLabel(parsed.score.category).color,
            bgColor: categoryLabel(parsed.score.category).bgColor,
            emoji: categoryLabel(parsed.score.category).emoji,
          },
          visas: parsed.visas || [],
          leadInfo: parsed.leadInfo || null,
        })
      }
    } catch {
      // ignore parse errors
    }
  }, [location.state])

  // Fire quiz_completed once per result load
  useEffect(() => {
    if (result) {
      track('quiz_completed', {
        score: result.score.percentage,
        category: result.score.category,
        top_visa: result.visas?.[0]?.code,
      })
    }
  }, [result])

  if (!result) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-gray-500">Não encontrámos nenhum resultado de quiz.</p>
        <Link
          to="/quiz"
          className="rounded-xl bg-brand-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Fazer o Quiz →
        </Link>
      </div>
    )
  }

  const { score, visas, leadInfo } = result

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-brand-50/40 to-white">
      <div className="container py-8 sm:py-12">
        <div className="mx-auto max-w-2xl space-y-6">

          {/* ── Score Card ── */}
          <ScoreCard score={score} leadInfo={leadInfo} />

          {/* ── Visa suggestions (teaser) ── */}
          <VisaTeaserCard visas={visas} />

          {/* ── Paywall CTA ── */}
          <PaywallCard firstName={leadInfo?.fullName?.split(' ')[0]} assessmentId={assessmentId} />

          {/* ── Restart ── */}
          <div className="text-center">
            <button
              id="results-restart-btn"
              onClick={() => navigate('/quiz')}
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Refazer o quiz
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ScoreCard({ score, leadInfo }: { score: QuizResult['score']; leadInfo: QuizResult['leadInfo'] }) {
  const firstName = leadInfo?.fullName?.split(' ')[0]

  return (
    <div data-testid="results-score" className={cn('rounded-2xl border p-6 text-center shadow-sm sm:p-8', score.bgColor)}>
      {/* Emoji + category */}
      <div className="mb-3 text-5xl">{score.emoji}</div>
      {firstName && (
        <p className="mb-1 text-sm font-medium text-gray-500">
          {firstName}, o seu resultado é:
        </p>
      )}
      <h1 className={cn('mb-2 text-2xl font-extrabold sm:text-3xl', score.color)}>
        {score.label}
      </h1>
      <p className="mb-6 text-sm text-gray-600 max-w-md mx-auto">{score.sublabel}</p>

      {/* Score gauge */}
      <div className="mx-auto max-w-xs">
        <div className="mb-2 flex items-baseline justify-between text-xs text-gray-400">
          <span>Pontuação</span>
          <span className={cn('text-lg font-extrabold', score.color)}>
            {score.percentage}%
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/60 shadow-inner">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-1000',
              score.category === 'alta' && 'bg-emerald-500',
              score.category === 'media' && 'bg-amber-500',
              score.category === 'baixa' && 'bg-blue-500',
            )}
            style={{ width: `${score.percentage}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
          <span>Baixa</span>
          <span>Média</span>
          <span>Alta</span>
        </div>
      </div>
    </div>
  )
}

function VisaTeaserCard({ visas }: { visas: VisaSuggestion[] }) {
  const topVisas = visas.slice(0, 3)

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-brand-600" />
        <h2 className="font-bold text-gray-900">Vistos Identificados para o Seu Perfil</h2>
      </div>

      <div className="space-y-3">
        {topVisas.map((visa, i) => (
          <div
            key={visa.code}
            className={cn(
              'relative flex items-start gap-3 rounded-xl border p-4',
              i === 0
                ? 'border-brand-200 bg-brand-50'
                : 'border-gray-100 bg-gray-50',
            )}
          >
            {/* Match indicator */}
            <div
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                visa.match === 'strong' && 'bg-emerald-500 text-white',
                visa.match === 'possible' && 'bg-amber-500 text-white',
                visa.match === 'weak' && 'bg-gray-400 text-white',
              )}
            >
              {visa.match === 'strong' ? '✓' : visa.match === 'possible' ? '~' : '?'}
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900 text-sm">{visa.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    visa.match === 'strong' && 'bg-emerald-100 text-emerald-700',
                    visa.match === 'possible' && 'bg-amber-100 text-amber-700',
                    visa.match === 'weak' && 'bg-gray-100 text-gray-500',
                  )}
                >
                  {visa.match === 'strong' ? 'Alta compatibilidade' : visa.match === 'possible' ? 'Compatibilidade possível' : 'A explorar'}
                </span>
              </div>
              {/* Blurred reason — paywall teaser */}
              <p className="text-xs text-gray-400 line-clamp-1 blur-[3px] select-none">
                {visa.reason}
              </p>
            </div>

            {/* Lock for non-first */}
            {i > 0 && (
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* Unlock hint */}
      <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3 text-center text-xs text-gray-500">
        <Lock className="mx-auto mb-1 h-3.5 w-3.5" />
        Desbloqueie a análise completa com os detalhes de cada visto, requisitos e lista de documentos.
      </div>
    </div>
  )
}

function PaywallCard({ firstName, assessmentId }: { firstName?: string; assessmentId?: string | null }) {
  const features = [
    { icon: Star, text: 'Análise jurídica completa personalizada' },
    { icon: CheckCircle, text: 'Top 3 vistos detalhados com requisitos exactos' },
    { icon: Users, text: 'Lista completa de documentos necessários' },
    { icon: Zap, text: 'Dashboard pessoal com acompanhamento do processo' },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-brand-600 bg-brand-700 text-white shadow-xl">
      <div className="p-6 sm:p-8">
        {/* Badge */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-white">
          <Star className="h-3 w-3" />
          Diagnóstico Profissional
        </div>

        <h2 className="mb-2 text-2xl font-extrabold leading-tight">
          {firstName ? `${firstName}, desbloqueie` : 'Desbloqueie'} a análise completa do seu perfil
        </h2>
        <p className="mb-6 text-sm text-blue-200">
          A nossa equipa de advogados especializados analisará o seu perfil e identificará o caminho mais direto para Portugal.
        </p>

        {/* Features */}
        <ul className="mb-6 space-y-2.5">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-sm text-blue-100">
              <Icon className="h-4 w-4 shrink-0 text-blue-300" />
              {text}
            </li>
          ))}
        </ul>

        {/* Pricing */}
        <div className="mb-4 flex items-baseline gap-2">
          <span className="text-4xl font-extrabold">€30</span>
          <span className="text-blue-300">pagamento único</span>
        </div>

        {/* CTA buttons */}
        <div className="space-y-3">
          <Link
            id="results-unlock-btn"
            data-testid="results-cta-paywall"
            to="/checkout"
            state={{ plan: 'one_time', assessmentId }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3.5 text-base font-bold text-brand-700 shadow-md transition hover:bg-blue-50"
          >
            Desbloquear por €30
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            id="results-subscribe-btn"
            to="/checkout"
            state={{ plan: 'recurring', assessmentId }}
            className="block w-full rounded-xl border-2 border-white/30 py-3 text-center text-sm font-semibold text-white transition hover:border-white/60"
          >
            Ou acompanhamento mensal por €4,90/mês →
          </Link>
        </div>

        {/* Trust */}
        <p className="mt-4 text-center text-xs text-blue-300">
          🔒 Pagamento seguro · Resultado em 24h · Garantia de satisfação
        </p>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categoryLabel(category: string) {
  if (category === 'alta')
    return {
      label: 'Perfil de Alta Elegibilidade',
      sublabel: 'O seu perfil indica fortes probabilidades de elegibilidade para Portugal.',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50',
      emoji: '🌟',
    }
  if (category === 'media')
    return {
      label: 'Perfil de Média Elegibilidade',
      sublabel: 'O seu perfil tem boas chances, mas podem existir condições a cumprir.',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      emoji: '⚡',
    }
  return {
    label: 'Perfil em Desenvolvimento',
    sublabel: 'Existem opções a explorar. A análise completa identificará os caminhos disponíveis.',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    emoji: '🔍',
  }
}
