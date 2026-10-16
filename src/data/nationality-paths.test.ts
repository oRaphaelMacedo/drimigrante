import { describe, expect, it } from 'vitest'
import {
  NATIONALITY_PATHS,
  NATIONALITY_PATH_CODES,
  PENDING,
  getNationalityPath,
  getPathDocuments,
  getPathSteps,
  getPathTimeline,
  isFilledText,
  type NationalityPath,
} from './nationality-paths'
import { QUIZ_QUESTIONS, pruneAnswers, suggestVisas } from './quiz-questions'

type Answers = Record<string, string>

/** Opções de uma pergunta do quiz (+ "sem resposta"). */
function optionsOf(key: string): Array<string | undefined> {
  const question = QUIZ_QUESTIONS.find((q) => q.key === key)
  return [undefined, ...(question?.options ?? []).map((o) => o.key)]
}

/** Todas as combinações das respostas que influenciam suggestVisas. */
function* answerCombinations(): Generator<Answers> {
  const casos = ['A', 'B', 'C', 'D', 'E', 'F']
  const keys = [
    'a1_antepassado',
    'a2_documento',
    'a4_lacos',
    'b1_tempo_casamento',
    'c3_tempo_portugal',
    'd1_situacao_legal',
    'd2_tempo_autorizacao',
    'f2_quando_mudou',
  ]
  // Cada caso sozinho, com todas as respostas das perguntas dele.
  for (const caso of casos) {
    const relevant = keys.filter((k) => k.startsWith(caso.toLowerCase()))
    const combos: Answers[] = [{ processo_tipo: 'nacionalidade', caso_tipo: caso }]
    for (const key of relevant) {
      const next: Answers[] = []
      for (const base of combos) {
        for (const option of optionsOf(key)) {
          next.push(option === undefined ? { ...base } : { ...base, [key]: option })
        }
      }
      combos.splice(0, combos.length, ...next)
    }
    yield* combos
  }
  // Vários casos juntos e o caso sem situação marcada.
  yield { processo_tipo: 'nacionalidade', caso_tipo: casos.join(',') }
  yield { processo_tipo: 'nacionalidade', caso_tipo: '' }
  yield { processo_tipo: 'nacionalidade' }
}

function codesFromSuggestVisas(): Set<string> {
  const codes = new Set<string>()
  for (const answers of answerCombinations()) {
    for (const suggestion of suggestVisas(answers)) codes.add(suggestion.code)
    for (const suggestion of suggestVisas(pruneAnswers(answers))) codes.add(suggestion.code)
  }
  return codes
}

describe('NATIONALITY_PATHS', () => {
  it('tem entrada para todo código que suggestVisas pode devolver', () => {
    const codes = codesFromSuggestVisas()
    // Sanidade: as combinações cobrem os 9 caminhos conhecidos.
    expect(codes.size).toBe(NATIONALITY_PATH_CODES.length)
    for (const code of codes) {
      expect(getNationalityPath(code), `sem entrada para "${code}"`).not.toBeNull()
    }
  })

  it('não tem entradas sobrando (todo caminho é alcançável pelo quiz)', () => {
    const codes = codesFromSuggestVisas()
    for (const code of NATIONALITY_PATH_CODES) expect(codes.has(code)).toBe(true)
    expect(Object.keys(NATIONALITY_PATHS).sort()).toEqual([...NATIONALITY_PATH_CODES].sort())
  })

  it('cada entrada tem o próprio código, título e descrição preenchidos', () => {
    for (const code of NATIONALITY_PATH_CODES) {
      const path = NATIONALITY_PATHS[code]
      expect(path.code).toBe(code)
      expect(isFilledText(path.title)).toBe(true)
      expect(isFilledText(path.summary)).toBe(true)
    }
  })

  it('não fala em visto nem promete aprovação nos textos fixos', () => {
    for (const path of Object.values(NATIONALITY_PATHS)) {
      const text = `${path.title} ${path.summary}`.toLowerCase()
      expect(text).not.toMatch(/\bvisto/)
      expect(text).not.toMatch(/garant|aprova/)
    }
  })

  it('códigos desconhecidos devolvem null', () => {
    expect(getNationalityPath('D7')).toBeNull()
    expect(getNationalityPath('')).toBeNull()
    expect(getNationalityPath(undefined)).toBeNull()
  })
})

describe('helpers de exibição (nenhum placeholder chega à tela)', () => {
  const base = NATIONALITY_PATHS.nacionalidade_casamento

  it('campos pendentes viram null/[]', () => {
    const pending: NationalityPath = { ...base, timeline: PENDING, documents: PENDING, nextSteps: PENDING }
    expect(getPathTimeline(pending)).toBeNull()
    expect(getPathDocuments(pending)).toEqual([])
    expect(getPathSteps(pending)).toEqual([])
  })

  it('itens com placeholder são filtrados e observações pendentes somem', () => {
    const partial: NationalityPath = {
      ...base,
      timeline: `Cerca de ${PENDING} meses`,
      documents: [
        { key: 'doc_ok', label: 'Documento confirmado', hint: PENDING },
        { key: 'doc_pendente', label: PENDING },
        { key: PENDING, label: 'Sem chave' },
      ],
      nextSteps: [
        { key: 'passo_ok', label: 'Passo confirmado', detail: 'Detalhe confirmado' },
        { key: 'passo_pendente', label: `  ${PENDING}  ` },
      ],
    }
    expect(getPathTimeline(partial)).toBeNull()
    expect(getPathDocuments(partial)).toEqual([{ key: 'doc_ok', label: 'Documento confirmado', hint: undefined }])
    expect(getPathSteps(partial)).toEqual([{ key: 'passo_ok', label: 'Passo confirmado', detail: 'Detalhe confirmado' }])
  })

  it('campos preenchidos passam', () => {
    const filled: NationalityPath = {
      ...base,
      timeline: '  Prazo confirmado  ',
      documents: [{ key: 'a', label: 'A', hint: 'Dica' }],
      nextSteps: [{ key: 'b', label: 'B' }],
    }
    expect(getPathTimeline(filled)).toBe('Prazo confirmado')
    expect(getPathDocuments(filled)).toEqual([{ key: 'a', label: 'A', hint: 'Dica' }])
    expect(getPathSteps(filled)).toEqual([{ key: 'b', label: 'B' }])
  })

  it('o que os helpers devolvem para os dados atuais nunca contém o marcador', () => {
    for (const path of Object.values(NATIONALITY_PATHS)) {
      const rendered = JSON.stringify({
        timeline: getPathTimeline(path),
        documents: getPathDocuments(path),
        steps: getPathSteps(path),
      })
      expect(rendered).not.toContain('A_PREENCHER')
    }
  })

  it('aceita caminho nulo', () => {
    expect(getPathTimeline(null)).toBeNull()
    expect(getPathDocuments(undefined)).toEqual([])
    expect(getPathSteps(null)).toEqual([])
  })
})
