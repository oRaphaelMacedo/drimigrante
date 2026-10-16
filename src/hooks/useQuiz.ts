// useQuiz.ts — máquina de estados do quiz: navegação, retomada, envio e eventos.
//
// - Estado e retomada (DI-041): a sessão guarda respostas + onde a pessoa parou
//   (useQuizPersistence); a etapa fica em ?passo= para o voltar/avançar do
//   sistema funcionar entre perguntas.
// - Envio (DI-042): só respostas visíveis (pruneAnswers); persistência e
//   compute-eligibility com timeout; a análise de IA não segura a navegação.
// - Eventos por etapa (DI-068): sempre via track()/trackOnce(), sem PII.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  computeScore,
  getVisibleQuestions,
  pruneAnswers,
  suggestVisas,
  type QuizQuestion,
  type ScoreResult,
  type VisaSuggestion,
} from '@/data/quiz-questions'
import { persistAssessment, type PersistAssessmentParams } from '@/hooks/useAssessment'
import { readStoredQuizSession, useQuizPersistence, type QuizSession } from './useQuizPersistence'
import { useQuizState, type QuizFlowState, type ResumeStep } from './useQuizState'
import { useQuizQuestions } from './useQuizQuestions'
import { supabase } from '@/lib/supabase'
import { Sentry } from '@/lib/sentry'
import { getAttribution } from '@/lib/attribution'
import { track, trackOnce } from '@/lib/analytics'
import {
  answersKey,
  createSessionId,
  pickSubmissionSessionId,
  QUIZ_RESULT_KEY,
  readSubmittedSessions,
  rememberSubmission,
} from '@/lib/quiz-submission'
import {
  CAPTURE_STEP,
  CASE_KEY,
  COMING_SOON_STEP,
  PROCESS_KEY,
  STEP_PARAM,
  clampStep,
  computeProgress,
  computeThemeProgress,
  countAnswered,
  formatStepParam,
  isAnswered,
  isLinkedSessionError,
  nextStepAfter,
  parseStepParam,
  resolveResumeStep,
  sameStep,
  withTimeout,
  type QuizStep,
} from '@/lib/quiz-flow'

/** Tempo máximo para gravar o assessment (RPC). */
const PERSIST_TIMEOUT_MS = 8000
/** Tempo máximo esperando o compute-eligibility antes de abrir o resultado. */
const ELIGIBILITY_TIMEOUT_MS = 8000
/** Teto do processamento inteiro: com functions lentas, /results abre em até ~9s. */
const PROCESSING_BUDGET_MS = 9000
/** Tempo mínimo da tela "Analisando…" (evita um piscar de tela). */
const MIN_PROCESSING_MS = 1200
/** /quiz?novo=1 começa uma sessão nova (ex.: "Refazer o quiz" no resultado). */
export const RESTART_PARAM = 'novo'
/** Marca da intro em history.state (a intro não tem ?passo=). */
const INTRO_MARK = 'intro'

// Atribuição (UTMs) — contrato com o W1-07: src/lib/attribution.ts exporta
// getAttribution(): { utm_source?, utm_medium?, utm_campaign? } (first-touch).
// Se ele não trouxer nada, cai para as UTMs da URL atual.
interface Attribution {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
}

function readAttribution(): Attribution {
  const params = new URLSearchParams(window.location.search)
  const fromUrl: Attribution = {
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
  }
  let stored: Attribution = {}
  try {
    stored = getAttribution()
  } catch {
    stored = {}
  }
  return {
    utm_source: stored.utm_source || fromUrl.utm_source || null,
    utm_medium: stored.utm_medium || fromUrl.utm_medium || null,
    utm_campaign: stored.utm_campaign || fromUrl.utm_campaign || null,
  }
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export type QuizState = QuizFlowState
export type { QuizSession }

export interface QuizResult {
  score: ScoreResult
  visas: VisaSuggestion[]
  leadInfo: LeadInfo | null
}

export interface LeadInfo {
  fullName: string
  email: string
  phone?: string
}

/**
 * O que o botão principal da pergunta faz agora (define o rótulo):
 * próxima pergunta, resultado (não há mais perguntas), "em breve", ou pular
 * uma pergunta opcional sem resposta (para outra pergunta ou para o resultado).
 */
export type QuizNextAction = 'next' | 'results' | 'continue' | 'skip' | 'skip_results'

// ─── Eventos de etapa (uma vez por pergunta e sessão) ───────────────────────

/** Eventos de etapa já enviados nesta aba: sobrevive ao recarregar a página. */
const STEP_EVENTS_KEY = 'dr_imigrante_quiz_step_events'
const MAX_STEP_EVENTS = 200

function tabStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function loadStepEvents(sessionId: string): Set<string> {
  try {
    const raw = tabStorage()?.getItem(STEP_EVENTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      const { sessionId: storedId, ids } = parsed as { sessionId?: unknown; ids?: unknown }
      if (storedId === sessionId && Array.isArray(ids)) {
        return new Set(ids.filter((id): id is string => typeof id === 'string'))
      }
    }
  } catch {
    // JSON inválido ou storage bloqueado: começa do zero.
  }
  return new Set()
}

function saveStepEvents(sessionId: string, ids: Set<string>): void {
  try {
    tabStorage()?.setItem(STEP_EVENTS_KEY, JSON.stringify({ sessionId, ids: [...ids].slice(-MAX_STEP_EVENTS) }))
  } catch {
    // storage indisponível: a deduplicação fica só na memória da página.
  }
}

/** Estado guardado em history.state a cada etapa empurrada. */
interface QuizHistoryState {
  /** Etapa da entrada logo abaixo no histórico (valor de ?passo= ou 'intro'). */
  quizPrev?: string
}

function stepFromState(quizState: QuizFlowState, currentIndex: number): QuizStep {
  switch (quizState) {
    case 'question':
      return { kind: 'question', index: currentIndex }
    case 'capture':
      return { kind: 'capture' }
    case 'comingsoon':
      return { kind: 'comingsoon' }
    default:
      return { kind: 'intro' }
  }
}

/** Ordem das etapas, para saber se uma navegação foi para trás. */
function stepRank(step: QuizStep): number {
  switch (step.kind) {
    case 'intro':
      return -1
    case 'question':
      return step.index
    case 'comingsoon':
      return 0.5
    default:
      return Number.MAX_SAFE_INTEGER
  }
}

function stepEventKey(step: QuizStep, visible: QuizQuestion[]): string {
  if (step.kind === 'question') return visible[step.index]?.key ?? String(step.index)
  if (step.kind === 'capture') return CAPTURE_STEP
  if (step.kind === 'comingsoon') return COMING_SOON_STEP
  return INTRO_MARK
}

// ─── Envio ──────────────────────────────────────────────────────────────────

type PersistOutcome =
  | { kind: 'ok'; assessmentId: string }
  | { kind: 'failed'; error: string | null }
  /** Passou do tempo; `late` ainda entrega o id se a gravação terminar depois. */
  | { kind: 'timeout'; late: Promise<string | null> }

async function persistWithTimeout(params: PersistAssessmentParams): Promise<PersistOutcome> {
  const attempt = persistAssessment(params).catch((err: unknown) => ({
    assessment: null,
    error: err instanceof Error ? err.message : String(err),
  }))
  const raced = await withTimeout(attempt, PERSIST_TIMEOUT_MS)
  if (raced.timedOut) {
    return { kind: 'timeout', late: attempt.then((r) => r.assessment?.id ?? null) }
  }
  const id = raced.value.assessment?.id
  return id ? { kind: 'ok', assessmentId: id } : { kind: 'failed', error: raced.value.error }
}

/**
 * compute-eligibility (grava assessment_results) e, quando ele termina bem, a
 * análise de IA — sem await: a pessoa não espera a OpenAI para ver o resultado.
 * Devolve a promessa do compute-eligibility (nunca rejeita).
 */
function startEligibility(assessmentId: string, sessionId: string): Promise<boolean> {
  // session_id prova a posse do assessment anônimo (DI-004).
  const body = { assessment_id: assessmentId, session_id: sessionId }
  const computed = supabase.functions
    .invoke('compute-eligibility', { body })
    .then(({ error }) => {
      if (!error) return true
      console.warn('[useQuiz] compute-eligibility falhou:', error)
      Sentry.captureException(error, { tags: { area: 'quiz', step: 'compute-eligibility' } })
      return false
    })
    .catch((err: unknown) => {
      console.warn('[useQuiz] compute-eligibility falhou:', err)
      Sentry.captureException(err, { tags: { area: 'quiz', step: 'compute-eligibility' } })
      return false
    })

  void computed
    .then(async (ok) => {
      if (!ok) return
      const { error } = await supabase.functions.invoke('generate-explanation', { body })
      if (error) Sentry.captureException(error, { tags: { area: 'quiz', step: 'generate-explanation' } })
    })
    .catch((err: unknown) => {
      Sentry.captureException(err, { tags: { area: 'quiz', step: 'generate-explanation' } })
    })

  return computed
}

interface StoredResultIdentity {
  sessionId?: unknown
  assessmentId?: unknown
}

function readStoredResult(storage: Storage | null): (StoredResultIdentity & Record<string, unknown>) | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(QUIZ_RESULT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as StoredResultIdentity & Record<string, unknown>) : null
  } catch {
    return null
  }
}

function writeStoredResult(storage: Storage | null, value: Record<string, unknown>): void {
  if (!storage) return
  try {
    storage.setItem(QUIZ_RESULT_KEY, JSON.stringify(value))
  } catch {
    // storage indisponível: o resultado segue pelo state da navegação.
  }
}

/** assessmentId já guardado para este mesmo session_id (reenvio). */
function previousAssessmentId(storage: Storage | null, sessionId: string): string | null {
  const stored = readStoredResult(storage)
  if (!stored || stored.sessionId !== sessionId) return null
  return typeof stored.assessmentId === 'string' && stored.assessmentId !== '' ? stored.assessmentId : null
}

/** Completa o resultado guardado com o assessmentId que chegou depois do timeout. */
function patchStoredAssessmentId(storage: Storage | null, sessionId: string, assessmentId: string): void {
  const stored = readStoredResult(storage)
  if (!stored || stored.sessionId !== sessionId || stored.assessmentId) return
  writeStoredResult(storage, { ...stored, assessmentId })
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useQuiz() {
  const navigate = useNavigate()
  const location = useLocation()

  // 0. Perguntas — Supabase com fallback do código
  const { data: allQuestions = [] } = useQuizQuestions()

  // 1. Sessão neste aparelho
  const { session, updateAnswers, setCurrentKey, replaceSessionId, resetSession } = useQuizPersistence()

  // 2. Máquina de estados
  const { state, dispatch } = useQuizState()
  const { quizState, currentIndex, animationDirection, result, isSubmitting } = state

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(session.answers, allQuestions),
    [session.answers, allQuestions],
  )

  const currentQuestion = visibleQuestions[currentIndex] ?? null
  const totalQuestions = visibleQuestions.length
  const questionsAnswered = useMemo(
    () => countAnswered(visibleQuestions, session.answers),
    [visibleQuestions, session.answers],
  )

  const progress = useMemo(
    () => computeProgress(session.answers, visibleQuestions, currentIndex, allQuestions),
    [session.answers, visibleQuestions, currentIndex, allQuestions],
  )
  const themes = useMemo(
    () => computeThemeProgress(visibleQuestions, session.answers),
    [visibleQuestions, session.answers],
  )
  const currentThemeName = currentQuestion?.themeName ?? null

  // Valores mais recentes para callbacks assíncronos e para a sincronia com a URL.
  const latestRef = useRef({
    state,
    visibleQuestions,
    answers: session.answers,
    locationState: location.state as unknown,
    search: location.search,
  })
  useEffect(() => {
    latestRef.current = {
      state,
      visibleQuestions,
      answers: session.answers,
      locationState: location.state as unknown,
      search: location.search,
    }
  })

  // ── Etapa na URL (?passo=) ───────────────────────────────────────────────
  const stepParam = new URLSearchParams(location.search).get(STEP_PARAM)
  /** Valor de ?passo= que o próprio quiz pôs na URL (undefined = ainda não leu). */
  const expectedParamRef = useRef<string | null | undefined>(undefined)
  /** O "Anterior" já registrou quiz_back antes de voltar no histórico. */
  const suppressBackTrackRef = useRef(false)

  const writeStepToUrl = useCallback(
    (step: QuizStep, { replace = false }: { replace?: boolean } = {}) => {
      const value = formatStepParam(step)
      expectedParamRef.current = value
      const params = new URLSearchParams(latestRef.current.search)
      if (value) params.set(STEP_PARAM, value)
      else params.delete(STEP_PARAM)
      params.delete(RESTART_PARAM)
      const search = params.toString()
      const { state: machine, locationState } = latestRef.current
      const historyState: QuizHistoryState | null = replace
        ? ((locationState as QuizHistoryState | null) ?? null)
        : { quizPrev: formatStepParam(stepFromState(machine.quizState, machine.currentIndex)) ?? INTRO_MARK }
      navigate({ search: search ? `?${search}` : '' }, { replace, state: historyState })
    },
    [navigate],
  )

  useEffect(() => {
    // Primeira leitura: a tela sempre abre na intro (com "Continue de onde parou"
    // quando houver respostas). Tira ?passo= da URL para ela bater com a tela.
    if (expectedParamRef.current === undefined) {
      expectedParamRef.current = stepParam
      const params = new URLSearchParams(location.search)
      const restart = params.has(RESTART_PARAM)
      if (restart) resetSession()
      if (stepParam !== null || restart) {
        params.delete(STEP_PARAM)
        params.delete(RESTART_PARAM)
        const search = params.toString()
        navigate({ search: search ? `?${search}` : '' }, { replace: true, state: location.state })
      }
      return
    }
    if (stepParam === expectedParamRef.current) return
    expectedParamRef.current = stepParam
    const backAlreadyTracked = suppressBackTrackRef.current
    suppressBackTrackRef.current = false

    // Voltar/avançar do sistema (ou link com ?passo=).
    const { state: machine, visibleQuestions: visible, answers } = latestRef.current
    if (machine.isSubmitting || machine.quizState === 'processing' || machine.quizState === 'results') return
    const requested = parseStepParam(stepParam)
    const target = clampStep(requested, visible, answers)
    const from = stepFromState(machine.quizState, machine.currentIndex)
    if (sameStep(target, from) && sameStep(target, requested)) return

    if (stepRank(target) < stepRank(from) && !backAlreadyTracked) {
      track('quiz_back', { question_key: stepEventKey(from, visible), index: machine.currentIndex })
    }
    dispatch({ type: 'GO_TO_STEP', step: target })
    if (!sameStep(target, requested)) writeStepToUrl(target, { replace: true })
  }, [stepParam, location.search, location.state, navigate, dispatch, resetSession, writeStepToUrl])

  // ── Onde a pessoa está (para a retomada) ─────────────────────────────────
  const currentQuestionKey = currentQuestion?.key ?? null
  useEffect(() => {
    if (quizState === 'question' && currentQuestionKey) setCurrentKey(currentQuestionKey)
    else if (quizState === 'capture') setCurrentKey(CAPTURE_STEP)
  }, [quizState, currentQuestionKey, setCurrentKey])

  // ── Eventos de etapa (uma vez por pergunta e sessão; recarregar não repete) ─
  const stepEventsRef = useRef<{ sessionId: string; ids: Set<string> } | null>(null)
  const trackOncePerSession = useCallback(
    (id: string, send: () => void) => {
      let log = stepEventsRef.current
      if (!log || log.sessionId !== session.sessionId) {
        log = { sessionId: session.sessionId, ids: loadStepEvents(session.sessionId) }
        stepEventsRef.current = log
      }
      if (log.ids.has(id)) return
      log.ids.add(id)
      saveStepEvents(log.sessionId, log.ids)
      send()
    },
    [session.sessionId],
  )

  useEffect(() => {
    if (quizState === 'question' && currentQuestion) {
      const question = currentQuestion
      trackOncePerSession(`viewed:${question.key}`, () =>
        track('quiz_step_viewed', {
          question_key: question.key,
          index: currentIndex,
          total_visible: progress.total ?? undefined,
          theme: question.themeCode,
        }),
      )
    } else if (quizState === 'capture') {
      trackOncePerSession('capture', () => track('quiz_capture_viewed'))
    }
  }, [quizState, currentQuestion, currentIndex, progress.total, trackOncePerSession])

  // ── Retomada ─────────────────────────────────────────────────────────────
  const resumeStep = useMemo<ResumeStep | null>(() => {
    if (questionsAnswered === 0) return null
    const step = resolveResumeStep(session.answers, visibleQuestions, session.currentKey)
    return step.kind === 'question' || step.kind === 'capture' ? step : null
  }, [questionsAnswered, session.answers, session.currentKey, visibleQuestions])

  // ── Ações ────────────────────────────────────────────────────────────────
  const answerQuestion = useCallback(
    (questionKey: string, value: string) => {
      updateAnswers(questionKey, value)
    },
    [updateAnswers],
  )

  const startQuiz = useCallback(
    (source: 'intro' | 'retry' = 'intro') => {
      dispatch({ type: 'START' })
      writeStepToUrl({ kind: 'question', index: 0 })
      track('quiz_started', { source })
    },
    [dispatch, writeStepToUrl],
  )

  /** "Continuar" no card de retomada. */
  const resumeQuiz = useCallback(() => {
    if (!resumeStep) {
      startQuiz()
      return
    }
    track('quiz_resume_clicked', {
      index: resumeStep.kind === 'question' ? resumeStep.index : visibleQuestions.length,
    })
    dispatch({ type: 'RESUME', step: resumeStep })
    writeStepToUrl(resumeStep)
  }, [resumeStep, startQuiz, visibleQuestions.length, dispatch, writeStepToUrl])

  /** "Recomeçar": sessão nova (session_id novo, sem respostas) e primeira pergunta. */
  const restartQuiz = useCallback(() => {
    track('quiz_restart_clicked', { index: questionsAnswered })
    resetSession()
    dispatch({ type: 'START' })
    writeStepToUrl({ kind: 'question', index: 0 })
    track('quiz_started', { source: 'restart' })
  }, [questionsAnswered, resetSession, dispatch, writeStepToUrl])

  /**
   * Avança a partir da pergunta atual. Devolve false (sem avançar) quando a
   * pergunta é obrigatória e ainda não tem resposta.
   */
  const nextQuestion = useCallback((): boolean => {
    if (quizState !== 'question') return false
    const current = visibleQuestions[currentIndex]
    if (!current) return false
    if (current.isRequired && !isAnswered(current, session.answers)) return false

    if (isAnswered(current, session.answers)) {
      trackOncePerSession(`answered:${current.key}`, () =>
        track('quiz_step_answered', {
          question_key: current.key,
          index: currentIndex,
          total_visible: progress.total ?? undefined,
          theme: current.themeCode,
        }),
      )
    }

    // A mesma etapa vai para a tela e para a URL (próxima pergunta, captura ou "em breve").
    const target = nextStepAfter(session.answers, allQuestions, current.key)
    dispatch({ type: 'GO_TO_STEP', step: target })
    writeStepToUrl(target)
    return true
  }, [
    quizState,
    visibleQuestions,
    currentIndex,
    session.answers,
    allQuestions,
    progress.total,
    trackOncePerSession,
    dispatch,
    writeStepToUrl,
  ])

  /**
   * Volta uma etapa. Se a etapa anterior é a entrada logo abaixo no histórico,
   * usa o voltar do navegador (o histórico não acumula idas e voltas).
   */
  const prevQuestion = useCallback(() => {
    let target: QuizStep
    if (quizState === 'question') {
      target = currentIndex > 0 ? { kind: 'question', index: currentIndex - 1 } : { kind: 'intro' }
    } else if (quizState === 'capture') {
      target = clampStep({ kind: 'question', index: visibleQuestions.length - 1 }, visibleQuestions, session.answers)
    } else if (quizState === 'comingsoon') {
      target = { kind: 'question', index: Math.max(0, visibleQuestions.findIndex((q) => q.key === PROCESS_KEY)) }
    } else {
      return
    }

    track('quiz_back', {
      question_key: stepEventKey(stepFromState(quizState, currentIndex), visibleQuestions),
      index: currentIndex,
    })

    const targetMark = formatStepParam(target) ?? INTRO_MARK
    const historyState = latestRef.current.locationState as QuizHistoryState | null
    if (historyState?.quizPrev === targetMark) {
      suppressBackTrackRef.current = true
      navigate(-1)
      return
    }
    dispatch({ type: 'GO_TO_STEP', step: target })
    writeStepToUrl(target, { replace: true })
  }, [quizState, currentIndex, visibleQuestions, session.answers, navigate, dispatch, writeStepToUrl])

  // Voltar da tela "em breve" para a primeira pergunta
  const backFromComingSoon = prevQuestion

  /** Prévia: escolher `value` em `questionKey` leva a outra pergunta (ou a "em breve")? */
  const leadsToAnotherStep = useCallback(
    (questionKey: string, value: string) => {
      const next = nextStepAfter({ ...session.answers, [questionKey]: value }, allQuestions, questionKey)
      return next.kind === 'question' || next.kind === 'comingsoon'
    },
    [session.answers, allQuestions],
  )

  // ── Envio ────────────────────────────────────────────────────────────────
  const submittingRef = useRef(false)
  const [processingThemes, setProcessingThemes] = useState<string[]>([])

  const submitQuiz = useCallback(
    async (leadInfo: LeadInfo) => {
      if (submittingRef.current) return
      submittingRef.current = true
      const startedAt = Date.now()
      const deadline = startedAt + PROCESSING_BUDGET_MS

      // Só as respostas das perguntas visíveis (ramos abandonados não vão ao servidor).
      const answers = pruneAnswers(session.answers, allQuestions)
      const visible = getVisibleQuestions(answers, allQuestions)
      const routingThemes = new Set(
        visible.filter((q) => q.key === PROCESS_KEY || q.key === CASE_KEY).map((q) => q.themeCode),
      )
      setProcessingThemes(
        computeThemeProgress(visible, answers)
          .filter((t) => !routingThemes.has(t.code))
          .map((t) => t.name),
      )
      dispatch({ type: 'SUBMIT_START' })

      try {
        const score = computeScore(answers, allQuestions)
        const visas = suggestVisas(answers)
        const quizResult: QuizResult = { score, visas, leadInfo }

        // Um session_id = um conjunto de respostas enviado (DI-004/DI-041): refazer o
        // quiz com respostas novas numa sessão já enviada usa um session_id novo, para
        // não reescrever um assessment cujo resultado e análise já foram gerados.
        const storage = browserStorage()
        const originalSessionId = session.sessionId
        let submissionSessionId = pickSubmissionSessionId({
          currentSessionId: originalSessionId,
          answers,
          submitted: readSubmittedSessions(storage),
          createId: createSessionId,
        })
        // Conversão (GA4 generate_lead / Meta Lead): uma vez por envio, mesmo com nova tentativa.
        trackOnce('lead_submitted', submissionSessionId, { category: score.category })

        const answeredCount = countAnswered(visible, answers)
        const attribution = readAttribution()
        const paramsFor = (sessionId: string): PersistAssessmentParams => ({
          sessionId,
          answers,
          fullName: leadInfo.fullName,
          email: leadInfo.email,
          phone: leadInfo.phone,
          questionsAnswered: answeredCount,
          totalQuestions: visible.length,
          utmSource: attribution.utm_source,
          utmMedium: attribution.utm_medium,
          utmCampaign: attribution.utm_campaign,
        })

        let outcome = await persistWithTimeout(paramsFor(submissionSessionId))
        if (outcome.kind === 'failed' && isLinkedSessionError(outcome.error)) {
          // O assessment desta sessão já foi vinculado a uma conta (42501): sessão nova e nova tentativa.
          submissionSessionId = createSessionId()
          replaceSessionId(submissionSessionId)
          outcome = await persistWithTimeout(paramsFor(submissionSessionId))
        }
        if (outcome.kind === 'failed') {
          console.warn('[useQuiz] Falha ao gravar o assessment; o resultado fica neste aparelho.', outcome.error)
        }

        const persistedId = outcome.kind === 'ok' ? outcome.assessmentId : null
        // Nunca troca um assessmentId válido deste mesmo envio por null (reenvio que falhou).
        const assessmentId = persistedId ?? previousAssessmentId(storage, submissionSessionId)

        writeStoredResult(storage, {
          sessionId: submissionSessionId,
          assessmentId,
          answers,
          score: {
            total: score.total,
            max: score.max,
            percentage: score.percentage,
            category: score.category,
          },
          visas,
          leadInfo,
          completedAt: new Date().toISOString(),
        })

        const rememberThisSubmission = () =>
          rememberSubmission(storage, { sessionId: submissionSessionId, answersKey: answersKey(answers) })

        let eligibility: Promise<boolean> | null = null
        if (persistedId) {
          rememberThisSubmission()
          // Sessão nova para o próximo quiz: "Refazer o quiz" começa do zero e vira
          // outro assessment (o resultado acima guarda o session_id deste envio).
          resetSession()
          eligibility = startEligibility(persistedId, submissionSessionId)
        } else if (outcome.kind === 'timeout') {
          // Gravação lenta: segue para o resultado e aproveita o id quando chegar.
          // Sem ele, a sessão continua retomável na captura (reenvio idempotente).
          const sessionSnapshot = readStoredQuizSession(storage)?.updatedAt
          const sessionIds = [originalSessionId, submissionSessionId]
          void outcome.late
            .then((lateId) => {
              if (!lateId) return
              patchStoredAssessmentId(storage, submissionSessionId, lateId)
              rememberThisSubmission()
              const stored = readStoredQuizSession(storage)
              if (stored && stored.updatedAt === sessionSnapshot && sessionIds.includes(stored.sessionId)) {
                resetSession()
              }
              void startEligibility(lateId, submissionSessionId)
            })
            .catch(() => undefined)
        }

        if (eligibility) {
          const remaining = Math.min(ELIGIBILITY_TIMEOUT_MS, Math.max(0, deadline - Date.now()))
          await withTimeout(eligibility, remaining)
        }
        const elapsed = Date.now() - startedAt
        if (elapsed < MIN_PROCESSING_MS) await sleep(MIN_PROCESSING_MS - elapsed)

        const quizStartedAt = Date.parse(session.startedAt)
        trackOnce('quiz_completed', submissionSessionId, {
          score: score.percentage,
          category: score.category,
          top_visa: visas[0]?.code,
          duration_ms: Number.isFinite(quizStartedAt) ? Math.max(0, Date.now() - quizStartedAt) : undefined,
        })

        dispatch({ type: 'SUBMIT_SUCCESS', payload: quizResult })
        navigate('/results', { state: { result: quizResult, assessmentId } })
      } catch (err) {
        Sentry.captureException(err, { tags: { area: 'quiz', step: 'submit' } })
        dispatch({ type: 'SUBMIT_ERROR' })
      } finally {
        submittingRef.current = false
      }
    },
    [session, navigate, dispatch, allQuestions, resetSession, replaceSessionId],
  )

  // Reset quiz (sessão nova e intro)
  const resetQuiz = useCallback(() => {
    resetSession()
    dispatch({ type: 'RESET' })
    writeStepToUrl({ kind: 'intro' }, { replace: true })
  }, [resetSession, dispatch, writeStepToUrl])

  const currentAnswer = currentQuestion ? session.answers[currentQuestion.key] ?? '' : ''
  const currentAnswered = currentQuestion ? isAnswered(currentQuestion, session.answers) : false
  const canProceed = !currentQuestion?.isRequired || currentAnswered

  const nextAction = useMemo<QuizNextAction>(() => {
    if (!currentQuestion) return 'next'
    if (!currentAnswered && currentQuestion.isRequired) return 'next'
    const target = nextStepAfter(session.answers, allQuestions, currentQuestion.key)
    if (!currentAnswered) return target.kind === 'capture' ? 'skip_results' : 'skip'
    if (target.kind === 'comingsoon') return 'continue'
    if (target.kind === 'capture') return 'results'
    return 'next'
  }, [currentQuestion, currentAnswered, session.answers, allQuestions])

  return {
    // State
    quizState,
    session,
    currentQuestion,
    currentIndex,
    currentAnswer,
    totalQuestions,
    questionsAnswered,
    /** Progresso honesto (DI-040): total e porcentagem só depois do caso. */
    progress,
    /** @deprecated use `progress.percentage` (0 enquanto o total é desconhecido). */
    progressPercentage: progress.percentage ?? 0,
    themes,
    currentThemeName,
    result,
    isSubmitting,
    canProceed,
    nextAction,
    animationDirection,
    resumeStep,
    processingThemes,

    // Actions
    startQuiz,
    resumeQuiz,
    restartQuiz,
    answerQuestion,
    nextQuestion,
    prevQuestion,
    leadsToAnotherStep,
    submitQuiz,
    resetQuiz,
    backFromComingSoon,
  }
}
