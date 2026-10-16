import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import tailwindConfig from '../../tailwind.config'
import {
  TOKEN_PAIRS,
  contrastRatio,
  evaluateAll,
  formatRatio,
  hexToRgb,
  parseHslTriplet,
  readRootVariables,
  rgbToHex,
  type ContrastPalette,
} from './contrast'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

const indexCss = read('../index.css')
const vars = readRootVariables(indexCss)
const brand = Object.fromEntries(
  Object.entries(tailwindConfig.theme.extend.colors.brand).map(([k, v]) => [String(k), v]),
) as Record<string, string>
const palette: ContrastPalette = { vars, brand }

const hexOf = (token: string) => rgbToHex(parseHslTriplet(vars[token]))

describe('contraste WCAG — funções', () => {
  it('calcula a razão de referência (preto/branco = 21:1)', () => {
    expect(contrastRatio(hexToRgb('#000'), hexToRgb('#fff'))).toBeCloseTo(21, 5)
    expect(contrastRatio(hexToRgb('#fff'), hexToRgb('#fff'))).toBeCloseTo(1, 5)
  })

  it('converte HSL do shadcn em RGB como o navegador', () => {
    expect(rgbToHex(parseHslTriplet('228 73% 45.1%'))).toBe('#1f41c7')
    expect(rgbToHex(parseHslTriplet('0 0% 100%'))).toBe('#ffffff')
    expect(() => parseHslTriplet('#1f41c7')).toThrow()
  })

  it('formata no padrão pt-BR sem arredondar para cima', () => {
    expect(formatRatio(4.4999)).toBe('4,49:1')
    expect(formatRatio(7.96)).toBe('7,96:1')
  })
})

describe('tokens da direção "Azulejo" (src/index.css)', () => {
  // Valores exatos das decisões de design (DI-062). Mudou um token? Atualize aqui e no DESIGN.md.
  const EXPECTED_HEX: Record<string, string> = {
    background: '#f9fafd',
    foreground: '#141a29',
    card: '#ffffff',
    'card-foreground': '#141a29',
    primary: '#1f41c7',
    'primary-foreground': '#ffffff',
    'primary-hover': '#1836ac',
    accent: '#fdba2f',
    'accent-foreground': '#2e1e0a',
    'accent-hover': '#f5ab0f',
    muted: '#f1f3f8',
    'muted-foreground': '#5c6372',
    border: '#dde1ea',
    input: '#dde1ea',
    ring: '#1f41c7',
    success: '#0b7643',
    warning: '#8a5a00',
    destructive: '#cc2827',
  }

  it.each(Object.entries(EXPECTED_HEX))('--%s = %s', (token, hex) => {
    expect(hexOf(token)).toBe(hex)
  })

  it('um único primary (#1f41c7) no CSS, na escala brand, no theme-color e no manifest', () => {
    expect(hexOf('primary')).toBe('#1f41c7')
    expect(brand['700']).toBe('#1f41c7')
    expect(hexOf('ring')).toBe(hexOf('primary'))
    expect(hexOf('primary-hover')).toBe(brand['800'])

    const html = read('../../index.html')
    expect(html).toMatch(/<meta name="theme-color" content="#1f41c7"/i)
    expect(html.match(/name="theme-color"/g)).toHaveLength(1)

    const viteConfig = read('../../vite.config.ts')
    expect(viteConfig).toMatch(/THEME_COLOR\s*=\s*'#1f41c7'/i)
    expect(viteConfig).toMatch(/theme_color:\s*THEME_COLOR/)
  })

  it('sem modo escuro: color-scheme only light no :root', () => {
    expect(vars).not.toHaveProperty('color-scheme')
    expect(indexCss).toMatch(/:root\s*\{[^}]*color-scheme:\s*only light/)
  })

  it('mantém a regra anti-zoom do iOS e o movimento reduzido', () => {
    expect(indexCss).toMatch(/@media \(max-width: 767px\)[\s\S]*font-size: 16px !important/)
    expect(indexCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: 0\.01ms !important/)
  })

  it('sombras do Tailwind iguais às variáveis --shadow-*', () => {
    const shadows = tailwindConfig.theme.extend.boxShadow
    expect(shadows.sm).toBe(vars['shadow-sm'])
    expect(shadows.DEFAULT).toBe(vars['shadow-sm'])
    expect(shadows.md).toBe(vars['shadow-md'])
    expect(shadows.lg).toBe(vars['shadow-lg'])
    expect(shadows.xl).toBe(vars['shadow-xl'])
    expect(shadows['2xl']).toBe(vars['shadow-2xl'])
    // Nenhuma sombra em preto puro.
    for (const value of Object.values(shadows)) expect(value).not.toMatch(/rgb\(0 0 0|rgba\(0, ?0, ?0/)
  })

  it('raios: cards com --radius (.875rem); md/sm pequenos para elementos miúdos', () => {
    expect(vars.radius).toBe('0.875rem')
    const radius = tailwindConfig.theme.extend.borderRadius
    expect(radius.lg).toBe('var(--radius)')
    expect(radius.md).toBe('0.375rem')
    expect(radius.sm).toBe('0.25rem')
  })

  it('movimento: ease e durações da direção (150/250/400ms)', () => {
    expect(vars['ease-out']).toBe('cubic-bezier(0.25, 1, 0.5, 1)')
    expect(vars['duration-fast']).toBe('150ms')
    expect(vars['duration-base']).toBe('250ms')
    expect(vars['duration-slow']).toBe('400ms')
    expect(tailwindConfig.theme.extend.transitionTimingFunction.DEFAULT).toBe('var(--ease-out)')
  })

  it('escala tipográfica: display com clamp da direção e corpo 1rem/1.6', () => {
    const sizes = tailwindConfig.theme.extend.fontSize
    expect(sizes.display[0]).toBe('clamp(1.875rem, 1.2rem + 3vw, 3rem)')
    expect(sizes.display[1].lineHeight).toBe('1.1')
    expect(sizes.base).toEqual(['1rem', { lineHeight: '1.6' }])
    expect(sizes.h3[0]).toBe('1.125rem')
  })

  it.each([
    ['display', 1.875, 3],
    ['h1', 1.75, 2.25],
    ['h2', 1.375, 1.75],
  ] as const)('text-%s: mínimo já em 360px (%srem) e teto de %srem', (key, min, max) => {
    const [value] = tailwindConfig.theme.extend.fontSize[key]
    const match = /^clamp\(([\d.]+)rem, ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/.exec(value)
    expect(match).not.toBeNull()
    const [, lo, base, vw, hi] = match!.map(Number)
    expect(lo).toBe(min)
    expect(hi).toBe(max)
    // Valor fluido (em rem) numa largura de viewport, com 1rem = 16px.
    const at = (width: number) => base + (vw * width) / 100 / 16
    expect(at(360)).toBeCloseTo(min, 1)
    expect(at(1280)).toBeGreaterThanOrEqual(max)
  })
})

describe('contraste dos pares de tokens', () => {
  const results = evaluateAll(palette)

  it('todos os pares obrigatórios passam (texto ≥4,5:1; foco e bordas de controle ≥3:1)', () => {
    const failures = results
      .filter((r) => !r.pass)
      .map((r) => `${r.fg} (${r.fgHex}) sobre ${r.bg} (${r.bgHex}): ${formatRatio(r.ratio)} < ${r.min} — ${r.use}`)
    expect(failures).toEqual([])
  })

  it('confere os números citados nas decisões de design', () => {
    const ratio = (fg: string, bg: string) =>
      contrastRatio(parseHslTriplet(vars[fg]), parseHslTriplet(vars[bg]))
    // Valores das decisões, arredondados a 2 casas (±0,005).
    expect(ratio('primary-foreground', 'primary')).toBeCloseTo(7.96, 2)
    expect(ratio('accent-foreground', 'accent')).toBeCloseTo(9.37, 2)
    expect(ratio('muted-foreground', 'card')).toBeCloseTo(6.03, 2)
    expect(ratio('foreground', 'background')).toBeCloseTo(16.6, 1)
  })

  it('branco sobre âmbar continua proibido (e reprovaria)', () => {
    const whiteOnAmber = contrastRatio(hexToRgb('#ffffff'), parseHslTriplet(vars.accent))
    expect(whiteOnAmber).toBeLessThan(4.5)
    expect(hexOf('accent-foreground')).not.toBe('#ffffff')
  })

  it('cada par referencia tokens que existem', () => {
    expect(results).toHaveLength(TOKEN_PAIRS.length)
  })
})

describe('tipografia self-hosted (src/styles/fonts.css)', () => {
  const fontFamily = tailwindConfig.theme.extend.fontFamily
  const fontsCss = read('../styles/fonts.css')
  const fontFaces = [...fontsCss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1])
  const faceOf = (family: string) => fontFaces.find((body) => body.includes(`font-family: '${family}';`))

  it('main.tsx importa as fontes antes do index.css, e nada vem de CDN', () => {
    const main = read('../main.tsx')
    expect(main.indexOf("import './styles/fonts.css'")).toBeGreaterThan(-1)
    expect(main.indexOf("import './styles/fonts.css'")).toBeLessThan(main.indexOf("import './index.css'"))
    for (const css of [fontsCss, indexCss, read('../../index.html')]) {
      expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    }
  })

  it.each([
    ['Figtree', 'figtree', '300 900'],
    ['Literata', 'literata', '600 700'],
  ])('%s: woff2 latino do @fontsource-variable, swap e pesos %s', (family, pkg, weights) => {
    const face = faceOf(family)
    expect(face).toBeDefined()
    const file = `@fontsource-variable/${pkg}/files/${pkg}-latin-wght-normal.woff2`
    expect(face).toContain(`url('${file}')`)
    expect(face).toContain('font-display: swap')
    expect(face).toContain(`font-weight: ${weights};`)
    expect(face).toContain('unicode-range: U+0000-00FF')
    // O arquivo existe na versão instalada (o build falharia sem ele).
    expect(readFileSync(new URL(`../../node_modules/${file}`, import.meta.url)).byteLength).toBeGreaterThan(10_000)
  })

  it('o Tailwind usa as famílias declaradas, com as reservas de métricas ajustadas', () => {
    expect(fontFamily.sans[0]).toBe('Figtree')
    expect(fontFamily.display[0]).toBe('Literata')
    const fallbacks = [...fontFamily.sans, ...fontFamily.display].filter((f) => f.includes('Fallback'))
    expect(fallbacks.map((f) => f.replace(/"/g, ''))).toEqual(['Figtree Fallback', 'Literata Fallback'])
    for (const family of fallbacks) {
      const faces = fontFaces.filter((body) => body.includes(`font-family: '${family.replace(/"/g, '')}';`))
      expect(faces.length).toBeGreaterThanOrEqual(1)
      for (const face of faces) {
        expect(face).toMatch(/src: local\(/)
        expect(face).toMatch(/font-weight: \d+( \d+)?;/)
        expect(face).toMatch(/size-adjust: [\d.]+%/)
        expect(face).toMatch(/ascent-override: [\d.]+%/)
        expect(face).toMatch(/descent-override: [\d.]+%/)
      }
    }
  })

  it('as reservas da Literata usam o corte negrito da Georgia (h1 700 e h2 600)', () => {
    const faces = fontFaces.filter((body) => body.includes("font-family: 'Literata Fallback';"))
    const weights = faces.map((body) => /font-weight: ([\d ]+);/.exec(body)?.[1]).sort()
    expect(weights).toEqual(['600', '700'])
    for (const face of faces) expect(face).toContain("local('Georgia Bold')")
  })
})
