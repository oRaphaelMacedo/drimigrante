// Paridade do score entre o front (src/data/quiz-questions.ts) e o servidor
// (_shared/quiz-engine.ts) — DI-006. Roda no Vitest (`npm test`) e no Deno
// (`deno test supabase/functions`), via _shared/testing/dual-runner.ts.
//
// O que garante:
//  · o espelho do código (ENGINE_QUESTIONS) tem as mesmas chaves, tipos, showIf e
//    pontos de QUIZ_QUESTIONS;
//  · categoria e percentual iguais nos dois lados para os perfis A–F e para 2000
//    perfis gerados pelo próprio fluxo do quiz;
//  · com as linhas do banco como estão em produção (9 condições incompletas), o
//    servidor monta as perguntas como o navegador (no Vitest, comparado com o
//    mapQuizRows do front) e chega ao mesmo score.

import { assert, assertEquals } from './test-asserts.ts'
import { importInVitest, isDeno, test } from './testing/dual-runner.ts'
import {
  buildEngineQuestions,
  computeScore,
  type DbScoringQuestionRow,
  ENGINE_QUESTIONS,
  type EngineQuestion,
  getVisibleQuestions,
  NEVER_SHOW,
  parseDisplayConditions,
  planScoreBackfill,
  QUIZ_SCORING_SELECT,
  scoreAssessment,
  scoreCategoryFor,
  type ShowIfRule,
} from './quiz-engine.ts'
import {
  computeScore as clientComputeScore,
  getVisibleQuestions as clientVisibleQuestions,
  QUIZ_QUESTIONS,
  type QuizQuestion,
} from '../../../src/data/quiz-questions.ts'

// O mapQuizRows do front importa tipos via alias `@/`, que só o Vitest resolve.
interface ClientConditionsModule {
  mapQuizRows(
    themes: unknown[],
    questions: unknown[],
    options: unknown[],
    opts?: { fallbackQuestions?: QuizQuestion[] },
  ): QuizQuestion[]
}
const clientConditions = await importInVitest<ClientConditionsModule>(
  new URL('../../../src/lib/quiz-conditions.ts', import.meta.url),
)

type Answers = Record<string, string>
const NAC = { processo_tipo: 'nacionalidade' }

// ─── Fixtures ────────────────────────────────────────────────────────────────

function toDbCondition(c: { questionKey: string; answerKey?: string | string[]; answerContains?: string }) {
  const out: Record<string, unknown> = { question_key: c.questionKey }
  if (c.answerKey !== undefined) out.answer_key = c.answerKey
  if (c.answerContains !== undefined) out.answer_contains = c.answerContains
  return out
}

function toDisplayConditions(rule: ShowIfRule | undefined): unknown {
  if (!rule) return null
  if ('any' in rule) return { any: rule.any.map(toDbCondition) }
  if ('all' in rule) return { all: rule.all.map(toDbCondition) }
  return toDbCondition(rule)
}

/** Condições gravadas incompletas em produção (GET somente leitura de 16/10/2026). */
const BROKEN_IN_PRODUCTION: Record<string, unknown> = {
  a1_antepassado: { question_key: 'caso_tipo' },
  a6_filiacao: { question_key: 'caso_tipo' },
  b1_tempo_casamento: { question_key: 'caso_tipo' },
  c1_maior_idade: { question_key: 'caso_tipo' },
  d1_situacao_legal: { question_key: 'caso_tipo' },
  d6_preparado_financeiro: { question_key: 'd5_motivo_nao_contratou' },
  d7_consultar_agora: {},
  d8_filhos_portugal: { question_key: 'caso_tipo' },
  f1_mora_portugal: { question_key: 'caso_tipo' },
}

function displayConditionsFor(q: QuizQuestion, broken: boolean): unknown {
  return broken && q.key in BROKEN_IN_PRODUCTION ? BROKEN_IN_PRODUCTION[q.key] : toDisplayConditions(q.showIf)
}

/** Linhas no formato do select QUIZ_SCORING_SELECT (servidor). */
function serverRows(broken: boolean): DbScoringQuestionRow[] {
  return QUIZ_QUESTIONS.map((q) => ({
    question_key: q.key,
    field_type: q.fieldType,
    display_conditions: displayConditionsFor(q, broken),
    form_question_options: (q.options ?? []).map((o) => ({ option_key: o.key, score: o.score, is_active: true })),
  }))
}

/** As mesmas linhas no formato que o navegador lê (3 tabelas, com ids). */
function clientRows(broken: boolean) {
  const themes = [{ id: 't1', code: 'processo', name_pt: 'Tipo de Processo', color: null, icon: null, sort_order: 0 }]
  const questions = QUIZ_QUESTIONS.map((q, i) => ({
    id: `q-${q.key}`,
    theme_id: 't1',
    question_key: q.key,
    question_text_pt: q.text,
    question_text_en: null,
    help_text: null,
    field_type: q.fieldType,
    display_conditions: displayConditionsFor(q, broken),
    validation_rules: null,
    placeholder: null,
    is_required: q.isRequired,
    sort_order: i,
  }))
  const options = QUIZ_QUESTIONS.flatMap((q) =>
    (q.options ?? []).map((o, i) => ({
      id: `o-${q.key}-${o.key}`,
      question_id: `q-${q.key}`,
      option_key: o.key,
      option_text_pt: o.label,
      option_text_en: null,
      score: o.score,
      is_eliminatory: false,
      sort_order: i,
    }))
  )
  return { themes, questions, options }
}

// Gerador pseudoaleatório determinístico (mulberry32), como em pathways_test.ts.
function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Simula o quiz: responde as perguntas visíveis na ordem, como o usuário faria. */
function randomConsistentAnswers(next: () => number): Answers {
  const answers: Answers = {}
  for (let guard = 0; guard < 50; guard++) {
    const pending = clientVisibleQuestions(answers).filter((q) => answers[q.key] === undefined)
    if (pending.length === 0) break
    const q = pending[0]
    const keys = (q.options ?? []).map((o) => o.key)
    if (q.key === 'processo_tipo') {
      answers[q.key] = next() < 0.85 ? 'nacionalidade' : keys[Math.floor(next() * keys.length)]
    } else if (q.fieldType === 'multiselect') {
      const picked = keys.filter(() => next() < 0.35)
      answers[q.key] = (picked.length ? picked : [keys[Math.floor(next() * keys.length)]]).join(',')
    } else {
      answers[q.key] = keys[Math.floor(next() * keys.length)]
    }
  }
  return answers
}

/** Perfis nomeados: um por caso (A–F) e combinações. */
const PROFILES: Array<{ name: string; answers: Answers; expected: { percentage: number; category: string } }> = [
  {
    name: 'A — pai/mãe com documento, sem laços',
    answers: { ...NAC, caso_tipo: 'A', a1_antepassado: 'pai_mae', a2_documento: 'sim', a4_lacos: 'nao', a6_filiacao: 'natural' },
    expected: { percentage: 80, category: 'alta' },
  },
  {
    name: 'A — não sabe o antepassado, quer pesquisar',
    answers: { ...NAC, caso_tipo: 'A', a1_antepassado: 'nao_sei', a5_genealogia: 'sim', a6_filiacao: 'natural' },
    expected: { percentage: 11, category: 'baixa' },
  },
  {
    name: 'B — casado há mais de 3 anos',
    answers: { ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' },
    expected: { percentage: 100, category: 'alta' },
  },
  {
    name: 'B — casado há menos de 3 anos',
    answers: { ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'menos_3_anos' },
    expected: { percentage: 25, category: 'baixa' },
  },
  {
    name: 'C — nascido em Portugal, mora há menos de 2 anos',
    answers: { ...NAC, caso_tipo: 'C', c1_maior_idade: 'sim', c2_mora_portugal: 'sim', c3_tempo_portugal: 'menos_2' },
    expected: { percentage: 44, category: 'media' },
  },
  {
    name: 'D — Autorização de Residência há 5 anos ou mais',
    answers: {
      ...NAC,
      caso_tipo: 'D',
      d1_situacao_legal: 'sim',
      d2_tempo_autorizacao: 'mais_5',
      d7_consultar_agora: 'nao',
      d8_filhos_portugal: 'nao',
    },
    expected: { percentage: 71, category: 'alta' },
  },
  {
    name: 'D — sem situação regularizada, consultou e achou caro',
    answers: {
      ...NAC,
      caso_tipo: 'D',
      d1_situacao_legal: 'nao',
      d3_disposto_advogado: 'sim',
      d4_consultou_advogado: 'sim',
      d5_motivo_nao_contratou: 'era_caro,sozinho',
      d6_preparado_financeiro: 'nao',
      d8_filhos_portugal: 'nao',
    },
    expected: { percentage: 25, category: 'baixa' },
  },
  {
    name: 'E — perdeu a nacionalidade (bônus de base)',
    answers: { ...NAC, caso_tipo: 'E' },
    expected: { percentage: 79, category: 'alta' },
  },
  {
    name: 'F — mudou-se antes de 1974',
    answers: { ...NAC, caso_tipo: 'F', f1_mora_portugal: 'sim', f2_quando_mudou: 'antes_1974' },
    expected: { percentage: 100, category: 'alta' },
  },
  {
    name: 'A + B + D combinados',
    answers: {
      ...NAC,
      caso_tipo: 'A,B,D',
      a1_antepassado: 'avo',
      a2_documento: 'nao',
      a3_interesse_docs: 'sim',
      a4_lacos: 'sim',
      a6_filiacao: 'natural',
      b1_tempo_casamento: 'menos_3_anos',
      d1_situacao_legal: 'sim',
      d2_tempo_autorizacao: 'menos_5',
      d7_consultar_agora: 'sim',
      d8_filhos_portugal: 'nao',
    },
    // 118 de 248: a1 30 + a3 8 + a4 15 + b1 15 + d1 15 + d2 25 + d7 10.
    expected: { percentage: 48, category: 'media' },
  },
  {
    name: 'objetivo visto (fora do diagnóstico de nacionalidade)',
    answers: { processo_tipo: 'visto' },
    expected: { percentage: 0, category: 'baixa' },
  },
]

function pick(score: { total: number; max: number; percentage: number; category: string }) {
  return { total: score.total, max: score.max, percentage: score.percentage, category: score.category }
}

// ─── Espelho do código ───────────────────────────────────────────────────────

test('ENGINE_QUESTIONS espelha chaves, tipos, showIf e pontos de QUIZ_QUESTIONS', () => {
  assertEquals(ENGINE_QUESTIONS.map((q) => q.key), QUIZ_QUESTIONS.map((q) => q.key))
  for (const q of QUIZ_QUESTIONS) {
    const mirror = ENGINE_QUESTIONS.find((e) => e.key === q.key) as EngineQuestion
    assertEquals(mirror.fieldType, q.fieldType, q.key)
    assertEquals(mirror.showIf, q.showIf, `showIf de ${q.key}`)
    assertEquals(
      mirror.options,
      (q.options ?? []).map((o) => ({ key: o.key, score: o.score })),
      `opções de ${q.key}`,
    )
  }
})

test('limiares de categoria: 60 alta, 35 média', () => {
  assertEquals([scoreCategoryFor(59), scoreCategoryFor(60)], ['media', 'alta'])
  assertEquals([scoreCategoryFor(34), scoreCategoryFor(35)], ['baixa', 'media'])
})

// ─── Paridade cliente × servidor ─────────────────────────────────────────────

test('perfis A–F: servidor e cliente dão o mesmo score e a categoria esperada', () => {
  const prodLike = buildEngineQuestions(serverRows(true))
  for (const { name, answers, expected } of PROFILES) {
    const client = pick(clientComputeScore(answers))
    assertEquals(pick(computeScore(answers)), client, `${name} (perguntas do código)`)
    assertEquals(pick(computeScore(answers, prodLike)), client, `${name} (linhas como em produção)`)
    assertEquals({ percentage: client.percentage, category: client.category }, expected, name)
  }
})

test('casado há mais de 3 anos fica "alta" com score ≥ 60 (antes: 60/428 → baixa)', () => {
  const score = scoreAssessment({ ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' }, serverRows(true))
  assertEquals(score.category, 'alta')
  assert(score.percentage >= 60, `percentual ${score.percentage}`)
  assertEquals(score.max, 60, 'o denominador só soma perguntas visíveis')
})

test('2000 perfis do fluxo: mesma visibilidade e mesmo score nos dois lados', () => {
  const prodLike = buildEngineQuestions(serverRows(true))
  const next = rng(20261016)
  for (let i = 0; i < 2000; i++) {
    const answers = randomConsistentAnswers(next)
    const context = JSON.stringify(answers)
    assertEquals(
      getVisibleQuestions(answers).map((q) => q.key),
      clientVisibleQuestions(answers).map((q) => q.key),
      context,
    )
    const client = pick(clientComputeScore(answers))
    assertEquals(pick(computeScore(answers)), client, context)
    assertEquals(pick(computeScore(answers, prodLike)), client, context)
  }
})

test(`linhas do banco montadas como no navegador (mapQuizRows)${isDeno ? ' — só no Vitest' : ''}`, () => {
  if (!clientConditions) {
    // Deno: o módulo do front usa o alias `@/`. No Vitest ele tem de carregar.
    assert(isDeno, 'src/lib/quiz-conditions.ts não carregou no Vitest')
    return
  }
  const next = rng(42)
  for (const broken of [false, true]) {
    const { themes, questions, options } = clientRows(broken)
    const clientQuestions = clientConditions.mapQuizRows(themes, questions, options, {
      fallbackQuestions: QUIZ_QUESTIONS,
    })
    const serverQuestions = buildEngineQuestions(serverRows(broken))
    assertEquals(
      serverQuestions.map((q) => ({ key: q.key, fieldType: q.fieldType, showIf: q.showIf, options: q.options })),
      clientQuestions.map((q) => ({
        key: q.key,
        fieldType: q.fieldType,
        showIf: q.showIf,
        options: q.options?.map((o) => ({ key: o.key, score: o.score })),
      })),
      `perguntas montadas (condições quebradas: ${broken})`,
    )
    for (let i = 0; i < 500; i++) {
      const answers = randomConsistentAnswers(next)
      assertEquals(
        pick(computeScore(answers, serverQuestions)),
        pick(clientComputeScore(answers, clientQuestions)),
        JSON.stringify(answers),
      )
    }
  }
})

// ─── Regras do motor ─────────────────────────────────────────────────────────

test('respostas de ramos ocultos não pontuam (pai precisa estar visível)', () => {
  // Marcou A → pai/mãe e depois trocou para só B: a1/a2 não contam mais.
  const stale = { ...NAC, caso_tipo: 'B', a1_antepassado: 'pai_mae', a2_documento: 'sim', b1_tempo_casamento: 'menos_3_anos' }
  assertEquals(pick(computeScore(stale)), { total: 15, max: 60, percentage: 25, category: 'baixa' })
  assertEquals(pick(computeScore(stale)), pick(clientComputeScore(stale)))
})

test('multisseleção não pontua e o caso E soma 55/70', () => {
  const withoutE = computeScore({ ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'menos_3_anos' })
  const withE = computeScore({ ...NAC, caso_tipo: 'B,E', b1_tempo_casamento: 'menos_3_anos' })
  assertEquals([withE.total - withoutE.total, withE.max - withoutE.max], [55, 70])
})

test('condição incompleta no banco usa a regra do código; sem equivalente, esconde', () => {
  assertEquals(parseDisplayConditions({ question_key: 'caso_tipo' }).kind, 'invalid')
  assertEquals(parseDisplayConditions({}).kind, 'invalid')
  assertEquals(parseDisplayConditions({ any: [] }).kind, 'invalid')
  assertEquals(parseDisplayConditions(null).kind, 'none')
  assertEquals(parseDisplayConditions({ question_key: 'caso_tipo', answer_contains: 'B' }), {
    kind: 'rule',
    rule: { questionKey: 'caso_tipo', answerContains: 'B' },
  })

  const repaired: string[] = []
  const questions = buildEngineQuestions(
    [
      ...serverRows(true),
      { question_key: 'pergunta_nova', field_type: 'radio', display_conditions: {}, form_question_options: [] },
    ],
    { onInvalidCondition: (key) => repaired.push(key) },
  )
  assertEquals(repaired.sort(), [...Object.keys(BROKEN_IN_PRODUCTION), 'pergunta_nova'].sort())
  assertEquals(questions.find((q) => q.key === 'b1_tempo_casamento')?.showIf, {
    questionKey: 'caso_tipo',
    answerContains: 'B',
  })
  assertEquals(questions.find((q) => q.key === 'pergunta_nova')?.showIf, NEVER_SHOW)
})

test('banco sem perguntas → perguntas do código; opções inativas não contam', () => {
  assertEquals(buildEngineQuestions([]), ENGINE_QUESTIONS)
  assertEquals(scoreAssessment({ ...NAC, caso_tipo: 'E' }, []).usedCodeQuestions, true)

  const rows = serverRows(false).map((row) =>
    row.question_key === 'b1_tempo_casamento'
      ? {
        ...row,
        form_question_options: [
          { option_key: 'mais_3_anos', score: 60, is_active: false },
          { option_key: 'menos_3_anos', score: 15, is_active: true },
        ],
      }
      : row
  )
  const score = scoreAssessment({ ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'menos_3_anos' }, rows)
  assertEquals(pick(score), { total: 15, max: 15, percentage: 100, category: 'alta' })
})

test('scoreAssessment normaliza as respostas cruas do banco (multisseleção em array)', () => {
  const score = scoreAssessment({ ...NAC, caso_tipo: ['B'], b1_tempo_casamento: 'mais_3_anos' }, serverRows(true))
  assertEquals(pick(score), { total: 60, max: 60, percentage: 100, category: 'alta' })
  assertEquals(scoreAssessment(null, serverRows(true)).percentage, 0)
})

test('o select usa a hint da FK question_id (o embed sem hint dá PGRST201)', () => {
  assert(QUIZ_SCORING_SELECT.includes('form_question_options!form_question_options_question_id_fkey('))
})

// ─── Backfill (scripts/backfill-scores.mjs) ──────────────────────────────────

test('planScoreBackfill corrige os 0/"baixa" gravados e não toca o que já está certo', () => {
  const casado = { ...NAC, caso_tipo: 'B', b1_tempo_casamento: 'mais_3_anos' }
  const visto = { processo_tipo: 'visto' }
  const answers = new Map<string, unknown>([
    ['a-casado', casado],
    ['a-visto', visto],
    ['a-descendente', { ...NAC, caso_tipo: ['A'], a1_antepassado: 'pai_mae', a2_documento: 'sim', a4_lacos: 'nao' }],
    ['a-ja-certo', casado],
  ])
  const plan = planScoreBackfill(
    [
      // Como em produção hoje: score 0 / 'baixa' gravado para todo mundo.
      { assessment_id: 'a-casado', score_numeric: 0, score_category: 'baixa', has_analysis: true },
      { assessment_id: 'a-visto', score_numeric: '0.00', score_category: 'baixa' },
      { assessment_id: 'a-descendente', score_numeric: null, score_category: null },
      { assessment_id: 'a-ja-certo', score_numeric: '100.00', score_category: 'alta' },
      { assessment_id: 'a-sem-respostas', score_numeric: 0, score_category: 'baixa' },
    ],
    answers,
    serverRows(true),
  )

  assertEquals(plan.changes, [
    {
      assessmentId: 'a-casado',
      before: { scoreNumeric: 0, scoreCategory: 'baixa' },
      after: { scoreNumeric: 100, scoreCategory: 'alta' },
      hasAnalysis: true,
    },
    {
      assessmentId: 'a-descendente',
      before: { scoreNumeric: null, scoreCategory: null },
      after: { scoreNumeric: 80, scoreCategory: 'alta' },
      hasAnalysis: false,
    },
  ])
  // 'visto' já está 0/'baixa' (correto) e 'a-ja-certo' grava '100.00' (DECIMAL).
  assertEquals(plan.unchanged, 2)
  assertEquals(plan.missingAnswers, ['a-sem-respostas'])
  // As condições incompletas são reportadas uma vez, não por linha.
  assertEquals(plan.repairedConditions.sort(), Object.keys(BROKEN_IN_PRODUCTION).sort())
  assertEquals(plan.usedCodeQuestions, false)
})

test('planScoreBackfill dá o mesmo score que o cliente para perfis do fluxo', () => {
  const next = rng(7)
  const answers = new Map<string, unknown>()
  const rows = []
  for (let i = 0; i < 300; i++) {
    const id = `a-${i}`
    answers.set(id, randomConsistentAnswers(next))
    rows.push({ assessment_id: id, score_numeric: -1, score_category: 'x' })
  }
  const plan = planScoreBackfill(rows, answers, serverRows(true))
  assertEquals(plan.changes.length, 300)
  for (const change of plan.changes) {
    const client = clientComputeScore(answers.get(change.assessmentId) as Answers)
    assertEquals(
      change.after,
      { scoreNumeric: client.percentage, scoreCategory: client.category },
      change.assessmentId,
    )
  }
})
