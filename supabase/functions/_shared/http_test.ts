// Testes Deno do log estruturado e dos helpers de posse.

import { assert, assertEquals } from './test-asserts.ts'
import { createLogger } from './http.ts'
import { canAccessAssessment, isValidSessionId, resolveCaller, unverifiedJwtRole } from './assessment-access.ts'

Deno.test('createLogger escreve uma linha JSON com fn, event e campos', () => {
  const original = console.error
  const lines: string[] = []
  console.error = (line: string) => lines.push(line)
  try {
    createLogger('send-email')('error', 'email_send', { trigger_key: 'welcome_free', status: 'failed', code: 'x' })
  } finally {
    console.error = original
  }
  assertEquals(lines.length, 1)
  const parsed = JSON.parse(lines[0])
  assertEquals(parsed.fn, 'send-email')
  assertEquals(parsed.event, 'email_send')
  assertEquals(parsed.trigger_key, 'welcome_free')
  assertEquals(parsed.status, 'failed')
  assert(typeof parsed.ts === 'string')
})

Deno.test('session_id: formatos aceitos e recusados', () => {
  assert(isValidSessionId('s_1760000000000_abc1234'))
  assert(isValidSessionId('8f14e45f-ceea-467e-a5b6-1b2c3d4e5f60-wl'))
  assert(!isValidSessionId('curto'))
  assert(!isValidSessionId('tem espaço no meio'))
  assert(!isValidSessionId('x'.repeat(65)))
  assert(!isValidSessionId(123))
})

Deno.test('resolveCaller só consulta o Auth para JWT de usuário', async () => {
  let calls = 0
  const opts = {
    serviceRoleKey: 'chave-service',
    getUserIdFromToken: () => {
      calls++
      return Promise.resolve('user-1')
    },
  }
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  const anon = `${enc({})}.${enc({ role: 'anon' })}.sig`
  const user = `${enc({})}.${enc({ role: 'authenticated' })}.sig`
  assertEquals(unverifiedJwtRole(anon), 'anon')
  assertEquals(await resolveCaller(anon, undefined, opts), { userId: null, sessionId: null, isServiceRole: false })
  assertEquals(calls, 0)
  assertEquals((await resolveCaller(user, 's_1760000000000_abc1234', opts)).userId, 'user-1')
  assertEquals(calls, 1)
  assertEquals((await resolveCaller('chave-service', undefined, opts)).isServiceRole, true)
})

Deno.test('canAccessAssessment: dono, sessão anônima e recusa', () => {
  const anon = { user_id: null, session_id: 's_1760000000000_abc1234' }
  const linked = { user_id: 'u1', session_id: 's_1760000000000_abc1234' }
  assert(canAccessAssessment(anon, { userId: null, sessionId: 's_1760000000000_abc1234' }))
  assert(!canAccessAssessment(anon, { userId: null, sessionId: 's_1760000000000_zzz9999' }))
  assert(!canAccessAssessment(linked, { userId: null, sessionId: 's_1760000000000_abc1234' }))
  assert(canAccessAssessment(linked, { userId: 'u1', sessionId: null }))
  assert(!canAccessAssessment(linked, { userId: 'u2', sessionId: null }))
})
