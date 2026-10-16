// StickyBuyBar.tsx — CTA de compra fixo no celular do /results (DI-028).
//
// Construído sobre o StickyCTA de src/components/ui: aparece quando o cartão do
// resultado sai da tela e some enquanto o bloco de compra da oferta (preço,
// e-mail de acesso e botão do PaywallCard) está visível ou um campo está focado
// (teclado aberto). Assim há sempre um CTA na tela depois do resultado, nunca
// dois, e a barra não cobre o e-mail nem o botão. Fica acima do banner de
// cookies (--cookie-banner-h). A compra usa o mesmo useStartCheckout da oferta.
import { useId, type RefObject } from 'react'
import { OFFER } from '@/lib/offer'
import { Button, StickyCTA } from '@/components/ui'

export interface StickyBuyBarProps {
  /** Cartão do resultado: a barra aparece depois que ele sai da tela por cima. */
  anchorRef: RefObject<Element>
  /** Bloco de compra da oferta: enquanto qualquer parte dele estiver visível, a barra some. */
  offerRef: RefObject<Element>
  isPending: boolean
  onBuy: () => void
}

export function StickyBuyBar({ anchorRef, offerRef, isPending, onBuy }: StickyBuyBarProps) {
  const priceId = useId()
  return (
    <StickyCTA anchorRef={anchorRef} inlineCtaRef={offerRef} label="Comprar a análise completa">
      {/* Em telas estreitas (360px) o rótulo cabe numa linha com 15px e menos respiro. */}
      <div className="flex items-center gap-3 max-[374px]:gap-2">
        <p id={priceId} className="shrink-0 leading-tight">
          <span className="block text-lg font-bold text-foreground">{OFFER.priceLabel}</span>
          <span className="block text-xs text-muted-foreground">pagamento único</span>
        </p>
        <Button
          data-testid="results-sticky-cta"
          variant="pay"
          size="md"
          className="min-w-0 flex-1 px-4 max-[374px]:px-2.5 max-[374px]:text-[0.9375rem]"
          aria-describedby={priceId}
          loading={isPending}
          onClick={onBuy}
        >
          Ver minha análise completa
        </Button>
      </div>
    </StickyCTA>
  )
}
