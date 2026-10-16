import { describe, expect, it } from 'vitest'
import { contrastRatio, hexToRgb } from '@/lib/contrast'
import { textClassOn, textToneOn } from './text-on-color'

describe('textToneOn', () => {
  it('usa texto claro em cores escuras', () => {
    expect(textToneOn('#1f41c7')).toBe('light')
    expect(textToneOn('#0b7643')).toBe('light')
    expect(textToneOn('#000')).toBe('light')
  })

  it('usa texto escuro em cores claras', () => {
    expect(textToneOn('#fdba2f')).toBe('dark')
    expect(textToneOn('#ffffff')).toBe('dark')
    expect(textToneOn('#93b5ff')).toBe('dark')
    expect(textToneOn('  #FFEB3B ')).toBe('dark')
  })

  it('cai no texto claro quando a cor não é hex válido', () => {
    expect(textToneOn('')).toBe('light')
    expect(textToneOn(null)).toBe('light')
    expect(textToneOn(undefined)).toBe('light')
    expect(textToneOn('rgb(0,0,0)')).toBe('light')
    expect(textToneOn('azul')).toBe('light')
  })

  it('escolhe sempre o tom com mais contraste', () => {
    const dark = hexToRgb('#141a29')
    const light = hexToRgb('#ffffff')
    for (const hex of ['#3b62f6', '#e11d48', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#777777']) {
      const bg = hexToRgb(hex)
      const best = Math.max(contrastRatio(dark, bg), contrastRatio(light, bg))
      const chosen = textToneOn(hex) === 'dark' ? contrastRatio(dark, bg) : contrastRatio(light, bg)
      expect(chosen).toBe(best)
    }
  })
})

describe('textClassOn', () => {
  it('devolve as classes dos tokens', () => {
    expect(textClassOn('#fdba2f')).toBe('text-foreground')
    expect(textClassOn('#1f41c7')).toBe('text-primary-foreground')
  })
})
