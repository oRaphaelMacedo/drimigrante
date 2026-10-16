import { describe, expect, it } from 'vitest'
import {
  CATEGORY_PRESENTATION,
  SCORE_CATEGORIES,
  categoryForPercentage,
  getCategoryPresentation,
  isScoreCategory,
} from './category'
import { computeScore, type QuizQuestion } from '@/data/quiz-questions'

function percentQuestion(score: number): QuizQuestion[] {
  return [
    {
      key: 'q',
      themeCode: 't',
      themeName: 'T',
      themeColor: '#000',
      fieldType: 'radio',
      text: 'Q',
      isRequired: true,
      options: [
        { key: 'zero', label: '0', score: 0 },
        { key: 'pick', label: String(score), score },
        { key: 'max', label: '100', score: 100 },
      ],
    },
  ]
}

describe('CATEGORY_PRESENTATION (DI-029)', () => {
  it('tem título, texto, subtítulo da oferta e ícone distintos para as 3 categorias', () => {
    const all = SCORE_CATEGORIES.map((c) => CATEGORY_PRESENTATION[c])
    for (const field of ['label', 'sublabel', 'offerSubtitle', 'icon'] as const) {
      expect(new Set(all.map((p) => p[field])).size).toBe(3)
    }
  })

  it('nenhum símbolo (+, ~, ?) como ícone e nenhum texto vazio', () => {
    for (const p of Object.values(CATEGORY_PRESENTATION)) {
      expect(['+', '~', '?']).not.toContain(p.icon)
      expect(p.icon).toMatch(/^[a-z-]+$/)
      expect(p.label.trim()).not.toBe('')
      expect(p.sublabel.trim()).not.toBe('')
      expect(p.offerSubtitle.trim()).not.toBe('')
    }
  })

  it('copy sem promessas proibidas', () => {
    const text = Object.values(CATEGORY_PRESENTATION)
      .map((p) => `${p.label} ${p.sublabel} ${p.offerSubtitle}`)
      .join(' ')
    expect(text).not.toMatch(/garantia|garantid|aprovação certa|advogados|24h|menos de €1/i)
  })

  it('categoria desconhecida cai na apresentação neutra de "baixa"', () => {
    expect(getCategoryPresentation('xyz')).toBe(CATEGORY_PRESENTATION.baixa)
    expect(getCategoryPresentation(undefined)).toBe(CATEGORY_PRESENTATION.baixa)
    expect(isScoreCategory('media')).toBe(true)
    expect(isScoreCategory('Média')).toBe(false)
  })

  it('limiares: 60% alta, 35% média', () => {
    expect(categoryForPercentage(60)).toBe('alta')
    expect(categoryForPercentage(59)).toBe('media')
    expect(categoryForPercentage(35)).toBe('media')
    expect(categoryForPercentage(34)).toBe('baixa')
  })

  it('computeScore usa os mesmos rótulos da apresentação única', () => {
    for (const [score, category] of [
      [80, 'alta'],
      [45, 'media'],
      [10, 'baixa'],
    ] as const) {
      const result = computeScore({ q: 'pick' }, percentQuestion(score))
      expect(result.category).toBe(category)
      expect(result.label).toBe(CATEGORY_PRESENTATION[category].label)
      expect(result.sublabel).toBe(CATEGORY_PRESENTATION[category].sublabel)
      expect(result.emoji).toBeUndefined()
    }
  })
})
