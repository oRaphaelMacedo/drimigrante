/**
 * Tom de texto legível sobre uma cor escolhida em tempo de execução (ex.: a cor
 * de um tema do quiz, gravada pelo admin em `form_themes.color`).
 *
 * Compara o contraste WCAG do texto claro (branco, `--primary-foreground`) e do
 * escuro (`--foreground` #141a29) sobre a cor e fica com o maior. Cor que não é
 * hex válido (vazia, `rgb(...)`, nome) cai no texto claro, o comportamento
 * anterior.
 */
import { contrastRatio, hexToRgb, type Rgb } from '@/lib/contrast'

export type TextTone = 'light' | 'dark'

const LIGHT_TEXT: Rgb = [255, 255, 255]
/** `--foreground` (223 34.4% 12%) da direção "Azulejo". */
const DARK_TEXT: Rgb = [0x14, 0x1a, 0x29]

export function textToneOn(color: string | null | undefined): TextTone {
  if (!color) return 'light'
  let background: Rgb
  try {
    background = hexToRgb(color)
  } catch {
    return 'light'
  }
  return contrastRatio(DARK_TEXT, background) > contrastRatio(LIGHT_TEXT, background) ? 'dark' : 'light'
}

/** Classe de cor do texto (tokens do Tailwind) para usar sobre `color`. */
export function textClassOn(color: string | null | undefined): string {
  return textToneOn(color) === 'dark' ? 'text-foreground' : 'text-primary-foreground'
}
