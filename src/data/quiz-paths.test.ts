// Enumeração exaustiva do quiz: falha se uma pergunta repetida voltar, se um caminho
// crescer ou se a tela deixar de coletar uma informação que o motor usa.
import { describe, expect, it } from 'vitest'
import {
  getVisibleQuestions,
  pruneAnswers,
  QUIZ_QUESTIONS,
  type QuizQuestion,
} from './quiz-questions'
import { COMBINED_QUESTIONS, getAskedQuestions, materializeAnswers, resolveQuizFlow } from './quiz-asked'
import { walkQuizPaths, type QuizPath } from './quiz-paths'
import { nextStepAfter } from '@/lib/quiz-flow'

/**
 * O que cada pergunta quer saber. Pergunta nova precisa entrar aqui: duas perguntas
 * com o mesmo fato não podem aparecer no mesmo caminho, mesmo com textos diferentes.
 */
const FACT_OF_QUESTION: Record<string, string> = {
  processo_tipo: 'objetivo',
  caso_tipo: 'situacoes',
  a1_antepassado: 'antepassado',
  a2_documento: 'tem_documento',
  a3_interesse_docs: 'quer_documento',
  a4_lacos: 'lacos',
  a5_genealogia: 'quer_genealogia',
  a6_filiacao: 'filiacao',
  b1_tempo_casamento: 'tempo_casamento',
  c1_maior_idade: 'maior_idade',
  c2_mora_portugal: 'mora_em_portugal',
  c3_tempo_portugal: 'tempo_em_portugal',
  d1_situacao_legal: 'autorizacao_residencia',
  d2_tempo_autorizacao: 'tempo_autorizacao',
  d3_disposto_advogado: 'preparo_financeiro',
  d4_consultou_advogado: 'consultou_advogado',
  d5_motivo_nao_contratou: 'motivo_nao_contratou',
  d6_preparado_financeiro: 'preparo_financeiro',
  d7_consultar_agora: 'quer_consultar',
  d8_filhos_portugal: 'filhos_portugueses',
  f1_mora_portugal: 'mora_em_portugal',
  f2_quando_mudou: 'quando_mudou',
}

const NOT_LIVING_OPTION = 'nao_mora'

const baseQuestion = (key: string) => QUIZ_QUESTIONS.find((q) => q.key === key)!

/** Fatos que a pessoa informou ao responder esta pergunta, nesta tela. */
function factsLearned(question: QuizQuestion, answer: string | null): string[] {
  if (answer === null) return []
  const base = baseQuestion(question.key)
  const isCombined = question.options?.length !== base.options?.length || question.text !== base.text
  if (!isCombined) return [FACT_OF_QUESTION[question.key]]
  const combo = COMBINED_QUESTIONS.find((c) => c.key === question.key)!
  const sets = combo.options.find((o) => o.key === answer)?.sets ?? { [question.key]: answer }
  const offersNotLiving = question.options?.some((o) => o.key === NOT_LIVING_OPTION)
  return Object.keys(sets)
    .map((k) => FACT_OF_QUESTION[k])
    .filter((fact) => fact !== 'mora_em_portugal' || offersNotLiving)
}

function repeatedFacts({ asked, given, raw }: QuizPath): string[] {
  const seen = new Set<string>()
  if ((raw.caso_tipo ?? '').split(',').includes('D')) seen.add('mora_em_portugal')
  const repeated: string[] = []
  asked.forEach((question, i) => {
    for (const fact of factsLearned(question, given[i])) {
      if (seen.has(fact)) repeated.push(fact)
      seen.add(fact)
    }
  })
  return repeated
}

const tokens = (text: string) =>
  new Set(text.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 2))

function similarity(a: string, b: string): number {
  const [x, y] = [tokens(a), tokens(b)]
  const shared = [...x].filter((t) => y.has(t)).length
  return shared / (x.size + y.size - shared)
}

// Uma enumeração só para todos os testes: leva poucos segundos.
const paths: QuizPath[] = []
walkQuizPaths((path) => paths.push(path))

// Limite próprio: são centenas de milhares de caminhos, e a suíte roda em paralelo.
describe('todos os caminhos do quiz', { timeout: 60_000 }, () => {
  it('toda pergunta tem um fato classificado', () => {
    const missing = QUIZ_QUESTIONS.map((q) => q.key).filter((key) => !FACT_OF_QUESTION[key])
    expect(missing).toEqual([])
  })

  it('nenhuma pergunta aparece duas vezes no mesmo caminho', () => {
    const bad = paths.filter((p) => new Set(p.asked.map((q) => q.key)).size !== p.asked.length)
    expect(bad.map((p) => p.raw)).toEqual([])
  })

  it('nenhum fato é perguntado duas vezes, mesmo com textos diferentes', () => {
    const bad = paths.filter((p) => repeatedFacts(p).length > 0)
    expect(bad.slice(0, 5).map((p) => ({ raw: p.raw, repetidos: repeatedFacts(p) }))).toEqual([])
  })

  it('duas perguntas do mesmo caminho não têm texto quase igual', () => {
    const sequences = new Map(paths.map((p) => [p.asked.map((q) => q.key).join('>'), p.asked]))
    const bad: string[] = []
    for (const asked of sequences.values()) {
      for (let i = 0; i < asked.length; i++) {
        for (let j = i + 1; j < asked.length; j++) {
          if (similarity(asked[i].text, asked[j].text) >= 0.8) bad.push(`${asked[i].key} ~ ${asked[j].key}`)
        }
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('a tela só mostra o que a pessoa ainda vai responder (nada aparece para trás)', () => {
    const bad = paths.filter((p) => {
      const final = resolveQuizFlow(p.raw).asked.map((q) => q.key)
      return final.join('>') !== p.asked.map((q) => q.key).join('>')
    })
    expect(bad.slice(0, 5).map((p) => p.raw)).toEqual([])
  })

  it('as respostas entregues ao motor são um questionário completo do formato antigo', () => {
    const bad = paths.filter(({ answers }) => {
      const visible = getVisibleQuestions(answers)
      const missing = visible.filter((q) => q.isRequired && !answers[q.key])
      const invalid = visible.filter(
        (q) => q.fieldType === 'radio' && answers[q.key] && !q.options?.some((o) => o.key === answers[q.key]),
      )
      return missing.length > 0 || invalid.length > 0 || JSON.stringify(pruneAnswers(answers)) !== JSON.stringify(answers)
    })
    expect(bad.slice(0, 5).map((p) => p.answers)).toEqual([])
  })

  it('o "Próximo" da tela segue exatamente estes caminhos', () => {
    // Uma amostra de cada sequência distinta: nextStepAfter usa a mesma lista de perguntas.
    const samples = new Map(paths.map((p) => [p.asked.map((q) => q.key).join('>'), p]))
    for (const { asked, raw } of samples.values()) {
      asked.forEach((question, i) => {
        const step = nextStepAfter(raw, QUIZ_QUESTIONS, question.key)
        if (i === asked.length - 1) {
          expect(['capture', 'comingsoon'], question.key).toContain(step.kind)
        } else {
          expect(step, question.key).toEqual({ kind: 'question', index: i + 1 })
        }
      })
    }
  })

  it('nenhuma informação se perde: toda resposta coerente do questionário antigo continua alcançável', () => {
    // Caminhos do formato antigo (uma pergunta por fato), com os casos que interagem entre si.
    const reachable = new Set(paths.map((p) => canonical(p.answers)))
    const lost: Record<string, string>[] = []
    const walkOld = (answers: Record<string, string>, currentKey: string) => {
      const visible = getVisibleQuestions(answers)
      const next = visible[visible.findIndex((q) => q.key === currentKey) + 1]
      if (!next) {
        if (isCoherent(answers) && !reachable.has(canonical(answers))) lost.push(answers)
        return
      }
      const options = next.key === 'caso_tipo' ? INTERACTING_CASES : choicesOf(next)
      for (const choice of options) {
        walkOld(choice === null ? answers : { ...answers, [next.key]: choice }, next.key)
      }
    }
    walkOld({ processo_tipo: 'nacionalidade' }, 'processo_tipo')
    expect(lost.slice(0, 5)).toEqual([])
  })
})

// A, C, D e F são os casos cujas perguntas dependem umas das outras. B e E não têm regra cruzada.
const INTERACTING_CASES = ['A', 'C', 'D', 'F', 'A,D', 'C,D', 'C,F', 'D,F', 'C,D,F', 'A,C,D,F']

function choicesOf(question: QuizQuestion): (string | null)[] {
  if (question.key === 'd5_motivo_nao_contratou') return ['era_caro', 'sozinho', 'era_caro,sozinho']
  const keys: (string | null)[] = (question.options ?? []).map((o) => o.key)
  if (!question.isRequired) keys.push(null)
  return keys
}

const canonical = (answers: Record<string, string>) =>
  JSON.stringify(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)))

/** Resposta contraditória (ou a6 sem antepassado para filiar) não existe mais na tela. */
function isCoherent(a: Record<string, string>): boolean {
  const casos = (a.caso_tipo ?? '').split(',')
  const livesHere = casos.includes('D')
  if (livesHere && (a.c2_mora_portugal === 'nao' || a.f1_mora_portugal === 'nao' || a.a4_lacos === 'nao')) return false
  if (a.c2_mora_portugal && a.f1_mora_portugal && a.c2_mora_portugal !== a.f1_mora_portugal) return false
  if (a.d3_disposto_advogado === 'sim' && a.d6_preparado_financeiro === 'nao') return false
  if (['trisavo', 'nao_sei'].includes(a.a1_antepassado ?? '') && a.a6_filiacao) return false
  return true
}

describe('tamanho dos caminhos', () => {
  const longest = (caso: string) =>
    Math.max(...paths.filter((p) => p.raw.caso_tipo === caso).map((p) => p.asked.length))

  it.each([
    ['A', 6],
    ['B', 3],
    ['C', 3],
    ['D', 6],
    ['E', 2],
    ['F', 3],
    ['nenhum', 2],
    ['A,B,C,D,E,F', 12],
  ])('caso %s tem no máximo %i perguntas', (caso, max) => {
    expect(longest(caso)).toBeLessThanOrEqual(max)
  })

  it('objetivo diferente de nacionalidade termina na primeira pergunta', () => {
    const others = paths.filter((p) => p.raw.processo_tipo !== 'nacionalidade')
    expect(others).toHaveLength(3)
    expect(others.every((p) => p.asked.length === 1)).toBe(true)
  })
})

describe('deduções', () => {
  const NAC = { processo_tipo: 'nacionalidade' }
  const keys = (raw: Record<string, string>) => getAskedQuestions(raw).map((q) => q.key)

  it('quem marcou "Moro em Portugal" não responde de novo se mora em Portugal', () => {
    const asked = getAskedQuestions({ ...NAC, caso_tipo: 'C,D,F' })
    const offered = asked.flatMap((q) => (q.options ?? []).map((o) => o.key))
    expect(offered).not.toContain(NOT_LIVING_OPTION)
    expect(keys({ ...NAC, caso_tipo: 'C,D,F' })).not.toContain('c2_mora_portugal')
    expect(keys({ ...NAC, caso_tipo: 'C,D,F' })).not.toContain('f1_mora_portugal')
  })

  it('morar em Portugal já conta como laço com Portugal', () => {
    const raw = { ...NAC, caso_tipo: 'A,D', a1_antepassado: 'avo', a2_documento: 'sim' }
    expect(keys(raw)).not.toContain('a4_lacos')
    expect(materializeAnswers(raw).a4_lacos).toBe('sim')
    expect(keys({ ...raw, caso_tipo: 'A' })).toContain('a4_lacos')
  })

  it('quem disse que não mora em Portugal não vê a pergunta de ex-colônias sobre a mudança', () => {
    const raw = { ...NAC, caso_tipo: 'C,F', c3_tempo_portugal: NOT_LIVING_OPTION }
    expect(keys(raw)).not.toContain('f2_quando_mudou')
    expect(materializeAnswers(raw)).toMatchObject({ c1_maior_idade: 'sim', c2_mora_portugal: 'nao', f1_mora_portugal: 'nao' })
  })

  it('menor de idade não informa onde mora: a pergunta de ex-colônias continua oferecendo a opção', () => {
    const raw = { ...NAC, caso_tipo: 'C,F', c3_tempo_portugal: 'menor_idade' }
    const f2 = getAskedQuestions(raw).find((q) => q.key === 'f2_quando_mudou')
    expect(f2?.options?.map((o) => o.key)).toContain(NOT_LIVING_OPTION)
    expect(materializeAnswers(raw).c1_maior_idade).toBe('nao')
  })

  it('d6 vem de d3: quem já disse ter condições não responde de novo', () => {
    const raw = {
      ...NAC,
      caso_tipo: 'D',
      d2_tempo_autorizacao: 'sem_autorizacao',
      d3_disposto_advogado: 'consultou',
      d5_motivo_nao_contratou: 'era_caro',
    }
    expect(keys(raw)).not.toContain('d6_preparado_financeiro')
    expect(materializeAnswers(raw)).toMatchObject({
      d1_situacao_legal: 'nao',
      d3_disposto_advogado: 'sim',
      d4_consultou_advogado: 'sim',
      d6_preparado_financeiro: 'sim',
    })
  })

  it('a6 só para quem tem antepassado com grau de parentesco a analisar', () => {
    for (const a1 of ['pai_mae', 'avo', 'bisavo']) {
      expect(keys({ ...NAC, caso_tipo: 'A', a1_antepassado: a1 })).toContain('a6_filiacao')
    }
    for (const a1 of ['trisavo', 'nao_sei', 'nao_sei_pesquisar']) {
      expect(keys({ ...NAC, caso_tipo: 'A', a1_antepassado: a1 })).not.toContain('a6_filiacao')
    }
  })
})

describe('perguntas combinadas', () => {
  const NAC = { processo_tipo: 'nacionalidade' }

  it.each<[string, Record<string, string>, Record<string, string>]>([
    ['c3 → moradia e maioridade', { caso_tipo: 'C', c3_tempo_portugal: '5_ou_mais' },
      { c1_maior_idade: 'sim', c2_mora_portugal: 'sim', c3_tempo_portugal: '5_ou_mais' }],
    ['c3 → menor de idade', { caso_tipo: 'C', c3_tempo_portugal: 'menor_idade' }, { c1_maior_idade: 'nao' }],
    ['f2 → não mora', { caso_tipo: 'F', f2_quando_mudou: NOT_LIVING_OPTION }, { f1_mora_portugal: 'nao' }],
    ['f2 → mudou antes', { caso_tipo: 'F', f2_quando_mudou: 'antes_1974' },
      { f1_mora_portugal: 'sim', f2_quando_mudou: 'antes_1974' }],
    ['d2 → sem autorização', { caso_tipo: 'D', d2_tempo_autorizacao: 'sem_autorizacao' }, { d1_situacao_legal: 'nao' }],
    ['d2 → 5 anos ou mais', { caso_tipo: 'D', d2_tempo_autorizacao: 'mais_5' },
      { d1_situacao_legal: 'sim', d2_tempo_autorizacao: 'mais_5' }],
    ['a2 → quer obter', { caso_tipo: 'A', a1_antepassado: 'avo', a2_documento: 'nao_quero_obter' },
      { a2_documento: 'nao', a3_interesse_docs: 'sim' }],
    ['a2 → sem interesse', { caso_tipo: 'A', a1_antepassado: 'avo', a2_documento: 'nao' },
      { a2_documento: 'nao', a3_interesse_docs: 'nao' }],
    ['a1 → quer pesquisar', { caso_tipo: 'A', a1_antepassado: 'nao_sei_pesquisar' },
      { a1_antepassado: 'nao_sei', a5_genealogia: 'sim' }],
    ['a1 → não quer pesquisar', { caso_tipo: 'A', a1_antepassado: 'nao_sei' },
      { a1_antepassado: 'nao_sei', a5_genealogia: 'nao' }],
    ['d3 → quer consultar agora', { caso_tipo: 'D', d2_tempo_autorizacao: 'sem_autorizacao', d3_disposto_advogado: 'consultar_agora' },
      { d3_disposto_advogado: 'sim', d4_consultou_advogado: 'nao', d7_consultar_agora: 'sim' }],
    ['d3 → não quer agora', { caso_tipo: 'D', d2_tempo_autorizacao: 'sem_autorizacao', d3_disposto_advogado: 'consultar_depois' },
      { d3_disposto_advogado: 'sim', d4_consultou_advogado: 'nao', d7_consultar_agora: 'nao' }],
    ['d3 → sem condições', { caso_tipo: 'D', d2_tempo_autorizacao: 'sem_autorizacao', d3_disposto_advogado: 'nao' },
      { d3_disposto_advogado: 'nao' }],
  ])('%s', (_name, raw, expected) => {
    expect(materializeAnswers({ ...NAC, ...raw })).toMatchObject(expected)
  })

  it('quem tem autorização ainda responde se quer consultar um advogado (d7 fora da combinada)', () => {
    const raw = { ...NAC, caso_tipo: 'D', d2_tempo_autorizacao: 'mais_5' }
    expect(getAskedQuestions(raw).map((q) => q.key)).toEqual([
      'processo_tipo', 'caso_tipo', 'd2_tempo_autorizacao', 'd7_consultar_agora', 'd8_filhos_portugal',
    ])
  })

  it('resposta que deixou de valer conta como não respondida', () => {
    // "Não moro" antes de marcar D: a opção some e a pessoa precisa escolher de novo.
    const raw = { ...NAC, caso_tipo: 'C,D', c3_tempo_portugal: NOT_LIVING_OPTION }
    expect(materializeAnswers(raw).c1_maior_idade).toBeUndefined()
    expect(getAskedQuestions(raw).map((q) => q.key)).toContain('c3_tempo_portugal')
  })

  it('pergunta desativada no admin desfaz a combinada, sem quebrar o fluxo', () => {
    const withoutA3 = QUIZ_QUESTIONS.filter((q) => q.key !== 'a3_interesse_docs')
    const raw = { ...NAC, caso_tipo: 'A', a1_antepassado: 'avo', a2_documento: 'nao' }
    const a2 = getAskedQuestions(raw, withoutA3).find((q) => q.key === 'a2_documento')
    expect(a2?.options?.map((o) => o.key)).toEqual(['sim', 'nao'])
    expect(materializeAnswers(raw, withoutA3)).toMatchObject({ a2_documento: 'nao' })
  })

  it('chaves que não são perguntas do quiz continuam nas respostas', () => {
    expect(materializeAnswers({ ...NAC, caso_tipo: 'E', origem_externa: 'x' })).toEqual({
      ...NAC,
      caso_tipo: 'E',
      origem_externa: 'x',
    })
  })
})
