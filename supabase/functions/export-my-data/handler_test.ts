// Testes do export-my-data (DI-083): handler + repo reais sobre um banco falso
// em memória (PostgREST mínimo: select/eq/in/order/limit/maybeSingle + rpc
// has_active_access). Nenhuma chamada de rede. Rodar: deno test --no-config supabase/functions

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import { assert, assertEquals, assertNotIncludes, assertStringIncludes } from '../_shared/test-asserts.ts'
import {
  COLUMNS,
  createExportHandler,
  EXPORT_FORMAT,
  exportFileName,
  type ExportRepo,
  FULL_ANALYSIS_COLUMN,
  LIMITS,
  NOTES,
  pick,
  type Row,
} from './handler.ts'
import { createExportRepo } from './repo.ts'

const ANA = 'a0000000-0000-4000-8000-00000000000a'
const BRUNO = 'b0000000-0000-4000-8000-00000000000b'
const NOW = new Date('2026-10-30T12:00:00.000Z')
const FUTURE = '2026-11-20T00:00:00.000Z'
const PAST = '2026-10-20T00:00:00.000Z'

/**
 * Espelho (só para o teste) de public.has_active_access(_, 'full_analysis')
 * da migration 20261020000000, sem o caso da equipe.
 */
function mirrorFullAnalysisAccess(sub: Row | undefined, now: Date): boolean {
  if (!sub) return false
  if (sub.recurring_active === true) return true
  const grants = sub.has_dashboard_access === true || sub.has_full_analysis === true
  if (sub.one_time_paid !== true && !grants) return false
  const expires = typeof sub.one_time_access_expires_at === 'string' ? new Date(sub.one_time_access_expires_at) : null
  if (expires && now > expires) return false
  if (!grants) return false
  return sub.has_full_analysis === true
}

type Filter = (row: Row) => boolean

class MiniQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = []
  private max = Infinity
  private single = false
  private orderBy: { column: string; ascending: boolean } | null = null
  constructor(private db: MiniDb, private table: string) {}
  select(_columns?: string) {
    return this
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value)
    return this
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }
  order(column: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: opts.ascending !== false }
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  then<A = { data: unknown; error: unknown }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
  private run() {
    this.db.queries.push(this.table)
    if (this.db.failOn === this.table) return { data: null, error: { message: 'boom', code: 'XX000' } }
    let rows = (this.db.tables[this.table] ?? []).filter((row) => this.filters.every((f) => f(row)))
    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
    }
    rows = rows.slice(0, this.max).map((row) => structuredClone(row))
    if (this.single) {
      if (rows.length > 1) return { data: null, error: { message: 'multiple rows', code: 'PGRST116' } }
      return { data: rows[0] ?? null, error: null }
    }
    return { data: rows, error: null }
  }
}

class MiniDb {
  tables: Record<string, Row[]> = {}
  queries: string[] = []
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  failOn: string | null = null
  from(table: string) {
    return new MiniQuery(this, table)
  }
  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args })
    if (this.failOn === `rpc:${name}`) {
      return Promise.resolve({ data: null, error: { message: 'function does not exist', code: '42883' } })
    }
    if (name !== 'has_active_access' || args._feature !== 'full_analysis') {
      return Promise.resolve({ data: false, error: null })
    }
    const sub = (this.tables.subscriptions ?? []).find((row) => row.user_id === args._user_id)
    return Promise.resolve({ data: mirrorFullAnalysisAccess(sub, NOW), error: null })
  }
  get client() {
    return this as unknown as SupabaseClient
  }
}

function seed(db: MiniDb) {
  db.tables.profiles = [
    {
      id: ANA,
      tenant_id: 'hub',
      full_name: 'Ana Souza',
      email: 'ana@example.com',
      phone: '+55 11 90000-0001',
      language: 'pt-BR',
      created_at: '2026-10-01',
    },
    {
      id: BRUNO,
      tenant_id: 'hub',
      full_name: 'Bruno Lima',
      email: 'bruno@example.com',
      phone: '+55 21 90000-0002',
      created_at: '2026-10-02',
    },
  ]
  db.tables.subscriptions = [
    {
      id: 'sub-row-a',
      user_id: ANA,
      tier: 'one_time',
      one_time_paid: true,
      one_time_access_expires_at: FUTURE,
      has_dashboard_access: true,
      has_full_analysis: true,
      has_chat_access: true,
      recurring_active: false,
      stripe_customer_id: 'cus_ANA123',
      stripe_payment_intent_id: 'pi_ANA',
      created_at: '2026-10-01',
    },
    { id: 'sub-row-b', user_id: BRUNO, tier: 'free', stripe_customer_id: 'cus_BRUNO9', created_at: '2026-10-02' },
  ]
  db.tables.assessments = [
    {
      id: 'as-ana-1',
      user_id: ANA,
      session_id: 's_secret_ana',
      resume_token: 'f'.repeat(64),
      crm_stage: 'novo',
      full_name: 'Ana Souza',
      email: 'ana@example.com',
      answers: { processo_tipo: 'nacionalidade' },
      status: 'completed',
      created_at: '2026-10-01T10:00:00Z',
    },
    {
      id: 'as-bruno-1',
      user_id: BRUNO,
      session_id: 's_secret_bruno',
      resume_token: 'e'.repeat(64),
      full_name: 'Bruno Lima',
      email: 'bruno@example.com',
      answers: { processo_tipo: 'visto' },
      status: 'completed',
      created_at: '2026-10-02T10:00:00Z',
    },
    // Anônimo com o e-mail da Ana: NÃO é exportado (pode ter sido feito por outra pessoa).
    {
      id: 'as-anon',
      user_id: null,
      session_id: 's_anon',
      full_name: 'Alguém',
      email: 'ana@example.com',
      created_at: '2026-09-01',
    },
  ]
  db.tables.assessment_results = [
    {
      id: 'r1',
      assessment_id: 'as-ana-1',
      score_numeric: 72,
      score_category: 'Média',
      ia_explanation_full: '## Análise da Ana',
      ia_model_used: 'lock:abc',
      ia_tokens_used: 900,
    },
    {
      id: 'r2',
      assessment_id: 'as-bruno-1',
      score_numeric: 90,
      score_category: 'Alta',
      ia_explanation_full: '## Análise do Bruno',
    },
  ]
  db.tables.messages = [
    {
      id: 'm1',
      assessment_id: 'as-ana-1',
      user_id: ANA,
      role: 'user',
      content: 'Pergunta da Ana',
      created_at: '2026-10-03',
    },
    {
      id: 'm2',
      assessment_id: 'as-bruno-1',
      user_id: BRUNO,
      role: 'user',
      content: 'Pergunta do Bruno',
      created_at: '2026-10-03',
    },
  ]
  db.tables.user_documents = [
    {
      id: 'd1',
      user_id: ANA,
      document_type: 'passaporte',
      display_name: 'Passaporte',
      file_name: 'passaporte.pdf',
      storage_path: `${ANA}/general/passaporte/1.pdf`,
      status: 'uploaded',
      created_at: '2026-10-04',
    },
    {
      id: 'd2',
      user_id: BRUNO,
      document_type: 'nif',
      display_name: 'NIF',
      file_name: 'nif-bruno.pdf',
      storage_path: `${BRUNO}/general/nif/1.pdf`,
      created_at: '2026-10-04',
    },
  ]
  db.tables.payments = [
    {
      id: 'p1',
      user_id: ANA,
      product: 'one_time_analysis',
      amount_cents: 3000,
      currency: 'eur',
      status: 'succeeded',
      stripe_payment_intent_id: 'pi_ANA',
      metadata: { checkout_session_id: 'cs_test_x' },
      created_at: '2026-10-01',
    },
    {
      id: 'p2',
      user_id: BRUNO,
      product: 'one_time_analysis',
      amount_cents: 3000,
      currency: 'eur',
      status: 'succeeded',
      created_at: '2026-10-02',
    },
  ]
  db.tables.email_send_log = [
    {
      id: 'e1',
      user_id: ANA,
      recipient_email: 'ana@example.com',
      subject: 'Pagamento confirmado',
      status: 'sent',
      body_html: '<a href="https://x.test/magic?token=SEGREDO">Entrar</a>',
      variables_used: { magic_link: 'https://x.test/magic?token=SEGREDO' },
      provider_message_id: 're_123',
      sent_at: '2026-10-01',
      created_at: '2026-10-01',
    },
    {
      id: 'e2',
      user_id: BRUNO,
      recipient_email: 'bruno@example.com',
      subject: 'Olá',
      status: 'sent',
      created_at: '2026-10-02',
    },
  ]
}

function setup(opts: { repo?: ExportRepo } = {}) {
  const db = new MiniDb()
  seed(db)
  const tokens = new Map([
    ['Bearer jwt-ana', {
      id: ANA,
      email: 'ana@example.com',
      created_at: '2026-10-01T09:00:00Z',
      last_sign_in_at: '2026-10-29T08:00:00Z',
    }],
  ])
  const logs: Array<Record<string, unknown>> = []
  const handler = createExportHandler({
    repo: opts.repo ?? createExportRepo(db.client),
    getUser: (header) => Promise.resolve(tokens.get(header) ?? null),
    now: () => NOW,
    log: (level, event, data) => logs.push({ level, event, ...data }),
  })
  const call = async (
    headers: Record<string, string> = { Authorization: 'Bearer jwt-ana' },
    method = 'POST',
    body = '{}',
  ) => {
    const res = await handler(
      new Request('http://localhost/functions/v1/export-my-data', {
        method,
        headers,
        body: method === 'POST' ? body : undefined,
      }),
    )
    const text = await res.text()
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      parsed = null
    }
    return { status: res.status, text, body: parsed, headers: res.headers }
  }
  return { db, call, logs }
}

/** Troca a assinatura da Ana (estado de acesso) antes da chamada. */
function setAnaSubscription(db: MiniDb, patch: Row | null) {
  const others = db.tables.subscriptions.filter((row) => row.user_id !== ANA)
  db.tables.subscriptions = patch === null ? others : [...others, { id: 'sub-row-a', user_id: ANA, ...patch }]
}

const ACCESS_STATES: Array<{ state: string; sub: Row | null; included: boolean }> = [
  { state: 'none (sem linha em subscriptions)', sub: null, included: false },
  { state: 'none (nunca pagou)', sub: { tier: 'free', one_time_paid: false }, included: false },
  {
    state: 'expired (€30 vencido)',
    sub: {
      tier: 'one_time',
      one_time_paid: true,
      one_time_access_expires_at: PAST,
      has_dashboard_access: true,
      has_full_analysis: true,
    },
    included: false,
  },
  {
    state: 'reembolso dentro do prazo (flags revogadas)',
    sub: {
      tier: 'one_time',
      one_time_paid: true,
      one_time_access_expires_at: FUTURE,
      has_dashboard_access: false,
      has_full_analysis: false,
    },
    included: false,
  },
  {
    state: 'active (€30 no prazo)',
    sub: {
      tier: 'one_time',
      one_time_paid: true,
      one_time_access_expires_at: FUTURE,
      has_dashboard_access: true,
      has_full_analysis: true,
    },
    included: true,
  },
  {
    state: 'recurring (€4,90 ativo depois dos 30 dias)',
    sub: {
      tier: 'recurring',
      one_time_paid: true,
      one_time_access_expires_at: PAST,
      recurring_active: true,
      has_dashboard_access: true,
      has_full_analysis: true,
    },
    included: true,
  },
]

Deno.test('sem token ou token inválido → 401 e nenhuma leitura', async () => {
  const { call, db } = setup()
  assertEquals((await call({})).status, 401)
  assertEquals((await call({ Authorization: 'Bearer outro' })).status, 401)
  assertEquals(db.queries.length, 0)
})

Deno.test('exporta só os dados da própria conta (nada do Bruno nem do anônimo com o mesmo e-mail)', async () => {
  const { call } = setup()
  const res = await call()
  assertEquals(res.status, 200)
  const body = res.body!
  assertEquals(body.formato, EXPORT_FORMAT)
  assertEquals(body.gerado_em, NOW.toISOString())
  assertEquals((body.conta as Row).id, ANA)
  assertEquals((body.perfil as Row).full_name, 'Ana Souza')
  assertEquals((body.plano as Row).tier, 'one_time')
  const diagnosticos = body.diagnosticos as Row[]
  assertEquals(diagnosticos.length, 1)
  assertEquals(diagnosticos[0].id, 'as-ana-1')
  // Ana está no prazo do €30 (seed): a análise completa vai junto.
  assertEquals((diagnosticos[0].resultado as Row).ia_explanation_full, '## Análise da Ana')
  assertEquals((body.mensagens_chat as Row[]).map((m) => m.content), ['Pergunta da Ana'])
  assertEquals((body.documentos as Row[]).map((d) => d.file_name), ['passaporte.pdf'])
  assertEquals((body.pagamentos as Row[]).length, 1)
  assertEquals((body.emails_enviados as Row[]).map((e) => e.subject), ['Pagamento confirmado'])

  for (const foreign of ['Bruno', 'bruno@example.com', BRUNO, 'cus_BRUNO9', 'nif-bruno', 'Alguém', 'as-anon']) {
    assertNotIncludes(res.text, foreign, `não pode conter ${foreign}`)
  }
})

for (const { state, sub, included } of ACCESS_STATES) {
  Deno.test(`análise completa (paywall DI-016): ${state} → ${included ? 'vai no arquivo' : 'fica de fora'}`, async () => {
    const { call, db } = setup()
    setAnaSubscription(db, sub)
    const res = await call()
    assertEquals(res.status, 200)
    const diagnostico = (res.body!.diagnosticos as Row[])[0]
    const resultado = diagnostico.resultado as Row
    // O resultado gratuito sai sempre.
    assertEquals(resultado.score_category, 'Média')
    assertEquals(Object.prototype.hasOwnProperty.call(resultado, FULL_ANALYSIS_COLUMN), included)
    const notes = res.body!.observacoes as string[]
    assertEquals(notes.includes(NOTES.analysisNotIncluded), !included)
    assert(notes.includes(NOTES.anonymousNotIncluded))
    if (!included) {
      assertNotIncludes(res.text, '## Análise da Ana')
      assertNotIncludes(res.text, FULL_ANALYSIS_COLUMN)
    } else {
      assertEquals(resultado.ia_explanation_full, '## Análise da Ana')
    }
    // A checagem é feita para o usuário do token, uma vez, com a feature certa.
    assertEquals(db.rpcCalls, [{ name: 'has_active_access', args: { _user_id: ANA, _feature: 'full_analysis' } }])
  })
}

Deno.test('checagem de acesso falha (ex.: RPC ausente) → 200 sem a análise completa (fail closed)', async () => {
  const db = new MiniDb()
  seed(db)
  db.failOn = 'rpc:has_active_access'
  const { call, logs } = setup({ repo: createExportRepo(db.client) })
  const res = await call()
  assertEquals(res.status, 200)
  assertNotIncludes(res.text, '## Análise da Ana')
  assertNotIncludes(res.text, FULL_ANALYSIS_COLUMN)
  assert((res.body!.observacoes as string[]).includes(NOTES.analysisNotIncluded))
  assertEquals(((res.body!.diagnosticos as Row[])[0].resultado as Row).score_numeric, 72)
  assert(logs.some((l) => l.event === 'access_check_failed' && l.level === 'warn'))
})

Deno.test('a allowlist de resultados não traz a análise completa por padrão', () => {
  assert(!(COLUMNS.result as readonly string[]).includes(FULL_ANALYSIS_COLUMN))
})

Deno.test('segredos e campos internos ficam de fora', async () => {
  const { call } = setup()
  const { text } = await call()
  for (
    const secret of [
      's_secret_ana',
      'f'.repeat(64),
      'resume_token',
      'session_id',
      'lock:abc',
      'ia_model_used',
      'SEGREDO',
      'body_html',
      'variables_used',
      're_123',
      'storage_path',
      'crm_stage',
      'tenant_id',
      'metadata',
      'pi_ANA',
    ]
  ) {
    assertNotIncludes(text, secret, `não pode conter ${secret}`)
  }
})

Deno.test('cabeçalhos: anexo com data no nome e sem cache', async () => {
  const { call } = setup()
  const res = await call()
  assertEquals(res.headers.get('Cache-Control'), 'no-store')
  assertEquals(res.headers.get('Content-Disposition'), `attachment; filename="${exportFileName(NOW)}"`)
  assertStringIncludes(res.headers.get('Content-Type') ?? '', 'application/json')
  assertEquals(exportFileName(NOW), 'doutor-imigrante-meus-dados-2026-10-30.json')
})

Deno.test('defesa extra: linhas de outro user_id vindas do repo são descartadas', async () => {
  const db = new MiniDb()
  seed(db)
  const real = createExportRepo(db.client)
  const leaky: ExportRepo = {
    ...real,
    messages: () => Promise.resolve(db.tables.messages),
    payments: () => Promise.resolve(db.tables.payments),
    profile: () => Promise.resolve(db.tables.profiles[1]),
  }
  const { call } = setup({ repo: leaky })
  const res = await call()
  assertEquals(res.status, 200)
  assertEquals(res.body!.perfil, null)
  assertEquals((res.body!.mensagens_chat as Row[]).length, 1)
  assertNotIncludes(res.text, 'Pergunta do Bruno')
})

Deno.test('conta sem dados: seções vazias, sem erro e sem checagem de acesso', async () => {
  const db = new MiniDb()
  const { call } = setup({ repo: createExportRepo(db.client) })
  const res = await call()
  assertEquals(res.status, 200)
  assertEquals(res.body!.perfil, null)
  assertEquals(res.body!.diagnosticos, [])
  assertEquals(res.body!.aviso_limite, undefined)
  assertEquals(res.body!.observacoes, [NOTES.anonymousNotIncluded])
  assertEquals(db.rpcCalls.length, 0)
})

Deno.test('falha de leitura → 500 internal_error, sem detalhes', async () => {
  const db = new MiniDb()
  seed(db)
  db.failOn = 'messages'
  const { call, logs } = setup({ repo: createExportRepo(db.client) })
  const res = await call()
  assertEquals(res.status, 500)
  assertEquals(res.body, { error: 'internal_error' })
  assert(logs.some((l) => l.event === 'export_failed'))
})

Deno.test('pick só copia colunas permitidas que existem', () => {
  assertEquals(pick({ a: 1, b: 2, c: undefined }, ['a', 'c', 'z']), { a: 1, c: undefined })
  assert(!COLUMNS.assessment.includes('session_id' as never))
  assert(LIMITS.messages >= 1000)
})

Deno.test('GET → 405; OPTIONS → 200', async () => {
  const { call } = setup()
  assertEquals((await call({ Authorization: 'Bearer jwt-ana' }, 'GET')).status, 405)
  assertEquals((await call({}, 'OPTIONS')).status, 200)
})
