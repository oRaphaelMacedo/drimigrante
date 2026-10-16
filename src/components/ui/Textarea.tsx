import * as React from 'react'
import { cn } from '@/lib/utils'
import { FieldShell, fieldControlClass, joinIds, useFieldIds, type FieldBaseProps } from './Field'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FieldBaseProps {}

/**
 * Área de texto (16px, altura mínima de 120px, redimensionável na vertical).
 *
 * @example
 * <Textarea label="Sua pergunta" rows={4} error={errors.message?.message} {...register('message')} />
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ id: idProp, label, hint, error, hideLabel, containerClassName, className, required, ...props }, ref) => {
    const { id, hintId, errorId } = useFieldIds(idProp)

    const control = (
      <textarea
        {...props}
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={joinIds(props['aria-describedby'], Boolean(hint) && hintId, Boolean(error) && errorId)}
        className={cn(fieldControlClass, 'min-h-[7.5rem] resize-y px-4 py-3 leading-relaxed', className)}
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
Textarea.displayName = 'Textarea'
