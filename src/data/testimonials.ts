/**
 * Depoimentos de clientes (DI-035).
 *
 * VAZIO por padrão: prova social só com dados reais. AÇÃO DO DONO: incluir aqui
 * apenas depoimentos verdadeiros, com autorização por escrito da pessoa
 * (registre a data em `authorizedAt`). Nada de texto inventado, nome fictício
 * ou placeholder (ex.: 'A_PREENCHER') — entradas incompletas não aparecem.
 */
import { isFilledValue } from '@/data/company'

export interface Testimonial {
  /** Chave estável. */
  readonly id: string
  /** Texto do depoimento, como a pessoa escreveu (pode ser resumido com o aval dela). */
  readonly quote: string
  /** Como a pessoa autorizou ser identificada (ex.: "Ana S., São Paulo"). */
  readonly author: string
  /** Contexto opcional (ex.: "Nacionalidade por descendência"). */
  readonly context?: string
  /** Data (AAAA-MM-DD) da autorização de uso. Sem ela, o depoimento não aparece. */
  readonly authorizedAt: string
}

export const TESTIMONIALS: readonly Testimonial[] = []

/** Só os depoimentos completos e autorizados, prontos para renderizar. */
export function getPublishableTestimonials(list: readonly Testimonial[] = TESTIMONIALS): Testimonial[] {
  return list.filter(
    (item) =>
      isFilledValue(item.quote) &&
      isFilledValue(item.author) &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.authorizedAt.trim()) &&
      (item.context === undefined || isFilledValue(item.context)),
  )
}
