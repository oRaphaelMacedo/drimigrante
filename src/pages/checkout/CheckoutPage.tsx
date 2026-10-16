// CheckoutPage.tsx — resumo da compra do €30 (DI-011, DI-010, DI-033).
//
// Três modos (useStartCheckout):
//  - anônimo com o resultado do quiz neste aparelho → 1 clique direto para o
//    Stripe, sem login;
//  - autenticado → mesma compra com a conta (JWT);
//  - vazio → "Fazer o quiz grátis" ou "Já paguei, entrar".
// Volta do Stripe com ?cancelled (ou ?checkout=cancelled) mostra o aviso
// "Pagamento não concluído. Nada foi cobrado." acima da dobra.
// Um só cabeçalho (o do Layout); resumo único (sem escolha de plano: só o €30
// é vendido antes do pagamento); textos da oferta vêm de OFFER.

import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronDown, Info, Loader2, Lock, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { readStoredCheckoutData, useStartCheckout } from '@/hooks/useStartCheckout'
import { track } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { Button, Card, Container } from '@/components/ui'
import { CheckoutFeedback } from '@/components/checkout/CheckoutFeedback'

function isCancelledReturn(params: URLSearchParams): boolean {
  return params.has('cancelled') || params.get('checkout') === 'cancelled'
}

export function CheckoutPage() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { loading, hasAccess } = useAuth()
  const { mode, phase, isPending, error, email, start } = useStartCheckout()
  const [hasLocalResult] = useState(() => readStoredCheckoutData() !== null)
  const [showCancelled, setShowCancelled] = useState(() => isCancelledReturn(searchParams))
  const cancelHandledRef = useRef(false)

  // Volta do Stripe sem pagar: evento único e URL limpa (recarregar não repete).
  useEffect(() => {
    if (!isCancelledReturn(searchParams) || cancelHandledRef.current) return
    cancelHandledRef.current = true
    setShowCancelled(true)
    track('checkout_cancelled', { plan: 'one_time' })
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('cancelled')
        next.delete('checkout')
        return next
      },
      { replace: true, state: location.state },
    )
  }, [searchParams, setSearchParams, location.state])

  // Quem já tem acesso não compra de novo.
  if (hasAccess('dashboard')) {
    return <Navigate to="/dashboard" replace />
  }

  const handlePay = () => {
    void start({ position: 'checkout' })
  }

  // Enquanto a sessão carrega, ainda não sabemos se a compra é com a conta (ou
  // se a pessoa já tem acesso): não mostra a oferta anônima para depois trocar.
  const waitingForAccount = loading

  // Voltar para onde faz sentido: o resultado deste aparelho ou o painel.
  const back =
    mode === 'empty' || waitingForAccount
      ? null
      : hasLocalResult
        ? { to: '/results', label: 'Voltar ao resultado' }
        : { to: '/dashboard', label: 'Voltar ao painel' }

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-background">
      <Container size="sm" className="pb-10 pt-2 sm:pb-16 sm:pt-6">
        {back && (
          <Link
            to={back.to}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {back.label}
          </Link>
        )}

        {showCancelled && (
          <div
            role="status"
            data-testid="checkout-cancelled-banner"
            className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-muted p-4"
          >
            <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-foreground">Pagamento não concluído. Nada foi cobrado.</p>
              <p className="mt-1 text-sm text-muted-foreground">Você pode tentar de novo quando quiser.</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowCancelled(false)}
              aria-label="Fechar aviso"
              className="-mr-2 -mt-2 shrink-0 text-muted-foreground"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}

        {waitingForAccount ? (
          <div role="status" className="flex min-h-[40dvh] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Carregando…</span>
          </div>
        ) : mode === 'empty' ? (
          <EmptyCheckout />
        ) : (
          <>
            <header className="mb-5 mt-4">
              <h1 className="text-2xl font-bold leading-tight text-foreground [text-wrap:balance] sm:text-3xl">
                Desbloqueie sua análise completa
              </h1>
              <p className="mt-2 text-base text-muted-foreground [text-wrap:pretty]">
                Gerada a partir das suas respostas e da Lei da Nacionalidade.
              </p>
            </header>

            {/* Resumo único do pedido (só o €30 é vendido antes do pagamento). */}
            <Card variant="elevated" data-testid="checkout-plan-onetime" aria-labelledby="checkout-summary-title" role="region">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 id="checkout-summary-title" className="text-lg font-semibold text-foreground">
                    Análise completa
                  </h2>
                  <p className="text-sm text-muted-foreground">pagamento único</p>
                </div>
                <p className="text-3xl font-bold text-foreground">{OFFER.priceLabel}</p>
              </div>

              <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Acesso</dt>
                  <dd className="text-right font-medium text-foreground">
                    {OFFER.accessDays} dias de painel{OFFER.includesChat ? ' e chat IA' : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Entrega</dt>
                  <dd className="text-right font-medium text-foreground">{OFFER.delivery}</dd>
                </div>
                {email && (
                  // E-mail em linha própria no celular: não quebra no meio do endereço.
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
                    <dt className="shrink-0 text-muted-foreground">
                      {mode === 'authenticated' ? 'Conta' : 'E-mail de acesso'}
                    </dt>
                    <dd className="min-w-0 font-medium text-foreground [overflow-wrap:anywhere] sm:text-right">{email}</dd>
                  </div>
                )}
              </dl>

              <Button
                id="checkout-pay-btn"
                data-testid="checkout-submit"
                variant="pay"
                size="lg"
                className="mt-5 w-full"
                loading={isPending}
                onClick={handlePay}
              >
                {isPending ? (
                  'Abrindo o pagamento…'
                ) : (
                  <>
                    Pagar {OFFER.priceLabel}
                    <ArrowRight aria-hidden="true" />
                  </>
                )}
              </Button>

              <CheckoutFeedback phase={phase} error={error} onRetry={handlePay} email={email} />

              <p className="mt-4 text-center text-sm text-muted-foreground [text-wrap:balance]">
                <Lock aria-hidden="true" className="-mt-0.5 mr-1.5 inline h-4 w-4 align-middle" />
                Pagamento processado pela Stripe{'\u00a0'}· sem renovação automática
              </p>
            </Card>

            <Card className="mt-5">
              <h2 className="mb-3 text-lg font-semibold text-foreground">O que está incluído</h2>
              <ul className="space-y-2.5">
                {OFFER.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-base text-foreground">
                    <Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            <FaqSection />
          </>
        )}
      </Container>
    </div>
  )
}

// ─── Estado vazio ─────────────────────────────────────────────────────────────

function EmptyCheckout() {
  return (
    <div data-testid="checkout-empty" className="mt-6 text-center">
      <h1 className="text-2xl font-bold leading-tight text-foreground [text-wrap:balance]">
        Faça o quiz para desbloquear sua análise
      </h1>
      <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground [text-wrap:pretty]">
        Não encontramos seu diagnóstico neste aparelho. O quiz é grátis e mostra seu resultado na hora.
      </p>
      <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
        <Button asChild size="lg" className="w-full">
          <Link to="/quiz">
            Fazer o quiz grátis
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="secondary" size="md" className="w-full">
          <Link to="/login" state={{ returnTo: '/dashboard' }}>
            Já paguei, entrar
          </Link>
        </Button>
      </div>
    </div>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FaqSection() {
  const faqs = [
    {
      q: 'O que acontece depois do pagamento?',
      a: `${OFFER.delivery}, no seu painel. O acesso ao painel${
        OFFER.includesChat ? ' e ao chat IA' : ''
      } dura ${OFFER.accessDays} dias.`,
    },
    {
      q: 'Como a análise é feita?',
      a: `É gerada automaticamente a partir das suas respostas e das regras da Lei da Nacionalidade, com textos produzidos com apoio de inteligência artificial${
        OFFER.reviewedBy ? ` e revisados por ${OFFER.reviewedBy}` : ''
      }. É informativa e não substitui a consulta com um advogado.`,
    },
    {
      q: 'É uma assinatura?',
      a: `Não. É um pagamento único de ${OFFER.priceLabel}, sem renovação automática.`,
    },
  ]

  return (
    <section className="mt-8" aria-labelledby="checkout-faq-title">
      <h2 id="checkout-faq-title" className="mb-3 text-lg font-semibold text-foreground">
        Perguntas frequentes
      </h2>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {faqs.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-medium text-foreground [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
              />
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Detalhes de pagamento e reembolso nos{' '}
        <Link to="/termos" className="font-medium text-primary underline underline-offset-4">
          Termos e condições
        </Link>
        .
      </p>
    </section>
  )
}
