import { describe, expect, it } from 'vitest'
import {
  computeScore,
  getVisibleQuestions,
  suggestVisas,
  type QuizQuestion,
  type ShowIfRule,
  type VisaSuggestion,
} from './quiz-questions'

// ─── helpers ────────────────────────────────────────────────────────────────

type Answers = Record<string, string>

function question(
  key: string,
  fieldType: QuizQuestion['fieldType'],
  scores: number[],
  showIf?: ShowIfRule,
): QuizQuestion {
  return {
    key,
    themeCode: 'teste',
    themeName: 'Teste',
    themeColor: '#000000',
    fieldType,
    text: key,
    isRequired: true,
    showIf,
    options: scores.map((score) => ({ key: `s${score}`, label: String(score), score })),
  }
}

/** Pergunta única com opções de 0 a 100 pontos (máximo = 100). */
const PERCENT_QUESTIONS: QuizQuestion[] = [question('q', 'radio', [0, 34, 35, 59, 60, 100])]

const visibleKeys = (answers: Answers) => getVisibleQuestions(answers).map((q) => q.key)

const summary = (suggestions: VisaSuggestion[]) => suggestions.map((s) => [s.code, s.match])

const NAC = { processo_tipo: 'nacionalidade' } as const

// ─── computeScore: limiares de categoria ────────────────────────────────────

describe('computeScore — limiares de categoria', () => {
  it('59% é média e 60% é alta', () => {
    const at59 = computeScore({ q: 's59' }, PERCENT_QUESTIONS)
    const at60 = computeScore({ q: 's60' }, PERCENT_QUESTIONS)

    expect(at59).toMatchObject({ total: 59, max: 100, percentage: 59, category: 'media' })
    expect(at60).toMatchObject({ total: 60, max: 100, percentage: 60, category: 'alta' })
  })

  it('34% é baixa e 35% é média', () => {
    const at34 = computeScore({ q: 's34' }, PERCENT_QUESTIONS)
    const at35 = computeScore({ q: 's35' }, PERCENT_QUESTIONS)

    expect(at34).toMatchObject({ percentage: 34, category: 'baixa' })
    expect(at35).toMatchObject({ percentage: 35, category: 'media' })
  })

  it('arredonda o percentual antes de aplicar o limiar (59,5% → 60% → alta)', () => {
    const questions = [question('q1', 'radio', [0, 100]), question('q2', 'radio', [0, 19, 100])]

    const result = computeScore({ q1: 's100', q2: 's19' }, questions)

    expect(result).toMatchObject({ total: 119, max: 200, percentage: 60, category: 'alta' })
  })

  it('sem perguntas pontuáveis visíveis, o percentual é 0 e a categoria é baixa', () => {
    const result = computeScore({})

    expect(result).toMatchObject({ total: 0, max: 0, percentage: 0, category: 'baixa' })
  })

  it('pergunta visível sem resposta conta no máximo, mas não no total', () => {
    const questions = [question('q1', 'radio', [0, 50]), question('q2', 'radio', [0, 50])]

    const result = computeScore({ q1: 's50' }, questions)

    expect(result).toMatchObject({ total: 50, max: 100, percentage: 50 })
  })

  it('perguntas ocultas pela condição não entram no máximo', () => {
    const questions = [
      question('q1', 'radio', [0, 40]),
      question('q2', 'radio', [0, 60], { questionKey: 'q1', answerKey: 's0' }),
    ]

    const result = computeScore({ q1: 's40' }, questions)

    expect(result).toMatchObject({ total: 40, max: 40, percentage: 100 })
  })
})

// ─── computeScore: multiselect e bônus do caso E ───────────────────────────

describe('computeScore — multiselect e bônus do caso E', () => {
  it('ignora perguntas multiselect no total e no máximo', () => {
    const questions = [question('q1', 'radio', [0, 10]), question('m1', 'multiselect', [50, 80])]

    const result = computeScore({ q1: 's10', m1: 's50,s80' }, questions)

    expect(result).toMatchObject({ total: 10, max: 10, percentage: 100 })
  })

  it('caso E sozinho soma o bônus de base (55 de 70 → 79%, alta)', () => {
    const result = computeScore({ ...NAC, caso_tipo: 'E' })

    expect(result).toMatchObject({ total: 55, max: 70, percentage: 79, category: 'alta' })
  })

  it('o bônus do caso E se soma às respostas de outros casos', () => {
    const withoutE = computeScore({ ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'menos_3_anos' })
    const withE = computeScore({ ...NAC, caso_tipo: 'B,E', b1_tempo_casamento: 'menos_3_anos' })

    expect(withoutE).toMatchObject({ total: 15, max: 60, percentage: 25, category: 'baixa' })
    expect(withE).toMatchObject({ total: 70, max: 130, percentage: 54, category: 'media' })
  })

  it('sem o caso E não há bônus', () => {
    const result = computeScore({ ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' })

    expect(result).toMatchObject({ total: 60, max: 60, percentage: 100, category: 'alta' })
  })
})

// ─── computeScore: perfis reais do quiz ─────────────────────────────────────

describe('computeScore — perfis do quiz', () => {
  it('caso A (pai/mãe, com documento, sem laços) → 60 de 75, alta', () => {
    const result = computeScore({
      ...NAC,
      caso_tipo: 'A',
      a1_antepassado: 'pai_mae',
      a2_documento: 'sim',
      a4_lacos: 'nao',
      a6_filiacao: 'natural',
    })

    expect(result).toMatchObject({ total: 60, max: 75, percentage: 80, category: 'alta' })
  })

  it('caso C (nascido em Portugal, mora há menos de 2 anos) → 44%, média', () => {
    const result = computeScore({
      ...NAC,
      caso_tipo: 'C',
      c1_maior_idade: 'sim',
      c2_mora_portugal: 'sim',
      c3_tempo_portugal: 'menos_2',
    })

    expect(result).toMatchObject({ total: 35, max: 80, percentage: 44, category: 'media' })
  })

  it('caso D (AR há 5 anos ou mais) → 75 de 105, alta', () => {
    const result = computeScore({
      ...NAC,
      caso_tipo: 'D',
      d1_situacao_legal: 'sim',
      d2_tempo_autorizacao: 'mais_5',
      d7_consultar_agora: 'nao',
      d8_filhos_portugal: 'nao',
    })

    expect(result).toMatchObject({ total: 75, max: 105, percentage: 71, category: 'alta' })
  })

  it('caso F (mudou antes de 1974) → 100%, alta', () => {
    const result = computeScore({
      ...NAC,
      caso_tipo: 'F',
      f1_mora_portugal: 'sim',
      f2_quando_mudou: 'antes_1974',
    })

    expect(result).toMatchObject({ total: 70, max: 70, percentage: 100, category: 'alta' })
  })
})

// ─── getVisibleQuestions ────────────────────────────────────────────────────

describe('getVisibleQuestions', () => {
  it('sem respostas, só mostra a pergunta de roteamento', () => {
    expect(visibleKeys({})).toEqual(['processo_tipo'])
  })

  it('a seleção de caso só aparece para quem quer a nacionalidade', () => {
    expect(visibleKeys({ processo_tipo: 'visto' })).toEqual(['processo_tipo'])
    expect(visibleKeys({ ...NAC })).toEqual(['processo_tipo', 'caso_tipo'])
  })

  it('marcando só B, mostra apenas a pergunta do casamento', () => {
    expect(visibleKeys({ ...NAC, caso_tipo: 'B' })).toEqual([
      'processo_tipo',
      'caso_tipo',
      'b1_tempo_casamento',
    ])
  })

  it('multiselect em CSV abre as perguntas de cada caso marcado', () => {
    const keys = visibleKeys({ ...NAC, caso_tipo: 'A,B' })

    expect(keys).toEqual(expect.arrayContaining(['a1_antepassado', 'a6_filiacao', 'b1_tempo_casamento']))
    expect(keys).not.toContain('c1_maior_idade')
    expect(keys).not.toContain('d1_situacao_legal')
    expect(keys).not.toContain('f1_mora_portugal')
  })

  it('answerKey em lista: avô mostra documento e laços; "não sei" mostra genealogia', () => {
    const avo = visibleKeys({ ...NAC, caso_tipo: 'A', a1_antepassado: 'avo' })
    const naoSei = visibleKeys({ ...NAC, caso_tipo: 'A', a1_antepassado: 'nao_sei' })

    expect(avo).toEqual(expect.arrayContaining(['a2_documento', 'a4_lacos']))
    expect(avo).not.toContain('a5_genealogia')
    expect(naoSei).toContain('a5_genealogia')
    expect(naoSei).not.toContain('a2_documento')
    expect(naoSei).not.toContain('a4_lacos')
  })

  it('regra "any" da d7: aparece com AR (d1=sim) ou sem consulta prévia (d4=nao)', () => {
    const base = { ...NAC, caso_tipo: 'D' }

    expect(visibleKeys({ ...base, d1_situacao_legal: 'sim' })).toContain('d7_consultar_agora')
    expect(
      visibleKeys({ ...base, d1_situacao_legal: 'nao', d3_disposto_advogado: 'sim', d4_consultou_advogado: 'nao' }),
    ).toContain('d7_consultar_agora')
    expect(
      visibleKeys({ ...base, d1_situacao_legal: 'nao', d3_disposto_advogado: 'sim', d4_consultou_advogado: 'sim' }),
    ).not.toContain('d7_consultar_agora')
  })
})

// ─── suggestVisas ───────────────────────────────────────────────────────────

describe('suggestVisas — por caso', () => {
  it('não sugere nada fora do processo de nacionalidade', () => {
    expect(suggestVisas({ processo_tipo: 'visto' })).toEqual([])
    expect(suggestVisas({})).toEqual([])
  })

  it('caso A, 1.º grau: forte com documento, possível sem documento', () => {
    const base = { ...NAC, caso_tipo: 'A', a1_antepassado: 'pai_mae' }

    expect(summary(suggestVisas({ ...base, a2_documento: 'sim' }))).toEqual([
      ['nacionalidade_descendencia_1', 'strong'],
    ])
    expect(summary(suggestVisas({ ...base, a2_documento: 'nao' }))).toEqual([
      ['nacionalidade_descendencia_1', 'possible'],
    ])
  })

  it('caso A, 2.º/3.º grau: forte com documento e laços, possível com um deles, fraca sem nenhum', () => {
    const base = { ...NAC, caso_tipo: 'A', a1_antepassado: 'avo' }

    expect(summary(suggestVisas({ ...base, a2_documento: 'sim', a4_lacos: 'sim' }))).toEqual([
      ['nacionalidade_descendencia_2', 'strong'],
    ])
    expect(summary(suggestVisas({ ...base, a2_documento: 'nao', a4_lacos: 'sim' }))).toEqual([
      ['nacionalidade_descendencia_2', 'possible'],
    ])
    expect(summary(suggestVisas({ ...base, a1_antepassado: 'bisavo', a2_documento: 'nao', a4_lacos: 'nao' }))).toEqual([
      ['nacionalidade_descendencia_2', 'weak'],
    ])
  })

  it('caso A sem saber o antepassado sugere pesquisa genealógica (fraca)', () => {
    expect(summary(suggestVisas({ ...NAC, caso_tipo: 'A', a1_antepassado: 'nao_sei' }))).toEqual([
      ['pesquisa_genealogica', 'weak'],
    ])
  })

  it('caso B: forte com mais de 3 anos de casamento, fraca com menos', () => {
    expect(summary(suggestVisas({ ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' }))).toEqual([
      ['nacionalidade_casamento', 'strong'],
    ])
    expect(summary(suggestVisas({ ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'menos_3_anos' }))).toEqual([
      ['nacionalidade_casamento', 'weak'],
    ])
  })

  it('caso C: forte com 5+ anos, possível com 2 a 4, fraca com menos de 2', () => {
    const base = { ...NAC, caso_tipo: 'C', c1_maior_idade: 'sim', c2_mora_portugal: 'sim' }

    expect(summary(suggestVisas({ ...base, c3_tempo_portugal: '5_ou_mais' }))).toEqual([
      ['nacionalidade_nascimento', 'strong'],
    ])
    expect(summary(suggestVisas({ ...base, c3_tempo_portugal: '2_a_4' }))).toEqual([
      ['nacionalidade_nascimento', 'possible'],
    ])
    expect(summary(suggestVisas({ ...base, c3_tempo_portugal: 'menos_2' }))).toEqual([
      ['nacionalidade_nascimento', 'weak'],
    ])
  })

  it('caso D: forte com AR há 5+ anos, possível com AR recente, fraca sem AR', () => {
    const base = { ...NAC, caso_tipo: 'D' }

    expect(summary(suggestVisas({ ...base, d1_situacao_legal: 'sim', d2_tempo_autorizacao: 'mais_5' }))).toEqual([
      ['naturalizacao_residencia', 'strong'],
    ])
    expect(summary(suggestVisas({ ...base, d1_situacao_legal: 'sim', d2_tempo_autorizacao: 'menos_5' }))).toEqual([
      ['naturalizacao_residencia', 'possible'],
    ])
    expect(summary(suggestVisas({ ...base, d1_situacao_legal: 'nao' }))).toEqual([
      ['naturalizacao_residencia', 'weak'],
    ])
  })

  it('caso E sugere a reaquisição da nacionalidade (forte)', () => {
    expect(summary(suggestVisas({ ...NAC, caso_tipo: 'E' }))).toEqual([['reaquisicao_nacionalidade', 'strong']])
  })

  it('caso F: forte antes de 25/04/1974, possível depois', () => {
    const base = { ...NAC, caso_tipo: 'F', f1_mora_portugal: 'sim' }

    expect(summary(suggestVisas({ ...base, f2_quando_mudou: 'antes_1974' }))).toEqual([
      ['nacionalidade_ex_colonias', 'strong'],
    ])
    expect(summary(suggestVisas({ ...base, f2_quando_mudou: 'depois_1974' }))).toEqual([
      ['nacionalidade_ex_colonias', 'possible'],
    ])
  })

  it('vários casos geram uma sugestão por caso, na ordem A → F', () => {
    const result = suggestVisas({
      ...NAC,
      caso_tipo: 'E,B,A',
      a1_antepassado: 'pai_mae',
      a2_documento: 'sim',
      b1_tempo_casamento: 'mais_3_anos',
    })

    expect(result.map((s) => s.code)).toEqual([
      'nacionalidade_descendencia_1',
      'nacionalidade_casamento',
      'reaquisicao_nacionalidade',
    ])
  })

  it('nacionalidade sem nenhum caso marcado cai na análise personalizada (fraca)', () => {
    expect(summary(suggestVisas({ ...NAC }))).toEqual([['analise_personalizada', 'weak']])
  })

  it('toda sugestão tem nome e justificativa preenchidos', () => {
    const all = suggestVisas({
      ...NAC,
      caso_tipo: 'A,B,C,D,E,F',
      a1_antepassado: 'avo',
      b1_tempo_casamento: 'mais_3_anos',
      c3_tempo_portugal: '2_a_4',
      d1_situacao_legal: 'sim',
      f2_quando_mudou: 'depois_1974',
    })

    expect(all).toHaveLength(6)
    for (const s of all) {
      expect(s.name.trim()).not.toBe('')
      expect(s.reason.trim()).not.toBe('')
    }
  })
})
