// compute-eligibility/scoring.ts — avaliador JSON-Logic mínimo das regras de visto
// (rule_versions.rules). O score do quiz NÃO é calculado aqui: ele vem de
// _shared/quiz-engine.ts (DI-006), igual ao do front. O cálculo antigo (soma de todas
// as perguntas com denominador fixo de 428 pontos e limiar 65) foi removido.

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
