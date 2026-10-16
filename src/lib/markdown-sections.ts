/**
 * markdown-sections — divide a análise completa (markdown da IA) em seções
 * pelos títulos `## ` (DI-050), para o acordeão e os atalhos da AnalysisPage.
 *
 * O generate-explanation novo pede 5 seções com `## `; análises antigas podem
 * não ter nenhum título (viram uma única seção) ou usar `**Título**` sozinho
 * na linha (tratado como título também).
 */

export interface MarkdownSection {
  /** Âncora estável para links (`#analise-...`). */
  id: string
  title: string
  /** Markdown do corpo, sem o título. */
  body: string
}

export interface SplitMarkdown {
  /** Texto antes do primeiro título (pode ser vazio). */
  intro: string
  sections: MarkdownSection[]
}

const H2 = /^##\s+(.+?)\s*#*\s*$/
/** Linha inteira em negrito, ex.: `**Próximos passos**` ou `**1. Avaliação:**`. */
const BOLD_LINE = /^\*\*([^*\n]{2,80}?)\*\*:?\s*$/
/** `# Título` no topo (às vezes a IA repete o título do documento). */
const H1 = /^#\s+(.+?)\s*#*\s*$/

export function slugify(text: string): string {
  const slug = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'secao'
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\*\*|__/g, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/:\s*$/, '')
    .trim()
}

/**
 * Divide por `## ` (fora de blocos de código). Sem nenhum `## `, usa linhas
 * inteiras em negrito como títulos. Sem títulos, devolve uma única seção.
 */
export function splitMarkdownSections(markdown: string | null | undefined, fallbackTitle = 'Análise completa'): SplitMarkdown {
  const text = (markdown ?? '').replace(/\r\n?/g, '\n').trim()
  if (!text) return { intro: '', sections: [] }

  const lines = text.split('\n')
  const hasH2 = lines.some((line) => H2.test(line.trim()))
  const isHeading = (line: string): string | null => {
    const trimmed = line.trim()
    const h2 = trimmed.match(H2)
    if (h2) return cleanTitle(h2[1])
    if (!hasH2) {
      const bold = trimmed.match(BOLD_LINE)
      if (bold) return cleanTitle(bold[1])
    }
    return null
  }

  const introLines: string[] = []
  const raw: Array<{ title: string; lines: string[] }> = []
  let inFence = false

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const title = inFence ? null : isHeading(line)
    if (title) {
      raw.push({ title, lines: [] })
      continue
    }
    // Um `# Título` solto antes da primeira seção é redundante com o título da página.
    if (!inFence && raw.length === 0 && introLines.every((l) => !l.trim()) && H1.test(line.trim())) continue
    if (raw.length === 0) introLines.push(line)
    else raw[raw.length - 1].lines.push(line)
  }

  const intro = introLines.join('\n').trim()
  if (raw.length === 0) {
    return { intro: '', sections: [{ id: `analise-${slugify(fallbackTitle)}`, title: fallbackTitle, body: intro }] }
  }

  const used = new Map<string, number>()
  const sections = raw
    .map(({ title, lines: body }) => ({ title, body: body.join('\n').trim() }))
    .filter((section) => section.title || section.body)
    .map(({ title, body }) => {
      const base = `analise-${slugify(title)}`
      const count = used.get(base) ?? 0
      used.set(base, count + 1)
      return { id: count === 0 ? base : `${base}-${count + 1}`, title, body }
    })

  return { intro, sections }
}

/**
 * Remove marcadores de ênfase que sobraram sem par (`**` soltos) de um texto já
 * convertido pelo parser de markdown. Usado pelo MarkdownText em nós de texto.
 */
export function stripStrayEmphasis(text: string): string {
  return text.replace(/\*{2,}/g, '')
}
