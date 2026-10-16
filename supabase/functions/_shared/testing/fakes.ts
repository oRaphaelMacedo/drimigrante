// _shared/testing/fakes.ts — Supabase e Stripe falsos, em memória, para os
// testes das functions de pagamento (W1-03). Nenhuma chamada de rede.
//
// FakeSupabase implementa só o subconjunto do supabase-js usado pelos
// handlers: from().select/insert/upsert/update/delete com eq/is/lt e
// maybeSingle; rpc; auth.admin.createUser/getUserById/generateLink;
// auth.signInWithOtp; functions.invoke. Restrições UNIQUE são simuladas
// (erro 23505), e falhas podem ser injetadas por tabela/operação.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'

export type Row = Record<string, unknown>
export interface FakeError {
  message: string
  code?: string
  status?: number
}
type Op = 'select' | 'insert' | 'upsert' | 'update' | 'delete'
type Result = { data: unknown; error: FakeError | null }

export interface FakeAuthUser {
  id: string
  email: string
  app_metadata: Record<string, unknown>
  last_sign_in_at: string | null
  created_at: string
}

const DEFAULT_UNIQUE: Record<string, string[]> = {
  payment_events: ['stripe_event_id'],
  payments: ['stripe_payment_intent_id'],
  subscriptions: ['user_id'],
  profiles: ['id'],
  checkout_claims: ['stripe_session_id'],
}

function readColumn(row: Row, column: string): unknown {
  const arrow = column.indexOf('->>')
  if (arrow >= 0) {
    const base = row[column.slice(0, arrow)] as Row | null | undefined
    const value = base?.[column.slice(arrow + 3)]
    return value === undefined || value === null ? null : String(value)
  }
  const value = row[column]
  return value === undefined ? null : value
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

class FakeQuery implements PromiseLike<Result> {
  private op: Op = 'select'
  private payload: Row[] = []
  private onConflict: string | undefined
  private filters: Array<(row: Row) => boolean> = []
  private returning = false
  private single: 'none' | 'maybe' | 'one' = 'none'

  constructor(private db: FakeSupabase, private table: string) {}

  select(_columns?: string): this {
    if (this.op !== 'select') this.returning = true
    return this
  }
  insert(rows: Row | Row[]): this {
    this.op = 'insert'
    this.payload = Array.isArray(rows) ? rows : [rows]
    return this
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }): this {
    this.op = 'upsert'
    this.payload = Array.isArray(rows) ? rows : [rows]
    this.onConflict = opts?.onConflict
    return this
  }
  update(patch: Row): this {
    this.op = 'update'
    this.payload = [patch]
    return this
  }
  delete(): this {
    this.op = 'delete'
    return this
  }
  eq(column: string, value: unknown): this {
    this.filters.push((row) => readColumn(row, column) === (value ?? null))
    return this
  }
  is(column: string, value: unknown): this {
    this.filters.push((row) => readColumn(row, column) === value)
    return this
  }
  lt(column: string, value: string | number): this {
    this.filters.push((row) => {
      const current = readColumn(row, column)
      return current !== null && (current as string | number) < value
    })
    return this
  }
  maybeSingle(): this {
    this.single = 'maybe'
    return this
  }
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected)
  }

  private matches(): Row[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((f) => f(row)))
  }

  private uniqueConflict(candidate: Row, ignore?: Row): boolean {
    const keys = this.db.uniqueKeys[this.table] ?? []
    return this.db.rows(this.table).some((existing) =>
      existing !== ignore &&
      keys.some((key) => candidate[key] != null && existing[key] === candidate[key])
    )
  }

  private insertRow(row: Row): Row {
    const stored: Row = {
      id: `${this.table}-${this.db.nextSeq()}`,
      created_at: this.db.now().toISOString(),
      ...clone(row),
    }
    this.db.rows(this.table).push(stored)
    return stored
  }

  private execute(): Result {
    this.db.queries.push({ table: this.table, op: this.op })
    const failure = this.db.takeFailure(this.table, this.op)
    if (failure) return { data: null, error: failure }

    const duplicate: FakeError = {
      message: 'duplicate key value violates unique constraint',
      code: '23505',
    }

    switch (this.op) {
      case 'insert': {
        if (this.payload.some((row) => this.uniqueConflict(row))) {
          return { data: null, error: duplicate }
        }
        const inserted = this.payload.map((row) => this.insertRow(row))
        return { data: this.returning ? clone(inserted) : null, error: null }
      }
      case 'upsert': {
        const out: Row[] = []
        for (const row of this.payload) {
          const key = this.onConflict
          const existing = key && row[key] != null
            ? this.db.rows(this.table).find((r) => r[key] === row[key])
            : undefined
          if (existing) {
            if (this.uniqueConflict(row, existing)) return { data: null, error: duplicate }
            Object.assign(existing, clone(row))
            out.push(existing)
          } else {
            if (this.uniqueConflict(row)) return { data: null, error: duplicate }
            out.push(this.insertRow(row))
          }
        }
        return { data: this.returning ? clone(out) : null, error: null }
      }
      case 'update': {
        const matched = this.matches()
        for (const row of matched) Object.assign(row, clone(this.payload[0]))
        return { data: this.returning ? clone(matched) : null, error: null }
      }
      case 'delete': {
        const matched = new Set(this.matches())
        this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !matched.has(r))
        return { data: null, error: null }
      }
      default: {
        const matched = clone(this.matches())
        if (this.single === 'maybe') {
          if (matched.length > 1) {
            return { data: null, error: { message: 'multiple rows', code: 'PGRST116' } }
          }
          return { data: matched[0] ?? null, error: null }
        }
        return { data: matched, error: null }
      }
    }
  }
}

export class FakeSupabase {
  tables: Record<string, Row[]> = {}
  uniqueKeys: Record<string, string[]>
  queries: Array<{ table: string; op: Op }> = []
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  users: FakeAuthUser[] = []
  createUserCalls: Array<Record<string, unknown>> = []
  otpRequests: Array<{ email: string; options?: Record<string, unknown> }> = []
  generateLinkCalls: Array<{ type: string; email: string }> = []
  invocations: Array<{ name: string; body: unknown; headers?: Record<string, string> }> = []
  invokeError: FakeError | null = null
  otpError: FakeError | null = null
  generateLinkError: FakeError | null = null
  /** Erro devolvido por rpc(name), por nome de função. */
  rpcErrors: Record<string, FakeError> = {}
  now: () => Date
  private failures: Array<{ table: string; op: Op; error: FakeError; remaining: number }> = []
  private seq = 0

  constructor(opts: { now?: () => Date } = {}) {
    this.now = opts.now ?? (() => new Date())
    this.uniqueKeys = { ...DEFAULT_UNIQUE }
  }

  get client(): SupabaseClient {
    return this as unknown as SupabaseClient
  }

  nextSeq(): number {
    return ++this.seq
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= [])
  }

  /** Próxima(s) operação(ões) `op` em `table` retornam erro. */
  failNext(table: string, op: Op, error: FakeError = { message: 'boom', code: 'XX000' }, times = 1) {
    this.failures.push({ table, op, error, remaining: times })
  }

  takeFailure(table: string, op: Op): FakeError | null {
    const failure = this.failures.find((f) => f.table === table && f.op === op && f.remaining > 0)
    if (!failure) return null
    failure.remaining--
    return failure.error
  }

  /** Cria um usuário como o Auth faria (inclui o trigger handle_new_user). */
  addUser(email: string, extra: Partial<FakeAuthUser> = {}): FakeAuthUser {
    const user: FakeAuthUser = {
      id: `user-${this.nextSeq()}`,
      email: email.toLowerCase(),
      app_metadata: {},
      last_sign_in_at: null,
      created_at: this.now().toISOString(),
      ...extra,
    }
    this.users.push(user)
    this.rows('profiles').push({ id: user.id, email: user.email, tenant_id: 'hub' })
    this.rows('subscriptions').push({ id: `sub-${user.id}`, user_id: user.id, tier: 'free' })
    return user
  }

  from(table: string): FakeQuery {
    return new FakeQuery(this, table)
  }

  rpc(name: string, args: Record<string, unknown>): Promise<Result> {
    this.rpcCalls.push({ name, args })
    const injected = this.rpcErrors[name]
    if (injected) return Promise.resolve({ data: null, error: injected })
    if (name === 'get_auth_user_id_by_email') {
      const email = String(args.p_email ?? '').trim().toLowerCase()
      const user = this.users.find((u) => u.email === email)
      return Promise.resolve({ data: user?.id ?? null, error: null })
    }
    if (name === 'get_anon_assessment') {
      const rows = this.rows('assessments').filter((r) =>
        r.id === args.p_id && r.session_id === args.p_session_id && r.user_id == null
      )
      return Promise.resolve({ data: clone(rows), error: null })
    }
    return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } })
  }

  auth = {
    admin: {
      createUser: (attrs: { email: string; app_metadata?: Record<string, unknown> }) => {
        this.createUserCalls.push(attrs)
        const email = attrs.email.toLowerCase()
        if (this.users.some((u) => u.email === email)) {
          return Promise.resolve({
            data: { user: null },
            error: { message: 'A user with this email address has already been registered', status: 422 },
          })
        }
        const user = this.addUser(email, { app_metadata: attrs.app_metadata ?? {} })
        return Promise.resolve({ data: { user: clone(user) }, error: null })
      },
      getUserById: (id: string) => {
        const user = this.users.find((u) => u.id === id)
        return Promise.resolve(
          user
            ? { data: { user: clone(user) }, error: null }
            : { data: { user: null }, error: { message: 'User not found', status: 404 } },
        )
      },
      generateLink: (params: { type: string; email: string }) => {
        this.generateLinkCalls.push(params)
        if (this.generateLinkError) {
          return Promise.resolve({ data: { properties: null, user: null }, error: this.generateLinkError })
        }
        return Promise.resolve({
          data: { properties: { hashed_token: `hash-${this.nextSeq()}` }, user: null },
          error: null,
        })
      },
    },
    signInWithOtp: (params: { email: string; options?: Record<string, unknown> }) => {
      this.otpRequests.push(params)
      return Promise.resolve({ data: { user: null, session: null }, error: this.otpError })
    },
  }

  functions = {
    invoke: (name: string, opts: { body?: unknown; headers?: Record<string, string> } = {}) => {
      this.invocations.push({ name, body: opts.body, headers: opts.headers })
      return Promise.resolve(
        this.invokeError ? { data: null, error: this.invokeError } : { data: { ok: true }, error: null },
      )
    },
  }
}

// ── Stripe falso ─────────────────────────────────────────────────────────────

export interface FakeStripeSubscription {
  id: string
  status: string
  cancel_at: number | null
  canceled_at?: number | null
  ended_at?: number | null
  start_date: number
  billing_cycle_anchor?: number | null
  latest_invoice?: string | { id: string; payment_intent?: string | null } | null
}

export class FakeStripe {
  readonly signatureFor = (secret: string) => `valid:${secret}`
  subscriptionsStore = new Map<string, FakeStripeSubscription>()
  sessionsStore = new Map<string, Record<string, unknown>>()
  updateCalls: Array<{ id: string; params: Record<string, unknown> }> = []
  cancelCalls: string[] = []
  createdSessions: Array<Record<string, unknown>> = []

  webhooks = {
    constructEventAsync: (payload: string, header: string, secret: string): Promise<unknown> => {
      if (header !== this.signatureFor(secret)) {
        return Promise.reject(new Error('No signatures found matching the expected signature'))
      }
      return Promise.resolve(JSON.parse(payload))
    },
  }

  subscriptions = {
    retrieve: (id: string, _params?: Record<string, unknown>) => {
      const sub = this.subscriptionsStore.get(id)
      return sub
        ? Promise.resolve(clone(sub))
        : Promise.reject(Object.assign(new Error('No such subscription'), { statusCode: 404 }))
    },
    update: (id: string, params: Record<string, unknown>) => {
      this.updateCalls.push({ id, params })
      const sub = this.subscriptionsStore.get(id)
      if (!sub) return Promise.reject(new Error('No such subscription'))
      if (typeof params.cancel_at === 'number') sub.cancel_at = params.cancel_at
      return Promise.resolve(clone(sub))
    },
    cancel: (id: string, _params?: Record<string, unknown>) => {
      this.cancelCalls.push(id)
      const sub = this.subscriptionsStore.get(id)
      if (!sub) return Promise.reject(new Error('No such subscription'))
      sub.status = 'canceled'
      return Promise.resolve(clone(sub))
    },
  }

  checkout = {
    sessions: {
      retrieve: (id: string) => {
        const session = this.sessionsStore.get(id)
        return session
          ? Promise.resolve(clone(session))
          : Promise.reject(
            Object.assign(new Error('No such checkout.session'), {
              statusCode: 404,
              code: 'resource_missing',
            }),
          )
      },
      create: (params: Record<string, unknown>) => {
        this.createdSessions.push(clone(params))
        const id = `cs_test_created${this.createdSessions.length}`
        return Promise.resolve({ id, url: `https://checkout.stripe.test/${id}` })
      },
    },
  }
}
