// Testes do delete-account com Stripe, Storage, banco e Auth falsos (DI-083).
// Nenhuma chamada de rede. Rodar: deno test --no-config supabase/functions

import { assert, assertEquals, assertNotIncludes } from '../_shared/test-asserts.ts'
import {
  CASE_DOCUMENTS_BUCKET,
  createDeleteAccountHandler,
  type DeleteAccountRepo,
  EraseRefusedError,
  type EraseResult,
  normalizeEmail,
  type StripeSubscriptionsClient,
  USER_DOCUMENTS_BUCKET,
} from './handler.ts'

const USER_ID = '7d0f3c1e-1111-4111-8111-111111111111'
const OTHER_ID = '9a1b2c3d-2222-4222-8222-222222222222'
const EMAIL = 'ana@example.com'

class FakeRepo implements DeleteAccountRepo {
  staff = false
  openCase = false
  subscriptionId: string | null = null
  files = new Map<string, string[]>([[USER_DOCUMENTS_BUCKET, []], [CASE_DOCUMENTS_BUCKET, []]])
  erase: EraseResult = { paymentsRetained: 1, caseDocumentPaths: [] }
  eraseError: unknown = null
  removeError: Partial<Record<string, unknown>> = {}
  authDeleteError: unknown = null
  calls: string[] = []
  erasedUserIds: string[] = []
  deletedAuthIds: string[] = []
  removed: Array<{ bucket: string; paths: string[] }> = []

  hasStaffRole(userId: string) {
    this.calls.push(`hasStaffRole:${userId}`)
    return Promise.resolve(this.staff)
  }
  hasOpenCase(userId: string) {
    this.calls.push(`hasOpenCase:${userId}`)
    return Promise.resolve(this.openCase)
  }
  getBilling(userId: string) {
    this.calls.push(`getBilling:${userId}`)
    return Promise.resolve({ stripeSubscriptionId: this.subscriptionId })
  }
  listUserFiles(userId: string) {
    this.calls.push(`listUserFiles:${userId}`)
    return Promise.resolve([...(this.files.get(USER_DOCUMENTS_BUCKET) ?? [])])
  }
  removeFiles(bucket: string, paths: string[]) {
    this.calls.push(`removeFiles:${bucket}`)
    if (this.removeError[bucket]) return Promise.reject(this.removeError[bucket])
    this.removed.push({ bucket, paths: [...paths] })
    return Promise.resolve()
  }
  eraseUser(userId: string) {
    this.calls.push(`eraseUser:${userId}`)
    if (this.eraseError) return Promise.reject(this.eraseError)
    this.erasedUserIds.push(userId)
    return Promise.resolve(this.erase)
  }
  deleteAuthUser(userId: string) {
    this.calls.push(`deleteAuthUser:${userId}`)
    if (this.authDeleteError) return Promise.reject(this.authDeleteError)
    this.deletedAuthIds.push(userId)
    return Promise.resolve()
  }
}

class FakeStripe implements StripeSubscriptionsClient {
  status = 'active'
  retrieveError: unknown = null
  cancelError: unknown = null
  cancelled: string[] = []
  subscriptions = {
    retrieve: (id: string) =>
      this.retrieveError ? Promise.reject(this.retrieveError) : Promise.resolve({ id, status: this.status }),
    cancel: (id: string) => {
      if (this.cancelError) return Promise.reject(this.cancelError)
      this.cancelled.push(id)
      this.status = 'canceled'
      return Promise.resolve({ id, status: 'canceled' })
    },
  }
}

function setup(opts: { stripe?: FakeStripe | null } = {}) {
  const repo = new FakeRepo()
  const stripe = opts.stripe === undefined ? new FakeStripe() : opts.stripe
  const logs: Array<{ level: string; event: string; data?: Record<string, unknown> }> = []
  const handler = createDeleteAccountHandler({
    repo,
    stripe,
    getUser: (header) => Promise.resolve(header === 'Bearer jwt-ana' ? { id: USER_ID, email: EMAIL } : null),
    log: (level, event, data) => logs.push({ level, event, data }),
  })
  const call = async (
    body: unknown = { confirm_email: EMAIL },
    headers: Record<string, string> = { Authorization: 'Bearer jwt-ana' },
    method = 'POST',
  ) => {
    const res = await handler(
      new Request('http://localhost/functions/v1/delete-account', {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      }),
    )
    const text = await res.text()
    // deno-lint-ignore no-explicit-any
    let parsed: any = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // texto puro (OPTIONS)
    }
    return { status: res.status, body: parsed, headers: res.headers }
  }
  return { repo, stripe, logs, call }
}

Deno.test('normalizeEmail: ignora caixa e espaços', () => {
  assertEquals(normalizeEmail('  Ana@Example.COM '), 'ana@example.com')
  assertEquals(normalizeEmail(undefined), '')
  assertEquals(normalizeEmail(42), '')
})

Deno.test('sem Authorization ou token inválido → 401 e nada é tocado', async () => {
  const { call, repo } = setup()
  assertEquals((await call(undefined, {})).status, 401)
  assertEquals((await call(undefined, { Authorization: 'Bearer outro' })).status, 401)
  assertEquals((await call(undefined, { Authorization: 'Basic abc' })).status, 401)
  assertEquals(repo.calls.length, 0)
})

Deno.test('confirmação ausente ou diferente → 400 e nada é apagado', async () => {
  const { call, repo, stripe } = setup()
  assertEquals((await call({})).body, { error: 'confirmation_required' })
  assertEquals((await call('não é json')).body, { error: 'confirmation_required' })
  assertEquals((await call({ confirm_email: 'outra@example.com' })).body, { error: 'confirmation_mismatch' })
  assertEquals(repo.calls.length, 0)
  assertEquals(stripe!.cancelled.length, 0)
})

Deno.test('o corpo não escolhe quem é apagado: user_id/e-mail de outra conta são ignorados', async () => {
  const { call, repo } = setup()
  const res = await call({ confirm_email: ' ANA@example.com ', user_id: OTHER_ID })
  assertEquals(res.status, 200)
  assertEquals(repo.erasedUserIds, [USER_ID])
  assertEquals(repo.deletedAuthIds, [USER_ID])
})

Deno.test('conta da equipe → 403 staff_account sem apagar nada', async () => {
  const { call, repo } = setup()
  repo.staff = true
  const res = await call()
  assertEquals(res.status, 403)
  assertEquals(res.body, { error: 'staff_account' })
  assertEquals(repo.erasedUserIds.length, 0)
  assertEquals(repo.deletedAuthIds.length, 0)
})

Deno.test('cliente sem assinatura: arquivos, banco e login apagados, nessa ordem', async () => {
  const { call, repo, stripe } = setup()
  repo.files.set(USER_DOCUMENTS_BUCKET, [`${USER_ID}/general/passaporte/1.pdf`, `${USER_ID}/a1/nif/2.png`])
  const res = await call()
  assertEquals(res.status, 200)
  assertEquals(res.body, { deleted: true, retained: { payments: 1 } })
  assertEquals(res.headers.get('Cache-Control'), 'no-store')
  assertEquals(stripe!.cancelled.length, 0)
  assertEquals(repo.removed, [{
    bucket: USER_DOCUMENTS_BUCKET,
    paths: [`${USER_ID}/general/passaporte/1.pdf`, `${USER_ID}/a1/nif/2.png`],
  }])
  const order = repo.calls.map((c) => c.split(':')[0])
  assertEquals(order, [
    'hasStaffRole',
    'hasOpenCase',
    'getBilling',
    'listUserFiles',
    'removeFiles',
    'eraseUser',
    'deleteAuthUser',
  ])
})

Deno.test('só remove arquivos dentro da pasta da própria conta', async () => {
  const { call, repo } = setup()
  repo.files.set(USER_DOCUMENTS_BUCKET, [`${USER_ID}/ok.pdf`, `${OTHER_ID}/nao.pdf`, `x${USER_ID}/nao.pdf`])
  assertEquals((await call()).status, 200)
  assertEquals(repo.removed[0].paths, [`${USER_ID}/ok.pdf`])
})

Deno.test('assinatura ativa é cancelada no Stripe antes de apagar', async () => {
  const { call, repo, stripe } = setup()
  repo.subscriptionId = 'sub_ABC123def'
  const res = await call()
  assertEquals(res.status, 200)
  assertEquals(stripe!.cancelled, ['sub_ABC123def'])
  // O cancelamento vem antes de qualquer remoção.
  assert(repo.calls.indexOf('listUserFiles:' + USER_ID) > repo.calls.indexOf('getBilling:' + USER_ID))
  assertEquals(repo.erasedUserIds, [USER_ID])
})

Deno.test('assinatura já cancelada ou inexistente no Stripe: segue sem cancelar de novo', async () => {
  const ended = setup()
  ended.repo.subscriptionId = 'sub_ABC123def'
  ended.stripe!.status = 'canceled'
  assertEquals((await ended.call()).status, 200)
  assertEquals(ended.stripe!.cancelled.length, 0)

  const missing = setup()
  missing.repo.subscriptionId = 'sub_ABC123def'
  missing.stripe!.retrieveError = Object.assign(new Error('No such subscription'), {
    code: 'resource_missing',
    statusCode: 404,
  })
  assertEquals((await missing.call()).status, 200)
  assertEquals(missing.repo.deletedAuthIds, [USER_ID])
})

Deno.test('Stripe falha ao cancelar → 502 e NADA é apagado (cobrança não pode ficar ativa)', async () => {
  const { call, repo, stripe } = setup()
  repo.subscriptionId = 'sub_ABC123def'
  stripe!.cancelError = Object.assign(new Error('rate limit'), { type: 'StripeRateLimitError', statusCode: 429 })
  const res = await call()
  assertEquals(res.status, 502)
  assertEquals(res.body, { error: 'subscription_cancel_failed' })
  assertEquals(repo.erasedUserIds.length, 0)
  assertEquals(repo.removed.length, 0)
  assertEquals(repo.deletedAuthIds.length, 0)
})

Deno.test('com assinatura e sem chave do Stripe → 500 e nada é apagado', async () => {
  const { call, repo } = setup({ stripe: null })
  repo.subscriptionId = 'sub_ABC123def'
  assertEquals((await call()).status, 500)
  assertEquals(repo.erasedUserIds.length, 0)
})

Deno.test('sem assinatura, a falta da chave do Stripe não impede a exclusão', async () => {
  const { call, repo } = setup({ stripe: null })
  assertEquals((await call()).status, 200)
  assertEquals(repo.deletedAuthIds, [USER_ID])
})

Deno.test('Storage falha → 502 antes de mexer no banco', async () => {
  const { call, repo } = setup()
  repo.files.set(USER_DOCUMENTS_BUCKET, [`${USER_ID}/1.pdf`])
  repo.removeError[USER_DOCUMENTS_BUCKET] = new Error('storage down')
  const res = await call()
  assertEquals(res.status, 502)
  assertEquals(res.body, { error: 'storage_cleanup_failed' })
  assertEquals(repo.erasedUserIds.length, 0)
})

Deno.test('processo em andamento → 409 open_case ANTES do Stripe e do Storage (nada é tocado)', async () => {
  const { call, repo, stripe } = setup()
  repo.openCase = true
  repo.subscriptionId = 'sub_ABC123def'
  repo.files.set(USER_DOCUMENTS_BUCKET, [`${USER_ID}/general/passaporte/1.pdf`])
  const res = await call()
  assertEquals(res.status, 409)
  assertEquals(res.body, { error: 'open_case' })
  assertEquals(stripe!.cancelled.length, 0)
  assertEquals(repo.removed.length, 0)
  assertEquals(repo.erasedUserIds.length, 0)
  assertEquals(repo.deletedAuthIds.length, 0)
  assertEquals(repo.calls.map((c) => c.split(':')[0]), ['hasStaffRole', 'hasOpenCase'])
})

Deno.test('processo aberto no meio do caminho: a RPC recusa → 409 open_case e o login continua', async () => {
  const { call, repo } = setup()
  repo.eraseError = new EraseRefusedError('open_case')
  const res = await call()
  assertEquals(res.status, 409)
  assertEquals(res.body, { error: 'open_case' })
  assertEquals(repo.deletedAuthIds.length, 0)
})

Deno.test('falha ao checar processos → 500 e nada é tocado', async () => {
  const { call, repo, stripe } = setup()
  repo.subscriptionId = 'sub_ABC123def'
  repo.hasOpenCase = () => Promise.reject(Object.assign(new Error('boom'), { code: 'XX000' }))
  const res = await call()
  assertEquals(res.status, 500)
  assertEquals(res.body, { error: 'internal_error' })
  assertEquals(stripe!.cancelled.length, 0)
  assertEquals(repo.removed.length, 0)
})

Deno.test('anexos de processo encerrado são removidos do bucket de casos (falha não bloqueia)', async () => {
  const ok = setup()
  ok.repo.erase = { paymentsRetained: 0, caseDocumentPaths: ['hub/c1/passaporte.pdf'] }
  assertEquals((await ok.call()).status, 200)
  assertEquals(ok.repo.removed, [{ bucket: CASE_DOCUMENTS_BUCKET, paths: ['hub/c1/passaporte.pdf'] }])

  const failing = setup()
  failing.repo.erase = { paymentsRetained: 0, caseDocumentPaths: ['hub/c1/passaporte.pdf'] }
  failing.repo.removeError[CASE_DOCUMENTS_BUCKET] = new Error('storage down')
  assertEquals((await failing.call()).status, 200)
  const warn = failing.logs.find((l) => l.event === 'case_files_cleanup_failed')
  assert(warn, 'loga a falha')
  assertNotIncludes(JSON.stringify(warn), 'passaporte.pdf')
})

Deno.test('falha no banco → 500 sem apagar o login; falha no Auth → 500 auth_delete_failed', async () => {
  const db = setup()
  db.repo.eraseError = Object.assign(new Error('boom'), { code: 'XX000' })
  assertEquals((await db.call()).body, { error: 'internal_error' })
  assertEquals(db.repo.deletedAuthIds.length, 0)

  const auth = setup()
  auth.repo.authDeleteError = Object.assign(new Error('Database error deleting user'), { status: 500 })
  const res = await auth.call()
  assertEquals(res.status, 500)
  assertEquals(res.body, { error: 'auth_delete_failed' })
  assertEquals(auth.repo.erasedUserIds, [USER_ID])
})

Deno.test('logs não levam e-mail nem token', async () => {
  const { call, repo, logs } = setup()
  repo.subscriptionId = 'sub_ABC123def'
  await call()
  const all = JSON.stringify(logs)
  assertNotIncludes(all, EMAIL)
  assertNotIncludes(all, 'jwt-ana')
})

Deno.test('GET → 405; OPTIONS → 200', async () => {
  const { call } = setup()
  assertEquals((await call(undefined, { Authorization: 'Bearer jwt-ana' }, 'GET')).status, 405)
  assertEquals((await call(undefined, {}, 'OPTIONS')).status, 200)
})
