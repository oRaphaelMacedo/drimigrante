// quiz-paths.ts — enumera TODOS os caminhos possíveis do quiz, como a tela permite
// (múltipla escolha com todas as combinações, opção exclusiva sozinha, pergunta
// opcional pulada). Usado só nos testes e na auditoria; o app não importa este módulo.
//
// Importado também pelo Deno (_shared/quiz-engine.test.ts): só imports relativos
// com extensão `.ts` e sem dependências npm.

import { resolveQuizFlow } from './quiz-asked.ts'
import { isExclusiveOption, QUIZ_QUESTIONS, type QuizQuestion } from './quiz-questions.ts'

type Answers = Record<string, string>

export interface QuizPath {
  /** Perguntas que a pessoa viu, na ordem. */
  asked: QuizQuestion[]
  /** O que a pessoa respondeu na tela (null = pulou a pergunta opcional). */
  given: (string | null)[]
  /** Respostas como a tela guarda. */
  raw: Answers
  /** Respostas como o motor e o servidor recebem. */
  answers: Answers
}

function nonEmptySubsets(keys: string[]): string[][] {
  const subsets: string[][] = []
  for (let mask = 1; mask < 1 << keys.length; mask++) {
    subsets.push(keys.filter((_, i) => mask & (1 << i)))
  }
  return subsets
}

/** Todas as respostas que a tela aceita para uma pergunta. */
export function answerChoices(question: QuizQuestion): (string | null)[] {
  const options = question.options ?? []
  if (question.fieldType === 'multiselect') {
    const regular = options.filter((o) => !isExclusiveOption(o)).map((o) => o.key)
    const exclusive = options.filter((o) => isExclusiveOption(o)).map((o) => o.key)
    return [...nonEmptySubsets(regular).map((s) => s.join(',')), ...exclusive]
  }
  const keys: (string | null)[] = options.map((o) => o.key)
  if (!question.isRequired) keys.push(null)
  return keys
}

/** Visita cada caminho completo, do primeiro objetivo até a captura ou "em breve". */
export function walkQuizPaths(
  visit: (path: QuizPath) => void,
  questions: QuizQuestion[] = QUIZ_QUESTIONS,
  choicesFor: (question: QuizQuestion) => (string | null)[] = answerChoices,
): void {
  const step = (raw: Answers, asked: QuizQuestion[], given: (string | null)[]) => {
    const flow = resolveQuizFlow(raw, questions)
    const current = asked[asked.length - 1]
    // Objetivo diferente de nacionalidade vai para "em breve" e o caminho termina.
    const next = current ? flow.asked[flow.asked.findIndex((q) => q.key === current.key) + 1] : flow.asked[0]
    if (!next) {
      visit({ asked, given, raw, answers: flow.answers })
      return
    }
    for (const choice of choicesFor(next)) {
      step(choice === null ? raw : { ...raw, [next.key]: choice }, [...asked, next], [...given, choice])
    }
  }
  step({}, [], [])
}
