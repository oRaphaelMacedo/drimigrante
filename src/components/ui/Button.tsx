import * as React from 'react'
import { Slot, Slottable } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Estilos do Button. Exportado para casos raros em que um elemento que não é
 * `<button>` precisa do mesmo visual (prefira `asChild`).
 */
export const buttonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 rounded-xl text-center font-semibold leading-tight',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:scale-[.98] disabled:pointer-events-none disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        /** Ação principal da tela (uma por tela). */
        primary:
          'bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-[hsl(var(--primary-hover))]',
        /** Exclusivo para compra/pagamento (âmbar). Texto escuro: branco sobre âmbar é proibido. */
        pay: 'bg-accent text-accent-foreground shadow-[var(--shadow-sm)] hover:bg-[hsl(var(--accent-hover))]',
        /** Ação secundária neutra, com borda. */
        secondary: 'border border-input bg-card text-foreground shadow-[var(--shadow-sm)] hover:bg-muted',
        /** Contorno na cor da marca, para ações secundárias que precisam de destaque. */
        outline: 'border border-primary bg-transparent text-primary hover:bg-muted',
        /** Sem fundo; para ações de baixa ênfase. Hover em muted (nunca accent). */
        ghost: 'bg-transparent text-foreground hover:bg-muted',
        /** Aparência de link, mantendo a área de toque do tamanho escolhido. */
        link: 'bg-transparent text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary',
        /** Ações destrutivas (apagar, cancelar algo irreversível). */
        destructive:
          'bg-destructive text-destructive-foreground shadow-[var(--shadow-sm)] hover:bg-destructive/90',
      },
      size: {
        /**
         * 40px visuais; a área de toque é ampliada para 44px por um pseudo-elemento
         * invisível (regra: alvos ≥44px).
         */
        sm: "min-h-10 px-4 py-2 text-sm before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[''] [&_svg]:size-4",
        md: 'min-h-12 px-5 py-2.5 text-base [&_svg]:size-5',
        lg: 'min-h-14 px-6 py-3 text-lg [&_svg]:size-5',
        /** Botão só com ícone (44×44). Exige `aria-label`. */
        icon: 'h-11 w-11 p-0 [&_svg]:size-5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Renderiza o filho direto (ex.: `<Link>` do react-router) com o visual do botão,
   * via Radix Slot. O filho precisa ser um único elemento.
   */
  asChild?: boolean
  /**
   * Mostra um spinner, marca `aria-busy` e bloqueia cliques. O texto continua
   * visível para leitores de tela e para manter a largura do botão.
   */
  loading?: boolean
}

/**
 * Botão base do app.
 *
 * - Variantes: `primary` (padrão), `pay` (só compra/pagamento), `secondary`,
 *   `outline`, `ghost`, `link` e `destructive`.
 * - Tamanhos (altura mínima): `sm` (40px, área de toque 44px), `md` (48px,
 *   padrão), `lg` (56px) e `icon` (44×44). Rótulos longos quebram linha em vez
 *   de estourar a largura no celular.
 * - `type` padrão é `"button"`; passe `type="submit"` em formulários.
 *
 * @example
 * <Button variant="pay" size="lg" loading={isPending} onClick={startCheckout}>
 *   Desbloquear análise completa
 * </Button>
 *
 * @example
 * <Button asChild variant="secondary">
 *   <Link to="/login">Entrar</Link>
 * </Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, type, children, onClick, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button'
    const isDisabled = Boolean(disabled) || loading

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      // Com asChild (ex.: <a>), `disabled` não existe: bloqueia o clique manualmente.
      if (asChild && isDisabled) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    }

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant, size }),
          loading && 'cursor-wait disabled:opacity-100 aria-disabled:opacity-100',
          className,
        )}
        {...(asChild
          ? { 'aria-disabled': isDisabled || undefined }
          : { type: type ?? 'button', disabled: isDisabled })}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        onClick={handleClick}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        <Slottable>{children}</Slottable>
      </Comp>
    )
  },
)
Button.displayName = 'Button'
