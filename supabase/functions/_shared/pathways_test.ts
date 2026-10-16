// Testes Deno: deno test --no-config supabase/functions
// Paridade entre _shared/pathways.ts (servidor) e src/data/quiz-questions.ts (front).

import { assert, assertEquals } from './test-asserts.ts'
import {
  getVisibleKeys,
  normalizeAnswers,
  pruneAnswers,
  QUESTION_CATALOG,
  suggestPathways,
} from './pathways.ts'
import {
  getVisibleQuestions,
  QUIZ_QUESTIONS,
  suggestVisas,
} from '../../../src/data/quiz-questions.ts'

// Gerador pseudoaleatório determinístico (mulberry32).
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
function randomConsistentAnswers(next: () => number): Record<string, string> {
  const answers: Record<string, string> = {}
  for (let guard = 0; guard < 50; guard++) {
    const pending = getVisibleQuestions(answers).filter((q) => answers[q.key] === undefined)
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

Deno.test('catálogo espelha as chaves e opções de QUIZ_QUESTIONS', () => {
  assertEquals(
    QUESTION_CATALOG.map((q) => q.key),
    QUIZ_QUESTIONS.map((q) => q.key),
  )
  for (const q of QUIZ_QUESTIONS) {
    const mirror = QUESTION_CATALOG.find((c) => c.key === q.key)!
    assertEquals(Object.keys(mirror.options).sort(), (q.options ?? []).map((o) => o.key).sort(), q.key)
    assertEquals(!!mirror.multi, q.fieldType === 'multiselect', q.key)
  }
})

Deno.test('suggestPathways tem paridade com suggestVisas (código, nome e match) em 3000 perfis', () => {
  const next = rng(20261016)
  for (let i = 0; i < 3000; i++) {
    const answers = randomConsistentAnswers(next)
    // Perfis gerados pelo próprio fluxo: visibilidade igual nas duas implementações.
    assertEquals(
      getVisibleKeys(answers),
      getVisibleQuestions(answers).map((q) => q.key),
      JSON.stringify(answers),
    )
    const server = suggestPathways(answers).map(({ code, name, match }) => ({ code, name, match }))
    const client = suggestVisas(answers).map(({ code, name, match }) => ({ code, name, match }))
    assertEquals(server, client, JSON.stringify(answers))
  }
})

Deno.test('textos das vias não prometem advogados nem serviços da plataforma', () => {
  const next = rng(7)
  for (let i = 0; i < 500; i++) {
    for (const p of suggestPathways(randomConsistentAnswers(next))) {
      assert(!/advogad/i.test(p.reason), p.reason)
      assert(!/nosso|podemos/i.test(p.reason), p.reason)
    }
  }
})

Deno.test('pruneAnswers descarta respostas de ramos abandonados', () => {
  // Marcou A → "não sei", depois trocou para só B: a5 e a1 não valem mais.
  const answers = {
    processo_tipo: 'nacionalidade',
    caso_tipo: 'B',
    a1_antepassado: 'nao_sei',
    a5_genealogia: 'sim',
    b1_tempo_casamento: 'mais_3_anos',
  }
  assertEquals(pruneAnswers(answers), {
    processo_tipo: 'nacionalidade',
    caso_tipo: 'B',
    b1_tempo_casamento: 'mais_3_anos',
  })
})

Deno.test('normalizeAnswers aceita arrays (legado) e ignora valores não textuais', () => {
  assertEquals(
    normalizeAnswers({ caso_tipo: ['A', 'B'], dev: true, n: 3, vazio: '  ', obj: { x: 1 } }),
    { caso_tipo: 'A,B', n: '3' },
  )
  assertEquals(normalizeAnswers(null), {})
  assertEquals(normalizeAnswers(['x']), {})
})
