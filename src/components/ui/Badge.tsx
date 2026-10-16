import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Pares de cor com contraste AA (≥4,5:1) sobre o fundo tingido a 8%,
 * calculados com os valores da direção "Azulejo".
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted text-foreground',
        primary: 'border-primary/20 bg-primary/[.08] text-primary',
        success: 'border-[hsl(var(--success)/0.2)] bg-[hsl(var(--success)/0.08)] text-[hsl(var(--success))]',
        warning: 'border-[hsl(var(--warning)/0.2)] bg-[hsl(var(--warning)/0.08)] text-[hsl(var(--warning))]',
        danger: 'border-destructive/20 bg-destructive/[.08] text-destructive',
        outline: 'border-input bg-transparent text-foreground',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs [&_svg]:size-3.5',
        md: 'px-2.5 py-1 text-sm [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'md',
    },
  },
)

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

/**
 * Etiqueta em pílula para estados e categorias (ex.: probabilidade, status do
 * acesso). Não é interativa: para ações use `Button`.
 *
 * @example
 * <Badge variant="success"><CheckCircle2 aria-hidden="true" />Acesso ativo</Badge>
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(({ className, variant, size, ...props }, ref) => (
  <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />
))
Badge.displayName = 'Badge'

export { badgeVariants }
