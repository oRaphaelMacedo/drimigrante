// Testes Deno do lifecycle-emails (DI-077). O Resend é SEMPRE mockado: o fetch falso
// falha o teste se for chamado em dry-run, e nenhum teste sai para a rede.

import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from '../_shared/test-asserts.ts'
import {
  type AccessCandidate,
  DAY_MS,
  emailHash,
  type NurtureCandidate,
  verifyUnsubscribeToken,
  type WaitlistCandidate,
} from '../_shared/email-lifecycle.ts'
import type { LogLevel } from '../_shared/http.ts'
import {
  createLifecycleEmailsHandler,
  type EmailTemplateRow,
  type LifecycleDeps,
  type PendingLogRow,
  RESEND_URL,
} from './handler.ts'

const INTERNAL = 'internal-secret-de-teste'
const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789'
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0)
const TOKEN = 'b'.repeat(64)
const UNSUB_URL = 'https://proj.test/functions/v1/unsubscribe'

const iso = (ms: number) => new Date(ms).toISOString()

function nurture(email: string, overrides: Partial<NurtureCandidate> = {}): NurtureCandidate {
  return {
    assessmentId: `as-${email.split('@')[0].toLowerCase()}`,
    userId: null,
    email,
    fullName: 'Ana Souza',
    answers: { processo_tipo: 'nacionalidade', marketing_opt_in: true },
    completedAt: iso(NOW - 1.5 * DAY_MS),
    resumeToken: TOKEN,
    scoreCategory: 'media',
    ...overrides,
  }
}

function buyer(overrides: Partial<AccessCandidate> = {}): AccessCandidate {
  return {
    userId: 'u-buyer',
    email: 'cliente@example.com',
    fullName: 'Bruno Lima',
    timezone: 'America/Sao_Paulo',
    expiresAt: iso(NOW + 2 * DAY_MS),
    oneTimePaid: true,
    recurringActive: false,
    notificationPreferences: null,
    ...overrides,
  }
}

const TEMPLATE_KEYS = [
  'nurture_d1',
  'nurture_d3',
  'nurture_d7',
  'access_expiring_d7',
  'access_expiring_d3',
  'access_expired',
  'waitlist_launch',
] as const

function templateRows(): Map<string, EmailTemplateRow> {
  const map = new Map<string, EmailTemplateRow>()
  for (const key of TEMPLATE_KEYS) {
    map.set(key, {
      id: `tpl-${key}`,
      trigger_key: key,
      subject_pt: `Assunto ${key}`,
      body_html_pt: key.startsWith('waitlist')
        ? '<p>{{product_phrase}}</p><a href="{{cta_link}}">ir</a><a href="{{unsubscribe_link}}">sair</a>'
        : key.startsWith('nurture')
        ? '<p>{{greeting}} {{category_label}}</p><a href="{{result_link}}">ver</a><a href="{{unsubscribe_link}}">sair</a>'
        : '<p>{{greeting}} {{expires_on}}</p><a href="{{dashboard_link}}">painel</a><a href="{{unsubscribe_link}}">sair</a>',
    })
  }
  return map
}

interface LogRow extends Omit<PendingLogRow, 'status'> {
  id: string
  status: 'pending' | 'sent' | 'failed'
  error_message?: string | null
}

interface World {
  nurture: NurtureCandidate[]
  access: AccessCandidate[]
  waitlist: WaitlistCandidate[]
  paidUserIds: Set<string>
  paidEmails: Set<string>
  suppressions: Map<string, Set<string>>
  templates: Map<string, EmailTemplateRow>
  log: LogRow[]
  /** Chaves que "outra execução" já travou (claim devolve null). */
  concurrent: Set<string>
  resendStatus: number
  resendCalls: Array<{ headers: Record<string, string>; body: Record<string, unknown> }>
  logs: Array<{ level: LogLevel; event: string; data?: Record<string, unknown> }>
  sleeps: number[]
}

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    nurture: [],
    access: [],
    waitlist: [],
    paidUserIds: new Set(),
    paidEmails: new Set(),
    suppressions: new Map(),
    templates: templateRows(),
    log: [],
    concurrent: new Set(),
    resendStatus: 200,
    resendCalls: [],
    logs: [],
    sleeps: [],
    ...overrides,
  }
}

function makeHandler(world: World, env: Partial<LifecycleDeps['env']> = {}) {
  return createLifecycleEmailsHandler({
    repo: {
      listCompletedAssessments: () => Promise.resolve(world.nurture),
      getPaidAccounts: () => Promise.resolve({ userIds: world.paidUserIds, emails: world.paidEmails }),
      listAccessCandidates: () => Promise.resolve(world.access),
      listWaitlist: () => Promise.resolve(world.waitlist),
      getSentState: (keys) => {
        const sent = new Set<string>()
        const failedAttempts = new Map<string, number>()
        for (const row of world.log) {
          const key = row.variables_used.dedupe_key
          if (!keys.includes(key)) continue
          if (row.status === 'failed') failedAttempts.set(key, (failedAttempts.get(key) ?? 0) + 1)
          else sent.add(key)
        }
        return Promise.resolve({ sent, failedAttempts })
      },
      getSuppressions: (hashes) =>
        Promise.resolve(new Map([...world.suppressions].filter(([hash]) => hashes.includes(hash)))),
      getTemplates: (keys) => Promise.resolve(new Map([...world.templates].filter(([k]) => keys.includes(k as never)))),
      claimSend: (row) => {
        const key = row.variables_used.dedupe_key
        if (world.concurrent.has(key)) return Promise.resolve(null)
        if (world.log.some((r) => r.variables_used.dedupe_key === key && r.status !== 'failed')) {
          return Promise.resolve(null)
        }
        const id = `log-${world.log.length + 1}`
        world.log.push({ ...row, id })
        return Promise.resolve({ id })
      },
      finishSend: (id, patch) => {
        const row = world.log.find((r) => r.id === id)!
        Object.assign(row, patch)
        return Promise.resolve()
      },
    },
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      assertEquals(url, RESEND_URL)
      world.resendCalls.push({
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      })
      return Promise.resolve(
        new Response(
          JSON.stringify(world.resendStatus === 200 ? { id: `re_${world.resendCalls.length}` } : { name: 'validation_error', message: 'The domain is not verified (pessoa@example.com)' }),
          { status: world.resendStatus },
        ),
      )
    }) as typeof fetch,
    log: (level, event, data) => world.logs.push({ level, event, data }),
    now: () => NOW,
    sleep: (ms) => {
      world.sleeps.push(ms)
      return Promise.resolve()
    },
    env: {
      dryRun: false,
      internalSecret: INTERNAL,
      serviceRoleKey: 'service-role-de-teste',
      resendKey: 're_test_nao_usada',
      unsubscribeSecret: SECRET,
      appUrl: 'https://app.test',
      unsubscribeUrl: UNSUB_URL,
      ...env,
    },
  })
}

function post(body: Record<string, unknown> = {}, headers: Record<string, string> = { 'x-internal-secret': INTERNAL }) {
  return new Request('http://localhost/lifecycle-emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

/** Envio desligado (padrão de produção): o fetch falso registra qualquer chamada. */
const DRY = { dryRun: true }

Deno.test('sem o segredo interno (ou com outro) → 403; GET → 405', async () => {
  const world = makeWorld({ nurture: [nurture('a@example.com')] })
  assertEquals((await makeHandler(world)(post({}, {}))).status, 403)
  assertEquals((await makeHandler(world)(post({}, { 'x-internal-secret': 'errado' }))).status, 403)
  assertEquals((await makeHandler(world)(post({}, { Authorization: 'Bearer service-role-de-teste' }))).status, 200)
  assertEquals((await makeHandler(world)(new Request('http://localhost/x'))).status, 405)
})

Deno.test('DRY_RUN lista destinatários (mascarados) sem request ao Resend e sem gravar nada', async () => {
  const world = makeWorld({
    nurture: [
      nurture('ana@example.com'),
      nurture('sem-optin@example.com', { answers: { processo_tipo: 'nacionalidade' } }),
    ],
    access: [buyer()],
  })
  const res = await makeHandler(world, DRY)(post({ sequence: 'all' }))
  assertEquals(res.status, 200)
  const json = await res.json()
  assertEquals(json.dry_run, true)
  assertEquals(json.planned_total, 2)
  assertEquals(json.by_template, { nurture_d1: 1, access_expiring_d3: 1 })
  assertEquals(json.planned.map((p: { to: string }) => p.to).sort(), ['an***@example.com', 'cl***@example.com'])
  assertEquals(json.skipped.no_opt_in, 1)
  assertEquals(json.planned[0].subject, 'Assunto nurture_d1')
  // Nada saiu e nada foi gravado.
  assertEquals(world.resendCalls.length, 0)
  assertEquals(world.log.length, 0)
  const serialized = JSON.stringify(json) + JSON.stringify(world.logs)
  assertNotIncludes(serialized, 'ana@example.com')
  assertNotIncludes(serialized, 'cliente@example.com')
})

Deno.test('dry_run no corpo força o dry-run mesmo com o envio ligado; o corpo não liga o envio', async () => {
  const world = makeWorld({ nurture: [nurture('ana@example.com')] })
  const forced = await (await makeHandler(world)(post({ dry_run: true }))).json()
  assertEquals(forced.dry_run, true)
  assertEquals(world.resendCalls.length, 0)

  const stillDry = await (await makeHandler(world, DRY)(post({ dry_run: false }))).json()
  assertEquals(stillDry.dry_run, true)
  assertEquals(world.resendCalls.length, 0)
})

Deno.test('dry-run sem EMAIL_UNSUBSCRIBE_SECRET funciona, com aviso de descadastros não conferidos', async () => {
  const world = makeWorld({ nurture: [nurture('ana@example.com')] })
  const json = await (await makeHandler(world, { dryRun: true, unsubscribeSecret: undefined })(post())).json()
  assertEquals(json.planned_total, 1)
  assert(json.warnings.some((w: string) => w.includes('EMAIL_UNSUBSCRIBE_SECRET')), JSON.stringify(json.warnings))
})

Deno.test('envio real: ninguém sem opt-in recebe nutrição', async () => {
  const world = makeWorld({
    nurture: [
      nurture('com@example.com'),
      nurture('sem@example.com', { answers: {} }),
      nurture('falso@example.com', { answers: { marketing_opt_in: false } }),
      nurture('texto@example.com', { answers: { marketing_opt_in: 'sim' } }),
    ],
  })
  const json = await (await makeHandler(world)(post({ sequence: 'nurture' }))).json()
  assertEquals(json.sent, 1)
  assertEquals(world.resendCalls.map((c) => (c.body.to as string[])[0]), ['com@example.com'])
  assertEquals(json.skipped.no_opt_in, 3)
})

Deno.test('envio real: link de descadastro válido no corpo e List-Unsubscribe one-click; log sent', async () => {
  const world = makeWorld({ nurture: [nurture('Ana@Example.com')] })
  const json = await (await makeHandler(world)(post({ sequence: 'nurture' }))).json()
  assertEquals([json.sent, json.failed], [1, 0])

  const call = world.resendCalls[0]
  assertEquals(call.headers.Authorization, 'Bearer re_test_nao_usada')
  assertEquals(call.headers['Idempotency-Key'], 'nurture_d1:as-ana')
  assertEquals(call.body.to, ['ana@example.com'])
  const extra = call.body.headers as Record<string, string>
  assertEquals(extra['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  const link = /^<(.+)>$/.exec(extra['List-Unsubscribe'])![1]
  assert(link.startsWith(`${UNSUB_URL}?t=`), link)
  const verified = await verifyUnsubscribeToken(SECRET, decodeURIComponent(new URL(link).searchParams.get('t')!))
  assertEquals(verified, { emailHash: await emailHash(SECRET, 'ana@example.com'), scope: 'marketing' })
  assertStringIncludes(String(call.body.html), `href="${link}"`)
  assertStringIncludes(String(call.body.html), `href="https://app.test/results?r=${TOKEN}"`)
  assertNotIncludes(String(call.body.html), '{{')

  assertEquals(world.log.length, 1)
  assertEquals(world.log[0].status, 'sent')
  assertEquals(world.log[0].variables_used.dedupe_key, 'nurture_d1:as-ana')
  assertNotIncludes(JSON.stringify(world.logs), 'ana@example.com')
})

Deno.test('envio real é idempotente: segunda execução não reenvia; trava concorrente pula sem fetch', async () => {
  const world = makeWorld({ nurture: [nurture('ana@example.com')], access: [buyer()] })
  await makeHandler(world)(post())
  assertEquals(world.resendCalls.length, 2)
  // Uma pausa entre os dois envios (limite de taxa do Resend).
  assertEquals(world.sleeps.length, 1)

  const again = await (await makeHandler(world)(post())).json()
  assertEquals(again.sent, 0)
  assertEquals(again.skipped.already_sent, 2)
  assertEquals(world.resendCalls.length, 2)

  const other = makeWorld({ nurture: [nurture('bia@example.com')] })
  other.concurrent.add('nurture_d1:as-bia')
  const raced = await (await makeHandler(other)(post({ sequence: 'nurture' }))).json()
  assertEquals([raced.sent, raced.skipped_concurrent], [0, 1])
  assertEquals(other.resendCalls.length, 0)
})

Deno.test('falha do Resend vira "failed" sem e-mail no log; depois de 2 falhas desiste', async () => {
  const world = makeWorld({ nurture: [nurture('ana@example.com')], resendStatus: 403 })
  for (let i = 0; i < 2; i++) {
    const json = await (await makeHandler(world)(post({ sequence: 'nurture' }))).json()
    assertEquals(json.failed, 1)
  }
  assertEquals(world.log.map((r) => r.status), ['failed', 'failed'])
  const error = JSON.parse(world.log[0].error_message ?? '{}')
  assertEquals(error.code, 'validation_error')
  assertNotIncludes(error.message, 'pessoa@example.com')
  assert(world.logs.some((l) => l.level === 'error' && l.event === 'email_send' && l.data?.trigger_key === 'nurture_d1'))

  const third = await (await makeHandler(world)(post({ sequence: 'nurture' }))).json()
  assertEquals(third.skipped.gave_up, 1)
  assertEquals(world.resendCalls.length, 2)
})

Deno.test('descadastrado não recebe; aviso de prazo respeita descadastro geral', async () => {
  const ana = (await emailHash(SECRET, 'ana@example.com'))!
  const cli = (await emailHash(SECRET, 'cliente@example.com'))!
  const world = makeWorld({
    nurture: [nurture('ana@example.com')],
    access: [buyer()],
    suppressions: new Map([[ana, new Set(['marketing'])], [cli, new Set(['all'])]]),
  })
  const json = await (await makeHandler(world)(post())).json()
  assertEquals(json.sent, 0)
  assertEquals(json.skipped.suppressed, 2)
  assertEquals(world.resendCalls.length, 0)
})

Deno.test('envio real sem RESEND_API_KEY ou sem segredo de descadastro → 503 sem enviar', async () => {
  const world = makeWorld({ nurture: [nurture('ana@example.com')] })
  const noKey = await makeHandler(world, { resendKey: undefined })(post())
  assertEquals(noKey.status, 503)
  assertEquals((await noKey.json()).missing, ['RESEND_API_KEY'])
  const noSecret = await makeHandler(world, { unsubscribeSecret: 'curto' })(post())
  assertEquals((await noSecret.json()).missing, ['EMAIL_UNSUBSCRIBE_SECRET'])
  assertEquals(world.resendCalls.length, 0)
})

Deno.test('lista de espera: exige produto; envio real exige confirm; dry-run lista sem confirm', async () => {
  const world = makeWorld({
    waitlist: [
      { assessmentId: 'w1', email: 'espera@example.com', answers: { processo_tipo: 'visto', waitlist: true } },
      { assessmentId: 'w2', email: 'outra@example.com', answers: { processo_tipo: 'regularizacao', waitlist: true } },
    ],
  })
  assertEquals((await makeHandler(world)(post({ sequence: 'waitlist_launch' }))).status, 400)
  const noConfirm = await makeHandler(world)(post({ sequence: 'waitlist_launch', product: 'visto' }))
  assertEquals(noConfirm.status, 400)
  assertEquals((await noConfirm.json()).error, 'confirm_required')

  const dry = await (await makeHandler(world, DRY)(post({ sequence: 'waitlist_launch', product: 'visto' }))).json()
  assertEquals(dry.planned_total, 1)
  assertEquals(world.resendCalls.length, 0)

  const sent = await (await makeHandler(world)(post({ sequence: 'waitlist_launch', product: 'visto', confirm: true }))).json()
  assertEquals(sent.sent, 1)
  assertEquals(world.resendCalls[0].body.to, ['espera@example.com'])
  // A chave gravada leva o hash, nunca o e-mail.
  assertNotIncludes(world.log[0].variables_used.dedupe_key, 'espera@example.com')
})

Deno.test('"now" só em dry-run; limit corta o lote; corpo inválido → 400', async () => {
  const world = makeWorld({ nurture: [nurture('a@example.com'), nurture('b@example.com'), nurture('c@example.com')] })
  assertEquals((await makeHandler(world)(post({ now: iso(NOW) }))).status, 400)
  const simulated = await (await makeHandler(world, DRY)(post({ now: iso(NOW + 2 * DAY_MS) }))).json()
  assertEquals(simulated.by_template, { nurture_d3: 3 })

  const capped = await (await makeHandler(world)(post({ sequence: 'nurture', limit: 2 }))).json()
  assertEquals([capped.sent, capped.capped], [2, 1])

  for (const body of [{ sequence: 'tudo' }, { limit: 0 }, { limit: 51 }, { now: 'ontem' }, { dry_run: 'sim' }]) {
    assertEquals((await makeHandler(world, DRY)(post(body))).status, 400, JSON.stringify(body))
  }
})

Deno.test('modelo ausente ou com variável sem valor não é enviado', async () => {
  const world = makeWorld({ nurture: [nurture('a@example.com')], access: [buyer()] })
  world.templates.delete('nurture_d1')
  world.templates.get('access_expiring_d3')!.body_html_pt += '{{variavel_nova}}'
  const json = await (await makeHandler(world)(post())).json()
  assertEquals([json.sent, json.skipped_template], [0, 2])
  assert(json.warnings.some((w: string) => w.includes('nurture_d1')))
  assertEquals(world.resendCalls.length, 0)
  assertEquals(world.log.length, 0)
})
