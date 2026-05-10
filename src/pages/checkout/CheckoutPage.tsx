// CheckoutPage.tsx — Day 4: Stripe Integration
// Handles one-time (€30) and recurring (€4,90/mês) plan selection
// Wired to create-checkout-session edge function → Stripe Hosted Checkout

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle,
  Loader2,
  Lock,
  Shield,
  Star,
  Zap,
  CreditCard,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────────────────────

type PlanId = 'one_time' | 'recurring'

interface Plan {
  id: PlanId
  name: string
  price: string
  priceNote: string
  description: string
  badge?: string
  badgeColor?: string
  features: string[]
  highlight: boolean
}

// ─── Plans ──────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id: 'one_time',
    name: 'Análise Completa',
    price: '€30',
    priceNote: 'pagamento único',
    description: 'Diagnóstico jurídico completo do seu perfil de imigração, uma vez.',
    badge: 'Mais popular',
    badgeColor: 'bg-brand-600 text-white',
    highlight: true,
    features: [
      'Análise jurídica personalizada do perfil',
      'Top 3 vistos com requisitos exactos',
      'Lista completa de documentos necessários',
      'Acesso ao Dashboard pessoal por 30 dias',
      'Resultado em até 24h úteis',
      'Garantia de satisfação ou reembolso',
    ],
  },
  {
    id: 'recurring',
    name: 'Acompanhamento Mensal',
    price: '€4,90',
    priceNote: '/mês · cancele a qualquer momento',
    description: 'Tudo da Análise Completa + acompanhamento contínuo do seu processo.',
    highlight: false,
    features: [
      'Tudo incluído na Análise Completa',
      'Dashboard pessoal ilimitado',
      'Chat IA com especialista em imigração',
      'Alertas de alterações legislativas',
      'Revisão do processo sempre que necessário',
      'Suporte prioritário por email',
    ],
  },
]

// ─── Component ──────────────────────────────────────────────────────────────

export function CheckoutPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { authUser } = useAuth()

  // Plan can be pre-selected from Results page link
  const initialPlan = (location.state?.plan as PlanId) ?? 'one_time'
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan)
  const [isProcessing, setIsProcessing] = useState(false)

  const plan = PLANS.find((p) => p.id === selectedPlan)!

  const handleCheckout = async () => {
    // If not logged in, redirect to login with return intent
    if (!authUser) {
      navigate('/login', { state: { returnTo: '/checkout', plan: selectedPlan } })
      return
    }

    setIsProcessing(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          plan: selectedPlan,
          assessmentId: location.state?.assessmentId ?? null,
        },
      })

      if (error) throw error
      if (!data?.url) throw new Error('Stripe session URL não recebida.')

      // Redirect to Stripe Hosted Checkout
      window.location.href = data.url
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      toast.error('Erro ao iniciar pagamento', {
        description: message,
        duration: 6000,
      })
      setIsProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50/50 via-white to-blue-50/30">
      {/* Back nav */}
      <div className="border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="container flex h-14 items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-700">Doutor Imigrante</span>
          <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="h-3 w-3" />
            Pagamento seguro
          </span>
        </div>
      </div>

      <div className="container py-10 sm:py-16">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="mb-2 text-3xl font-extrabold text-gray-900 sm:text-4xl">
              Desbloqueie a sua análise
            </h1>
            <p className="text-gray-500">
              Escolha o plano que melhor se adapta à sua situação.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Left: Plan Selector ── */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
                Selecione o plano
              </h2>

              {PLANS.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  selected={selectedPlan === p.id}
                  onSelect={() => setSelectedPlan(p.id)}
                />
              ))}

              {/* Trust badges */}
              <div className="mt-2 grid grid-cols-3 gap-3 pt-2">
                {[
                  { icon: Shield, label: 'Pagamento SSL seguro' },
                  { icon: RefreshCw, label: 'Cancele quando quiser' },
                  { icon: Star, label: 'Garantia de satisfação' },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="flex flex-col items-center gap-1 rounded-xl border border-gray-100 bg-white p-3 text-center"
                  >
                    <Icon className="h-4 w-4 text-brand-600" />
                    <span className="text-[10px] font-medium text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: Order Summary ── */}
            <div>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
                Resumo do pedido
              </h2>

              <div className="sticky top-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                {/* Plan summary */}
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{plan.name}</p>
                    <p className="mt-0.5 text-sm text-gray-500">{plan.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-extrabold text-gray-900">{plan.price}</p>
                    <p className="text-xs text-gray-400">{plan.priceNote}</p>
                  </div>
                </div>

                {/* Features */}
                <ul className="mb-6 space-y-2 border-t border-gray-100 pt-4">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* User info (if logged in) */}
                {authUser && (
                  <div className="mb-4 rounded-xl bg-gray-50 p-3 text-sm">
                    <p className="text-xs font-medium text-gray-400">A pagar como</p>
                    <p className="font-medium text-gray-800">{authUser.profile?.full_name}</p>
                    <p className="text-gray-500">{authUser.user.email}</p>
                  </div>
                )}

                {/* CTA */}
                <button
                  id="checkout-pay-btn"
                  onClick={handleCheckout}
                  disabled={isProcessing}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition',
                    'bg-brand-700 text-white shadow-md hover:bg-brand-600',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      A processar...
                    </>
                  ) : authUser ? (
                    <>
                      <CreditCard className="h-4 w-4" />
                      Pagar {plan.price}
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      Continuar para pagamento
                    </>
                  )}
                </button>

                {!authUser && (
                  <p className="mt-3 text-center text-xs text-gray-400">
                    Será pedido para entrar ou criar conta.{' '}
                    <Link to="/login" className="text-brand-600 underline">
                      Já tem conta? Entre aqui.
                    </Link>
                  </p>
                )}

                <p className="mt-4 text-center text-xs text-gray-400">
                  🔒 Pagamento processado por Stripe · PCI DSS compliant
                </p>
              </div>
            </div>
          </div>

          {/* FAQ mini */}
          <FaqSection />
        </div>
      </div>
    </div>
  )
}

// ─── PlanCard ────────────────────────────────────────────────────────────────

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: Plan
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative w-full rounded-2xl border-2 p-5 text-left transition-all',
        selected
          ? 'border-brand-600 bg-brand-50/60 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300',
      )}
    >
      {/* Badge */}
      {plan.badge && (
        <span
          className={cn(
            'absolute right-4 top-4 rounded-full px-2.5 py-0.5 text-[10px] font-bold',
            plan.badgeColor,
          )}
        >
          {plan.badge}
        </span>
      )}

      {/* Radio */}
      <div className="mb-3 flex items-center gap-3">
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border-2 transition',
            selected ? 'border-brand-600' : 'border-gray-300',
          )}
        >
          {selected && <div className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{plan.name}</p>
          <p className="text-xs text-gray-500">{plan.description}</p>
        </div>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-extrabold text-gray-900">{plan.price}</span>
        <span className="text-sm text-gray-400">{plan.priceNote}</span>
      </div>
    </button>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FaqSection() {
  const faqs = [
    {
      q: 'O que acontece após o pagamento?',
      a: 'A nossa equipa recebe imediatamente o seu perfil e inicia a análise. Receberá o resultado no seu dashboard em até 24h úteis.',
    },
    {
      q: 'Posso cancelar a subscrição mensal?',
      a: 'Sim, pode cancelar a qualquer momento sem penalizações. O acesso continua até ao fim do período pago.',
    },
    {
      q: 'A análise é feita por advogados reais?',
      a: 'Sim. A nossa IA faz um pré-diagnóstico e a nossa equipa jurídica especializada valida e aprofunda cada caso.',
    },
  ]

  return (
    <div className="mt-12">
      <h2 className="mb-6 text-center text-lg font-bold text-gray-900">Perguntas frequentes</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {faqs.map(({ q, a }) => (
          <div key={q} className="rounded-xl border border-gray-100 bg-white p-5">
            <p className="mb-2 font-semibold text-gray-900 text-sm">{q}</p>
            <p className="text-sm text-gray-500">{a}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
