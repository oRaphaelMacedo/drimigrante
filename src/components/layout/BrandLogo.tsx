import { COMPANY } from '@/data/company'
import { cn } from '@/lib/utils'

/**
 * Monograma "DI" da marca (mesmo desenho de public/logo.svg e da og-image),
 * pintado com os tokens `primary` / `primary-foreground`.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className={cn('h-8 w-8 shrink-0', className)}
    >
      <rect width="512" height="512" rx="112" className="fill-primary" />
      <path
        className="fill-primary-foreground"
        fillRule="evenodd"
        d="M113 146H203A110 110 0 0 1 203 366H113ZM169 202V310H203A54 54 0 0 0 203 202Z"
      />
      <rect x="343" y="146" width="56" height="220" className="fill-primary-foreground" />
    </svg>
  )
}

/** Monograma + nome comercial. Envolva num `<Link to="/">` quando for navegável. */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark />
      <span className="text-lg font-bold tracking-tight text-foreground">{COMPANY.brandName}</span>
    </span>
  )
}
