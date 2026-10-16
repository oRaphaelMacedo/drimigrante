/**
 * Depoimentos reais (DI-035). Lê src/data/testimonials.ts e NÃO renderiza nada
 * enquanto a lista estiver vazia: sem depoimento, número ou selo inventado.
 */
import { Quote } from 'lucide-react'
import { getPublishableTestimonials, type Testimonial } from '@/data/testimonials'
import { Container } from '@/components/ui/Container'

export interface TestimonialsProps {
  /** Para testes; o padrão é a lista oficial. */
  items?: readonly Testimonial[]
}

export function Testimonials({ items }: TestimonialsProps) {
  const testimonials = getPublishableTestimonials(items)
  if (testimonials.length === 0) return null

  return (
    <section aria-labelledby="landing-depoimentos" data-testid="landing-testimonials" className="py-12 sm:py-20">
      <Container>
        <h2 id="landing-depoimentos" className="mb-6 text-h2 text-foreground sm:mb-8">
          Quem já fez o diagnóstico
        </h2>
        <ul className="grid gap-4 md:grid-cols-3">
          {testimonials.map((item) => (
            <li key={item.id}>
              <figure className="h-full rounded-lg border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
                <Quote aria-hidden="true" className="mb-3 h-5 w-5 text-primary" />
                <blockquote className="text-base text-foreground">{item.quote}</blockquote>
                <figcaption className="mt-4 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{item.author}</span>
                  {item.context ? ` · ${item.context}` : null}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}
