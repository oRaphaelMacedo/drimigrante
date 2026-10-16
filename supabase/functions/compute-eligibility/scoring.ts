// compute-eligibility/scoring.ts — avaliador JSON-Logic mínimo e cálculo de score.
// Lógica movida sem alteração de comportamento do index.ts original (a revisão do
// score fica com o DI-006/_shared/quiz-engine.ts).

// Minimal JSON-Logic evaluator for MVP
// Phase 2: use full json-logic-js library
export function evaluateRule(rule: unknown, data: Record<string, unknown>): boolean {
  if (typeof rule !== 'object' || rule === null) return false

  const r = rule as Record<string, unknown>

  if ('and' in r && Array.isArray(r.and)) {
    return (r.and as unknown[]).every((sub) => evaluateRule(sub, data))
  }
  if ('or' in r && Array.isArray(r.or)) {
    return (r.or as unknown[]).some((sub) => evaluateRule(sub, data))
  }
  if ('>=' in r && Array.isArray(r['>='])) {
    const [a, b] = r['>='] as unknown[]
    return (resolveValue(a, data) as number) >= (resolveValue(b, data) as number)
  }
  if ('>' in r && Array.isArray(r['>'])) {
    const [a, b] = r['>'] as unknown[]
    return (resolveValue(a, data) as number) > (resolveValue(b, data) as number)
  }
  if ('in' in r && Array.isArray(r.in)) {
    const [val, arr] = r.in as unknown[]
    const resolved = resolveValue(val, data)
    return Array.isArray(arr) && arr.includes(resolved)
  }
  if ('==' in r && Array.isArray(r['=='])) {
    const [a, b] = r['=='] as unknown[]
    return resolveValue(a, data) === resolveValue(b, data)
  }

  return false
}

export function resolveValue(v: unknown, data: Record<string, unknown>): unknown {
  if (typeof v === 'object' && v !== null && 'var' in (v as Record<string, unknown>)) {
    const key = (v as { var: string }).var
    return data[key]
  }
  return v
}

export interface ScoringOption {
  question_key: string
  option_key: string
  score: number
}

export function calculateScore(answers: Record<string, unknown>, options: ScoringOption[]): number {
  let total = 0
  let maxPossible = 0

  const scoresByQuestion: Record<string, number> = {}
  const maxByQuestion: Record<string, number> = {}

  for (const opt of options) {
    if (!maxByQuestion[opt.question_key] || opt.score > maxByQuestion[opt.question_key]) {
      maxByQuestion[opt.question_key] = opt.score
    }
  }

  for (const opt of options) {
    const answer = answers[opt.question_key]
    if (answer === opt.option_key || (Array.isArray(answer) && (answer as string[]).includes(opt.option_key))) {
      if (!scoresByQuestion[opt.question_key] || opt.score > scoresByQuestion[opt.question_key]) {
        scoresByQuestion[opt.question_key] = opt.score
      }
    }
  }

  for (const [key, max] of Object.entries(maxByQuestion)) {
    maxPossible += max
    total += scoresByQuestion[key] ?? 0
  }

  return maxPossible > 0 ? Math.round((total / maxPossible) * 100) : 0
}

export function scoreCategoryFor(scoreNumeric: number): 'alta' | 'media' | 'baixa' {
  return scoreNumeric >= 65 ? 'alta' : scoreNumeric >= 35 ? 'media' : 'baixa'
}
