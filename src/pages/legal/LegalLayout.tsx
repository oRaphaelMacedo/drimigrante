import type { ReactNode } from 'react'
import { Container } from '@/components/ui/Container'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
}

/**
 * Moldura das páginas legais (DI-079): tokens semânticos, título na escala
 * `text-h1` e links na cor primária com foco visível. Fica dentro do `<main>`
 * do Layout público, por isso é um `<div>` (dois `<main>` confundem leitores
 * de tela).
 */
export function LegalLayout({ title, subtitle, children }: Props) {
  return (
    <Container size="sm" className="max-w-3xl py-10 md:py-16">
      <header className="mb-8 md:mb-10">
        <h1 className="text-h1 text-foreground">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      </header>
      <article
        className="
          space-y-4 text-base leading-relaxed text-foreground/90 [&_p]:[text-wrap:pretty]
          [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-h2 [&_h2]:text-foreground
          [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6
          [&_li]:leading-relaxed
          [&_a]:rounded-sm [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/40 [&_a]:underline-offset-4
          [&_a:hover]:decoration-primary
          [&_a:focus-visible]:outline-none [&_a:focus-visible]:ring-2 [&_a:focus-visible]:ring-ring [&_a:focus-visible]:ring-offset-2
          [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
          [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold
          [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:align-top
        "
      >
        {children}
      </article>
    </Container>
  )
}
