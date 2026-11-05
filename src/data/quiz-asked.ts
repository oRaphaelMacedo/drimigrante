// quiz-asked.ts — o que a pessoa responde na tela × o que o motor recebe.
//
// As 22 perguntas de QUIZ_QUESTIONS (e do banco) continuam sendo o modelo do motor:
// score, vias, servidor e análise da IA leem exatamente as mesmas chaves e opções.
// Para perguntar menos, a tela mostra menos perguntas e este módulo traduz:
//   · IMPLIED_ANSWERS: a resposta já se deduz de outra e a pergunta não é feita;
//   · COMBINED_QUESTIONS: uma pergunta na tela responde várias do modelo;
//   · ASK_ONLY_IF: pergunta opcional que só é feita quando pode mudar a análise.
//
// resolveQuizFlow() devolve as duas visões. No envio, materializeAnswers() entrega ao
// motor o questionário no formato de sempre, então nada muda no servidor nem no banco.
// src/data/quiz-paths.test.ts percorre todos os caminhos e falha se um fato for
// perguntado duas vezes ou se uma resposta coerente deixar de ser alcançável.
//
// Importado também pelo Deno (testes de paridade): só imports relativos com `.ts`.

import {
  matchesCondition,
  QUIZ_QUESTIONS,
  type QuizOption,
  type QuizQuestion,
  type ShowIfCondition,
} from './quiz-questions.ts'

type Answers = Record<string, string>

export interface ImpliedAnswerRule {
  questionKey: string
  /** Só pode citar pergunta anterior na ordem do quiz. */
  when: ShowIfCondition
  answer: string
}

const LIVES_IN_PORTUGAL: ShowIfCondition = { questionKey: 'caso_tipo', answerContains: 'D' }

/**
 * Perguntas que não são feitas porque a resposta já foi dada em outra forma.
 * A primeira regra satisfeita vale, e a resposta deduzida conta no score como
 * se a pessoa a tivesse marcado.
 */
export const IMPLIED_ANSWERS: ImpliedAnswerRule[] = [
  // O texto de ajuda de a4 já conta morar em Portugal como laço.
  { questionKey: 'a4_lacos', when: LIVES_IN_PORTUGAL, answer: 'sim' },
  { questionKey: 'c2_mora_portugal', when: LIVES_IN_PORTUGAL, answer: 'sim' },
  // d6 só aparece depois de d3 = sim, que já afirma o preparo financeiro.
  { questionKey: 'd6_preparado_financeiro', when: { questionKey: 'd3_disposto_advogado', answerKey: 'sim' }, answer: 'sim' },
  { questionKey: 'f1_mora_portugal', when: LIVES_IN_PORTUGAL, answer: 'sim' },
  { questionKey: 'f1_mora_portugal', when: { questionKey: 'c2_mora_portugal', answerKey: 'sim' }, answer: 'sim' },
  { questionKey: 'f1_mora_portugal', when: { questionKey: 'c2_mora_portugal', answerKey: 'nao' }, answer: 'nao' },
]

export interface CombinedOption {
  key: string
  /** Sem rótulo: usa o da opção de mesma chave da pergunta (editável no admin). */
  label?: string
  /** Respostas do modelo que esta opção representa. Padrão: a própria pergunta = esta chave. */
  sets?: Answers
  /** Some da tela quando esta pergunta já tem resposta deduzida. */
  hideIfImplied?: string
}

export interface CombinedQuestion {
  /** Pergunta do modelo que abre o trecho: a combinada aparece na posição dela. */
  anchor: string
  /** Pergunta do modelo que empresta chave, texto e opções para a tela. */
  key: string
  text?: string
  helpText?: string
  options: CombinedOption[]
}

const moved = (f1: string, f2: string) => ({ f1_mora_portugal: f1, f2_quando_mudou: f2 })
const livedFor = (value: string) => ({ c1_maior_idade: 'sim', c2_mora_portugal: 'sim', c3_tempo_portugal: value })
const authorizedFor = (value: string) => ({ d1_situacao_legal: 'sim', d2_tempo_autorizacao: value })

export const COMBINED_QUESTIONS: CombinedQuestion[] = [
  {
    anchor: 'a1_antepassado',
    key: 'a1_antepassado',
    options: [
      { key: 'pai_mae' },
      { key: 'avo' },
      { key: 'bisavo' },
      { key: 'trisavo' },
      {
        key: 'nao_sei_pesquisar',
        label: 'Não sei ao certo, mas quero pesquisar minha árvore genealógica',
        sets: { a1_antepassado: 'nao_sei', a5_genealogia: 'sim' },
      },
      {
        key: 'nao_sei',
        label: 'Não sei ao certo e não quero pesquisar por enquanto',
        sets: { a1_antepassado: 'nao_sei', a5_genealogia: 'nao' },
      },
    ],
  },
  {
    anchor: 'a2_documento',
    key: 'a2_documento',
    options: [
      { key: 'sim' },
      {
        key: 'nao_quero_obter',
        label: 'Não tenho, mas quero obter esses documentos em Portugal',
        sets: { a2_documento: 'nao', a3_interesse_docs: 'sim' },
      },
      {
        key: 'nao',
        label: 'Não tenho e não tenho interesse em obter',
        sets: { a2_documento: 'nao', a3_interesse_docs: 'nao' },
      },
    ],
  },
  {
    anchor: 'c1_maior_idade',
    key: 'c3_tempo_portugal',
    helpText: 'Se você tem menos de 18 anos, marque a última opção.',
    options: [
      { key: 'menos_2', sets: livedFor('menos_2') },
      { key: '2_a_4', sets: livedFor('2_a_4') },
      { key: '5_ou_mais', sets: livedFor('5_ou_mais') },
      {
        key: 'nao_mora',
        label: 'Não moro em Portugal',
        sets: { c1_maior_idade: 'sim', c2_mora_portugal: 'nao' },
        hideIfImplied: 'c2_mora_portugal',
      },
      { key: 'menor_idade', label: 'Tenho menos de 18 anos', sets: { c1_maior_idade: 'nao' } },
    ],
  },
  {
    anchor: 'd1_situacao_legal',
    key: 'd2_tempo_autorizacao',
    options: [
      { key: 'menos_5', sets: authorizedFor('menos_5') },
      { key: 'mais_5', sets: authorizedFor('mais_5') },
      {
        key: 'sem_autorizacao',
        label: 'Não tenho: minha situação ainda não está regularizada',
        sets: { d1_situacao_legal: 'nao' },
      },
    ],
  },
  {
    anchor: 'd3_disposto_advogado',
    key: 'd3_disposto_advogado',
    text: 'Sobre contratar um advogado para regularizar a situação, o que mais se aproxima do seu caso?',
    options: [
      {
        key: 'consultou',
        label: 'Já consultei um advogado e tenho condições de contratar',
        sets: { d3_disposto_advogado: 'sim', d4_consultou_advogado: 'sim' },
      },
      {
        key: 'consultar_agora',
        label: 'Ainda não consultei, mas tenho condições e quero consultar agora',
        sets: { d3_disposto_advogado: 'sim', d4_consultou_advogado: 'nao', d7_consultar_agora: 'sim' },
      },
      {
        key: 'consultar_depois',
        label: 'Ainda não consultei; tenho condições, mas não quero consultar agora',
        sets: { d3_disposto_advogado: 'sim', d4_consultou_advogado: 'nao', d7_consultar_agora: 'nao' },
      },
      {
        key: 'nao',
        label: 'Ainda não tenho condições financeiras de contratar',
        sets: { d3_disposto_advogado: 'nao' },
      },
    ],
  },
  {
    anchor: 'f1_mora_portugal',
    key: 'f2_quando_mudou',
    options: [
      { key: 'antes_1974', sets: moved('sim', 'antes_1974') },
      { key: 'depois_1974', sets: moved('sim', 'depois_1974') },
      { key: 'nao_mora', label: 'Não moro em Portugal', sets: { f1_mora_portugal: 'nao' } },
    ],
  },
]

/** Pergunta opcional, sem pontos, feita só quando pode mudar a análise da via. */
export const ASK_ONLY_IF: Record<string, ShowIfCondition> = {
  a6_filiacao: { questionKey: 'a1_antepassado', answerKey: ['pai_mae', 'avo', 'bisavo'] },
}

/** Resposta aproveitável: texto não vazio e, em escolha única, uma opção que existe. */
export function isValidAnswer(
  question: Partial<Pick<QuizQuestion, 'fieldType' | 'options'>>,
  value: unknown,
): value is string {
  if (typeof value !== 'string' || value.trim() === '') return false
  if (question.fieldType !== 'radio' || !question.options?.length) return true
  return question.options.some((o) => o.key === value)
}

// Pergunta desativada no admin desfaz a combinada: a pergunta volta a ser feita sozinha.
const anchorsCache = new WeakMap<QuizQuestion[], Map<string, CombinedQuestion>>()

function activeAnchors(questions: QuizQuestion[]): Map<string, CombinedQuestion> {
  const cached = anchorsCache.get(questions)
  if (cached) return cached
  const known = new Set(questions.map((q) => q.key))
  const anchors = new Map<string, CombinedQuestion>()
  for (const combined of COMBINED_QUESTIONS) {
    const keys = [combined.anchor, combined.key, ...combined.options.flatMap((o) => Object.keys(o.sets ?? {}))]
    if (keys.every((key) => known.has(key))) anchors.set(combined.anchor, combined)
  }
  anchorsCache.set(questions, anchors)
  return anchors
}

function impliedAnswer(key: string, resolved: Answers, visible: Set<string>): string | undefined {
  for (const rule of IMPLIED_ANSWERS) {
    if (rule.questionKey !== key) continue
    if (visible.has(rule.when.questionKey) && matchesCondition(resolved, rule.when)) return rule.answer
  }
  return undefined
}

function offeredOptions(combined: CombinedQuestion, resolved: Answers, visible: Set<string>): CombinedOption[] {
  return combined.options.filter(
    (o) => !o.hideIfImplied || impliedAnswer(o.hideIfImplied, resolved, visible) === undefined,
  )
}

function toScreenQuestion(combined: CombinedQuestion, base: QuizQuestion, offered: CombinedOption[]): QuizQuestion {
  const options: QuizOption[] = offered.map((o) => {
    const original = base.options?.find((b) => b.key === o.key)
    return { ...original, key: o.key, label: o.label ?? original?.label ?? o.key, score: original?.score ?? 0 }
  })
  return { ...base, text: combined.text ?? base.text, helpText: combined.helpText ?? base.helpText, options }
}

export interface QuizFlow {
  /** Perguntas que a pessoa responde na tela, na ordem. */
  asked: QuizQuestion[]
  /** Respostas no formato do motor: só perguntas visíveis, com combinadas e deduções aplicadas. */
  answers: Answers
}

/**
 * Traduz as respostas da tela. Percorre as perguntas na ordem do quiz (o pai vem
 * antes do filho), acumulando as respostas do modelo: o que já foi respondido por
 * uma combinada ou deduzido não é perguntado de novo.
 */
export function resolveQuizFlow(raw: Answers, questions: QuizQuestion[] = QUIZ_QUESTIONS): QuizFlow {
  const known = new Set(questions.map((q) => q.key))
  const resolved: Answers = {}
  // Chaves que não são perguntas do quiz seguem junto, como em pruneAnswers.
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) resolved[key] = value
  }

  const byKey = new Map(questions.map((q) => [q.key, q]))
  const anchors = activeAnchors(questions)
  const visible = new Set<string>()
  const asked: QuizQuestion[] = []
  const holds = (c: ShowIfCondition) => visible.has(c.questionKey) && matchesCondition(resolved, c)

  for (const question of questions) {
    const rule = question.showIf
    const shown = !rule
      ? true
      : 'any' in rule
        ? rule.any.some(holds)
        : 'all' in rule
          ? rule.all.length > 0 && rule.all.every(holds)
          : holds(rule)
    if (!shown) continue
    visible.add(question.key)

    // Já respondida por uma combinada.
    if (resolved[question.key] !== undefined) continue

    const implied = impliedAnswer(question.key, resolved, visible)
    if (implied !== undefined) {
      resolved[question.key] = implied
      continue
    }

    const askOnlyIf = ASK_ONLY_IF[question.key]
    if (askOnlyIf && byKey.has(askOnlyIf.questionKey) && !holds(askOnlyIf)) continue

    const combined = anchors.get(question.key)
    if (combined) {
      const offered = offeredOptions(combined, resolved, visible)
      asked.push(toScreenQuestion(combined, byKey.get(combined.key)!, offered))
      const chosen = offered.find((o) => o.key === raw[combined.key])
      if (chosen) Object.assign(resolved, chosen.sets ?? { [combined.key]: chosen.key })
      continue
    }

    asked.push(question)
    if (isValidAnswer(question, raw[question.key])) resolved[question.key] = raw[question.key]
  }

  return { asked, answers: resolved }
}

/** Perguntas que a pessoa responde na tela. */
export function getAskedQuestions(raw: Answers, questions: QuizQuestion[] = QUIZ_QUESTIONS): QuizQuestion[] {
  return resolveQuizFlow(raw, questions).asked
}

/** Respostas no formato do motor, prontas para score, vias e envio ao servidor. */
export function materializeAnswers(raw: Answers, questions: QuizQuestion[] = QUIZ_QUESTIONS): Answers {
  return resolveQuizFlow(raw, questions).answers
}
