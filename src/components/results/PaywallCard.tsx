// PaywallCard.tsx — oferta da análise completa no /results (DI-030, DI-031, DI-032).
//
// - Título com o caminho mais forte e subtítulo honesto por categoria.
// - O que se recebe, preço, prazo e mini-FAQ vêm de OFFER (src/lib/offer.ts):
//   nada de "menos de €1/dia", garantia ou revisão humana enquanto o dono não
//   preencher esses campos. Só o pagamento único aparece antes da compra.
// - E-mail de acesso visível e editável logo acima do botão (DI-031).
// - Bloco de confiança: Stripe, Privacidade e dados da empresa (campos null não
//   aparecem).
import { forwardRef, useEffect, useRef, type Ref } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronDown, Lock } from 'lucide-react'
import { trackOnce } from '@/lib/analytics'
import { OFFER } from '@/lib/offer'
import { getCategoryPresentation } from '@/lib/category'
import { getCompanyIdentification } from '@/data/company'
import { Badge, Button, Card } from '@/components/ui'
import { CheckoutFeedback } from '@/components/checkout/CheckoutFeedback'
import type { CheckoutError, CheckoutPhase } from '@/hooks/useStartCheckout'
import type { UpdateAccessEmailResult } from '@/lib/access-email'
import { AccessEmail } from './AccessEmail'
import { offerFaq, offerIncludes, offerTitle } from './results-copy'

export const PAYWALL_ID = 'oferta'
export const PAYWALL_TITLE_ID = 'results-offer-title'

export interface PaywallCardProps {
  firstName: string | null
  category: string
  /** Caminho mais forte (para o título; "a explorar" usa o título neutro). */
  strongestPath: { code: string; match: string } | null
  /** Já tem acesso: mostra o atalho para o painel em vez da oferta. */
  paid: boolean
  /** Chave do diagnóstico para o paywall_viewed (uma vez por diagnóstico). */
  onceKey: string
  /** E-mail com que a compra será feita (conta ou quiz). */
  email: string | null
  /** O e-mail pode ser corrigido aqui (compra sem login). */
  emailEditable: boolean
  onEmailSave: (email: string, source: 'manual' | 'suggestion') => Promise<UpdateAccessEmailResult>
  phase: CheckoutPhase
  isPending: boolean
  error: CheckoutError | null
  onBuy: () => void
  /**
   * Botão de compra. A página observa ele para esconder a barra fixa enquanto
   * está na tela e rola até ele quando a compra pela barra volta com erro.
   */
  ctaRef?: Ref<HTMLButtonElement>
}

export const PaywallCard = forwardRef<HTMLDivElement, PaywallCardProps>(function PaywallCard(
  {
    firstName,
    category,
    strongestPath,
    paid,
    onceKey,
    email,
    emailEditable,
    onEmailSave,
    phase,
    isPending,
    error,
    onBuy,
    ctaRef,
  },
  ref,
) {
  const viewRef = useRef<HTMLDivElement | null>(null)

  // paywall_viewed: quando metade da oferta aparece na tela (uma vez por diagnóstico).
  useEffect(() => {
    const el = viewRef.current
    if (!el || paid) return
    if (typeof IntersectionObserver === 'undefined') {
      trackOnce('paywall_viewed', onceKey, { position: 'results' })
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        trackOnce('paywall_viewed', onceKey, { position: 'results' })
        observer.disconnect()
      },
      { threshold: 0.25 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onceKey, paid])

  const setRefs = (node: HTMLDivElement | null) => {
    viewRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  if (paid) {
    return (
      <Card ref={setRefs} id={PAYWALL_ID} variant="elevated" data-testid="results-paid" className="scroll-mt-20">
        <h2 className="mb-2 text-h2 text-foreground">Você já tem acesso à análise completa</h2>
        <p className="mb-5 text-base text-muted-foreground">
          Abra seu painel para ver os detalhes de cada caminho, os requisitos e os próximos passos.
        </p>
        <Button asChild size="lg" className="w-full">
          <Link to="/dashboard/analysis">
            Abrir minha análise
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </Card>
    )
  }

  const presentation = getCategoryPresentation(category)
  const includes = offerIncludes()
  const faq = offerFaq()
  const company = getCompanyIdentification()

  return (
    <Card
      ref={setRefs}
      id={PAYWALL_ID}
      variant="elevated"
      padding="none"
      role="region"
      aria-labelledby={PAYWALL_TITLE_ID}
      data-testid="results-paywall"
      className="relative scroll-mt-20 overflow-hidden border-primary/25"
    >
      {/* Motivo de azulejo: só no hero e no card de paywall (DESIGN.md). */}
      <div aria-hidden="true" className="bg-azulejo pointer-events-none absolute inset-0" />
      <div className="relative p-5 sm:p-6">
        <Badge variant="primary" size="sm" className="mb-3">
          Análise completa
        </Badge>

        <h2 id={PAYWALL_TITLE_ID} tabIndex={-1} className="mb-2 text-h2 text-foreground focus:outline-none">
          {offerTitle(firstName, strongestPath)}
        </h2>
        <p className="mb-5 text-base text-muted-foreground" data-testid="results-offer-subtitle">
          {presentation.offerSubtitle}
        </p>

        {includes.length > 0 && (
          <>
            <h3 className="mb-2.5 text-sm font-semibold text-foreground">O que você recebe</h3>
            <ul className="mb-5 space-y-2.5" data-testid="results-offer-includes">
              {includes.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-base text-foreground">
                  <Check aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--success))]" />
                  {item}
                </li>
              ))}
            </ul>
          </>
        )}

        <div data-testid="results-buy-block">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-4xl font-bold leading-none text-foreground">{OFFER.priceLabel}</span>
            <span className="text-sm text-muted-foreground">
              pagamento único, com {OFFER.accessDays} dias de acesso
            </span>
          </div>

          {email && <AccessEmail email={email} editable={emailEditable} onSave={onEmailSave} />}

          <Button
            ref={ctaRef}
            id="results-unlock-btn"
            data-testid="results-cta-paywall"
            variant="pay"
            size="lg"
            className="w-full"
            loading={isPending}
            onClick={onBuy}
          >
            {isPending ? (
              'Abrindo o pagamento…'
            ) : (
              <>
                Desbloquear por {OFFER.priceLabel}
                <ArrowRight aria-hidden="true" />
              </>
            )}
          </Button>

          <CheckoutFeedback phase={phase} error={error} onRetry={onBuy} email={email} />
        </div>

        <p className="mt-3 text-center text-sm text-muted-foreground">{OFFER.delivery}.</p>

        <div className="mt-4 space-y-1.5 border-t border-border pt-4 text-center text-sm text-muted-foreground">
          <p>
            <Lock aria-hidden="true" className="-mt-0.5 mr-1.5 inline h-4 w-4 align-middle" />
            Pagamento processado pela Stripe{' '}· sem renovação automática
          </p>
          <p>
            Seus dados são tratados conforme a{' '}
            <Link to="/privacidade" className="font-medium text-primary underline underline-offset-4">
              Política de Privacidade
            </Link>
            .
          </p>
          {company.length > 0 && (
            <p data-testid="results-company">{company.map((field) => `${field.label}: ${field.value}`).join(' · ')}</p>
          )}
        </div>

        {faq.length > 0 && (
          <section className="mt-5" aria-labelledby="results-faq-title">
            <h3 id="results-faq-title" className="mb-2 text-base font-semibold text-foreground">
              Perguntas frequentes
            </h3>
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {faq.map(({ question, answer }) => (
                <details key={question} className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    {question}
                    <ChevronDown
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-fast ease-out group-open:rotate-180"
                    />
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>
    </Card>
  )
})
