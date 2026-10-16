import Markdown, { type Components } from 'react-markdown'
import { cn } from '@/lib/utils'
import { stripStrayEmphasis } from '@/lib/markdown-sections'

/**
 * MarkdownText — markdown da IA renderizado com segurança (DI-050).
 *
 * - Sem HTML cru: tags no texto são descartadas (`skipHtml`) e só uma lista
 *   fechada de elementos é aceita (imagens, tabelas e afins somem, o texto fica).
 * - Links só http(s)/mailto, abrindo em nova aba com rel seguro.
 * - `**` que sobrarem sem par (markdown malformado) não aparecem na tela.
 * - Títulos começam em `minHeadingLevel` (padrão h3) para não quebrar a
 *   hierarquia da página onde o texto é inserido.
 */

type HeadingLevel = 3 | 4 | 5 | 6

export interface MarkdownTextProps {
  children: string | null | undefined
  className?: string
  /** Nível do maior título do markdown (padrão: 3, ou seja `#`/`##`/`###` → h3). */
  minHeadingLevel?: HeadingLevel
}

const ALLOWED_ELEMENTS = [
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'a',
  'blockquote',
  'code',
  'pre',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
] as const

const SAFE_URL = /^(https?:|mailto:)/i

function safeUrl(url: string): string {
  const value = url.trim()
  return SAFE_URL.test(value) ? value : ''
}

interface HastLike {
  type: string
  value?: string
  tagName?: string
  children?: HastLike[]
}

/** Plugin rehype: tira `**` soltos dos nós de texto (fora de código). */
function rehypeStripStrayEmphasis() {
  const walk = (node: HastLike, inCode: boolean) => {
    if (node.type === 'text' && typeof node.value === 'string' && !inCode) {
      node.value = stripStrayEmphasis(node.value)
    }
    const code = inCode || node.tagName === 'code' || node.tagName === 'pre'
    node.children?.forEach((child) => walk(child, code))
  }
  return (tree: HastLike) => walk(tree, false)
}

const HEADING_CLASS: Record<HeadingLevel, string> = {
  3: 'mt-6 text-lg font-semibold leading-snug text-foreground first:mt-0',
  4: 'mt-5 text-base font-semibold leading-snug text-foreground first:mt-0',
  5: 'mt-4 text-base font-semibold text-foreground first:mt-0',
  6: 'mt-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground first:mt-0',
}

function headingComponent(level: HeadingLevel): NonNullable<Components['h3']> {
  const Tag = `h${level}` as const
  return function MarkdownHeading({ children }) {
    return <Tag className={cn(HEADING_CLASS[level], '[text-wrap:balance]')}>{children}</Tag>
  }
}

function buildComponents(minLevel: HeadingLevel): Components {
  const level = (n: number): HeadingLevel => Math.min(6, Math.max(minLevel, n)) as HeadingLevel
  return {
    h1: headingComponent(level(minLevel)),
    h2: headingComponent(level(minLevel)),
    h3: headingComponent(level(minLevel)),
    h4: headingComponent(level(minLevel + 1)),
    h5: headingComponent(level(minLevel + 2)),
    h6: headingComponent(level(minLevel + 2)),
    p: ({ children }) => <p className="mt-3 leading-relaxed [text-wrap:pretty] first:mt-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-primary first:mt-0">{children}</ul>,
    ol: ({ children }) => (
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-primary first:mt-0">{children}</ol>
    ),
    li: ({ children }) => <li className="pl-1 leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="mt-3 border-l-4 border-primary/30 pl-4 text-muted-foreground first:mt-0">{children}</blockquote>
    ),
    code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-[.9em]">{children}</code>,
    pre: ({ children }) => (
      <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm first:mt-0">
        {children}
      </pre>
    ),
    hr: () => <hr className="my-5 border-border" />,
    a: ({ href, children }) =>
      href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        >
          {children}
        </a>
      ) : (
        <span>{children}</span>
      ),
  }
}

const COMPONENTS_BY_LEVEL: Record<HeadingLevel, Components> = {
  3: buildComponents(3),
  4: buildComponents(4),
  5: buildComponents(5),
  6: buildComponents(6),
}

const REHYPE_PLUGINS = [rehypeStripStrayEmphasis]

export function MarkdownText({ children, className, minHeadingLevel = 3 }: MarkdownTextProps) {
  const text = (children ?? '').trim()
  if (!text) return null
  return (
    <div className={cn('break-words text-base text-foreground/90', className)}>
      <Markdown
        skipHtml
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        urlTransform={safeUrl}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS_BY_LEVEL[minHeadingLevel]}
      >
        {text}
      </Markdown>
    </div>
  )
}
