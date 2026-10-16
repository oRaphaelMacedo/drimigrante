import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldShell, fieldControlClass, joinIds, useFieldIds, type FieldBaseProps } from './Field'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, FieldBaseProps {
  /** Opção inicial vazia e desabilitada (ex.: "Selecione"). */
  placeholder?: string
}

/**
 * Seleção nativa estilizada (48px, 16px). Nativa de propósito: no celular abre o
 * seletor do sistema, que é mais rápido e acessível que um dropdown custom.
 *
 * @example
 * <Select label="País de nascimento" placeholder="Selecione" {...register('country')}>
 *   <option value="BR">Brasil</option>
 *   <option value="PT">Portugal</option>
 * </Select>
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    { id: idProp, label, hint, error, hideLabel, containerClassName, className, required, placeholder, children, ...props },
    ref,
  ) => {
    const { id, hintId, errorId } = useFieldIds(idProp)

    const control = (
      <div className="relative">
        <select
          {...props}
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={joinIds(props['aria-describedby'], Boolean(hint) && hintId, Boolean(error) && errorId)}
          className={cn(fieldControlClass, 'h-12 cursor-pointer appearance-none pl-4 pr-11', className)}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    )

    if (!label && !hint && !error) return control

    return (
      <FieldShell
        id={id}
        hintId={hintId}
        errorId={errorId}
        label={label}
        hint={hint}
        error={error}
        hideLabel={hideLabel}
        required={required}
        containerClassName={containerClassName}
      >
        {control}
      </FieldShell>
    )
  },
)
Select.displayName = 'Select'
