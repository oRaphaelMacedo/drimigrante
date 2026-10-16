// useQuizQuestions.ts — fetches active quiz questions from Supabase
// (form_themes + form_questions + form_question_options) and shapes them
// into the QuizQuestion[] structure the UI already expects.
//
// Robustez (DI-005 / DI-066):
// - display_conditions incompletas no banco usam a regra do código para a
//   mesma key (src/lib/quiz-conditions.ts), com console.warn;
// - se a busca falhar, tenta de novo uma vez (500 ms) e depois usa as
//   perguntas do código, avisando o Sentry. O quiz nunca fica sem perguntas.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Sentry } from '@/lib/sentry'
import {
  QUIZ_QUESTIONS as FALLBACK_QUESTIONS,
  type QuizQuestion,
} from '@/data/quiz-questions'
import {
  mapQuizRows,
  type OptionRow,
  type QuestionRow,
  type ThemeRow,
} from '@/lib/quiz-conditions'

export const QUIZ_QUESTIONS_QUERY_KEY = ['quiz-questions', 'active'] as const
const ADMIN_QUERY_KEY = ['quiz-questions', 'admin'] as const

const RETRY_DELAY_MS = 500

// Avisa uma vez por key e por sessão, para não poluir o console a cada refetch.
const warnedKeys = new Set<string>()
function warnInvalidCondition(questionKey: string, reason: string, repairedFromCode: boolean) {
  if (warnedKeys.has(questionKey)) return
  warnedKeys.add(questionKey)
  console.warn(
    `[quiz] display_conditions incompleta em "${questionKey}" (${reason}); ` +
      (repairedFromCode ? 'usando a regra do código.' : 'pergunta oculta (sem regra no código).'),
  )
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

  return mapQuizRows(
    themes as unknown as ThemeRow[],
    questions as unknown as QuestionRow[],
    (options ?? []) as unknown as OptionRow[],
    { fallbackQuestions: FALLBACK_QUESTIONS, onInvalidCondition: warnInvalidCondition },
  )
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Busca com 1 nova tentativa; se ainda falhar, devolve as perguntas do código. */
export async function fetchQuizWithFallback(): Promise<QuizQuestion[]> {
  try {
    return await fetchQuiz()
  } catch {
    await sleep(RETRY_DELAY_MS)
    try {
      return await fetchQuiz()
    } catch (err) {
      console.warn('[quiz] Falha ao carregar as perguntas do banco; usando as perguntas do código.', err)
      Sentry.captureException(err, { tags: { area: 'quiz', fallback: 'hardcoded_questions' } })
      return FALLBACK_QUESTIONS
    }
  }
}

/** Perguntas do quiz público: nunca entra em estado de erro nem fica vazio. */
export function useQuizQuestions() {
  return useQuery({
    queryKey: QUIZ_QUESTIONS_QUERY_KEY,
    queryFn: fetchQuizWithFallback,
    staleTime: 5 * 60 * 1000, // 5 min — quiz changes rarely
    placeholderData: FALLBACK_QUESTIONS, // serve hardcoded immediately, swap to DB
    retry: false, // a nova tentativa já acontece dentro do queryFn
  })
}

/**
 * Perguntas para o admin: só dados do banco (sem perguntas do código como
 * substituto), com erro visível. Condições incompletas aparecem já resolvidas
 * e marcadas com `showIfRepaired` para o admin corrigir.
 */
export function useQuizQuestionsAdmin() {
  return useQuery({
    queryKey: ADMIN_QUERY_KEY,
    queryFn: fetchQuiz,
    staleTime: 30 * 1000,
    retry: 1,
  })
}

// Synchronous accessor for places that can't easily use the hook (e.g. score
// computation from the persisted answers object). Reads from React Query cache
// if a request finished, else falls back to hardcoded.
export function getQuizQuestionsSync(client: { getQueryData: <T>(key: readonly unknown[]) => T | undefined }) {
  const cached = client.getQueryData<QuizQuestion[]>(QUIZ_QUESTIONS_QUERY_KEY)
  return cached ?? FALLBACK_QUESTIONS
}
