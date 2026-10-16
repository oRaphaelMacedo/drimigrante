import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva('rounded-lg border bg-card text-card-foreground', {
  variants: {
    variant: {
      /** Superfície padrão: fundo branco, borda e sombra leve. */
      default: 'shadow-[var(--shadow-sm)]',
      /** Destaque (ex.: oferta, resultado): sombra tingida de marca. */
      elevated: 'shadow-[var(--shadow-md)]',
      /** Bloco secundário sobre fundo muted, sem sombra. */
      muted: 'border-transparent bg-muted',
    },
    padding: {
      default: 'p-5 sm:p-6',
      none: 'p-0',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'default',
  },
})

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

/**
 * Cartão base (p-5 no mobile, p-6 a partir de sm). O raio vem de `--radius`.
 *
 * @example
 * <Card>
 *   <CardHeader>
 *     <CardTitle>O que está incluído</CardTitle>
 *     <CardDescription>Acesso por 30 dias.</CardDescription>
 *   </CardHeader>
 *   ...
 *   <CardFooter><Button className="w-full">Continuar</Button></CardFooter>
 * </Card>
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, padding, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ variant, padding }), className)} {...props} />
))
Card.displayName = 'Card'

/** Cabeçalho do cartão: título + descrição empilhados. */
export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('mb-4 flex flex-col gap-1.5', className)} {...props} />,
)
CardHeader.displayName = 'CardHeader'

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Nível do título para manter a hierarquia da página (padrão: h3). */
  as?: 'h2' | 'h3' | 'h4'
}

/** Título do cartão. Use `as` para ajustar o nível na hierarquia de títulos. */
export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Heading = 'h3', ...props }, ref) => (
    <Heading ref={ref} className={cn('text-lg font-semibold leading-snug text-foreground', className)} {...props} />
  ),
)
CardTitle.displayName = 'CardTitle'

/** Texto de apoio do cartão (cor muted, contraste AA). */
export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm leading-relaxed text-muted-foreground', className)} {...props} />
  ),
)
CardDescription.displayName = 'CardDescription'

/** Rodapé do cartão, normalmente com a ação do cartão. */
export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-5 flex flex-col gap-3 sm:flex-row sm:items-center', className)} {...props} />
  ),
)
CardFooter.displayName = 'CardFooter'
