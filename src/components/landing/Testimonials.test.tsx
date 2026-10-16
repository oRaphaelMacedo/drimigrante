// @vitest-environment jsdom
/**
 * DI-035 — prova social só com dados reais: a lista oficial é vazia e
 * entradas incompletas, sem autorização ou com placeholder não aparecem.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Testimonials } from './Testimonials'
import { TESTIMONIALS, getPublishableTestimonials, type Testimonial } from '@/data/testimonials'

const valid: Testimonial = {
  id: 'ana',
  quote: 'Entendi por onde começar o meu pedido.',
  author: 'Ana S., Recife',
  context: 'Nacionalidade por descendência',
  authorizedAt: '2026-10-01',
}

describe('Testimonials', () => {
  it('a lista oficial começa vazia e o componente não renderiza nada', () => {
    expect(TESTIMONIALS).toEqual([])
    const { container } = render(<Testimonials />)
    expect(container).toBeEmptyDOMElement()
  })

  it('descarta entradas sem autorização, incompletas ou com placeholder', () => {
    const items: Testimonial[] = [
      { ...valid, id: 'sem-data', authorizedAt: '' },
      { ...valid, id: 'placeholder', quote: 'A_PREENCHER' },
      { ...valid, id: 'sem-autor', author: '  ' },
      { ...valid, id: 'contexto-vazio', context: 'TODO' },
    ]
    expect(getPublishableTestimonials(items)).toEqual([])
    const { container } = render(<Testimonials items={items} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('mostra depoimentos completos e autorizados', () => {
    render(<Testimonials items={[valid]} />)
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
    expect(screen.getByText(valid.quote)).toBeInTheDocument()
    expect(screen.getByText(valid.author)).toBeInTheDocument()
  })
})
