// Testes das regras puras dos e-mails do ciclo de vida (DI-077). Rodam no Vitest
// (`npm test`) e no Deno (`deno test supabase/functions`), via testing/dual-runner.ts.
//
// Garantias principais:
//  · ninguém sem opt-in explícito entra na nutrição; quem pagou também não;
//  · descadastro por HMAC: token sem o e-mail, à prova de adulteração e de outro segredo;
//  · dry-run é o padrão para qualquer valor que não seja "false" explícito;
//  · os modelos da migration 20261030000000 só usam as variáveis que o código fornece
//    (nenhum `{{x}}` cru chega à caixa de entrada), e a migration não reescreve modelo
//    que o código em produção ainda envia com outras variáveis (o welcome_free antigo)
//    — conferido só no Vitest (lê arquivo).

import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from './test-asserts.ts'
import { isDeno, test } from './testing/dual-runner.ts'
import {
  accessStepFor,
  type AccessCandidate,
  buildResultUrl,
  buildUnsubscribeUrl,
  CATEGORY_LABELS,
  categoryLabel,
  createUnsubscribeToken,
  DAY_MS,
  daysLeftLabel,
  emailHash,
  formatDatePtBr,
  greetingFor,
  hasMarketingOptIn,
  isSuppressedFor,
  maskEmail,
  type NurtureCandidate,
  nurtureStepFor,
  parseDryRun,
  placeholdersIn,
  planAccess,
  planNurture,
  planWaitlist,
  renderEmail,
  type SentState,
  TEMPLATE_SPECS,
  unsubscribeFunctionUrl,
  verifyUnsubscribeToken,
  wantsOffers,
  WELCOME_TEMPLATE_KEY,
  WELCOME_TEMPLATE_KEYS,
  welcomeDedupeKey,
} from './email-lifecycle.ts'
import { CATEGORY_PRESENTATION } from '../../../src/lib/category.ts'

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789'
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0)
const TOKEN = 'a'.repeat(64)
const APP = 'https://app.test'
const NO_SENT: SentState = { sent: new Set(), failedAttempts: new Map() }

const iso = (ms: number) => new Date(ms).toISOString()

function candidate(overrides: Partial<NurtureCandidate> = {}): NurtureCandidate {
  return {
    assessmentId: '11111111-2222-4333-8444-555555555555',
    userId: null,
    email: 'Pessoa@Example.com ',
    fullName: 'Ana Souza',
    answers: { processo_tipo: 'nacionalidade', marketing_opt_in: true },
    completedAt: iso(NOW - 1.5 * DAY_MS),
    resumeToken: TOKEN,
    scoreCategory: 'alta',
    ...overrides,
  }
}

function nurtureCtx(overrides: Partial<Parameters<typeof planNurture>[1]> = {}) {
  return {
    nowMs: NOW,
    appUrl: APP,
    sentState: NO_SENT,
    suppressions: new Map<string, Set<string>>(),
    paidUserIds: new Set<string>(),
    paidEmails: new Set<string>(),
    offersOffUserIds: new Set<string>(),
    offersOffEmails: new Set<string>(),
    ...overrides,
  }
}

// ── Interruptor ──────────────────────────────────────────────────────────────

test('dry-run é o padrão: só "false" explícito liga o envio', () => {
  for (const raw of [undefined, null, '', 'true', 'TRUE', ' yes ', 'fasle', 'desligado']) {
    assertEquals(parseDryRun(raw), true, String(raw))
  }
  for (const raw of ['false', 'FALSE', ' false ', '0', 'off', 'no']) assertEquals(parseDryRun(raw), false, raw)
})

// ── Descadastro por HMAC ─────────────────────────────────────────────────────

test('token de descadastro: ida e volta, sem o e-mail, escopo preservado', async () => {
  const token = await createUnsubscribeToken(SECRET, ' Pessoa@Example.COM', 'marketing')
  assert(token, 'token')
  assertNotIncludes(token, 'pessoa')
  assertNotIncludes(token, '@')
  const verified = await verifyUnsubscribeToken(SECRET, token)
  assertEquals(verified, { emailHash: await emailHash(SECRET, 'pessoa@example.com'), scope: 'marketing' })

  const all = await createUnsubscribeToken(SECRET, 'pessoa@example.com', 'all')
  assertEquals((await verifyUnsubscribeToken(SECRET, all))?.scope, 'all')
})

test('token adulterado, de outro segredo ou malformado é recusado', async () => {
  const token = (await createUnsubscribeToken(SECRET, 'pessoa@example.com', 'marketing'))!
  const [hash, , sig] = token.split('.')
  // Trocar o escopo sem a assinatura certa não passa.
  assertEquals(await verifyUnsubscribeToken(SECRET, `${hash}.a.${sig}`), null)
  // Hash de outra pessoa com a assinatura desta não passa.
  const other = (await emailHash(SECRET, 'outra@example.com'))!
  assertEquals(await verifyUnsubscribeToken(SECRET, `${other}.m.${sig}`), null)
  assertEquals(await verifyUnsubscribeToken('outro-segredo-tambem-com-32-caracteres-xx', token), null)
  for (const bad of ['', 'abc', `${hash}.m`, `${token}x`, 42, null, 'x'.repeat(500)]) {
    assertEquals(await verifyUnsubscribeToken(SECRET, bad), null, String(bad))
  }
  // Sem segredo utilizável não há token nem verificação.
  assertEquals(await createUnsubscribeToken('curto', 'pessoa@example.com', 'all'), null)
  assertEquals(await verifyUnsubscribeToken('', token), null)
})

test('hash do e-mail ignora caixa e espaços; e-mail inválido não gera hash', async () => {
  const a = await emailHash(SECRET, 'Pessoa@Example.com')
  assertEquals(a, await emailHash(SECRET, '  pessoa@example.com '))
  assert(/^[0-9a-f]{64}$/.test(a ?? ''), String(a))
  assertEquals(await emailHash(SECRET, 'sem-arroba'), null)
})

test('escopos: "all" bloqueia marketing e serviço; "marketing" só marketing; pagamento nunca', () => {
  const m = new Set(['marketing'])
  const all = new Set(['all'])
  assertEquals(isSuppressedFor('marketing', m), true)
  assertEquals(isSuppressedFor('service', m), false)
  assertEquals(isSuppressedFor('service', all), true)
  assertEquals(isSuppressedFor('transactional', all), false)
  assertEquals(isSuppressedFor('marketing', null), false)
})

test('links: resultado com ?r= e descadastro da function', () => {
  assertEquals(buildResultUrl('https://app.test/', TOKEN), `https://app.test/results?r=${TOKEN}`)
  const base = unsubscribeFunctionUrl('https://proj.supabase.co/')
  assertEquals(base, 'https://proj.supabase.co/functions/v1/unsubscribe')
  assertEquals(buildUnsubscribeUrl(base, 'a.b.c'), `${base}?t=a.b.c`)
})

// ── Opt-in e nutrição ────────────────────────────────────────────────────────

test('opt-in só vale com true explícito', () => {
  assertEquals(hasMarketingOptIn({ marketing_opt_in: true }), true)
  assertEquals(hasMarketingOptIn({ marketing_opt_in: 'true' }), true)
  for (const answers of [{}, { marketing_opt_in: false }, { marketing_opt_in: 'sim' }, null, 'x', []]) {
    assertEquals(hasMarketingOptIn(answers), false, JSON.stringify(answers))
  }
})

test('nutrição: ninguém sem opt-in recebe', () => {
  const people = [
    candidate({ assessmentId: 'a1', email: 'sem@example.com', answers: { processo_tipo: 'nacionalidade' } }),
    candidate({ assessmentId: 'a2', email: 'falso@example.com', answers: { marketing_opt_in: false } }),
    candidate({ assessmentId: 'a3', email: 'texto@example.com', answers: { marketing_opt_in: 'sim' } }),
    candidate({ assessmentId: 'a4', email: 'com@example.com' }),
  ]
  const { due, skipped } = planNurture(people, nurtureCtx())
  assertEquals(due.map((d) => d.email), ['com@example.com'])
  assertEquals(skipped.no_opt_in, 3)
})

test('nutrição: janelas d1/d3/d7 sem sobreposição', () => {
  const at = (days: number) => nurtureStepFor(NOW - days * DAY_MS, NOW)?.template ?? null
  assertEquals([0.5, 1, 2.9, 3, 5.9, 6, 6.9, 7, 9.9, 10, 30].map(at), [
    null,
    'nurture_d1',
    'nurture_d1',
    'nurture_d3',
    'nurture_d3',
    null,
    null,
    'nurture_d7',
    'nurture_d7',
    null,
    null,
  ])
})

test('nutrição: variáveis, chave por assessment e e-mail normalizado', () => {
  const { due } = planNurture([candidate()], nurtureCtx())
  assertEquals(due.length, 1)
  assertEquals(due[0].template, 'nurture_d1')
  assertEquals(due[0].category, 'marketing')
  assertEquals(due[0].email, 'pessoa@example.com')
  assertEquals(due[0].dedupeKey, 'nurture_d1:11111111-2222-4333-8444-555555555555')
  assertEquals(due[0].variables, {
    greeting: 'Olá, Ana.',
    category_label: 'Alta elegibilidade',
    result_link: `${APP}/results?r=${TOKEN}`,
  })
})

test('nutrição: quem pagou, quem se descadastrou, lista de espera e envio repetido ficam de fora', () => {
  const paidById = planNurture([candidate({ userId: 'u1' })], nurtureCtx({ paidUserIds: new Set(['u1']) }))
  assertEquals([paidById.due.length, paidById.skipped.paid], [0, 1])

  const paidByEmail = planNurture([candidate()], nurtureCtx({ paidEmails: new Set(['pessoa@example.com']) }))
  assertEquals(paidByEmail.skipped.paid, 1)

  const suppressed = planNurture(
    [candidate()],
    nurtureCtx({ suppressions: new Map([['pessoa@example.com', new Set(['marketing'])]]) }),
  )
  assertEquals(suppressed.skipped.suppressed, 1)

  const waitlist = planNurture([candidate({ answers: { waitlist: true, marketing_opt_in: true } })], nurtureCtx())
  assertEquals(waitlist.skipped.waitlist, 1)

  const key = 'nurture_d1:11111111-2222-4333-8444-555555555555'
  const sent = planNurture([candidate()], nurtureCtx({ sentState: { sent: new Set([key]), failedAttempts: new Map() } }))
  assertEquals(sent.skipped.already_sent, 1)

  const gaveUp = planNurture(
    [candidate()],
    nurtureCtx({ sentState: { sent: new Set(), failedAttempts: new Map([[key, 2]]) } }),
  )
  assertEquals(gaveUp.skipped.gave_up, 1)
})

test('nutrição: "Novidades e dicas" desligado na conta bloqueia; sem a chave vale o opt-in do quiz', () => {
  assertEquals(wantsOffers({ offers: false }), false)
  for (const prefs of [{ offers: true }, { email: true, sms: false }, {}, null, 'x']) {
    assertEquals(wantsOffers(prefs), true, JSON.stringify(prefs))
  }
  const byId = planNurture([candidate({ userId: 'u1' })], nurtureCtx({ offersOffUserIds: new Set(['u1']) }))
  assertEquals([byId.due.length, byId.skipped.prefs_off], [0, 1])
  const byEmail = planNurture([candidate()], nurtureCtx({ offersOffEmails: new Set(['pessoa@example.com']) }))
  assertEquals([byEmail.due.length, byEmail.skipped.prefs_off], [0, 1])
})

test('boas-vindas: modelo novo com chave própria; o antigo continua contando como já recebido', () => {
  assertEquals(WELCOME_TEMPLATE_KEY, 'welcome_free_v2')
  assertEquals([...WELCOME_TEMPLATE_KEYS], ['welcome_free', 'welcome_free_v2'])
  assertEquals(welcomeDedupeKey('a1'), 'welcome_free_v2:a1')
  assert(!('welcome_free' in TEMPLATE_SPECS), 'o código novo não envia o modelo antigo')
  assertEquals(TEMPLATE_SPECS.welcome_free_v2.category, 'service')
})

test('nutrição: só o quiz mais recente de cada e-mail; sem token de retomada não envia', () => {
  const older = candidate({ assessmentId: 'velho', completedAt: iso(NOW - 2 * DAY_MS) })
  const newer = candidate({ assessmentId: 'novo', completedAt: iso(NOW - 1.2 * DAY_MS), answers: {} })
  const { due, skipped } = planNurture([older, newer], nurtureCtx())
  // O mais recente não tem opt-in: a escolha mais nova vale, e o antigo não recebe.
  assertEquals(due.length, 0)
  assertEquals([skipped.no_opt_in, skipped.superseded], [1, 1])

  const noToken = planNurture([candidate({ resumeToken: null })], nurtureCtx())
  assertEquals(noToken.skipped.no_resume_token, 1)
})

// ── Avisos de prazo ──────────────────────────────────────────────────────────

function buyer(overrides: Partial<AccessCandidate> = {}): AccessCandidate {
  return {
    userId: 'u1',
    email: 'cliente@example.com',
    fullName: 'Bruno Lima',
    timezone: 'America/Sao_Paulo',
    expiresAt: iso(NOW + 5 * DAY_MS),
    oneTimePaid: true,
    recurringActive: false,
    notificationPreferences: { process_updates: true, offers: false },
    ...overrides,
  }
}

test('prazo: janelas de 7 dias, 3 dias e expirado (o instante exato ainda tem acesso)', () => {
  const at = (days: number) => accessStepFor(NOW + days * DAY_MS, NOW)
  assertEquals([8, 7, 3.01, 3, 0.1, 0, -0.1, -2.9, -3, -10].map(at), [
    null,
    'access_expiring_d7',
    'access_expiring_d7',
    'access_expiring_d3',
    'access_expiring_d3',
    'access_expiring_d3',
    'access_expired',
    'access_expired',
    null,
    null,
  ])
})

test('prazo: variáveis com dias arredondados para cima e data no fuso do perfil', () => {
  const { due } = planAccess([buyer({ expiresAt: iso(NOW + 4.2 * DAY_MS) })], { nowMs: NOW, appUrl: APP, sentState: NO_SENT, suppressions: new Map() })
  assertEquals(due.length, 1)
  assertEquals(due[0].template, 'access_expiring_d7')
  assertEquals(due[0].category, 'service')
  assertEquals(due[0].variables.days_left_label, '5 dias')
  assertEquals(due[0].variables.dashboard_link, `${APP}/dashboard`)
  assertEquals(due[0].variables.expires_on, formatDatePtBr(new Date(NOW + 4.2 * DAY_MS), 'America/Sao_Paulo'))
  assertEquals(due[0].dedupeKey, `access_expiring_d7:u1:${iso(NOW + 4.2 * DAY_MS).slice(0, 10)}`)

  const expired = planAccess([buyer({ expiresAt: iso(NOW - DAY_MS) })], { nowMs: NOW, appUrl: APP, sentState: NO_SENT, suppressions: null })
  assertEquals(expired.due[0].template, 'access_expired')
  assertEquals(expired.due[0].variables.dashboard_link, `${APP}/dashboard?acesso=expirado`)
  assert(!('days_left_label' in expired.due[0].variables))
})

test('prazo: assinatura ativa, reembolso, preferência desligada e descadastro geral não recebem', () => {
  const ctx = {
    nowMs: NOW,
    appUrl: APP,
    sentState: NO_SENT,
    suppressions: new Map([['d@example.com', new Set(['all'])], ['m@example.com', new Set(['marketing'])]]),
  }
  const { due, skipped } = planAccess(
    [
      buyer({ userId: 'a', recurringActive: true }),
      buyer({ userId: 'b', oneTimePaid: false }),
      buyer({ userId: 'c', notificationPreferences: { process_updates: false } }),
      buyer({ userId: 'd', email: 'd@example.com' }),
      // Descadastro só de marketing não bloqueia aviso de serviço.
      buyer({ userId: 'm', email: 'm@example.com' }),
    ],
    ctx,
  )
  assertEquals(due.map((d) => d.userId), ['m'])
  assertEquals(skipped, { recurring: 1, not_paid: 1, prefs_off: 1, suppressed: 1 })
})

// ── Lista de espera ──────────────────────────────────────────────────────────

test('lista de espera: só o produto pedido, um por e-mail, respeita descadastro', () => {
  const rows = [
    { assessmentId: 'w1', email: 'a@example.com', answers: { processo_tipo: 'visto', waitlist: true } },
    { assessmentId: 'w2', email: 'A@example.com', answers: { processo_tipo: 'visto', waitlist: true } },
    { assessmentId: 'w3', email: 'b@example.com', answers: { processo_tipo: 'regularizacao', waitlist: true } },
    { assessmentId: 'w4', email: 'c@example.com', answers: { processo_tipo: 'visto', waitlist: true } },
  ]
  const { due, skipped } = planWaitlist(rows, 'visto', {
    nowMs: NOW,
    appUrl: APP,
    sentState: NO_SENT,
    suppressions: new Map([['c@example.com', new Set(['marketing'])]]),
    emailHashes: new Map([['a@example.com', 'f'.repeat(64)]]),
  })
  assertEquals(due.map((d) => d.email), ['a@example.com'])
  assertEquals(due[0].variables, {
    product_label: 'Diagnóstico de vistos',
    product_phrase: 'o diagnóstico de vistos',
    cta_link: `${APP}/quiz`,
  })
  // A chave leva o hash, nunca o e-mail (fica gravada no log de envios).
  assertEquals(due[0].dedupeKey, `waitlist_launch:visto:${'f'.repeat(64)}`)
  assertEquals(skipped, { duplicate_recipient: 1, other_product: 1, suppressed: 1 })
})

// ── Textos e renderização ────────────────────────────────────────────────────

test('rótulos de categoria iguais aos do front (src/lib/category.ts)', () => {
  for (const key of ['alta', 'media', 'baixa'] as const) {
    assertEquals(CATEGORY_LABELS[key], CATEGORY_PRESENTATION[key].label)
  }
  assertEquals(categoryLabel('desconhecida'), CATEGORY_PRESENTATION.baixa.label)
})

test('saudação, dias, data e máscara', () => {
  assertEquals(greetingFor('  Ana   Souza '), 'Olá, Ana.')
  assertEquals(greetingFor(null), 'Olá.')
  assertEquals(daysLeftLabel(1), '1 dia')
  assertEquals(daysLeftLabel(0), '1 dia')
  assertEquals(daysLeftLabel(3), '3 dias')
  assertEquals(formatDatePtBr(new Date(Date.UTC(2026, 10, 2, 1, 0)), 'America/Sao_Paulo'), '01/11/2026')
  assertEquals(formatDatePtBr(new Date(Date.UTC(2026, 10, 2, 1, 0)), 'Fuso/Invalido'), '02/11/2026')
  assertEquals(maskEmail('pessoa@example.com'), 'pe***@example.com')
  assertEquals(maskEmail('a@b.co'), 'a***@b.co')
})

test('renderEmail escapa as variáveis no HTML e aponta placeholders sem valor', () => {
  const out = renderEmail(
    { subject_pt: 'Oi {{greeting}}', body_html_pt: '<p>{{greeting}}</p><a href="{{result_link}}">x</a>{{faltando}}' },
    { greeting: 'Olá, <b>Ana</b>.', result_link: 'https://app.test/results?r=1&x=2' },
  )
  assertEquals(out.subject, 'Oi Olá, <b>Ana</b>.')
  assertStringIncludes(out.html, '<p>Olá, &lt;b&gt;Ana&lt;/b&gt;.</p>')
  assertStringIncludes(out.html, 'href="https://app.test/results?r=1&amp;x=2"')
  assertEquals(out.missing, ['faltando'])
})

// ── Migration × código (só no Vitest: lê o arquivo) ──────────────────────────

if (!isDeno) {
  test('modelos da migration 20261030000000 seguem o contrato de variáveis', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(
      new URL('../../migrations/20261030000000_lifecycle_emails.sql', import.meta.url),
      'utf8',
    )
    const blocks = sql.split('-- template: ').slice(1)
    const keys = blocks.map((b) => b.slice(0, b.indexOf('\n')).trim())
    assertEquals([...keys].sort(), Object.keys(TEMPLATE_SPECS).sort())

    for (const block of blocks) {
      const key = block.slice(0, block.indexOf('\n')).trim() as keyof typeof TEMPLATE_SPECS
      const subject = /\$subject\$([\s\S]*?)\$subject\$/.exec(block)?.[1] ?? ''
      const body = /\$body\$([\s\S]*?)\$body\$/.exec(block)?.[1] ?? ''
      assert(subject && body, `${key}: assunto e corpo`)
      const used = placeholdersIn(`${subject}\n${body}`)
      const allowed = TEMPLATE_SPECS[key].variables
      for (const name of used) assert(allowed.includes(name), `${key} usa {{${name}}} fora do contrato`)
      // Marketing e serviço sempre levam o link de descadastro; transacional nunca.
      const hasUnsubscribe = used.includes('unsubscribe_link')
      assertEquals(hasUnsubscribe, TEMPLATE_SPECS[key].category !== 'transactional', `${key}: descadastro`)
      // Sem resto de pt-PT, promessas e emoji.
      for (const banned of [/aceder/i, /subscriç/i, /está a ser/i, /análise jurídica/i, /garantid/i, /urgente/i, /últimas vagas/i, /🎉|✅/u]) {
        assert(!banned.test(`${subject}\n${body}`), `${key}: ${banned}`)
      }
    }
  })

  /**
   * Variáveis que o código EM PRODUÇÃO (main e ondas 1 a 3) manda para cada modelo que já
   * existia. Entre o `db push` e o deploy das functions novas, é esse código que envia:
   * um modelo reescrito no lugar não pode usar nada fora desta lista.
   *  · welcome_free: generate-explanation (name, score_category, cta_link);
   *  · payment_confirmed: stripe-webhook (amount, dashboard_link) + name do send-email;
   *  · subscription_cancelled e analysis_ready: nenhuma versão em produção envia.
   */
  const PRODUCTION_SENDS: Record<string, readonly string[] | null> = {
    welcome_free: ['name', 'score_category', 'cta_link'],
    payment_confirmed: ['name', 'amount', 'dashboard_link'],
    subscription_cancelled: null,
    analysis_ready: null,
  }

  test('a migration não reescreve modelo que o código em produção envia com outras variáveis', async () => {
    const { readFileSync } = await import('node:fs')
    const sql = readFileSync(
      new URL('../../migrations/20261030000000_lifecycle_emails.sql', import.meta.url),
      'utf8',
    )
    // Só o SQL executável (sem as linhas de comentário).
    const code = sql
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
    // O welcome_free antigo fica intacto: nenhum INSERT/UPDATE com a chave dele.
    assert(!/'welcome_free'/.test(code), "a migration não pode tocar o modelo 'welcome_free'")
    assertStringIncludes(code, "'welcome_free_v2'")

    for (const block of sql.split('-- template: ').slice(1)) {
      const key = block.slice(0, block.indexOf('\n')).trim()
      if (!(key in PRODUCTION_SENDS)) continue
      const allowed = PRODUCTION_SENDS[key]
      if (allowed === null) continue
      const subject = /\$subject\$([\s\S]*?)\$subject\$/.exec(block)?.[1] ?? ''
      const body = /\$body\$([\s\S]*?)\$body\$/.exec(block)?.[1] ?? ''
      for (const name of placeholdersIn(`${subject}\n${body}`)) {
        assert(allowed.includes(name), `${key}: {{${name}}} não é enviado pelo código em produção`)
      }
    }
  })
}
