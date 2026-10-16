// QuizQuestionEditor.tsx — drawer para criar/editar uma pergunta do quiz.
// Suporta: texto PT/EN, opções e exibição condicional (showIf) sem perder
// informação: "resposta igual a" (answer_key), "resposta inclui" para
// múltipla escolha (answer_contains) e combinações "qualquer"/"todas" (any/all).
//
// Regras de hooks: o wrapper exportado não usa hooks e só monta o painel quando
// está aberto; o painel declara todos os hooks antes de qualquer retorno.

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Trash2, Save, Loader2, AlertTriangle } from 'lucide-react'
import type { QuizQuestion, FieldType } from '@/data/quiz-questions'
import {
  useUpdateQuestion,
  useCreateQuestion,
  type OptionInput,
} from '@/hooks/useQuizAdmin'
import {
  newConditionRow,
  ruleToConditionRows,
  conditionRowsToDisplayConditions,
  type ConditionRow,
  type ConditionCombinator,
  type ConditionOperator,
} from '@/lib/quiz-conditions'
import { cn } from '@/lib/utils'

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'radio', label: 'Escolha única (radio)' },
  { value: 'multiselect', label: 'Múltipla escolha (multiselect)' },
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

// ─── Componente ──────────────────────────────────────────────────────────────

function isRowComplete(row: ConditionRow): boolean {
  if (!row.questionKey || row.answerKeys.length === 0) return false
  return row.operator === 'equals' || row.answerKeys.length === 1
}

function operatorFor(parent?: QuizQuestion): ConditionOperator {
  return parent?.fieldType === 'multiselect' ? 'contains' : 'equals'
}

export function QuizQuestionEditor(props: Props) {
  const mode: Mode = props.mode ?? (props.question ? 'edit' : 'create')
  const isOpen = !!props.mode || !!props.question
  if (!isOpen) return null
  if (mode === 'edit' && !props.question) return null

  const panelKey = mode === 'create' ? `create:${props.initialThemeCode ?? ''}` : `edit:${props.question!.key}`
  return <QuizQuestionEditorPanel key={panelKey} {...props} mode={mode} />
}

function QuizQuestionEditorPanel({
  question,
  mode,
  themes = [],
  initialThemeCode,
  allQuestions = [],
  onClose,
}: Props & { mode: Mode }) {
  const update = useUpdateQuestion()
  const create = useCreateQuestion()
  const isCreate = mode === 'create'
  const source = isCreate ? null : question ?? null

  // Estado inicial derivado das props uma única vez (o painel é remontado por key).
  const [questionKey, setQuestionKey] = useState(() => source?.key ?? '')
  const [themeCode, setThemeCode] = useState(
    () => source?.themeCode ?? initialThemeCode ?? themes[0]?.code ?? '',
  )
  const [text, setText] = useState(() => source?.text ?? '')
  const [textEn, setTextEn] = useState(() => source?.textEn ?? '')
  const [helpText, setHelpText] = useState(() => source?.helpText ?? '')
  const [fieldType, setFieldType] = useState<FieldType>(() => source?.fieldType ?? 'radio')
  const [isRequired, setIsRequired] = useState(() => source?.isRequired ?? true)
  const [placeholder, setPlaceholder] = useState(() => source?.placeholder ?? '')
  const [min, setMin] = useState<string>(() => (source?.min !== undefined ? String(source.min) : ''))
  const [max, setMax] = useState<string>(() => (source?.max !== undefined ? String(source.max) : ''))
  const [options, setOptions] = useState<OptionInput[]>(() =>
    (source?.options ?? []).map((o, i) => ({
      option_key: o.key,
      option_text_pt: o.label,
      option_text_en: o.labelEn ?? null,
      score: o.score,
      is_eliminatory: o.isEliminatory ?? false,
      sort_order: i,
    })),
  )

  // showIf
  const [initialCondition] = useState(() => ruleToConditionRows(source?.showIf))
  const [hasCondition, setHasCondition] = useState(() => !!source?.showIf)
  const [rows, setRows] = useState<ConditionRow[]>(initialCondition.rows)
  const [combinator, setCombinator] = useState<ConditionCombinator>(initialCondition.combinator)

  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  // Perguntas que podem ser pai (têm opções e não são a própria pergunta)
  const possibleParents = useMemo(
    () => allQuestions.filter((q) => q.options && q.options.length > 0 && q.key !== questionKey),
    [allQuestions, questionKey],
  )
  const parentByKey = useMemo(
    () => new Map(possibleParents.map((q) => [q.key, q])),
    [possibleParents],
  )

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Esc fecha o drawer; o foco vai para o painel só ao abrir (não a cada render do pai).
  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isChoice = fieldType === 'radio' || fieldType === 'select' || fieldType === 'multiselect'
  const isNumeric = fieldType === 'number'

  // ── Opções ──
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

  // ── Condições ──
  const updateRow = (id: number, patch: Partial<ConditionRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const addRow = () => setRows((prev) => [...prev, newConditionRow()])
  const removeRow = (id: number) => setRows((prev) => prev.filter((r) => r.id !== id))
  const changeRowParent = (id: number, parentKey: string) =>
    updateRow(id, { questionKey: parentKey, operator: operatorFor(parentByKey.get(parentKey)), answerKeys: [] })
  const toggleRowAnswer = (row: ConditionRow, key: string) => {
    if (row.operator === 'contains') {
      updateRow(row.id, { answerKeys: row.answerKeys[0] === key ? [] : [key] })
      return
    }
    updateRow(row.id, {
      answerKeys: row.answerKeys.includes(key)
        ? row.answerKeys.filter((k) => k !== key)
        : [...row.answerKeys, key],
    })
  }

  const toggleHasCondition = (checked: boolean) => {
    setHasCondition(checked)
    if (checked && rows.length === 0) addRow()
  }

  // ── Validação ──
  const conditionError = hasCondition
    ? rows.length === 0
      ? 'Adicione pelo menos uma condição ou desmarque “Mostrar condicionalmente”.'
      : rows.some((r) => !isRowComplete(r))
        ? 'Complete ou remova as condições sem pergunta-pai ou sem resposta.'
        : null
    : null

  const optionKeys = options.map((o) => o.option_key.trim())
  const optionsError = isChoice
    ? options.length === 0
      ? 'Adicione pelo menos uma opção.'
      : optionKeys.some((k) => !k) || options.some((o) => !o.option_text_pt.trim())
        ? 'Toda opção precisa de key e texto.'
        : new Set(optionKeys).size !== optionKeys.length
          ? 'As keys das opções precisam ser únicas.'
          : null
    : null

  const isPending = create.isPending || update.isPending
  const canSave =
    text.trim().length > 0 &&
    (!isCreate || (questionKey.trim().length > 0 && themeCode.length > 0)) &&
    !conditionError &&
    !optionsError

  const handleSave = () => {
    if (!canSave) return
    const validation = isNumeric
      ? {
          ...(min !== '' ? { min: Number(min) } : {}),
          ...(max !== '' ? { max: Number(max) } : {}),
        }
      : null

    const placeholderVal = isNumeric || fieldType === 'text' ? placeholder.trim() || null : null
    const display = hasCondition ? conditionRowsToDisplayConditions(rows, combinator) : null
    const cleanOptions = options.map((o, i) => ({
      ...o,
      option_key: o.option_key.trim(),
      option_text_pt: o.option_text_pt.trim(),
      option_text_en: o.option_text_en?.trim() || null,
      sort_order: i,
    }))

    if (isCreate) {
      const theme = themes.find((t) => t.code === themeCode)
      if (!theme) return
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
          options: isChoice ? cleanOptions : undefined,
        },
        { onSuccess: onClose },
      )
      return
    }

    update.mutate(
      {
        questionKey: source!.key,
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
        options: isChoice ? cleanOptions : undefined,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        ref={dialogRef}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl outline-none"
        role="dialog"
        aria-modal="true"
        aria-label={isCreate ? 'Criar pergunta' : 'Editar pergunta'}
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-600">
              {isCreate ? 'Nova pergunta' : 'Editar pergunta'}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-gray-500">
              {isCreate ? '— a criar —' : source!.key}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="space-y-5">
            {!isCreate && source?.showIfRepaired && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>
                  A condição gravada no banco estava incompleta. Abaixo está a regra padrão do
                  código, que é a usada hoje no quiz. Salve para gravá-la no banco.
                </p>
              </div>
            )}

            {isCreate && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Key (identificador)" required htmlFor="qe-key">
                  <input
                    id="qe-key"
                    value={questionKey}
                    onChange={(e) =>
                      setQuestionKey(e.target.value.replace(/[^a-z0-9_]/g, '_').toLowerCase())
                    }
                    className="input font-mono"
                    placeholder="ex: preferred_region"
                  />
                </Field>
                <Field label="Tema" required htmlFor="qe-theme">
                  <select
                    id="qe-theme"
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
            )}

            <Field label="Texto da pergunta (PT)" required htmlFor="qe-text">
              <textarea
                id="qe-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                className="input"
                placeholder="Ex: Qual é o seu rendimento mensal?"
              />
            </Field>

            <Field label="Texto da pergunta (EN — opcional)" htmlFor="qe-text-en">
              <textarea
                id="qe-text-en"
                value={textEn}
                onChange={(e) => setTextEn(e.target.value)}
                rows={2}
                className="input"
                placeholder="What is your monthly income?"
              />
            </Field>

            <Field label="Texto de ajuda (opcional)" htmlFor="qe-help">
              <textarea
                id="qe-help"
                value={helpText}
                onChange={(e) => setHelpText(e.target.value)}
                rows={2}
                className="input"
                placeholder="Aparece abaixo da pergunta como contexto."
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de campo" htmlFor="qe-type">
                <select
                  id="qe-type"
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
              <Field label="Placeholder (opcional)" htmlFor="qe-placeholder">
                <input
                  id="qe-placeholder"
                  value={placeholder}
                  onChange={(e) => setPlaceholder(e.target.value)}
                  className="input"
                  placeholder="Ex: 2500"
                />
              </Field>
            )}

            {isNumeric && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mínimo" htmlFor="qe-min">
                  <input
                    id="qe-min"
                    type="number"
                    value={min}
                    onChange={(e) => setMin(e.target.value)}
                    className="input"
                  />
                </Field>
                <Field label="Máximo" htmlFor="qe-max">
                  <input
                    id="qe-max"
                    type="number"
                    value={max}
                    onChange={(e) => setMax(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
            )}

            {/* Exibição condicional */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={hasCondition}
                  onChange={(e) => toggleHasCondition(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <div>
                  <span className="font-medium text-gray-900">Mostrar condicionalmente</span>
                  <p className="text-xs text-gray-600">
                    A pergunta só aparece quando respostas anteriores atendem às condições (e a
                    pergunta-pai também está visível).
                  </p>
                </div>
              </label>

              {hasCondition && (
                <div className="mt-3 space-y-3">
                  {rows.length > 1 && (
                    <fieldset className="flex flex-wrap items-center gap-2 text-xs">
                      <legend className="sr-only">Como combinar as condições</legend>
                      <span className="font-medium text-gray-700">Mostrar quando:</span>
                      {(
                        [
                          ['any', 'qualquer condição for atendida (OU)'],
                          ['all', 'todas as condições forem atendidas (E)'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={combinator === value}
                          onClick={() => setCombinator(value)}
                          className={cn(
                            'rounded-full border px-3 py-1 transition',
                            combinator === value
                              ? 'border-brand-500 bg-brand-50 text-brand-800'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </fieldset>
                  )}

                  {rows.map((row, idx) => {
                    const parent = parentByKey.get(row.questionKey)
                    const parentOptionKeys = parent?.options?.map((o) => o.key) ?? []
                    const staleKeys = row.answerKeys.filter((k) => !parentOptionKeys.includes(k))
                    const selectId = `qe-cond-parent-${row.id}`
                    return (
                      <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <Field label={`Condição ${idx + 1} — pergunta-pai`} htmlFor={selectId}>
                              <select
                                id={selectId}
                                value={row.questionKey}
                                onChange={(e) => changeRowParent(row.id, e.target.value)}
                                className="input"
                              >
                                <option value="">Selecionar…</option>
                                {row.questionKey && !parent && (
                                  <option value={row.questionKey}>
                                    {row.questionKey} (não encontrada)
                                  </option>
                                )}
                                {possibleParents.map((q) => (
                                  <option key={q.key} value={q.key}>
                                    {q.text} ({q.key})
                                  </option>
                                ))}
                              </select>
                            </Field>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Remover condição ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {row.questionKey && (
                          <div className="mt-3">
                            <p className="mb-1.5 text-sm font-medium text-gray-700">
                              {row.operator === 'contains'
                                ? 'Mostrar quando a resposta incluir'
                                : 'Mostrar quando a resposta for'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {parent?.options?.map((o) => {
                                const checked = row.answerKeys.includes(o.key)
                                return (
                                  <button
                                    key={o.key}
                                    type="button"
                                    aria-pressed={checked}
                                    onClick={() => toggleRowAnswer(row, o.key)}
                                    className={cn(
                                      'rounded-full border px-3 py-1 text-xs transition',
                                      checked
                                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                                    )}
                                  >
                                    {checked ? '✓ ' : ''}
                                    {o.label}
                                  </button>
                                )
                              })}
                              {staleKeys.map((k) => (
                                <button
                                  key={`stale-${k}`}
                                  type="button"
                                  aria-pressed
                                  onClick={() => toggleRowAnswer(row, k)}
                                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-900"
                                  title="Esta opção não existe mais na pergunta-pai. Clique para remover."
                                >
                                  ✓ {k} (opção inexistente)
                                </button>
                              ))}
                            </div>
                            <p className="mt-1 text-xs text-gray-600">
                              {row.operator === 'contains'
                                ? 'Múltipla escolha: escolha uma opção. Para “A ou B”, adicione outra condição e use “qualquer condição”.'
                                : row.answerKeys.length === 0
                                  ? 'Selecione pelo menos uma resposta.'
                                  : `${row.answerKeys.length} resposta${row.answerKeys.length > 1 ? 's' : ''} ativa${row.answerKeys.length > 1 ? 'm' : ''} esta condição.`}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar condição
                  </button>

                  {conditionError && (
                    <p role="alert" className="text-xs font-medium text-red-700">
                      {conditionError}
                    </p>
                  )}
                </div>
              )}
            </div>

            {isChoice && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">Opções de resposta</p>
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
                  <p className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-center text-xs text-gray-600">
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
                            aria-label={`Key da opção ${i + 1}`}
                            className="input col-span-3 font-mono"
                          />
                          <input
                            value={opt.option_text_pt}
                            onChange={(e) => updateOption(i, { option_text_pt: e.target.value })}
                            placeholder="Texto a mostrar (PT)"
                            aria-label={`Texto da opção ${i + 1}`}
                            className="input col-span-6"
                          />
                          <input
                            type="number"
                            value={opt.score}
                            onChange={(e) => updateOption(i, { score: Number(e.target.value) || 0 })}
                            placeholder="Score"
                            aria-label={`Score da opção ${i + 1}`}
                            className="input col-span-2 text-center"
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(i)}
                            className="col-span-1 flex items-center justify-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-700"
                            aria-label={`Remover opção ${i + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <input
                            value={opt.option_text_en ?? ''}
                            onChange={(e) =>
                              updateOption(i, { option_text_en: e.target.value || null })
                            }
                            placeholder="Texto em inglês (opcional)"
                            aria-label={`Texto em inglês da opção ${i + 1}`}
                            className="input col-span-12"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {optionsError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-red-700">
                    {optionsError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || !canSave}
            aria-busy={isPending}
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
            {isPending ? 'Salvando…' : isCreate ? 'Criar pergunta' : 'Salvar'}
          </button>
        </footer>
      </aside>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid rgb(209 213 219);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 1rem;
          border-radius: 0.5rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        @media (min-width: 640px) {
          .input { font-size: 0.875rem; }
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
  htmlFor,
  children,
}: {
  label: string
  required?: boolean
  htmlFor?: string
  children: React.ReactNode
}) {
  const content = (
    <>
      {label}
      {required && <span className="ml-0.5 text-red-600">*</span>}
    </>
  )
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
          {content}
        </label>
      ) : (
        <p className="mb-1.5 text-sm font-medium text-gray-700">{content}</p>
      )}
      {children}
    </div>
  )
}
