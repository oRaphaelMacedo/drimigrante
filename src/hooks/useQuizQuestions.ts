// useQuizQuestions.ts — fetches active quiz questions from Supabase
// (form_themes + form_questions + form_question_options) and shapes them
// into the QuizQuestion[] structure the UI already expects.
// Falls back to the hardcoded QUIZ_QUESTIONS when DB is unreachable.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  QUIZ_QUESTIONS as FALLBACK_QUESTIONS,
  type QuizQuestion,
  type FieldType,
} from '@/data/quiz-questions'

interface ThemeRow {
  id: string
  code: string
  name_pt: string
  color: string | null
  icon: string | null
  sort_order: number
}

interface QuestionRow {
  id: string
  theme_id: string
  question_key: string
  question_text_pt: string
  question_text_en: string | null
  help_text: string | null
  field_type: FieldType
  display_conditions: { question_key: string; answer_key: string | string[] } | null
  validation_rules: { min?: number; max?: number } | null
  placeholder: string | null
  is_required: boolean
  sort_order: number
}

interface OptionRow {
  id: string
  question_id: string
  option_key: string
  option_text_pt: string
  option_text_en: string | null
  score: number
  is_eliminatory: boolean
  sort_order: number
}

async function fetchQuiz(): Promise<QuizQuestion[]> {
  const [{ data: themes, error: errT }, { data: questions, error: errQ }, { data: options, error: errO }] =
    await Promise.all([
      supabase.from('form_themes').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('form_questions').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('form_question_options').select('*').eq('is_active', true).order('sort_order'),
    ])

  if (errT) throw errT
  if (errQ) throw errQ
  if (errO) throw errO
  if (!themes?.length || !questions?.length) {
    throw new Error('Quiz tables are empty — falling back to hardcoded data')
  }

  const themeById = new Map<string, ThemeRow>(
    (themes as ThemeRow[]).map((t) => [t.id, t]),
  )
  const optionsByQ = new Map<string, OptionRow[]>()
  ;(options as OptionRow[]).forEach((o) => {
    const list = optionsByQ.get(o.question_id) ?? []
    list.push(o)
    optionsByQ.set(o.question_id, list)
  })

  return (questions as QuestionRow[]).map<QuizQuestion>((q) => {
    const theme = themeById.get(q.theme_id)
    const opts = optionsByQ.get(q.id) ?? []
    return {
      key: q.question_key,
      themeCode: theme?.code ?? 'unknown',
      themeName: theme?.name_pt ?? '—',
      themeColor: theme?.color ?? '#3b62f6',
      themeIcon: theme?.icon ?? '❓',
      text: q.question_text_pt,
      textEn: q.question_text_en ?? undefined,
      helpText: q.help_text ?? undefined,
      fieldType: q.field_type,
      isRequired: q.is_required,
      placeholder: q.placeholder ?? undefined,
      min: q.validation_rules?.min,
      max: q.validation_rules?.max,
      showIf: q.display_conditions
        ? {
            questionKey: q.display_conditions.question_key,
            answerKey: q.display_conditions.answer_key,
          }
        : undefined,
      options: opts.length
        ? opts.map((o) => ({
            key: o.option_key,
            label: o.option_text_pt,
            labelEn: o.option_text_en ?? undefined,
            score: o.score,
            isEliminatory: o.is_eliminatory,
          }))
        : undefined,
    }
  })
}

export function useQuizQuestions() {
  return useQuery({
    queryKey: ['quiz-questions', 'active'],
    queryFn: fetchQuiz,
    staleTime: 5 * 60 * 1000, // 5 min — quiz changes rarely
    placeholderData: FALLBACK_QUESTIONS, // serve hardcoded immediately, swap to DB
  })
}

// Synchronous accessor for places that can't easily use the hook (e.g. score
// computation from the persisted answers object). Reads from React Query cache
// if a request finished, else falls back to hardcoded.
export function getQuizQuestionsSync(client: { getQueryData: <T>(key: unknown[]) => T | undefined }) {
  const cached = client.getQueryData<QuizQuestion[]>(['quiz-questions', 'active'])
  return cached ?? FALLBACK_QUESTIONS
}
