import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const containerVariants = cva('mx-auto w-full px-4 sm:px-6 lg:px-8', {
  variants: {
    size: {
      /** Leitura e formulários (quiz, login, checkout). */
      sm: 'max-w-2xl',
      /** Páginas de conteúdo (resultado, análise). */
      md: 'max-w-4xl',
      /** Páginas largas (landing, dashboard). */
      lg: 'max-w-6xl',
    },
  },
  defaultVariants: {
    size: 'lg',
  },
})

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof containerVariants> {
  /** Elemento semântico a renderizar (padrão: div). */
  as?: 'div' | 'section' | 'main' | 'header' | 'footer' | 'article'
}

/**
 * Contêiner centralizado com respiro lateral de 16px no celular (px-4).
 *
 * @example
 * <Container as="section" size="sm" className="py-12 sm:py-20">...</Container>
 */
export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size, as: Comp = 'div', ...props }, ref) => (
    <Comp ref={ref} className={cn(containerVariants({ size }), className)} {...props} />
  ),
)
Container.displayName = 'Container'
