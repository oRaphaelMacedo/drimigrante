// AdminQuizPage.tsx — perguntas do quiz: visualização, edição, ordem e temas
// (cada alteração gera uma versão; ver AdminQuizHistoryPage).

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  EyeOff,
  History,
  ListChecks,
  Loader2,
  Palette,
  Pencil,
  Plus,
  Save,
  Search,
} from 'lucide-react'
import type { QuizQuestion } from '@/data/quiz-questions'
import { describeShowIf } from '@/lib/quiz-conditions'
import { useQuizQuestionsAdmin } from '@/hooks/useQuizQuestions'
import {
  useReorderQuestion,
  useToggleQuestionActive,
  useFormThemes,
  useCreateTheme,
  useUpdateTheme,
  type FormTheme,
} from '@/hooks/useQuizAdmin'
import { AdminDrawer } from '@/components/admin/AdminDrawer'
import { QuizQuestionEditor } from '@/components/quiz/QuizQuestionEditor'
import { Badge, Button, Input, Select } from '@/components/ui'
import { textClassOn } from '@/lib/text-on-color'
import { cn } from '@/lib/utils'

const FIELD_TYPE_LABEL: Record<string, string> = {
  radio: 'Escolha única',
  multiselect: 'Múltipla escolha',
  select: 'Lista suspensa',
  number: 'Número',
  text: 'Texto',
  textarea: 'Texto longo',
  checkbox: 'Múltipla escolha',
  date: 'Data',
  email: 'E-mail',
  phone: 'Telefone',
  autocomplete: 'Autocompletar',
}

const chipClass = (selected: boolean) =>
  cn(
    'inline-flex min-h-11 items-center gap-1.5 border px-3 text-sm font-medium transition-colors',
    'focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    selected ? 'border-primary bg-primary/[.08] text-primary' : 'border-input bg-card text-foreground/80 hover:bg-muted',
  )

export function AdminQuizPage() {
  // Só dados do banco (sem as perguntas do código como substituto): o admin
  // precisa ver erro se o banco falhar, e não editar dados que não existem lá.
  const { data: questions = [], isLoading, error } = useQuizQuestionsAdmin()
  const { data: formThemes = [] } = useFormThemes()
  const reorder = useReorderQuestion()
  const toggleActive = useToggleQuestionActive()

  const [search, setSearch] = useState('')
  const [themeFilter, setThemeFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Editor de pergunta
  const [editing, setEditing] = useState<QuizQuestion | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [creatingThemeCode, setCreatingThemeCode] = useState<string>('')

  // Editor de tema
  const [editingTheme, setEditingTheme] = useState<FormTheme | null>(null)
  const [isCreatingTheme, setIsCreatingTheme] = useState(false)

  const themeStats = useMemo(() => {
    const map = new Map<string, { code: string; name: string; color: string; count: number }>()
    questions.forEach((q) => {
      const cur = map.get(q.themeCode)
      if (cur) cur.count++
      else map.set(q.themeCode, { code: q.themeCode, name: q.themeName, color: q.themeColor, count: 1 })
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

  const repairedCount = useMemo(() => questions.filter((q) => q.showIfRepaired).length, [questions])

  const totalOptions = useMemo(() => questions.reduce((sum, q) => sum + (q.options?.length ?? 0), 0), [questions])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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

  const closeThemeEditor = () => {
    setEditingTheme(null)
    setIsCreatingTheme(false)
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Carregando perguntas">
        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/[.08] p-4 text-sm text-destructive"
      >
        <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="min-w-0 [overflow-wrap:anywhere]">Erro ao carregar perguntas: {(error as Error).message}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Quiz</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Edite as perguntas, as opções e a ordem. Cada alteração cria automaticamente uma versão para reverter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => openCreate()}>
            <Plus aria-hidden="true" />
            Nova pergunta
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsCreatingTheme(true)}>
            <Palette aria-hidden="true" />
            Novo tema
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link to="/admin/quiz/history">
              <History aria-hidden="true" />
              Histórico
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Resumo do quiz">
        <Badge variant="neutral" size="sm">{questions.length} perguntas</Badge>
        <Badge variant="neutral" size="sm">{totalOptions} opções</Badge>
        <Badge variant="neutral" size="sm">{themeStats.length} temas</Badge>
      </div>

      {repairedCount > 0 && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-warning/20 bg-warning/[.08] p-4 text-sm text-warning"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          {/* min-w-0 + overflow-wrap: o nome do arquivo não tem ponto de quebra e, sem
              isso, alarga a página no celular (360px) e corta os painéis abertos. */}
          <p className="min-w-0 [overflow-wrap:anywhere]">
            {repairedCount === 1 ? '1 pergunta tem' : `${repairedCount} perguntas têm`} condição de
            exibição incompleta no banco. O quiz está usando a regra padrão do código para{' '}
            {repairedCount === 1 ? 'ela' : 'elas'}. Para corrigir no banco, abra a pergunta e salve,
            ou aplique a migration{' '}
            <code className="break-all font-mono text-xs">20261016000200_fix_quiz_display_conditions.sql</code>.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pergunta, chave ou ajuda…"
            aria-label="Buscar pergunta, chave ou texto de ajuda"
            className="pl-10"
          />
        </div>
        <div className="sm:w-64">
          <Select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)} aria-label="Filtrar por tema">
            <option value="all">Todos os temas ({questions.length})</option>
            {themeStats.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name} ({t.count})
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Temas: filtro rápido, editar tema e nova pergunta no tema. No celular a faixa
          rola na horizontal (uma linha) em vez de empilhar um tema por linha. */}
      <div
        role="group"
        aria-label="Temas"
        className="relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        <button
          type="button"
          onClick={() => setThemeFilter('all')}
          aria-pressed={themeFilter === 'all'}
          className={cn(chipClass(themeFilter === 'all'), 'shrink-0 rounded-xl')}
        >
          Todos
        </button>
        {themeStats.map((t) => (
          <div key={t.code} className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => setThemeFilter(t.code)}
              aria-pressed={themeFilter === t.code}
              className={cn(chipClass(themeFilter === t.code), 'whitespace-nowrap rounded-l-xl')}
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
            </button>
            <button
              type="button"
              onClick={() => {
                const ft = formThemes.find((f) => f.code === t.code)
                if (ft) setEditingTheme(ft)
              }}
              title="Editar tema"
              aria-label={`Editar tema ${t.name}`}
              className={cn(chipClass(false), '-ml-px w-11 justify-center px-0 text-muted-foreground')}
            >
              <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => openCreate(t.code)}
              title="Nova pergunta neste tema"
              aria-label={`Nova pergunta no tema ${t.name}`}
              className={cn(chipClass(false), '-ml-px w-11 justify-center rounded-r-xl px-0 text-muted-foreground')}
            >
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Lista de perguntas */}
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <ListChecks aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhuma pergunta corresponde aos filtros.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-1"
              onClick={() => openCreate(themeFilter !== 'all' ? themeFilter : undefined)}
            >
              <Plus aria-hidden="true" />
              Criar pergunta
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((q, idx) => {
              const isOpen = expanded.has(q.key)
              return (
                <li key={q.key} className="px-4 py-3 sm:px-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(q.key)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                          textClassOn(q.themeColor),
                        )}
                        style={{ backgroundColor: q.themeColor }}
                      >
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{q.text}</span>
                          <span className="break-all rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80">
                            {q.key}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{q.themeName}</span>
                          <span aria-hidden="true">·</span>
                          <span>{FIELD_TYPE_LABEL[q.fieldType] ?? q.fieldType}</span>
                          {q.options?.length ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{q.options.length} opções</span>
                            </>
                          ) : null}
                          {q.showIf ? (
                            <Badge variant="warning" size="sm">
                              Condicional
                            </Badge>
                          ) : null}
                          {q.showIfRepaired ? (
                            <Badge variant="danger" size="sm">
                              Condição incompleta no banco
                            </Badge>
                          ) : null}
                          {!q.isRequired ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>opcional</span>
                            </>
                          ) : null}
                        </div>
                        {q.helpText ? <p className="mt-1 text-xs text-muted-foreground">{q.helpText}</p> : null}
                      </div>
                      {isOpen ? (
                        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>

                    {/* Ações da pergunta */}
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => reorder.mutate({ questionKey: q.key, direction: 'up', questions })}
                        disabled={reorder.isPending}
                        className="text-muted-foreground"
                        title="Subir no tema"
                        aria-label={`Subir ${q.key} no tema`}
                      >
                        <ArrowUp aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => reorder.mutate({ questionKey: q.key, direction: 'down', questions })}
                        disabled={reorder.isPending}
                        className="text-muted-foreground"
                        title="Descer no tema"
                        aria-label={`Descer ${q.key} no tema`}
                      >
                        <ArrowDown aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive.mutate({ questionKey: q.key, isActive: false })}
                        disabled={toggleActive.isPending}
                        className="text-muted-foreground hover:text-warning"
                        title="Desativar pergunta"
                        aria-label={`Desativar ${q.key}`}
                      >
                        <EyeOff aria-hidden="true" />
                      </Button>
                      <Button variant="secondary" size="sm" className="ml-1" onClick={() => setEditing(q)}>
                        <Pencil aria-hidden="true" />
                        Editar
                      </Button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div className="mt-4 space-y-3 rounded-lg bg-muted p-4 sm:ml-9">
                      {q.showIf ? (
                        <div className="text-xs text-foreground/80">
                          <span className="font-semibold">Mostra quando:</span>{' '}
                          <code className="break-words rounded bg-card px-1.5 py-0.5 text-xs">{describeShowIf(q.showIf)}</code>
                          {q.showIfRepaired ? (
                            <span className="ml-2 text-destructive">
                              (regra padrão do código — a do banco está incompleta)
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {typeof q.min === 'number' || typeof q.max === 'number' || q.placeholder ? (
                        <div className="text-xs text-foreground/80">
                          <span className="font-semibold">Validação:</span>{' '}
                          {typeof q.min === 'number' && <>mín.: {q.min}; </>}
                          {typeof q.max === 'number' && <>máx.: {q.max}; </>}
                          {q.placeholder && <>placeholder: "{q.placeholder}"</>}
                        </div>
                      ) : null}

                      {q.options?.length ? (
                        <div>
                          <p className="mb-2 text-xs font-semibold text-foreground/80">Opções</p>
                          <div className="overflow-x-auto rounded-md border bg-card">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-muted text-foreground/80">
                                <tr>
                                  <th scope="col" className="px-3 py-1.5 font-medium">Chave</th>
                                  <th scope="col" className="px-3 py-1.5 font-medium">Texto</th>
                                  <th scope="col" className="px-3 py-1.5 text-right font-medium">Pontos</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {q.options.map((o) => (
                                  <tr key={o.key}>
                                    <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{o.key}</td>
                                    <td className="px-3 py-1.5 text-foreground">{o.label}</td>
                                    <td className="px-3 py-1.5 text-right">
                                      <Badge
                                        size="sm"
                                        className="font-mono"
                                        variant={o.score >= 15 ? 'success' : o.score >= 5 ? 'primary' : 'neutral'}
                                      >
                                        +{o.score}
                                      </Badge>
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

      {/* Editor de pergunta (painel) */}
      <QuizQuestionEditor
        mode={isCreating ? 'create' : editing ? 'edit' : undefined}
        question={editing}
        themes={formThemes}
        initialThemeCode={isCreating ? creatingThemeCode : undefined}
        allQuestions={questions}
        onClose={handleEditorClose}
      />

      {/* Editor de tema: montado só quando aberto; a key reinicia o formulário a cada tema. */}
      {(isCreatingTheme || editingTheme) && (
        <ThemeEditor
          key={isCreatingTheme ? 'new' : editingTheme?.id}
          theme={isCreatingTheme ? null : editingTheme}
          onClose={closeThemeEditor}
        />
      )}
    </div>
  )
}

// ─── Editor de tema ───────────────────────────────────────────────────────────

const DEFAULT_THEME_COLOR = '#3b62f6'
const DEFAULT_THEME_ICON = '❓'

/** Ícones gravados em form_themes.icon (dado do tema, escolhido pelo admin). */
const THEME_ICONS = [
  '🌍', '💼', '🏛️', '📋', '💰', '🏥', '🎓', '🏠', '⚖️', '🌐',
  '👨‍👩‍👧', '✈️', '📚', '🤝', '🎯', '🔑', '📝', '🏆', '💡', '❓',
]

/**
 * Código do tema a partir do que foi digitado: minúsculas, sem acento e só
 * `a-z`, `0-9` e `_` ("Situação Nova" → "situacao_nova").
 */
function toThemeCode(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
}

/** `theme` nulo = criar tema. O estado inicial vem das props (sem efeito de sincronização). */
function ThemeEditor({ theme, onClose }: { theme: FormTheme | null; onClose: () => void }) {
  const isCreating = theme === null
  const createThemeMutation = useCreateTheme()
  const updateThemeMutation = useUpdateTheme()

  const [code, setCode] = useState(theme?.code ?? '')
  const [namePt, setNamePt] = useState(theme?.name_pt ?? '')
  const [nameEn, setNameEn] = useState(theme?.name_en ?? '')
  const [color, setColor] = useState(theme?.color ?? DEFAULT_THEME_COLOR)
  const [icon, setIcon] = useState(theme?.icon ?? DEFAULT_THEME_ICON)

  const isPending = createThemeMutation.isPending || updateThemeMutation.isPending
  const canSave = namePt.trim().length > 0 && (!isCreating || code.trim().length > 0)

  const handleSave = () => {
    if (theme === null) {
      createThemeMutation.mutate(
        { code: code.trim(), name_pt: namePt.trim(), name_en: nameEn.trim() || null, color, icon },
        { onSuccess: onClose },
      )
    } else {
      updateThemeMutation.mutate(
        {
          originalCode: theme.code,
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
    <AdminDrawer
      open
      closeOnBack
      onOpenChange={(open) => {
        if (!open && !isPending) onClose()
      }}
      title={isCreating ? 'Novo tema' : 'Editar tema'}
      description={isCreating ? undefined : <span className="break-all font-mono">{theme.code}</span>}
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave} loading={isPending}>
            {!isPending && <Save aria-hidden="true" />}
            {isPending ? 'Salvando…' : isCreating ? 'Criar tema' : 'Salvar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 px-4 py-5 sm:px-6">
        {isCreating && (
          <Input
            label="Código (identificador)"
            required
            value={code}
            onChange={(e) => setCode(toThemeCode(e.target.value))}
            className="font-mono"
            placeholder="ex.: situacao_profissional"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nome (PT)"
            required
            value={namePt}
            onChange={(e) => setNamePt(e.target.value)}
            placeholder="Situação profissional"
          />
          <Input
            label="Nome (EN)"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            placeholder="Professional situation"
          />
        </div>

        <div>
          <label htmlFor="theme-color" className="mb-1.5 block text-sm font-medium text-foreground">
            Cor de destaque
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="theme-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-md border border-input bg-card p-0.5"
            />
            <span
              className={cn('max-w-full break-words rounded-full px-3 py-1 text-xs font-semibold', textClassOn(color))}
              style={{ backgroundColor: color }}
            >
              {namePt || 'Prévia'}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{color}</span>
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-foreground">
            Ícone atual: <span className="text-base">{icon}</span>
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {THEME_ICONS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIcon(i)}
                aria-pressed={i === icon}
                aria-label={`Usar o ícone ${i}`}
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-xl text-lg transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  i === icon ? 'bg-primary/[.08] ring-2 ring-primary' : 'hover:bg-muted',
                )}
              >
                {i}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </AdminDrawer>
  )
}
