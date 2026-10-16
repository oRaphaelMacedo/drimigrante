// Testes Deno: deno test --no-config supabase/functions
// Testa o módulo do FRONT src/lib/quiz-submission.ts (módulo puro, sem aliases),
// como o pathways_test.ts faz com src/data/quiz-questions.ts: este branch ainda
// não tem runner de testes do front (o Vitest chega com o W1-01).
//
// Regra garantida: um session_id corresponde a UM conjunto de respostas enviado.
// O compute-eligibility congela o resultado quando a análise de IA já existe, então
// reaproveitar o session_id com respostas novas deixaria score, vias e análise
// (pagos depois no checkout) presos às respostas antigas.

import { assert, assertEquals } from './test-asserts.ts'
import {
  answersKey,
  createSessionId,
  MAX_REMEMBERED_SUBMISSIONS,
  pickSubmissionSessionId,
  QUIZ_RESULT_KEY,
  readSubmittedSessions,
  rememberSubmission,
  SUBMITTED_SESSIONS_KEY,
} from '../../../src/lib/quiz-submission.ts'

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value))
  }
}

const A = { processo_tipo: 'nacionalidade', caso_tipo: 'A', a1: 'pai_mae' }
const B = { processo_tipo: 'nacionalidade', caso_tipo: 'B', b1_tempo_casamento: 'mais_3' }
const C = { processo_tipo: 'nacionalidade', caso_tipo: 'D', d2_tempo_autorizacao: 'mais_5' }

function idFactory(prefix = 'novo') {
  let n = 0
  const ids: string[] = []
  const createId = () => {
    const id = `${prefix}-${++n}`
    ids.push(id)
    return id
  }
  return { createId, ids }
}

Deno.test('primeiro envio usa o session_id atual', () => {
  const { createId, ids } = idFactory()
  const id = pickSubmissionSessionId({ currentSessionId: 's_1_a', answers: A, submitted: [], createId })
  assertEquals(id, 's_1_a')
  assertEquals(ids.length, 0)
})

Deno.test('reenvio com as MESMAS respostas reaproveita o session_id (idempotente)', () => {
  const { createId, ids } = idFactory()
  const id = pickSubmissionSessionId({
    currentSessionId: 's_1_a',
    answers: { ...A },
    submitted: [{ sessionId: 's_1_a', answersKey: answersKey(A) }],
    createId,
  })
  assertEquals(id, 's_1_a')
  assertEquals(ids.length, 0)
})

Deno.test('refazer o quiz na mesma sessão com respostas diferentes gera session_id novo', () => {
  const { createId } = idFactory()
  const id = pickSubmissionSessionId({
    currentSessionId: 's_1_a',
    answers: B,
    submitted: [{ sessionId: 's_1_a', answersKey: answersKey(A) }],
    createId,
  })
  assertEquals(id, 'novo-1')
})

Deno.test('estado anterior ao release (só o resultado guardado) também conta como envio', () => {
  const storage = new MemoryStorage()
  storage.setItem(
    QUIZ_RESULT_KEY,
    JSON.stringify({ sessionId: 's_legacy_1', assessmentId: 'a-1', answers: A, score: { total: 1 } }),
  )
  const submitted = readSubmittedSessions(storage)
  assertEquals(submitted, [{ sessionId: 's_legacy_1', answersKey: answersKey(A) }])

  const { createId } = idFactory()
  assertEquals(
    pickSubmissionSessionId({ currentSessionId: 's_legacy_1', answers: B, submitted, createId }),
    'novo-1',
  )
  assertEquals(
    pickSubmissionSessionId({ currentSessionId: 's_legacy_1', answers: A, submitted, createId }),
    's_legacy_1',
  )
})

Deno.test('aba antiga: sessão já enviada não é reaproveitada mesmo depois de outros envios', () => {
  // Envio 1 em S0 (A); envio 2 em S1 (B) sobrescreve o resultado guardado;
  // uma aba antiga ainda com S0 em memória envia C → precisa de id novo.
  const storage = new MemoryStorage()
  rememberSubmission(storage, { sessionId: 'S0', answersKey: answersKey(A) })
  storage.setItem(QUIZ_RESULT_KEY, JSON.stringify({ sessionId: 'S0', answers: A }))
  rememberSubmission(storage, { sessionId: 'S1', answersKey: answersKey(B) })
  storage.setItem(QUIZ_RESULT_KEY, JSON.stringify({ sessionId: 'S1', answers: B }))

  const { createId } = idFactory()
  const id = pickSubmissionSessionId({
    currentSessionId: 'S0',
    answers: C,
    submitted: readSubmittedSessions(storage),
    createId,
  })
  assertEquals(id, 'novo-1')
})

Deno.test('fluxo completo: cada refação vira um assessment novo; repetir o envio não duplica', () => {
  const storage = new MemoryStorage()
  const { createId } = idFactory('gerado')
  let currentSessionId = 'S0' // useQuizPersistence
  const persisted: Array<{ sessionId: string; answers: Record<string, string> }> = []

  // Simula o submitQuiz do useQuiz: escolhe o id, persiste, lembra o envio e gira a sessão.
  function submit(answers: Record<string, string>, opts: { rotate: boolean } = { rotate: true }) {
    const sessionId = pickSubmissionSessionId({
      currentSessionId,
      answers,
      submitted: readSubmittedSessions(storage),
      createId,
    })
    persisted.push({ sessionId, answers })
    storage.setItem(QUIZ_RESULT_KEY, JSON.stringify({ sessionId, answers }))
    rememberSubmission(storage, { sessionId, answersKey: answersKey(answers) })
    if (opts.rotate) currentSessionId = `S${persisted.length}` // resetSession()
    return sessionId
  }

  const first = submit(A)
  const second = submit(B)
  const third = submit(C)
  assertEquals([first, second, third], ['S0', 'S1', 'S2'])
  assertEquals(new Set(persisted.map((p) => p.sessionId)).size, 3, 'um session_id por conjunto de respostas')

  // Sem girar a sessão (ex.: falha antes do resetSession), o mesmo envio repetido não duplica…
  currentSessionId = 'S9'
  assertEquals(submit(A, { rotate: false }), 'S9')
  assertEquals(submit(A, { rotate: false }), 'S9')
  // …mas respostas novas na mesma sessão não reescrevem o assessment S9.
  assertEquals(submit(B, { rotate: false }), 'gerado-1')
})

Deno.test('answersKey ignora ordem das chaves e valores vazios, mas muda com qualquer resposta', () => {
  assertEquals(answersKey({ b: '2', a: '1' }), answersKey({ a: '1', b: '2' }))
  assertEquals(answersKey({ a: '1', vazio: '' }), answersKey({ a: '1' }))
  assertEquals(answersKey(null), answersKey({}))
  assert(answersKey({ a: '1' }) !== answersKey({ a: '2' }))
  assert(answersKey({ a: '1' }) !== answersKey({ a: '1', b: '2' }))
})

Deno.test('readSubmittedSessions tolera storage ausente, JSON quebrado e formato inesperado', () => {
  assertEquals(readSubmittedSessions(null), [])

  const broken = new MemoryStorage()
  broken.setItem(SUBMITTED_SESSIONS_KEY, '{nao-e-json')
  broken.setItem(QUIZ_RESULT_KEY, 'tambem-nao')
  assertEquals(readSubmittedSessions(broken), [])

  const odd = new MemoryStorage()
  odd.setItem(SUBMITTED_SESSIONS_KEY, JSON.stringify([{ sessionId: 1 }, 'x', null, { sessionId: 'ok', answersKey: '[]' }]))
  odd.setItem(QUIZ_RESULT_KEY, JSON.stringify({ assessmentId: 'sem-session' }))
  assertEquals(readSubmittedSessions(odd), [{ sessionId: 'ok', answersKey: '[]' }])

  const throwing = {
    getItem(): string | null {
      throw new Error('SecurityError')
    },
    setItem(): void {
      throw new Error('QuotaExceededError')
    },
  }
  assertEquals(readSubmittedSessions(throwing), [])
  rememberSubmission(throwing, { sessionId: 'x', answersKey: '[]' }) // não lança
})

Deno.test('rememberSubmission guarda o mais recente primeiro, sem duplicar, com limite', () => {
  const storage = new MemoryStorage()
  for (let i = 0; i < MAX_REMEMBERED_SUBMISSIONS + 5; i++) {
    rememberSubmission(storage, { sessionId: `S${i}`, answersKey: `k${i}` })
  }
  rememberSubmission(storage, { sessionId: 'S14', answersKey: 'k14-novo' })
  const list = JSON.parse(storage.getItem(SUBMITTED_SESSIONS_KEY)!) as Array<{ sessionId: string; answersKey: string }>
  assertEquals(list.length, MAX_REMEMBERED_SUBMISSIONS)
  assertEquals(list[0], { sessionId: 'S14', answersKey: 'k14-novo' })
  assertEquals(list.filter((e) => e.sessionId === 'S14').length, 1)
  // S14 voltou ao topo sem duplicar: ficam S14, S13…S5 (os 10 mais recentes).
  assertEquals(list[list.length - 1].sessionId, 'S5')
})

Deno.test('createSessionId gera ids distintos aceitos pelo RPC (8 a 64 caracteres)', () => {
  const a = createSessionId()
  const b = createSessionId()
  assert(a !== b)
  for (const id of [a, b]) {
    assert(id.length >= 8 && id.length <= 64, `tamanho inválido: ${id}`)
    assert(/^[0-9a-f-]{36}$/.test(id), `esperado UUID: ${id}`)
  }
})
