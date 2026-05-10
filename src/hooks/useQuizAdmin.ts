// useQuizAdmin.ts — mutations for editing the quiz (Phase 3+4)
// Wraps Supabase writes to form_themes / form_questions / form_question_options
// + the snapshot_quiz_version RPC, all gated by RLS to hub admins.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { QuizQuestion, FieldType } from '@/data/quiz-questions'

export interface QuestionUpdate {
  question_text_pt?: string
  question_text_en?: string | null
  help_text?: string | null
  field_type?: FieldType
  is_required?: boolean
  placeholder?: string | null
  validation_rules?: { min?: number; max?: number } | null
  display_conditions?: { question_key: string; answer_key: string | string[] } | null
  is_active?: boolean
  sort_order?: number
  theme_id?: string
}

export interface OptionInput {
  option_key: string
  option_text_pt: string
  option_text_en?: string | null
  score: number
  is_eliminatory?: boolean
  sort_order?: number
}

export interface ThemeInput {
  code: string
  name_pt: string
  name_en?: string | null
  color?: string | null
  icon?: string | null
  sort_order?: number
}

async function snapshotBefore(label: string) {
  // Best-effort: never block the edit if snapshot fails.
  // RPC name not yet in generated types — cast through any.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('snapshot_quiz_version', { p_label: label })
    if (error) console.warn('[snapshot] failed:', error.message)
  } catch (err) {
    console.warn('[snapshot] exception:', err)
  }
}

async function getQuestionIdByKey(questionKey: string): Promise<string> {
  const { data, error } = await supabase
    .from('form_questions')
    .select('id')
    .eq('question_key', questionKey)
    .single()
  if (error) throw error
  if (!data) throw new Error(`Question ${questionKey} not found`)
  return data.id
}

export function useUpdateQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      questionKey,
      updates,
      options,
    }: {
      questionKey: string
      updates: QuestionUpdate
      options?: OptionInput[]
    }) => {
      await snapshotBefore(`Edit ${questionKey}`)

      const questionId = await getQuestionIdByKey(questionKey)

      const { error: updErr } = await supabase
        .from('form_questions')
        .update(updates)
        .eq('id', questionId)
      if (updErr) throw updErr

      if (options) {
        // Wipe existing options and re-insert (simple, deterministic)
        const { error: delErr } = await supabase
          .from('form_question_options')
          .delete()
          .eq('question_id', questionId)
        if (delErr) throw delErr

        if (options.length > 0) {
          const rows = options.map((o, i) => ({
            question_id: questionId,
            option_key: o.option_key,
            option_text_pt: o.option_text_pt,
            score: o.score,
            is_eliminatory: o.is_eliminatory ?? false,
            sort_order: o.sort_order ?? i,
          }))
          const { error: insErr } = await supabase.from('form_question_options').insert(rows)
          if (insErr) throw insErr
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
      qc.invalidateQueries({ queryKey: ['quiz-versions'] })
      toast.success('Pergunta actualizada')
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })
}

export function useToggleQuestionActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ questionKey, isActive }: { questionKey: string; isActive: boolean }) => {
      await snapshotBefore(`${isActive ? 'Restore' : 'Disable'} ${questionKey}`)
      const id = await getQuestionIdByKey(questionKey)
      const { error } = await supabase
        .from('form_questions')
        .update({ is_active: isActive })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
      qc.invalidateQueries({ queryKey: ['quiz-versions'] })
      toast.success(vars.isActive ? 'Pergunta reactivada' : 'Pergunta desactivada')
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })
}

export function useCreateQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      themeId,
      question,
      options,
    }: {
      themeId: string
      question: {
        question_key: string
        question_text_pt: string
        question_text_en?: string | null
        help_text?: string | null
        field_type: FieldType
        is_required: boolean
        placeholder?: string | null
        validation_rules?: { min?: number; max?: number } | null
        display_conditions?: { question_key: string; answer_key: string | string[] } | null
      }
      options?: OptionInput[]
    }) => {
      await snapshotBefore(`Create ${question.question_key}`)

      // Determine sort_order — append at end of theme
      const { data: existing } = await supabase
        .from('form_questions')
        .select('sort_order')
        .eq('theme_id', themeId)
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

      const { data: inserted, error: insErr } = await supabase
        .from('form_questions')
        .insert({
          theme_id: themeId,
          ...question,
          sort_order: nextOrder,
          is_active: true,
        })
        .select('id')
        .single()
      if (insErr) throw insErr

      if (options?.length) {
        const rows = options.map((o, i) => ({
          question_id: inserted!.id,
          option_key: o.option_key,
          option_text_pt: o.option_text_pt,
          option_text_en: o.option_text_en ?? null,
          score: o.score,
          is_eliminatory: o.is_eliminatory ?? false,
          sort_order: o.sort_order ?? i,
        }))
        const { error } = await supabase.from('form_question_options').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
      qc.invalidateQueries({ queryKey: ['quiz-versions'] })
      toast.success('Pergunta criada')
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })
}

export function useMoveQuestionToTheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      questionKey,
      newThemeCode,
    }: {
      questionKey: string
      newThemeCode: string
    }) => {
      await snapshotBefore(`Move ${questionKey} → ${newThemeCode}`)

      const [{ data: theme, error: tErr }, qid] = await Promise.all([
        supabase.from('form_themes').select('id').eq('code', newThemeCode).single(),
        getQuestionIdByKey(questionKey),
      ])
      if (tErr) throw tErr

      // Append at end of new theme
      const { data: tail } = await supabase
        .from('form_questions')
        .select('sort_order')
        .eq('theme_id', theme!.id)
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextOrder = (tail?.[0]?.sort_order ?? -1) + 1

      const { error } = await supabase
        .from('form_questions')
        .update({ theme_id: theme!.id, sort_order: nextOrder })
        .eq('id', qid)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
      qc.invalidateQueries({ queryKey: ['quiz-versions'] })
      toast.success('Pergunta movida')
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })
}

// ─── Themes CRUD ────────────────────────────────────────────────────────────

export function useCreateTheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ThemeInput) => {
      await snapshotBefore(`Create theme ${input.code}`)
      // Append at end
      const { data: tail } = await supabase
        .from('form_themes')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
      const nextOrder = input.sort_order ?? (tail?.[0]?.sort_order ?? -1) + 1
      const { error } = await supabase.from('form_themes').insert({
        code: input.code,
        name_pt: input.name_pt,
        name_en: input.name_en ?? null,
        color: input.color ?? '#3b62f6',
        icon: input.icon ?? '❓',
        sort_order: nextOrder,
        is_active: true,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
      qc.invalidateQueries({ queryKey: ['quiz-versions'] })
      qc.invalidateQueries({ queryKey: ['form-themes'] })
      toast.success('Tema criado')
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })
}

export function useUpdateTheme() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ originalCode, patch }: { originalCode: string; patch: Partial<ThemeInput> }) => {
      await snapshotBefore(`Edit theme ${originalCode}`)
      const { error } = await supabase
        .from('form_themes')
        .update({
          ...(patch.code !== undefined && { code: patch.code }),
          ...(patch.name_pt !== undefined && { name_pt: patch.name_pt }),
          ...(patch.name_en !== undefined && { name_en: patch.name_en }),
          ...(patch.color !== undefined && { color: patch.color }),
          ...(patch.icon !== undefined && { icon: patch.icon }),
        })
        .eq('code', originalCode)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
      qc.invalidateQueries({ queryKey: ['quiz-versions'] })
      qc.invalidateQueries({ queryKey: ['form-themes'] })
      toast.success('Tema actualizado')
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })
}

export function useReorderQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      questionKey,
      direction,
      questions,
    }: {
      questionKey: string
      direction: 'up' | 'down'
      questions: QuizQuestion[]
    }) => {
      const sameTheme = questions.filter((q) => q.themeCode === questions.find((qq) => qq.key === questionKey)?.themeCode)
      const idx = sameTheme.findIndex((q) => q.key === questionKey)
      if (idx === -1) throw new Error('Question not found in theme')
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= sameTheme.length) return // boundary

      await snapshotBefore(`Reorder ${questionKey}`)

      const a = sameTheme[idx]
      const b = sameTheme[swapIdx]
      const aId = await getQuestionIdByKey(a.key)
      const bId = await getQuestionIdByKey(b.key)

      // Read current sort_order values from DB
      const { data: rows, error: fetchErr } = await supabase
        .from('form_questions')
        .select('id, sort_order')
        .in('id', [aId, bId])
      if (fetchErr) throw fetchErr
      const aRow = rows.find((r) => r.id === aId)!
      const bRow = rows.find((r) => r.id === bId)!

      // Swap
      const { error: e1 } = await supabase.from('form_questions').update({ sort_order: bRow.sort_order }).eq('id', aId)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('form_questions').update({ sort_order: aRow.sort_order }).eq('id', bId)
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  })
}

// ─── Form Themes Query ──────────────────────────────────────────────────────

export interface FormTheme {
  id: string
  code: string
  name_pt: string
  name_en: string | null
  color: string | null
  icon: string | null
  sort_order: number
  is_active: boolean
}

export function useFormThemes() {
  return useQuery({
    queryKey: ['form-themes'],
    queryFn: async (): Promise<FormTheme[]> => {
      const { data, error } = await supabase
        .from('form_themes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as FormTheme[]
    },
  })
}

// ─── Versions ───────────────────────────────────────────────────────────────

export interface QuizVersion {
  id: string
  version_number: number
  name: string | null
  description: string | null
  is_active: boolean
  published_at: string | null
  published_by: string | null
  created_at: string
}

export function useQuizVersions() {
  return useQuery({
    queryKey: ['quiz-versions'],
    queryFn: async (): Promise<QuizVersion[]> => {
      const { data, error } = await supabase
        .from('form_versions')
        .select('id, version_number, name, description, is_active, published_at, published_by, created_at')
        .order('version_number', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as QuizVersion[]
    },
  })
}

export function useRestoreVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (versionId: string) => {
      // Read snapshot
      const { data: ver, error: vErr } = await supabase
        .from('form_versions')
        .select('schema_snapshot, version_number')
        .eq('id', versionId)
        .single()
      if (vErr) throw vErr
      if (!ver?.schema_snapshot) throw new Error('Versão sem snapshot')

      const snap = ver.schema_snapshot as { themes: any[]; questions: any[]; options: any[] }

      // Snapshot the current state first (so the restore is reversible)
      await snapshotBefore(`Before restore to v${ver.version_number}`)

      // Wipe + re-seed (safe because we snapshotted)
      const { error: e1 } = await supabase.from('form_question_options').delete().not('id', 'is', null)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('form_questions').delete().not('id', 'is', null)
      if (e2) throw e2
      const { error: e3 } = await supabase.from('form_themes').delete().not('id', 'is', null)
      if (e3) throw e3

      // Re-insert themes (preserve UUIDs so question.theme_id keeps working)
      if (snap.themes?.length) {
        const { error } = await supabase.from('form_themes').insert(snap.themes)
        if (error) throw error
      }
      if (snap.questions?.length) {
        const { error } = await supabase.from('form_questions').insert(snap.questions)
        if (error) throw error
      }
      if (snap.options?.length) {
        const { error } = await supabase.from('form_question_options').insert(snap.options)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quiz-questions'] })
      qc.invalidateQueries({ queryKey: ['quiz-versions'] })
      toast.success('Versão restaurada')
    },
    onError: (err: Error) => toast.error(`Erro a restaurar: ${err.message}`),
  })
}
