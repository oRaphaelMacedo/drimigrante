// AdminQuizPage.tsx — Phase 2 viewer + Phase 3 editor + Phase 4 versioning

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown, ChevronRight, Search, ListChecks, AlertCircle, Loader2,
  Pencil, ArrowUp, ArrowDown, EyeOff, History, Plus, Palette, X, Save,
} from 'lucide-react'
import type { QuizQuestion } from '@/data/quiz-questions'
import { useQuizQuestions } from '@/hooks/useQuizQuestions'
import {
  useReorderQuestion, useToggleQuestionActive,
  useFormThemes, useCreateTheme, useUpdateTheme,
  type FormTheme,
} from '@/hooks/useQuizAdmin'
import { QuizQuestionEditor } from '@/components/quiz/QuizQuestionEditor'
import { cn } from '@/lib/utils'

const FIELD_TYPE_LABEL: Record<string, string> = {
  radio: 'Escolha única',
  select: 'Lista suspensa',
  number: 'Número',
  text: 'Texto',
  textarea: 'Texto longo',
  checkbox: 'Múltipla escolha',
  date: 'Data',
  email: 'Email',
  phone: 'Telefone',
  autocomplete: 'Auto-completar',
}

export function AdminQuizPage() {
  const { data: questions = [], isLoading, error } = useQuizQuestions()
  const { data: formThemes = [] } = useFormThemes()
  const reorder = useReorderQuestion()
  const toggleActive = useToggleQuestionActive()

  const [search, setSearch] = useState('')
  const [themeFilter, setThemeFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Question editor state
  const [editing, setEditing] = useState<QuizQuestion | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [creatingThemeCode, setCreatingThemeCode] = useState<string>('')

  // Theme editor state
  const [editingTheme, setEditingTheme] = useState<FormTheme | null>(null)
  const [isCreatingTheme, setIsCreatingTheme] = useState(false)

  const themeStats = useMemo(() => {
    const map = new Map<string, { code: string; name: string; color: string; icon: string; count: number }>()
    questions.forEach((q) => {
      const cur = map.get(q.themeCode)
      if (cur) cur.count++
      else map.set(q.themeCode, { code: q.themeCode, name: q.themeName, color: q.themeColor, icon: q.themeIcon, count: 1 })
    })
    return Array.from(map.values())
  }, [questions])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return questions.filter((q) => {
      if (themeFilter !== 'all' && q.themeCode !== themeFilter) return false
      if (!term) return true
      return (
        q.text.toLowerCase().includes(term) ||
        q.key.toLowerCase().includes(term) ||
        q.helpText?.toLowerCase().includes(term)
      )
    })
  }, [questions, search, themeFilter])

  const totalOptions = useMemo(
    () => questions.reduce((sum, q) => sum + (q.options?.length ?? 0), 0),
    [questions],
  )

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const openCreate = (themeCode?: string) => {
    setCreatingThemeCode(themeCode ?? formThemes[0]?.code ?? '')
    setIsCreating(true)
  }

  const handleEditorClose = () => {
    setEditing(null)
    setIsCreating(false)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        Erro a carregar perguntas: {(error as Error).message}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quiz</h1>
          <p className="mt-1 text-sm text-gray-500">
            Edita as perguntas, opções e ordem. Cada alteração cria automaticamente uma versão para reverter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCreatingTheme(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <Palette className="h-3.5 w-3.5" />
            Novo tema
          </button>
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Nova pergunta
          </button>
          <Link
            to="/admin/quiz/history"
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <History className="h-3.5 w-3.5" />
            Histórico
          </Link>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
            {questions.length} perguntas
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
            {totalOptions} opções
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
            {themeStats.length} temas
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Procurar pergunta, key ou ajuda…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <select
          value={themeFilter}
          onChange={(e) => setThemeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        >
          <option value="all">Todos os temas ({questions.length})</option>
          {themeStats.map((t) => (
            <option key={t.code} value={t.code}>
              {t.icon} {t.name} ({t.count})
            </option>
          ))}
        </select>
      </div>

      {/* Theme chips + per-theme actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setThemeFilter('all')}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition',
            themeFilter === 'all'
              ? 'border-brand-300 bg-brand-50 text-brand-700'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          Todos
        </button>
        {themeStats.map((t) => (
          <div key={t.code} className="flex items-center">
            <button
              onClick={() => setThemeFilter(t.code)}
              className={cn(
                'rounded-l-full border px-3 py-1 text-xs font-medium transition',
                themeFilter === t.code
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
              )}
              style={themeFilter === t.code ? undefined : { color: t.color }}
            >
              {t.icon} {t.name}
            </button>
            <button
              onClick={() => {
                const ft = formThemes.find((f) => f.code === t.code)
                if (ft) setEditingTheme(ft)
              }}
              title="Editar tema"
              className="border-y border-gray-200 bg-white px-1.5 py-1 text-gray-400 transition hover:bg-gray-50 hover:text-gray-700"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={() => openCreate(t.code)}
              title="Nova pergunta neste tema"
              className="rounded-r-full border border-gray-200 bg-white px-1.5 py-1 text-gray-400 transition hover:bg-brand-50 hover:text-brand-600"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Question list */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <ListChecks className="h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">Nenhuma pergunta corresponde aos filtros.</p>
            <button
              onClick={() => openCreate(themeFilter !== 'all' ? themeFilter : undefined)}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Criar pergunta
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((q, idx) => {
              const isOpen = expanded.has(q.key)
              return (
                <li key={q.key} className="px-4 py-3 sm:px-6">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggle(q.key)}
                      className="flex flex-1 items-start gap-3 text-left"
                    >
                      <span
                        className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: q.themeColor }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{q.text}</span>
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                            {q.key}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span>
                            {q.themeIcon} {q.themeName}
                          </span>
                          <span>·</span>
                          <span>{FIELD_TYPE_LABEL[q.fieldType] ?? q.fieldType}</span>
                          {q.options?.length ? (
                            <>
                              <span>·</span>
                              <span>{q.options.length} opções</span>
                            </>
                          ) : null}
                          {q.showIf ? (
                            <>
                              <span>·</span>
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                                Condicional
                              </span>
                            </>
                          ) : null}
                          {!q.isRequired ? (
                            <>
                              <span>·</span>
                              <span className="text-gray-400">opcional</span>
                            </>
                          ) : null}
                        </div>
                        {q.helpText ? (
                          <p className="mt-1 text-xs text-gray-400">{q.helpText}</p>
                        ) : null}
                      </div>
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      )}
                    </button>

                    {/* Action toolbar */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => reorder.mutate({ questionKey: q.key, direction: 'up', questions })}
                        disabled={reorder.isPending}
                        className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                        title="Subir no tema"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => reorder.mutate({ questionKey: q.key, direction: 'down', questions })}
                        disabled={reorder.isPending}
                        className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                        title="Descer no tema"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => toggleActive.mutate({ questionKey: q.key, isActive: false })}
                        disabled={toggleActive.isPending}
                        className="rounded p-1 text-gray-400 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-30"
                        title="Desactivar pergunta"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditing(q)}
                        className="ml-1 flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="mt-4 ml-9 space-y-3 rounded-lg bg-gray-50 p-4">
                      {q.showIf ? (
                        <div className="text-xs text-gray-600">
                          <span className="font-semibold">Mostra quando:</span>{' '}
                          <code className="rounded bg-white px-1.5 py-0.5 text-[11px]">
                            {q.showIf.questionKey} ={' '}
                            {Array.isArray(q.showIf.answerKey)
                              ? q.showIf.answerKey.join(' ou ')
                              : q.showIf.answerKey}
                          </code>
                        </div>
                      ) : null}

                      {typeof q.min === 'number' || typeof q.max === 'number' || q.placeholder ? (
                        <div className="text-xs text-gray-600">
                          <span className="font-semibold">Validação:</span>{' '}
                          {typeof q.min === 'number' && <>min: {q.min}; </>}
                          {typeof q.max === 'number' && <>max: {q.max}; </>}
                          {q.placeholder && <>placeholder: "{q.placeholder}"</>}
                        </div>
                      ) : null}

                      {q.options?.length ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-gray-600">Opções</p>
                          <div className="overflow-hidden rounded-md border border-gray-200">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-gray-100 text-gray-600">
                                <tr>
                                  <th className="px-3 py-1.5 font-medium">Key</th>
                                  <th className="px-3 py-1.5 font-medium">Texto</th>
                                  <th className="px-3 py-1.5 font-medium text-right">Score</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 bg-white">
                                {q.options.map((o) => (
                                  <tr key={o.key}>
                                    <td className="px-3 py-1.5 font-mono text-[11px] text-gray-500">
                                      {o.key}
                                    </td>
                                    <td className="px-3 py-1.5">{o.label}</td>
                                    <td className="px-3 py-1.5 text-right">
                                      <span
                                        className={cn(
                                          'rounded px-1.5 py-0.5 font-mono text-[11px]',
                                          o.score >= 15
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : o.score >= 5
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'bg-gray-100 text-gray-600',
                                        )}
                                      >
                                        +{o.score}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Question editor drawer */}
      <QuizQuestionEditor
        mode={isCreating ? 'create' : editing ? 'edit' : undefined}
        question={editing}
        themes={formThemes}
        initialThemeCode={isCreating ? creatingThemeCode : undefined}
        allQuestions={questions}
        onClose={handleEditorClose}
      />

      {/* Theme editor drawer */}
      <ThemeEditor
        theme={editingTheme}
        isCreating={isCreatingTheme}
        onClose={() => {
          setEditingTheme(null)
          setIsCreatingTheme(false)
        }}
      />
    </div>
  )
}

// ─── Theme Editor Drawer ──────────────────────────────────────────────────────

const THEME_ICONS = [
  '🌍', '💼', '🏛️', '📋', '💰', '🏥', '🎓', '🏠', '⚖️', '🌐',
  '👨‍👩‍👧', '✈️', '📚', '🤝', '🎯', '🔑', '📝', '🏆', '💡', '❓',
]

function ThemeEditor({
  theme,
  isCreating,
  onClose,
}: {
  theme: FormTheme | null
  isCreating: boolean
  onClose: () => void
}) {
  const createThemeMutation = useCreateTheme()
  const updateThemeMutation = useUpdateTheme()

  const [code, setCode] = useState('')
  const [namePt, setNamePt] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [color, setColor] = useState('#3b62f6')
  const [icon, setIcon] = useState('❓')

  useEffect(() => {
    if (isCreating) {
      setCode('')
      setNamePt('')
      setNameEn('')
      setColor('#3b62f6')
      setIcon('❓')
    } else if (theme) {
      setCode(theme.code)
      setNamePt(theme.name_pt)
      setNameEn(theme.name_en ?? '')
      setColor(theme.color ?? '#3b62f6')
      setIcon(theme.icon ?? '❓')
    }
  }, [theme?.id, isCreating])

  const isOpen = isCreating || !!theme
  if (!isOpen) return null

  const isPending = createThemeMutation.isPending || updateThemeMutation.isPending
  const canSave = namePt.trim().length > 0 && (!isCreating || code.trim().length > 0)

  const handleSave = () => {
    if (isCreating) {
      createThemeMutation.mutate(
        { code: code.trim(), name_pt: namePt.trim(), name_en: nameEn.trim() || null, color, icon },
        { onSuccess: onClose },
      )
    } else {
      updateThemeMutation.mutate(
        {
          originalCode: theme!.code,
          patch: {
            code: code.trim(),
            name_pt: namePt.trim(),
            name_en: nameEn.trim() || null,
            color,
            icon,
          },
        },
        { onSuccess: onClose },
      )
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-hidden bg-white shadow-2xl"
        role="dialog"
        aria-label={isCreating ? 'Novo tema' : 'Editar tema'}
      >
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              {isCreating ? 'Novo tema' : 'Editar tema'}
            </p>
            {!isCreating && (
              <p className="mt-0.5 font-mono text-xs text-gray-400">{theme!.code}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {isCreating && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Código (identificador) <span className="text-red-500">*</span>
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9_]/g, '_').toLowerCase())}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="ex: situacao_profissional"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Nome (PT) <span className="text-red-500">*</span>
              </label>
              <input
                value={namePt}
                onChange={(e) => setNamePt(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="Situação Profissional"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome (EN)</label>
              <input
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                placeholder="Professional Situation"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cor de destaque</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border border-gray-200 p-0.5"
              />
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {namePt || 'Pré-visualização'}
              </span>
              <span className="font-mono text-xs text-gray-400">{color}</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Ícone — actual:{' '}
              <span className="text-base" aria-label={icon}>
                {icon}
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {THEME_ICONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={cn(
                    'rounded-lg p-1.5 text-lg transition',
                    i === icon
                      ? 'bg-brand-100 ring-2 ring-brand-400'
                      : 'hover:bg-gray-100',
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
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
            {isPending ? 'A guardar…' : isCreating ? 'Criar tema' : 'Guardar'}
          </button>
        </footer>
      </aside>
    </>
  )
}
