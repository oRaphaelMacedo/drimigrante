/**
 * Contraste WCAG 2.x dos tokens de cor da direção "Azulejo" (DI-062).
 *
 * Funções puras, sem DOM. Usadas por:
 * - src/lib/contrast.test.ts (roda no `npm test` e falha se algum par cair abaixo do mínimo);
 * - scripts/check-contrast.ts (`npx tsx scripts/check-contrast.ts`, tabela para o PR).
 *
 * Os valores vêm das variáveis de src/index.css (`--token: H S% L%`) e da escala
 * `brand` do tailwind.config.ts — nunca de uma cópia, para o teste acompanhar a
 * fonte da verdade.
 */

export type Rgb = readonly [number, number, number]

/** Referência de cor: nome de variável CSS (`primary`), tom da escala (`brand-700`) ou hex (`#ffffff`). */
export type ColorRef = string

export interface ContrastPair {
  fg: ColorRef
  bg: ColorRef
  /** Fundo translúcido: `bg` com esta opacidade composta sobre `over` (ex.: Badge com /8%). */
  bgAlpha?: number
  over?: ColorRef
  /** Mínimo exigido: 4,5 para texto (WCAG 1.4.3), 3 para indicadores não textuais (1.4.11). 0 = só informativo. */
  min: number
  /** Onde o par aparece. */
  use: string
}

export interface ContrastPalette {
  /** Variáveis CSS sem o `--` (ex.: `{ primary: '228 73% 45.1%' }`). */
  vars: Record<string, string>
  /** Escala `brand` do Tailwind (ex.: `{ 700: '#1f41c7' }`). */
  brand: Record<string, string>
}

export interface ContrastResult extends ContrastPair {
  ratio: number
  pass: boolean
  fgHex: string
  bgHex: string
}

export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`Cor hex inválida: ${hex}`)
  const value = match[1].length === 3 ? [...match[1]].map((c) => c + c).join('') : match[1]
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16)) as unknown as Rgb
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
}

/** HSL (h em graus, s e l em %) → RGB 0–255, como o navegador calcula `hsl()`. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100
  const light = l / 100
  const a = sat * Math.min(light, 1 - light)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return light - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
  }
  return [f(0), f(8), f(4)].map((c) => Math.round(c * 255)) as unknown as Rgb
}

/** Lê um triplet do shadcn (`228 73% 45.1%`). */
export function parseHslTriplet(value: string): Rgb {
  const match = /^\s*(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(value)
  if (!match) throw new Error(`Valor HSL inválido: "${value}" (esperado "H S% L%")`)
  return hslToRgb(Number(match[1]), Number(match[2]), Number(match[3]))
}

/** Luminância relativa (WCAG 2.x). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Composição de `fg` com opacidade `alpha` sobre `bg` (canal a canal, sRGB). */
export function blend(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as unknown as Rgb
}

/**
 * Extrai as variáveis CSS declaradas nos blocos `:root { ... }` de uma folha
 * de estilo (ignora comentários). Blocos repetidos: o último valor vence.
 */
export function readRootVariables(css: string): Record<string, string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const vars: Record<string, string> = {}
  const blockRe = /:root\s*\{([^}]*)\}/g
  let block: RegExpExecArray | null
  while ((block = blockRe.exec(withoutComments))) {
    const declRe = /--([\w-]+)\s*:\s*([^;]+);/g
    let decl: RegExpExecArray | null
    while ((decl = declRe.exec(block[1]))) vars[decl[1]] = decl[2].trim()
  }
  return vars
}

export function resolveColor(ref: ColorRef, palette: ContrastPalette): Rgb {
  if (ref.startsWith('#')) return hexToRgb(ref)
  const brand = /^brand-(\d+)$/.exec(ref)
  if (brand) {
    const hex = palette.brand[brand[1]]
    if (!hex) throw new Error(`Tom inexistente na escala brand: ${ref}`)
    return hexToRgb(hex)
  }
  const value = palette.vars[ref]
  if (value === undefined) throw new Error(`Variável CSS inexistente: --${ref}`)
  return parseHslTriplet(value)
}

export function evaluatePair(pair: ContrastPair, palette: ContrastPalette): ContrastResult {
  const fg = resolveColor(pair.fg, palette)
  let bg = resolveColor(pair.bg, palette)
  if (pair.bgAlpha !== undefined) bg = blend(bg, resolveColor(pair.over ?? 'card', palette), pair.bgAlpha)
  const ratio = contrastRatio(fg, bg)
  return { ...pair, ratio, pass: ratio >= pair.min, fgHex: rgbToHex(fg), bgHex: rgbToHex(bg) }
}

/** Formata a razão como no texto das decisões ("7,96:1"). */
export function formatRatio(ratio: number): string {
  return `${(Math.floor(ratio * 100) / 100).toFixed(2).replace('.', ',')}:1`
}

const TEXT = 4.5
const NON_TEXT = 3

/**
 * Pares que a interface usa de fato. Ao criar um token novo ou um uso novo
 * (ex.: texto sobre uma superfície diferente), acrescente o par aqui.
 */
export const TOKEN_PAIRS: readonly ContrastPair[] = [
  // Texto sobre superfícies
  { fg: 'foreground', bg: 'background', min: TEXT, use: 'Corpo de texto sobre o fundo da página' },
  { fg: 'card-foreground', bg: 'card', min: TEXT, use: 'Texto em cards' },
  { fg: 'popover-foreground', bg: 'popover', min: TEXT, use: 'Texto em menus e popovers' },
  { fg: 'foreground', bg: 'muted', min: TEXT, use: 'Texto em blocos muted e Badge neutral' },
  { fg: 'secondary-foreground', bg: 'secondary', min: TEXT, use: 'Superfície secondary' },
  { fg: 'muted-foreground', bg: 'card', min: TEXT, use: 'Texto de apoio (hint, legenda) em cards' },
  { fg: 'muted-foreground', bg: 'background', min: TEXT, use: 'Texto de apoio sobre o fundo da página' },
  { fg: 'muted-foreground', bg: 'muted', min: TEXT, use: 'Texto de apoio em blocos muted' },
  { fg: 'primary', bg: 'card', min: TEXT, use: 'Links e Button outline/link em cards' },
  { fg: 'primary', bg: 'background', min: TEXT, use: 'Links sobre o fundo da página' },
  { fg: 'primary', bg: 'muted', min: TEXT, use: 'Button outline/link no hover (bg-muted)' },
  { fg: 'destructive', bg: 'card', min: TEXT, use: 'Mensagem de erro de campo' },
  { fg: 'destructive', bg: 'background', min: TEXT, use: 'Mensagem de erro sobre o fundo da página' },
  { fg: 'success', bg: 'card', min: TEXT, use: 'Texto de sucesso' },
  { fg: 'warning', bg: 'card', min: TEXT, use: 'Texto de aviso' },

  // Botões e superfícies cheias
  { fg: 'primary-foreground', bg: 'primary', min: TEXT, use: 'Button primary' },
  { fg: 'primary-foreground', bg: 'primary-hover', min: TEXT, use: 'Button primary no hover' },
  { fg: 'accent-foreground', bg: 'accent', min: TEXT, use: 'Button pay (CTA de compra)' },
  { fg: 'accent-foreground', bg: 'accent-hover', min: TEXT, use: 'Button pay no hover' },
  { fg: 'destructive-foreground', bg: 'destructive', min: TEXT, use: 'Button destructive' },
  { fg: 'success-foreground', bg: 'success', min: TEXT, use: 'Superfície de sucesso' },
  { fg: 'warning-foreground', bg: 'warning', min: TEXT, use: 'Superfície de aviso' },

  // Badges: texto na cor do estado sobre o próprio tom a 8% (bg-<cor>/[.08] sobre card)
  { fg: 'primary', bg: 'primary', bgAlpha: 0.08, over: 'card', min: TEXT, use: 'Badge primary' },
  { fg: 'success', bg: 'success', bgAlpha: 0.08, over: 'card', min: TEXT, use: 'Badge success' },
  { fg: 'warning', bg: 'warning', bgAlpha: 0.08, over: 'card', min: TEXT, use: 'Badge warning' },
  { fg: 'destructive', bg: 'destructive', bgAlpha: 0.08, over: 'card', min: TEXT, use: 'Badge danger' },

  // Superfícies cobalto (hero, card de paywall)
  { fg: '#ffffff', bg: 'brand-700', min: TEXT, use: 'Texto branco sobre cobalto (= primary)' },
  { fg: 'brand-100', bg: 'brand-700', min: TEXT, use: 'Texto secundário sobre cobalto' },
  { fg: 'accent', bg: 'brand-700', min: TEXT, use: 'Destaque âmbar sobre cobalto (ex.: preço)' },
  { fg: '#ffffff', bg: 'brand-600', min: TEXT, use: 'Texto branco sobre brand-600' },
  { fg: '#ffffff', bg: 'brand-800', min: TEXT, use: 'Texto branco sobre brand-800 (= primary-hover)' },
  { fg: '#ffffff', bg: 'brand-900', min: TEXT, use: 'Texto branco sobre brand-900' },
  { fg: '#ffffff', bg: 'brand-950', min: TEXT, use: 'Texto branco sobre brand-950' },

  // Superfícies claras da escala brand
  { fg: 'brand-700', bg: 'brand-50', min: TEXT, use: 'Texto cobalto sobre brand-50' },
  { fg: 'brand-800', bg: 'brand-100', min: TEXT, use: 'Texto brand-800 sobre brand-100' },
  { fg: 'brand-900', bg: 'brand-200', min: TEXT, use: 'Texto brand-900 sobre brand-200' },

  // Indicadores não textuais (WCAG 1.4.11)
  { fg: 'ring', bg: 'background', min: NON_TEXT, use: 'Anel de foco sobre o fundo da página' },
  { fg: 'ring', bg: 'card', min: NON_TEXT, use: 'Anel de foco sobre cards' },
  { fg: 'primary', bg: 'muted', min: NON_TEXT, use: 'Borda do Button outline sobre muted' },

  // Informativo (não bloqueia): bordas decorativas e de campo
  { fg: 'border', bg: 'card', min: 0, use: 'Borda decorativa (divisores, cards) — sem exigência' },
  {
    fg: 'input',
    bg: 'card',
    min: 0,
    use: 'Borda de campo — WCAG 1.4.11 pede 3:1 quando a borda é a única pista do campo (decisão pendente, ver DESIGN.md)',
  },
]

export function evaluateAll(palette: ContrastPalette, pairs: readonly ContrastPair[] = TOKEN_PAIRS): ContrastResult[] {
  return pairs.map((pair) => evaluatePair(pair, palette))
}
