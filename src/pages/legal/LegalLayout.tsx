import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle?: string
  children: ReactNode
}

export function LegalLayout({ title, subtitle, children }: Props) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      </header>
      <article
        className="
          space-y-4 text-foreground/90 leading-relaxed
          [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5
          [&_li]:leading-relaxed
          [&_a]:text-brand-600 [&_a]:underline [&_a:hover]:text-brand-700
          [&_table]:w-full [&_table]:border-collapse [&_table]:my-4 [&_table]:text-sm
          [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold
          [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:align-top
        "
      >
        {children}
      </article>
    </main>
  )
}
