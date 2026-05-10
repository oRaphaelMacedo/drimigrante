// QuizQuestionEditor.tsx — Phase 3+ drawer for create/edit a quiz question
// Supports: PT/EN text, conditional display (showIf), CRUD options.

import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, Save, Loader2 } from 'lucide-react'
import type { QuizQuestion, FieldType } from '@/data/quiz-questions'
import {
  useUpdateQuestion,
  useCreateQuestion,
  type OptionInput,
} from '@/hooks/useQuizAdmin'
import { cn } from '@/lib/utils'

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'radio', label: 'Escolha única (radio)' },
  { value: 'select', label: 'Lista suspensa (select)' },
  { value: 'number', label: 'Número' },
  { value: 'text', label: 'Texto' },
]

type Mode = 'edit' | 'create'

interface Theme {
  code: string
  name_pt: string
  id: string
}

interface Props {
  // edit mode: pass an existing question
  question?: QuizQuestion | null
  // create mode: pass theme list + initial themeCode
  mode?: Mode
  themes?: Theme[]
  initialThemeCode?: string
  // for showIf editor
  allQuestions?: QuizQuestion[]
  onClose: () => void
}

export function QuizQuestionEditor({
  question,
  mode: explicitMode,
  themes = [],
  initialThemeCode,
  allQuestions = [],
  onClose,
}: Props) {
  const update = useUpdateQuestion()
  const create = useCreateQuestion()

  const mode: Mode = explicitMode ?? (question ? 'edit' : 'create')
  const isCreate = mode === 'create'

  // Form state
  const [questionKey, setQuestionKey] = useState('')
  const [themeCode, setThemeCode] = useState(initialThemeCode ?? themes[0]?.code ?? '')
  const [text, setText] = useState('')
  const [textEn, setTextEn] = useState('')
  const [helpText, setHelpText] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('radio')
  const [isRequired, setIsRequired] = useState(true)
  const [placeholder, setPlaceholder] = useState('')
  const [min, setMin] = useState<string>('')
  const [max, setMax] = useState<string>('')
  const [options, setOptions] = useState<OptionInput[]>([])

  // showIf state
  const [hasCondition, setHasCondition] = useState(false)
  const [condQuestionKey, setCondQuestionKey] = useState('')
  const [condAnswerKeys, setCondAnswerKeys] = useState<string[]>([])

  useEffect(() => {
    if (isCreate) {
      // Reset form for create
      setQuestionKey('')
      setThemeCode(initialThemeCode ?? themes[0]?.code ?? '')
      setText('')
      setTextEn('')
      setHelpText('')
      setFieldType('radio')
      setIsRequired(true)
      setPlaceholder('')
      setMin('')
      setMax('')
      setOptions([])
      setHasCondition(false)
      setCondQuestionKey('')
      setCondAnswerKeys([])
      return
    }

    if (!question) return
    setQuestionKey(question.key)
    setThemeCode(question.themeCode)
    setText(question.text)
    setTextEn('')
    setHelpText(question.helpText ?? '')
    setFieldType(question.fieldType)
    setIsRequired(question.isRequired)
    setPlaceholder(question.placeholder ?? '')
    setMin(question.min !== undefined ? String(question.min) : '')
    setMax(question.max !== undefined ? String(question.max) : '')
    setOptions(
      (question.options ?? []).map((o, i) => ({
        option_key: o.key,
        option_text_pt: o.label,
        option_text_en: null,
        score: o.score,
        is_eliminatory: o.isEliminatory ?? false,
        sort_order: i,
      })),
    )
    setHasCondition(!!question.showIf)
    const simpleShowIf = question.showIf && !('any' in question.showIf) && !('all' in question.showIf)
      ? question.showIf as { questionKey: string; answerKey?: string | string[] }
      : null
    setCondQuestionKey(simpleShowIf?.questionKey ?? '')
    setCondAnswerKeys(
      simpleShowIf
        ? Array.isArray(simpleShowIf.answerKey)
          ? simpleShowIf.answerKey
          : simpleShowIf.answerKey ? [simpleShowIf.answerKey] : []
        : [],
    )
  }, [question?.key, isCreate, initialThemeCode, themes])

  const isOpen = !!explicitMode || !!question
  if (!isOpen) return null

  const isChoice = fieldType === 'radio' || fieldType === 'select'
  const isNumeric = fieldType === 'number'

  // Available parent questions for showIf (must have options)
  const possibleParents = useMemo(
    () => allQuestions.filter((q) => q.options && q.options.length > 0 && q.key !== questionKey),
    [allQuestions, questionKey],
  )
  const selectedParent = possibleParents.find((q) => q.key === condQuestionKey)

  const addOption = () => {
    setOptions((prev) => [
      ...prev,
      {
        option_key: `opt_${prev.length + 1}`,
        option_text_pt: '',
        option_text_en: null,
        score: 0,
        is_eliminatory: false,
        sort_order: prev.length,
      },
    ])
  }
  const removeOption = (idx: number) =>
    setOptions((prev) => prev.filter((_, i) => i !== idx).map((o, i) => ({ ...o, sort_order: i })))
  const updateOption = (idx: number, patch: Partial<OptionInput>) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)))

  const toggleAnswerKey = (k: string) => {
    setCondAnswerKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }

  const buildDisplayConditions = () => {
    if (!hasCondition || !condQuestionKey || condAnswerKeys.length === 0) return null
    return {
      question_key: condQuestionKey,
      answer_key: condAnswerKeys.length === 1 ? condAnswerKeys[0] : condAnswerKeys,
    }
  }

  const handleSave = () => {
    const validation = isNumeric
      ? {
          ...(min !== '' ? { min: Number(min) } : {}),
          ...(max !== '' ? { max: Number(max) } : {}),
        }
      : null

    const placeholderVal = isNumeric || fieldType === 'text' ? placeholder.trim() || null : null
    const display = buildDisplayConditions()

    if (isCreate) {
      const theme = themes.find((t) => t.code === themeCode)
      if (!theme) {
        return
      }
      create.mutate(
        {
          themeId: theme.id,
          question: {
            question_key: questionKey.trim(),
            question_text_pt: text.trim(),
            question_text_en: textEn.trim() || null,
            help_text: helpText.trim() || null,
            field_type: fieldType,
            is_required: isRequired,
            placeholder: placeholderVal,
            validation_rules: validation,
            display_conditions: display,
          },
          options: isChoice ? options : undefined,
        },
        { onSuccess: onClose },
      )
      return
    }

    update.mutate(
      {
        questionKey: question!.key,
        updates: {
          question_text_pt: text.trim(),
          question_text_en: textEn.trim() || null,
          help_text: helpText.trim() || null,
          field_type: fieldType,
          is_required: isRequired,
          placeholder: placeholderVal,
          validation_rules: validation,
          display_conditions: display,
        },
        options: isChoice ? options : undefined,
      },
      { onSuccess: onClose },
    )
  }

  const isPending = create.isPending || update.isPending
  const canSave =
    text.trim().length > 0 && (!isCreate || (questionKey.trim().length > 0 && themeCode.length > 0))

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl"
        role="dialog"
        aria-label={isCreate ? 'Criar pergunta' : 'Editar pergunta'}
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              {isCreate ? 'Nova pergunta' : 'Editar pergunta'}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-gray-400">
              {isCreate ? '— por criar —' : question!.key}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-5">
            {isCreate && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Key (identificador)" required>
                    <input
                      value={questionKey}
                      onChange={(e) =>
                        setQuestionKey(e.target.value.replace(/[^a-z0-9_]/g, '_').toLowerCase())
                      }
                      className="input font-mono text-xs"
                      placeholder="ex: preferred_region"
                    />
                  </Field>
                  <Field label="Tema" required>
                    <select
                      value={themeCode}
                      onChange={(e) => setThemeCode(e.target.value)}
                      className="input"
                    >
                      {themes.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.name_pt}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            )}

            <Field label="Texto da pergunta (PT)" required>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                className="input"
                placeholder="Ex: Qual é o seu rendimento mensal?"
              />
            </Field>

            <Field label="Texto da pergunta (EN — opcional)">
              <textarea
                value={textEn}
                onChange={(e) => setTextEn(e.target.value)}
                rows={2}
                className="input"
                placeholder="What is your monthly income?"
              />
            </Field>

            <Field label="Texto de ajuda (opcional)">
              <textarea
                value={helpText}
                onChange={(e) => setHelpText(e.target.value)}
                rows={2}
                className="input"
                placeholder="Aparece abaixo da pergunta como contexto."
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de campo">
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as FieldType)}
                  className="input"
                >
                  {FIELD_TYPES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Obrigatória">
                <label className="flex cursor-pointer items-center gap-2 pt-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Sim, é obrigatória
                </label>
              </Field>
            </div>

            {(fieldType === 'text' || isNumeric) && (
              <Field label="Placeholder (opcional)">
                <input
                  value={placeholder}
                  onChange={(e) => setPlaceholder(e.target.value)}
                  className="input"
                  placeholder="Ex: 2500"
                />
              </Field>
            )}

            {isNumeric && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mínimo">
                  <input
                    type="number"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Máximo">
                  <input
                    type="number"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
            )}

            {/* Conditional display editor */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasCondition}
                  onChange={(e) => setHasCondition(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="font-medium text-gray-900">Mostrar condicionalmente</span>
                  <p className="text-xs text-gray-500">
                    Esta pergunta só aparece quando uma resposta anterior corresponde a critérios.
                  </p>
                </div>
              </label>

              {hasCondition && (
                <div className="mt-3 space-y-3">
                  <Field label="Pergunta-pai">
                    <select
                      value={condQuestionKey}
                      onChange={(e) => {
                        setCondQuestionKey(e.target.value)
                        setCondAnswerKeys([])
                      }}
                      className="input"
                    >
                      <option value="">Selecionar…</option>
                      {possibleParents.map((q) => (
                        <option key={q.key} value={q.key}>
                          {q.text} ({q.key})
                        </option>
                      ))}
                    </select>
                  </Field>

                  {selectedParent && (
                    <Field label="Mostrar quando a resposta for">
                      <div className="flex flex-wrap gap-2">
                        {selectedParent.options?.map((o) => {
                          const checked = condAnswerKeys.includes(o.key)
                          return (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => toggleAnswerKey(o.key)}
                              className={cn(
                                'rounded-full border px-3 py-1 text-xs transition',
                                checked
                                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
                              )}
                            >
                              {checked ? '✓ ' : ''}
                              {o.label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {condAnswerKeys.length === 0
                          ? 'Selecione pelo menos uma resposta.'
                          : `${condAnswerKeys.length} resposta${condAnswerKeys.length > 1 ? 's' : ''} ativam.`}
                      </p>
                    </Field>
                  )}
                </div>
              )}
            </div>

            {isChoice && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">Opções de resposta</label>
                  <button
                    type="button"
                    onClick={addOption}
                    className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nova opção
                  </button>
                </div>

                {options.length === 0 ? (
                  <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-center text-xs text-gray-500">
                    Sem opções. Adicione pelo menos uma.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {options.map((opt, i) => (
                      <li key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="grid grid-cols-12 gap-2">
                          <input
                            value={opt.option_key}
                            onChange={(e) => updateOption(i, { option_key: e.target.value })}
                            placeholder="key"
                            className="input col-span-3 font-mono text-xs"
                          />
                          <input
                            value={opt.option_text_pt}
                            onChange={(e) => updateOption(i, { option_text_pt: e.target.value })}
                            placeholder="Texto a mostrar (PT)"
                            className="input col-span-6"
                          />
                          <input
                            type="number"
                            value={opt.score}
                            onChange={(e) => updateOption(i, { score: Number(e.target.value) || 0 })}
                            placeholder="Score"
                            className="input col-span-2 text-center"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(i)}
                            className="col-span-1 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Remover opção"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <input
                            value={opt.option_text_en ?? ''}
                            onChange={(e) =>
                              updateOption(i, { option_text_en: e.target.value || null })
                            }
                            placeholder="Texto em inglês (opcional)"
                            className="input col-span-12 text-xs"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !canSave}
            className={cn(
              'flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition',
              'hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isPending ? 'A guardar…' : isCreate ? 'Criar pergunta' : 'Guardar'}
          </button>
        </footer>
      </aside>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid rgb(229 231 235);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          border-radius: 0.5rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border-color: rgb(99 102 241);
          box-shadow: 0 0 0 3px rgb(199 210 254 / 0.4);
        }
      `}</style>
    </>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}
