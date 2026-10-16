import * as React from 'react'
import { cn } from '@/lib/utils'
import { FieldShell, fieldControlClass, joinIds, useFieldIds, type FieldBaseProps } from './Field'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, FieldBaseProps {}

/**
 * Campo de texto (48px de altura, fonte de 16px — sem zoom no iOS).
 *
 * Com `label`, `hint` ou `error`, renderiza o conjunto completo e liga tudo por
 * `htmlFor`, `aria-describedby` e `aria-invalid`. Sem eles, renderiza só o
 * `<input>` (passe `aria-label` nesse caso).
 *
 * @example
 * <Input
 *   label="E-mail"
 *   type="email"
 *   autoComplete="email"
 *   inputMode="email"
 *   required
 *   hint="Enviamos o resultado para este e-mail."
 *   error={errors.email?.message}
 *   {...register('email')}
 * />
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { id: idProp, label, hint, error, hideLabel, containerClassName, className, required, type = 'text', ...props },
    ref,
  ) => {
    const { id, hintId, errorId } = useFieldIds(idProp)

    const control = (
      <input
        {...props}
        ref={ref}
        id={id}
        type={type}
        required={required}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={joinIds(props['aria-describedby'], Boolean(hint) && hintId, Boolean(error) && errorId)}
        className={cn(fieldControlClass, 'h-12 px-4', className)}
      />
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
Input.displayName = 'Input'
