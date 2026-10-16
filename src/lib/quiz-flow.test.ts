/**
 * DI-040/DI-041/DI-042 — regras puras do fluxo do quiz: etapa na URL (?passo=),
 * retomada, para onde vai o "Próximo", progresso honesto e envio com timeout.
 * Usa as perguntas reais de src/data/quiz-questions.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QUIZ_QUESTIONS, getVisibleQuestions } from '@/data/quiz-questions'
import {
  CAPTURE_STEP,
  clampStep,
  computeProgress,
  computeThemeProgress,
  formatStepParam,
  isLinkedSessionError,
  nextStepAfter,
  parseStepParam,
  resolveResumeStep,
  routesToComingSoon,
  sameStep,
  withTimeout,
  type QuizStep,
} from './quiz-flow'

const visibleFor = (answers: Record<string, string>) => getVisibleQuestions(answers, QUIZ_QUESTIONS)
const indexOf = (answers: Record<string, string>, key: string) => visibleFor(answers).findIndex((q) => q.key === key)

const CASE_A = { processo_tipo: 'nacionalidade', caso_tipo: 'A' }
/** Caso A completo, sem a pergunta opcional a6. */
const CASE_A_DONE = { ...CASE_A, a1_antepassado: 'avo', a2_documento: 'sim', a4_lacos: 'sim' }

describe('?passo= (etapa na URL)', () => {
  it('vai e volta sem perder a etapa', () => {
    const steps: QuizStep[] = [
      { kind: 'question', index: 0 },
      { kind: 'question', index: 4 },
      { kind: 'capture' },
      { kind: 'comingsoon' },
    ]
    for (const step of steps) {
      expect(parseStepParam(formatStepParam(step))).toEqual(step)
    }
    expect(formatStepParam({ kind: 'question', index: 4 })).toBe('5')
    expect(formatStepParam({ kind: 'capture' })).toBe(CAPTURE_STEP)
  })

  it('intro não tem parâmetro e valores desconhecidos voltam à intro', () => {
    expect(formatStepParam({ kind: 'intro' })).toBeNull()
    for (const value of [null, undefined, '', '0', '-1', 'abc', '1e3', '12345', '2.5']) {
      expect(parseStepParam(value)).toEqual({ kind: 'intro' })
    }
  })

  it('sameStep compara tipo e índice', () => {
    expect(sameStep({ kind: 'question', index: 2 }, { kind: 'question', index: 2 })).toBe(true)
    expect(sameStep({ kind: 'question', index: 2 }, { kind: 'question', index: 3 })).toBe(false)
    expect(sameStep({ kind: 'capture' }, { kind: 'capture' })).toBe(true)
    expect(sameStep({ kind: 'capture' }, { kind: 'intro' })).toBe(false)
  })
})

describe('clampStep (voltar/avançar do sistema e links)', () => {
  it('nunca pula uma pergunta obrigatória sem resposta', () => {
    const answers = { processo_tipo: 'nacionalidade' }
    expect(clampStep({ kind: 'question', index: 6 }, visibleFor(answers), answers)).toEqual({
      kind: 'question',
      index: indexOf(answers, 'caso_tipo'),
    })
    expect(clampStep({ kind: 'capture' }, visibleFor(answers), answers)).toEqual({ kind: 'question', index: 1 })
  })

  it('aceita voltar para qualquer pergunta já respondida', () => {
    expect(clampStep({ kind: 'question', index: 2 }, visibleFor(CASE_A_DONE), CASE_A_DONE)).toEqual({
      kind: 'question',
      index: 2,
    })
  })

  it('a captura só abre com todas as obrigatórias respondidas (a opcional pode ficar em branco)', () => {
    expect(clampStep({ kind: 'capture' }, visibleFor(CASE_A_DONE), CASE_A_DONE)).toEqual({ kind: 'capture' })
  })

  it('objetivo diferente de nacionalidade: "em breve", nunca as perguntas seguintes', () => {
    const answers = { processo_tipo: 'visto' }
    expect(routesToComingSoon(answers)).toBe(true)
    const visible = visibleFor(answers)
    expect(clampStep({ kind: 'comingsoon' }, visible, answers)).toEqual({ kind: 'comingsoon' })
    expect(clampStep({ kind: 'capture' }, visible, answers)).toEqual({ kind: 'question', index: 0 })
    expect(clampStep({ kind: 'question', index: 3 }, visible, answers)).toEqual({ kind: 'question', index: 0 })
  })

  it('"em breve" sem a resposta que leva até lá volta para a pergunta pendente', () => {
    expect(clampStep({ kind: 'comingsoon' }, visibleFor({}), {})).toEqual({ kind: 'question', index: 0 })
    expect(clampStep({ kind: 'comingsoon' }, visibleFor(CASE_A), CASE_A)).toEqual({
      kind: 'question',
      index: indexOf(CASE_A, 'a1_antepassado'),
    })
  })

  it('índice além do fim vai para a última pergunta visível', () => {
    const visible = visibleFor(CASE_A_DONE)
    expect(clampStep({ kind: 'question', index: 99 }, visible, CASE_A_DONE)).toEqual({
      kind: 'question',
      index: visible.length - 1,
    })
  })
})

describe('nextStepAfter (o que o "Próximo" faz)', () => {
  it('objetivo ≠ nacionalidade leva a "em breve"', () => {
    expect(nextStepAfter({ processo_tipo: 'regularizacao' }, QUIZ_QUESTIONS, 'processo_tipo')).toEqual({
      kind: 'comingsoon',
    })
  })

  it('nacionalidade segue para a escolha do caso', () => {
    expect(nextStepAfter({ processo_tipo: 'nacionalidade' }, QUIZ_QUESTIONS, 'processo_tipo')).toEqual({
      kind: 'question',
      index: 1,
    })
  })

  it('a última pergunta visível leva à captura (e só ela)', () => {
    const answers = { processo_tipo: 'nacionalidade', caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' }
    expect(nextStepAfter(answers, QUIZ_QUESTIONS, 'caso_tipo')).toEqual({
      kind: 'question',
      index: indexOf(answers, 'b1_tempo_casamento'),
    })
    expect(nextStepAfter(answers, QUIZ_QUESTIONS, 'b1_tempo_casamento')).toEqual({ kind: 'capture' })
  })

  it('a resposta atual entra na conta (uma resposta pode abrir outra pergunta)', () => {
    const base = { ...CASE_A, a1_antepassado: 'avo' }
    // a2 = "não" abre a3; a2 = "sim" pula direto para a4.
    expect(nextStepAfter({ ...base, a2_documento: 'nao' }, QUIZ_QUESTIONS, 'a2_documento')).toEqual({
      kind: 'question',
      index: indexOf({ ...base, a2_documento: 'nao' }, 'a3_interesse_docs'),
    })
    expect(nextStepAfter({ ...base, a2_documento: 'sim' }, QUIZ_QUESTIONS, 'a2_documento')).toEqual({
      kind: 'question',
      index: indexOf({ ...base, a2_documento: 'sim' }, 'a4_lacos'),
    })
  })
})

describe('resolveResumeStep (Continue de onde parou)', () => {
  it('volta à pergunta onde a pessoa parou (ex.: a 5ª)', () => {
    const visible = visibleFor(CASE_A_DONE)
    const fifth = visible[4]
    expect(resolveResumeStep(CASE_A_DONE, visible, fifth.key)).toEqual({ kind: 'question', index: 4 })
  })

  it('retoma na captura quando já tinha chegado lá', () => {
    expect(resolveResumeStep(CASE_A_DONE, visibleFor(CASE_A_DONE), CAPTURE_STEP)).toEqual({ kind: 'capture' })
  })

  it('captura guardada com pergunta pendente: retoma na pendente', () => {
    const answers = { ...CASE_A, a1_antepassado: 'avo' }
    expect(resolveResumeStep(answers, visibleFor(answers), CAPTURE_STEP)).toEqual({
      kind: 'question',
      index: indexOf(answers, 'a2_documento'),
    })
  })

  it('pergunta guardada que sumiu (perguntas mudaram): primeira pendente', () => {
    const answers = { ...CASE_A }
    expect(resolveResumeStep(answers, visibleFor(answers), 'pergunta_que_nao_existe')).toEqual({
      kind: 'question',
      index: indexOf(answers, 'a1_antepassado'),
    })
  })

  it('sem pergunta guardada e tudo respondido: última pergunta', () => {
    const visible = visibleFor(CASE_A_DONE)
    expect(resolveResumeStep(CASE_A_DONE, visible, null)).toEqual({ kind: 'question', index: visible.length - 1 })
  })

  it('sem perguntas carregadas: intro', () => {
    expect(resolveResumeStep(CASE_A_DONE, [], 'a1_antepassado')).toEqual({ kind: 'intro' })
  })
})

describe('computeProgress (DI-040: progresso honesto)', () => {
  it('primeira pergunta: sem total e sem porcentagem (nunca "Pergunta 1 de 1")', () => {
    const progress = computeProgress({}, visibleFor({}), 0, QUIZ_QUESTIONS)
    expect(progress).toEqual({ position: 1, total: null, answered: 0, percentage: null })
  })

  it('objetivo respondido mas caso ainda não: total continua desconhecido', () => {
    const answers = { processo_tipo: 'nacionalidade' }
    const progress = computeProgress(answers, visibleFor(answers), 1, QUIZ_QUESTIONS)
    expect(progress.total).toBeNull()
    expect(progress.percentage).toBeNull()
    expect(progress.position).toBe(2)
  })

  it('depois do caso: total = perguntas visíveis e porcentagem = respondidas ÷ visíveis', () => {
    const answers = { processo_tipo: 'nacionalidade', caso_tipo: 'B' }
    const visible = visibleFor(answers)
    expect(visible.map((q) => q.key)).toEqual(['processo_tipo', 'caso_tipo', 'b1_tempo_casamento'])
    expect(computeProgress(answers, visible, 2, QUIZ_QUESTIONS)).toEqual({
      position: 3,
      total: 3,
      answered: 2,
      percentage: 67,
    })
  })

  it('respostas de ramos ocultos não contam', () => {
    const answers = { processo_tipo: 'nacionalidade', caso_tipo: 'B', a1_antepassado: 'avo' }
    const progress = computeProgress(answers, visibleFor(answers), 2, QUIZ_QUESTIONS)
    expect(progress.answered).toBe(2)
  })

  it('tudo respondido chega a 100%', () => {
    const answers = { processo_tipo: 'nacionalidade', caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' }
    expect(computeProgress(answers, visibleFor(answers), 2, QUIZ_QUESTIONS).percentage).toBe(100)
  })
})

describe('computeThemeProgress (segmentos da barra)', () => {
  it('um segmento por tema visível, na ordem, cada tema uma vez', () => {
    const answers = { processo_tipo: 'nacionalidade', caso_tipo: 'A,B', a1_antepassado: 'avo' }
    const themes = computeThemeProgress(visibleFor(answers), answers)
    expect(themes.map((t) => t.code)).toEqual(['processo', 'selecao', 'descendencia', 'matrimonio'])
    expect(themes.find((t) => t.code === 'descendencia')).toMatchObject({ answered: 1, total: 4 })
    expect(themes.find((t) => t.code === 'matrimonio')).toMatchObject({ answered: 0, total: 1 })
  })
})

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('devolve o valor quando a promessa termina a tempo', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toEqual({ timedOut: false, value: 42 })
  })

  it('desiste depois do prazo sem cancelar a promessa', async () => {
    vi.useFakeTimers()
    let resolveLate!: (value: string) => void
    const slow = new Promise<string>((resolve) => {
      resolveLate = resolve
    })
    const raced = withTimeout(slow, 8000)
    await vi.advanceTimersByTimeAsync(8000)
    await expect(raced).resolves.toEqual({ timedOut: true })
    resolveLate('chegou depois')
    await expect(slow).resolves.toBe('chegou depois')
  })

  it('repassa o erro da promessa', async () => {
    await expect(withTimeout(Promise.reject(new Error('falhou')), 1000)).rejects.toThrow('falhou')
  })
})

describe('isLinkedSessionError (42501: assessment já vinculado a uma conta)', () => {
  it('reconhece o código e a mensagem do RPC', () => {
    expect(isLinkedSessionError({ code: '42501', message: 'x' })).toBe(true)
    expect(isLinkedSessionError('Assessment already linked to a user')).toBe(true)
    expect(isLinkedSessionError({ message: 'Assessment already linked to a user' })).toBe(true)
    expect(isLinkedSessionError('permission denied (42501)')).toBe(true)
  })

  it('ignora outros erros', () => {
    expect(isLinkedSessionError(null)).toBe(false)
    expect(isLinkedSessionError('Invalid session_id')).toBe(false)
    expect(isLinkedSessionError({ code: '22023', message: 'Invalid session_id' })).toBe(false)
    expect(isLinkedSessionError('Failed to fetch')).toBe(false)
  })
})
