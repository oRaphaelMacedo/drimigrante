/**
 * Perguntas frequentes da landing (DI-035).
 *
 * `<details>/<summary>` nativos: abrem com toque, Enter ou Espaço, são lidos
 * como "recolhido/expandido" pelos leitores de tela e funcionam sem JS. Cada
 * pergunta é um alvo de pelo menos 48px. Fechadas por padrão, para a página
 * continuar curta no celular.
 */
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FaqItem {
  /** Chave estável (também vira o `id` do item, para links diretos). */
  id: string
  question: string
  answer: ReactNode
}

export interface FaqProps {
  items: readonly FaqItem[]
  className?: string
}

export function Faq({ items, className }: FaqProps) {
  if (items.length === 0) return null

  return (
    <div
      data-testid="landing-faq"
      className={cn('divide-y divide-border rounded-lg border bg-card shadow-[var(--shadow-sm)]', className)}
    >
      {items.map((item) => (
        <details key={item.id} id={`faq-${item.id}`} className="group">
          <summary
            className={cn(
              'flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 sm:px-5',
              'text-left text-base font-semibold text-foreground transition-colors hover:bg-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              '[&::-webkit-details-marker]:hidden',
            )}
          >
            <span className="[text-wrap:pretty]">{item.question}</span>
            <ChevronDown
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-base ease-out group-open:rotate-180"
            />
          </summary>
          <div className="space-y-2 px-4 pb-4 text-base text-muted-foreground sm:px-5 [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2">
            {item.answer}
          </div>
        </details>
      ))}
    </div>
  )
}
