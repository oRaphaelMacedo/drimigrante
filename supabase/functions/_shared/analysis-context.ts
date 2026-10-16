// _shared/analysis-context.ts — monta o contexto do diagnóstico enviado à IA.
//
// Regras (DI-004 / DI-008):
//   · usa as chaves reais do quiz (QUESTION_CATALOG espelha src/data/quiz-questions.ts);
//   · só inclui perguntas visíveis e respondidas — nada de "Não aplicável";
//   · NUNCA inclui nome, e-mail, telefone ou qualquer campo de contato;
//   · todo valor é truncado em 200 caracteres e sem quebras de linha;
//   · as vias vêm de suggestPathways() (port de suggestVisas), nunca de visa_types do banco.

import {
  getCatalogQuestion,
  getVisibleKeys,
  normalizeAnswers,
  pruneAnswers,
  rankPathways,
  splitMulti,
  suggestPathways,
  type Pathway,
} from './pathways.ts'

export const MAX_CONTEXT_VALUE_LENGTH = 200

export interface ResultSummary {
  score_numeric?: number | string | null
  score_category?: string | null
}

const MATCH_LABEL: Record<Pathway['match'], string> = {
  strong: 'compatibilidade forte',
  possible: 'compatibilidade possível',
  weak: 'compatibilidade fraca',
}

const CATEGORY_LABEL: Record<string, string> = {
  alta: 'alta',
  media: 'média',
  média: 'média',
  baixa: 'baixa',
}

/** Remove quebras de linha/caracteres de controle e limita o tamanho. */
export function clip(value: string, max = MAX_CONTEXT_VALUE_LENGTH): string {
  // deno-lint-ignore no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export function categoryLabel(category: string | null | undefined): string | null {
  if (!category) return null
  return CATEGORY_LABEL[category] ?? clip(category, 40)
}

function optionLabel(questionKey: string, value: string): string {
  const q = getCatalogQuestion(questionKey)
  if (!q) return clip(value)
  if (q.multi) {
    const labels = splitMulti(value).map((v) => q.options[v] ?? v)
    return clip(labels.join('; '))
  }
  return clip(q.options[value] ?? value)
}

/** Vias de nacionalidade (ordenadas) para estas respostas, ignorando ramos ocultos. */
export function pathwaysFor(rawAnswers: unknown): Pathway[] {
  const answers = pruneAnswers(normalizeAnswers(rawAnswers))
  return rankPathways(suggestPathways(answers))
}

export function buildAnalysisContext(rawAnswers: unknown, result: ResultSummary | null): string {
  const answers = pruneAnswers(normalizeAnswers(rawAnswers))
  const lines: string[] = []

  if (answers.processo_tipo) {
    lines.push(`Objetivo: ${optionLabel('processo_tipo', answers.processo_tipo)}`)
  }

  const casos = splitMulti(answers.caso_tipo)
  if (casos.length > 0) {
    const casoQuestion = getCatalogQuestion('caso_tipo')
    lines.push('Situações declaradas:')
    for (const caso of casos) {
      lines.push(`- ${clip(casoQuestion?.options[caso] ?? caso)}`)
    }
  }

  const detailKeys = getVisibleKeys(answers).filter(
    (key) => key !== 'processo_tipo' && key !== 'caso_tipo' && answers[key] !== undefined,
  )
  if (detailKeys.length > 0) {
    lines.push('Respostas do questionário:')
    for (const key of detailKeys) {
      const q = getCatalogQuestion(key)
      if (!q) continue
      lines.push(`- ${clip(q.label)}: ${optionLabel(key, answers[key])}`)
    }
  }

  const category = categoryLabel(result?.score_category)
  const scoreValue = result?.score_numeric
  const score = scoreValue === null || scoreValue === undefined || scoreValue === ''
    ? null
    : Math.round(Number(scoreValue))
  if (category || (score !== null && Number.isFinite(score))) {
    const parts: string[] = []
    if (category) parts.push(`elegibilidade ${category}`)
    if (score !== null && Number.isFinite(score)) parts.push(`pontuação ${score} de 100`)
    lines.push(`Pré-resultado do diagnóstico: ${parts.join(', ')}`)
  }

  const pathways = rankPathways(suggestPathways(answers))
  if (pathways.length > 0) {
    lines.push('Vias de nacionalidade identificadas pelas regras do diagnóstico (da mais para a menos compatível):')
    pathways.forEach((p, i) => {
      lines.push(`${i + 1}. ${clip(p.name)} — ${MATCH_LABEL[p.match]}. Motivo: ${clip(p.reason)}`)
    })
  } else {
    lines.push('Vias de nacionalidade identificadas: nenhuma (o objetivo informado não é a nacionalidade portuguesa).')
  }

  return lines.join('\n')
}
