// quiz-flow.ts — regras puras do fluxo do quiz (etapas, retomada e progresso).
//
// Sem React nem acesso a window: usado pelo useQuiz e testado em
// src/lib/quiz-flow.test.ts. Cobre:
//   - etapa atual ↔ parâmetro ?passo= da URL (voltar/avançar do sistema, DI-041);
//   - para onde vai o "Próximo" e quando ele vira "Ver meu resultado" (DI-040);
//   - onde a pessoa retoma o quiz (DI-041);
//   - progresso honesto: sem total antes de saber o caso (DI-040).
import { getVisibleQuestions, type QuizQuestion } from '@/data/quiz-questions'

/** Pergunta de roteamento: só "nacionalidade" segue para o diagnóstico. */
export const PROCESS_KEY = 'processo_tipo'
export const NATIONALITY_ANSWER = 'nacionalidade'
/** Pergunta que define o ramo (casos A–F); antes dela o total é desconhecido. */
export const CASE_KEY = 'caso_tipo'

/** Parâmetro da URL com a etapa atual. */
export const STEP_PARAM = 'passo'
/** Valor de ?passo= e de session.currentKey para a tela de contato. */
export const CAPTURE_STEP = 'contato'
/** Valor de ?passo= para a tela "em breve". */
export const COMING_SOON_STEP = 'em-breve'

export type QuizStep =
  | { kind: 'intro' }
  | { kind: 'question'; index: number }
  | { kind: 'capture' }
  | { kind: 'comingsoon' }

export type Answers = Record<string, string>

export function isAnswered(question: Pick<QuizQuestion, 'key'>, answers: Answers): boolean {
  const value = answers[question.key]
  return typeof value === 'string' && value.trim() !== ''
}

/** Índice da primeira pergunta obrigatória sem resposta (ou -1). */
export function firstBlockingIndex(visible: QuizQuestion[], answers: Answers): number {
  return visible.findIndex((q) => q.isRequired && !isAnswered(q, answers))
}

/** true quando a resposta da pergunta de roteamento leva à tela "em breve". */
export function routesToComingSoon(answers: Answers): boolean {
  const value = answers[PROCESS_KEY]
  return typeof value === 'string' && value !== '' && value !== NATIONALITY_ANSWER
}

// ─── ?passo= ────────────────────────────────────────────────────────────────

/** Valor de ?passo= para a etapa (null = intro, sem parâmetro). Perguntas usam 1, 2, 3… */
export function formatStepParam(step: QuizStep): string | null {
  switch (step.kind) {
    case 'question':
      return String(step.index + 1)
    case 'capture':
      return CAPTURE_STEP
    case 'comingsoon':
      return COMING_SOON_STEP
    default:
      return null
  }
}

/** Lê ?passo=. Valor ausente ou desconhecido = intro. */
export function parseStepParam(value: string | null | undefined): QuizStep {
  if (!value) return { kind: 'intro' }
  if (value === CAPTURE_STEP) return { kind: 'capture' }
  if (value === COMING_SOON_STEP) return { kind: 'comingsoon' }
  if (/^\d{1,3}$/.test(value)) {
    const n = Number(value)
    if (n >= 1) return { kind: 'question', index: n - 1 }
  }
  return { kind: 'intro' }
}

export function sameStep(a: QuizStep, b: QuizStep): boolean {
  if (a.kind !== b.kind) return false
  return a.kind !== 'question' || a.index === (b as { index: number }).index
}

/**
 * Ajusta uma etapa pedida (pela URL, pelo voltar/avançar do sistema ou pela
 * retomada) ao que as respostas permitem: nunca pula uma pergunta obrigatória
 * sem resposta, nunca passa da pergunta de roteamento quando o destino é
 * "em breve" e nunca chega à captura com perguntas pendentes.
 */
export function clampStep(step: QuizStep, visible: QuizQuestion[], answers: Answers): QuizStep {
  if (step.kind === 'intro') return step
  if (visible.length === 0) return { kind: 'intro' }

  const blocking = firstBlockingIndex(visible, answers)
  const processIndex = visible.findIndex((q) => q.key === PROCESS_KEY)
  const gate = processIndex >= 0 && routesToComingSoon(answers) ? processIndex : -1

  if (step.kind === 'comingsoon') {
    if (gate >= 0) return step
    return { kind: 'question', index: blocking >= 0 ? blocking : 0 }
  }

  if (step.kind === 'capture') {
    if (gate >= 0) return { kind: 'question', index: gate }
    if (blocking >= 0) return { kind: 'question', index: blocking }
    return step
  }

  let index = Math.min(Math.max(step.index, 0), visible.length - 1)
  if (blocking >= 0 && blocking < index) index = blocking
  if (gate >= 0 && gate < index) index = gate
  return { kind: 'question', index }
}

/**
 * Para onde o "Próximo" leva a partir da pergunta `currentKey`, com as
 * respostas atuais: a próxima pergunta visível, a captura (não há mais
 * perguntas) ou "em breve" (objetivo diferente de nacionalidade).
 */
export function nextStepAfter(
  answers: Answers,
  questions: QuizQuestion[],
  currentKey: string,
): QuizStep {
  if (currentKey === PROCESS_KEY && routesToComingSoon(answers)) {
    return { kind: 'comingsoon' }
  }
  const visible = getVisibleQuestions(answers, questions)
  const index = visible.findIndex((q) => q.key === currentKey)
  if (index >= 0 && index < visible.length - 1) return { kind: 'question', index: index + 1 }
  return { kind: 'capture' }
}

// ─── Retomada ───────────────────────────────────────────────────────────────

/**
 * Etapa em que a pessoa retoma: a pergunta onde parou (`currentKey`) ou a
 * captura, ajustada por clampStep. Se a pergunta guardada não estiver mais
 * visível (perguntas mudaram), vai para a primeira pendente ou para a última.
 */
export function resolveResumeStep(
  answers: Answers,
  visible: QuizQuestion[],
  currentKey: string | null | undefined,
): QuizStep {
  if (visible.length === 0) return { kind: 'intro' }
  if (currentKey === CAPTURE_STEP) return clampStep({ kind: 'capture' }, visible, answers)
  const index = currentKey ? visible.findIndex((q) => q.key === currentKey) : -1
  if (index >= 0) return clampStep({ kind: 'question', index }, visible, answers)
  const blocking = firstBlockingIndex(visible, answers)
  return clampStep({ kind: 'question', index: blocking >= 0 ? blocking : visible.length - 1 }, visible, answers)
}

export function countAnswered(visible: QuizQuestion[], answers: Answers): number {
  return visible.filter((q) => isAnswered(q, answers)).length
}

// ─── Progresso ──────────────────────────────────────────────────────────────

/**
 * O total de perguntas só é conhecido quando as perguntas de roteamento
 * (objetivo e caso) estão visíveis e respondidas. Antes disso, "Pergunta 1 de 1"
 * seria falso: depois do caso aparecem as perguntas do ramo.
 */
export function isTotalKnown(visible: QuizQuestion[], answers: Answers, questions: QuizQuestion[]): boolean {
  const routingKeys = [PROCESS_KEY, CASE_KEY].filter((key) => questions.some((q) => q.key === key))
  return routingKeys.every((key) => {
    const question = visible.find((q) => q.key === key)
    return question ? isAnswered(question, answers) : false
  })
}

export interface QuizProgressInfo {
  /** Posição da pergunta atual (1 = primeira). */
  position: number
  /** Total de perguntas visíveis, ou null enquanto o ramo não é conhecido. */
  total: number | null
  /** Perguntas visíveis já respondidas. */
  answered: number
  /** Respondidas ÷ visíveis (0–100), ou null enquanto o total não é conhecido. */
  percentage: number | null
}

export function computeProgress(
  answers: Answers,
  visible: QuizQuestion[],
  currentIndex: number,
  questions: QuizQuestion[],
): QuizProgressInfo {
  const answered = countAnswered(visible, answers)
  const total = visible.length > 0 && isTotalKnown(visible, answers, questions) ? visible.length : null
  return {
    position: Math.max(1, currentIndex + 1),
    total,
    answered,
    percentage: total ? Math.min(100, Math.round((answered / total) * 100)) : null,
  }
}

export interface ThemeProgress {
  code: string
  name: string
  total: number
  answered: number
}

/** Temas das perguntas visíveis, na ordem em que aparecem, com quantas foram respondidas. */
export function computeThemeProgress(visible: QuizQuestion[], answers: Answers): ThemeProgress[] {
  const themes: ThemeProgress[] = []
  for (const q of visible) {
    let theme = themes.find((t) => t.code === q.themeCode)
    if (!theme) {
      theme = { code: q.themeCode, name: q.themeName, total: 0, answered: 0 }
      themes.push(theme)
    }
    theme.total += 1
    if (isAnswered(q, answers)) theme.answered += 1
  }
  return themes
}

// ─── Envio ──────────────────────────────────────────────────────────────────

export type TimeoutResult<T> = { timedOut: false; value: T } | { timedOut: true }

/**
 * Espera `promise` por até `ms`. Não cancela a promessa: quem chamou ainda pode
 * aproveitar o resultado tardio (ex.: o assessment gravado depois do timeout).
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<TimeoutResult<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, ms))
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve({ timedOut: false, value })
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/**
 * Erro do upsert_anon_assessment quando o assessment desta sessão já foi
 * vinculado a uma conta (ERRCODE 42501). Nesse caso o quiz precisa de um
 * session_id novo — reaproveitar o antigo deixa o paywall em loop.
 */
export function isLinkedSessionError(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'object') {
    const e = error as { code?: unknown; message?: unknown }
    if (e.code === '42501') return true
    return typeof e.message === 'string' && isLinkedSessionError(e.message)
  }
  return typeof error === 'string' && (/already linked/i.test(error) || /\b42501\b/.test(error))
}
