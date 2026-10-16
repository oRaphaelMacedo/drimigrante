// QuizQuestion.tsx — uma pergunta do quiz com o seu tipo de campo.
//
// - Opções grandes (≥52px, texto de 16px) para responder com o polegar.
// - Rádio com semântica de radiogroup: setas mudam a seleção SEM avançar;
//   toque/clique, Enter ou Espaço confirmam (`commit: true`) e permitem o
//   auto-avanço feito pela página (DI-039).
// - O tema aparece uma vez só, no progresso (DI-040).
import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuizQuestion, QuizOption } from '@/data/quiz-questions'

export interface QuizAnswerMeta {
  /**
   * true quando a resposta veio de um toque/clique (ou Enter/Espaço) numa opção;
   * false para setas do teclado, select e digitação. A página só auto-avança
   * escolha única com commit, e ignora o toque "fantasma" logo após um avanço.
   */
  commit: boolean
}

interface QuizQuestionProps {
  question: QuizQuestion
  answer: string
  onChange: (value: string, meta: QuizAnswerMeta) => void
  /** Enter no campo numérico (equivale ao "Próximo"). */
  onSubmit?: () => void
  animationDirection: 'forward' | 'backward'
  /** Recebe o foco a cada pergunta nova (tabIndex -1). */
  headingRef?: React.Ref<HTMLHeadingElement>
  /** Id da mensagem "responda para continuar", quando visível. */
  errorId?: string
}

export const QUIZ_QUESTION_TITLE_ID = 'quiz-question-title'

export function QuizQuestionCard({
  question,
  answer,
  onChange,
  onSubmit,
  animationDirection,
  headingRef,
  errorId,
}: QuizQuestionProps) {
  const helpId = question.helpText ? 'quiz-question-help' : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined
  const invalid = errorId ? true : undefined

  return (
    <div
      key={question.key}
      data-testid="quiz-question"
      className={cn(
        'animate-in fade-in-0 duration-300',
        animationDirection === 'backward' ? 'slide-in-from-left-4' : 'slide-in-from-right-4',
      )}
    >
      <h2
        id={QUIZ_QUESTION_TITLE_ID}
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-bold leading-snug text-foreground [text-wrap:balance] focus:outline-none sm:text-2xl"
      >
        {question.text}
      </h2>

      {question.helpText && (
        <p id={helpId} className="mt-2 text-sm text-muted-foreground [text-wrap:pretty]">
          {question.helpText}
        </p>
      )}
      {!question.isRequired && (
        <p className="mt-2 text-sm text-muted-foreground">Esta pergunta é opcional.</p>
      )}

      <div className="mt-5 sm:mt-6">
        {question.fieldType === 'radio' && question.options && (
          <RadioGroup
            options={question.options}
            value={answer}
            onChange={onChange}
            describedBy={describedBy}
            invalid={invalid}
          />
        )}

        {question.fieldType === 'multiselect' && question.options && (
          <MultiCheckbox
            options={question.options}
            value={answer}
            onChange={onChange}
            describedBy={describedBy}
          />
        )}

        {question.fieldType === 'select' && question.options && (
          <SelectField
            options={question.options}
            value={answer}
            onChange={onChange}
            placeholder="Selecione uma opção"
            describedBy={describedBy}
            invalid={invalid}
          />
        )}

        {question.fieldType === 'number' && (
          <NumberField
            value={answer}
            onChange={onChange}
            onSubmit={onSubmit}
            min={question.min}
            max={question.max}
            placeholder={question.placeholder}
            describedBy={describedBy}
            invalid={invalid}
          />
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

const optionClass = (selected: boolean) =>
  cn(
    'flex min-h-[3.25rem] w-full select-none items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-base font-medium leading-snug text-foreground',
    'transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[.99]',
    selected
      ? 'border-primary bg-brand-50 shadow-[var(--shadow-sm)]'
      : 'border-border bg-card hover:border-brand-300 hover:bg-muted',
  )

interface FieldProps {
  describedBy?: string
  invalid?: boolean
}

const ARROW_STEP: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }

function RadioGroup({
  options,
  value,
  onChange,
  describedBy,
  invalid,
}: FieldProps & {
  options: QuizOption[]
  value: string
  onChange: (v: string, meta: QuizAnswerMeta) => void
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((opt) => opt.key === value)
  // Tabulação "itinerante": só a opção marcada (ou a primeira) entra no Tab.
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0

  const moveTo = (index: number) => {
    const opt = options[index]
    if (!opt) return
    refs.current[index]?.focus()
    // Setas mudam a seleção, mas não confirmam: nada de auto-avanço.
    onChange(opt.key, { commit: false })
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = options.length
    if (event.key in ARROW_STEP) {
      event.preventDefault()
      moveTo((index + ARROW_STEP[event.key] + n) % n)
    } else if (event.key === 'Home') {
      event.preventDefault()
      moveTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      moveTo(n - 1)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={QUIZ_QUESTION_TITLE_ID}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="space-y-2.5"
    >
      {options.map((opt, index) => {
        const selected = value === opt.key
        return (
          <button
            key={opt.key}
            ref={(el) => {
              refs.current[index] = el
            }}
            id={`option-${opt.key}`}
            data-testid={`quiz-option-${opt.key}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => onChange(opt.key, { commit: true })}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={optionClass(selected)}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                selected ? 'border-primary' : 'border-muted-foreground/70',
              )}
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full bg-primary transition-transform duration-150',
                  selected ? 'scale-100' : 'scale-0',
                )}
              />
            </span>
            <span className="min-w-0 flex-1">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function MultiCheckbox({
  options,
  value,
  onChange,
  describedBy,
}: FieldProps & {
  options: QuizOption[]
  value: string
  onChange: (v: string, meta: QuizAnswerMeta) => void
}) {
  const selected = value ? value.split(',').filter(Boolean) : []

  const toggle = (key: string) => {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]
    // Múltipla escolha nunca avança sozinha (a página só avança escolha única):
    // a pessoa confirma no "Próximo".
    onChange(next.join(','), { commit: true })
  }

  return (
    <div role="group" aria-labelledby={QUIZ_QUESTION_TITLE_ID} aria-describedby={describedBy} className="space-y-2.5">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.key)
        return (
          <button
            key={opt.key}
            id={`option-${opt.key}`}
            data-testid={`quiz-option-${opt.key}`}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            onClick={() => toggle(opt.key)}
            className={optionClass(isSelected)}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/70 bg-card',
              )}
            >
              {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function SelectField({
  options,
  value,
  onChange,
  placeholder,
  describedBy,
  invalid,
}: FieldProps & {
  options: QuizOption[]
  value: string
  onChange: (v: string, meta: QuizAnswerMeta) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <select
        id="quiz-select"
        value={value}
        onChange={(e) => onChange(e.target.value, { commit: false })}
        aria-labelledby={QUIZ_QUESTION_TITLE_ID}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className={cn(
          'h-12 w-full appearance-none rounded-xl border-2 border-input bg-card px-4 pr-10 text-base font-medium shadow-[var(--shadow-sm)]',
          'transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          'aria-[invalid=true]:border-destructive',
          value ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

function NumberField({
  value,
  onChange,
  onSubmit,
  min,
  max,
  placeholder,
  describedBy,
  invalid,
}: FieldProps & {
  value: string
  onChange: (v: string, meta: QuizAnswerMeta) => void
  onSubmit?: () => void
  min?: number
  max?: number
  placeholder?: string
}) {
  const rangeId = min !== undefined && max !== undefined ? 'quiz-number-range' : undefined
  return (
    <div className="space-y-2">
      <input
        id="quiz-number-input"
        type="number"
        inputMode="numeric"
        enterKeyHint="next"
        value={value}
        onChange={(e) => onChange(e.target.value, { commit: false })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onSubmit?.()
          }
        }}
        min={min}
        max={max}
        placeholder={placeholder}
        aria-labelledby={QUIZ_QUESTION_TITLE_ID}
        aria-describedby={[describedBy, rangeId].filter(Boolean).join(' ') || undefined}
        aria-invalid={invalid}
        className={cn(
          'h-12 w-full rounded-xl border-2 border-input bg-card px-4 text-lg font-semibold text-foreground shadow-[var(--shadow-sm)]',
          'placeholder:font-normal placeholder:text-muted-foreground',
          'transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
          'aria-[invalid=true]:border-destructive',
          '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
        )}
      />
      {rangeId && (
        <p id={rangeId} className="text-sm text-muted-foreground">
          Valor entre {min} e {max}
        </p>
      )}
    </div>
  )
}
