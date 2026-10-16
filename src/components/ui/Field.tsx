import * as React from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Props comuns de rótulo/ajuda/erro para Input, Select e Textarea. */
export interface FieldBaseProps {
  /** Rótulo visível ligado ao campo por `htmlFor`. Sem rótulo, passe `aria-label`. */
  label?: React.ReactNode
  /** Texto de ajuda abaixo do campo (ligado por `aria-describedby`). */
  hint?: React.ReactNode
  /** Mensagem de erro: marca `aria-invalid` e é anunciada por leitores de tela. */
  error?: React.ReactNode
  /** Esconde o rótulo visualmente, mantendo-o acessível. */
  hideLabel?: boolean
  /** Classe do contêiner que agrupa rótulo, campo e mensagens. */
  containerClassName?: string
}

/**
 * Classes compartilhadas dos controles de formulário: 16px (sem zoom no iOS),
 * borda do token input, anel de foco na cor de foco e estado inválido em vermelho.
 */
export const fieldControlClass = cn(
  'w-full rounded-xl border border-input bg-card text-base text-foreground shadow-[var(--shadow-sm)]',
  'placeholder:text-muted-foreground',
  'transition-[border-color,box-shadow] duration-150 ease-out',
  'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground',
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
)

/** Gera ids estáveis para o campo e as mensagens associadas. */
export function useFieldIds(idProp?: string) {
  const reactId = React.useId()
  const id = idProp ?? `field${reactId.replace(/:/g, '')}`
  return { id, hintId: `${id}-hint`, errorId: `${id}-error` }
}

/** Junta ids para `aria-describedby`, ignorando vazios. */
export function joinIds(...ids: Array<string | false | null | undefined>): string | undefined {
  const value = ids.filter(Boolean).join(' ')
  return value || undefined
}

interface FieldShellProps extends FieldBaseProps {
  id: string
  hintId: string
  errorId: string
  required?: boolean
  children: React.ReactNode
}

/** Estrutura visual comum: rótulo, campo, ajuda e erro. Uso interno dos campos. */
export function FieldShell({
  id,
  hintId,
  errorId,
  label,
  hint,
  error,
  hideLabel,
  required,
  containerClassName,
  children,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label && (
        <label htmlFor={id} className={cn('text-sm font-medium text-foreground', hideLabel && 'sr-only')}>
          {label}
          {required && (
            <span className="text-destructive" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
