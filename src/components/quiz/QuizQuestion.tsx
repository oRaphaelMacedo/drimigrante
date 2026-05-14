// QuizQuestion.tsx — Renders a single quiz question with its field type
import { cn } from '@/lib/utils'
import type { QuizQuestion, QuizOption } from '@/data/quiz-questions'
import { ChevronDown } from 'lucide-react'

interface QuizQuestionProps {
  question: QuizQuestion
  answer: string
  onChange: (value: string) => void
  animationDirection: 'forward' | 'backward'
}

export function QuizQuestionCard({ question, answer, onChange, animationDirection }: QuizQuestionProps) {
  return (
    <div
      key={question.key}
      data-testid="quiz-question"
      className={cn(
        'animate-in fade-in-0 slide-in-from-right-4 duration-300',
        animationDirection === 'backward' && 'slide-in-from-left-4',
      )}
    >
      {/* Theme badge */}
      <div className="mb-4 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: question.themeColor }}
        />
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ backgroundColor: `${question.themeColor}18`, color: question.themeColor }}
        >
          {question.themeName}
        </span>
      </div>

      {/* Question text */}
      <h2 className="mb-1.5 text-xl font-bold leading-snug text-gray-900 sm:text-2xl">
        {question.text}
      </h2>

      {/* Help text */}
      {question.helpText && (
        <p className="mb-6 text-sm text-gray-500">{question.helpText}</p>
      )}
      {!question.helpText && <div className="mb-6" />}

      {/* Field: radio */}
      {question.fieldType === 'radio' && question.options && (
        <RadioGroup
          options={question.options}
          value={answer}
          onChange={onChange}
          themeColor={question.themeColor}
        />
      )}

      {/* Field: multiselect */}
      {question.fieldType === 'multiselect' && question.options && (
        <MultiCheckbox
          options={question.options}
          value={answer}
          onChange={onChange}
          themeColor={question.themeColor}
        />
      )}

      {/* Field: select */}
      {question.fieldType === 'select' && question.options && (
        <SelectField
          options={question.options}
          value={answer}
          onChange={onChange}
          placeholder="Selecione uma opção..."
        />
      )}

      {/* Field: number */}
      {question.fieldType === 'number' && (
        <NumberField
          value={answer}
          onChange={onChange}
          min={question.min}
          max={question.max}
          placeholder={question.placeholder}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function RadioGroup({
  options,
  value,
  onChange,
  themeColor,
}: {
  options: QuizOption[]
  value: string
  onChange: (v: string) => void
  themeColor: string
}) {
  return (
    <div className="space-y-2.5">
      {options.map((opt) => {
        const selected = value === opt.key
        return (
          <button
            key={opt.key}
            id={`option-${opt.key}`}
            data-testid={`quiz-option-${opt.key}`}
            type="button"
            onClick={() => onChange(opt.key)}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all duration-200',
              selected
                ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
            )}
            style={selected ? { borderColor: themeColor, backgroundColor: `${themeColor}10` } : {}}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                selected ? 'border-[4px]' : 'border-gray-300',
              )}
              style={selected ? { borderColor: themeColor } : {}}
            />
            <span className="leading-snug">{opt.label}</span>
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
  themeColor,
}: {
  options: QuizOption[]
  value: string
  onChange: (v: string) => void
  themeColor: string
}) {
  const selected = value ? value.split(',').filter(Boolean) : []

  const toggle = (key: string) => {
    const next = selected.includes(key)
      ? selected.filter((k) => k !== key)
      : [...selected, key]
    onChange(next.join(','))
  }

  return (
    <div className="space-y-2.5">
      {options.map((opt) => {
        const isSelected = selected.includes(opt.key)
        return (
          <button
            key={opt.key}
            id={`option-${opt.key}`}
            data-testid={`quiz-option-${opt.key}`}
            type="button"
            onClick={() => toggle(opt.key)}
            className={cn(
              'group flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-medium transition-all duration-200',
              isSelected
                ? 'border-brand-500 bg-brand-50 text-brand-900 shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
            )}
            style={isSelected ? { borderColor: themeColor, backgroundColor: `${themeColor}10` } : {}}
          >
            {/* Checkbox square */}
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all',
                isSelected ? 'border-[5px]' : 'border-gray-300',
              )}
              style={isSelected ? { borderColor: themeColor, backgroundColor: `${themeColor}20` } : {}}
            >
              {isSelected && (
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6l3 3 5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: themeColor }}
                  />
                </svg>
              )}
            </span>
            <span className="leading-snug">{opt.label}</span>
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
}: {
  options: QuizOption[]
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <select
        id="quiz-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full appearance-none rounded-xl border-2 border-gray-200 bg-white px-4 py-3.5 pr-10 text-sm font-medium text-gray-700 shadow-sm transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200',
          value ? 'text-gray-900' : 'text-gray-400',
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
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

function NumberField({
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  min?: number
  max?: number
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <input
        id="quiz-number-input"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        placeholder={placeholder}
        className="w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3.5 text-lg font-semibold text-gray-900 shadow-sm transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      {min !== undefined && max !== undefined && (
        <p className="text-xs text-gray-400">Valor entre {min} e {max}</p>
      )}
    </div>
  )
}
