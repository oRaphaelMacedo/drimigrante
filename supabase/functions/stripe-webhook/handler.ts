// stripe-webhook/handler.ts — lógica do webhook do Stripe (W1-03)
//
// Separada do index.ts para ser testada com Stripe e Supabase falsos
// (handler.test.ts). Cards: DI-002, DI-012, DI-020, DI-021.
//
// Garantias:
//  - Idempotência atômica (DI-020): o evento é "reivindicado" com INSERT em
//    payment_events (UNIQUE stripe_event_id). Duplicado já processado → 200;
//    duplicado ainda em processamento → 409 (o Stripe tenta de novo depois);
//    falha → a reivindicação é removida e a resposta é 500 (o Stripe reenvia).
//    Todas as escritas usam upsert/update idempotentes, então reprocessar após
//    uma falha não duplica linhas em payments.
//  - Payload mínimo em payment_events: {id, type, livemode, object_id, amount,
//    currency} — nada de e-mail, nome ou endereço do comprador.
//  - Acesso só com pagamento confirmado: payment_status 'paid' (ou
//    'no_payment_required', cupom de 100%). 'unpaid' (pagamento assíncrono
//    pendente) espera o checkout.session.async_payment_succeeded.
//  - Comprador resolvido por auth.users (RPC get_auth_user_id_by_email), nunca
//    por profiles.email (DI-002).
//  - €30 libera painel, análise completa e chat IA por 30 dias (DI-012).
//  - €4,90/mês limitado a 12 ciclos via subscriptions.update(cancel_at) — o
//    Checkout não aceita subscription_data.cancel_at (DI-021).
//  - Reembolso total e disputa revogam o acesso do €30; disputa em cobrança
//    da assinatura cancela a assinatura no Stripe e revoga o acesso recorrente.
//  - Falha de pagamento da assinatura só revoga na última tentativa.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import { findOrCreateBuyer } from '../_shared/buyer.ts'
import {
  addCalendarMonthsUtc,
  isCheckoutSettled,
  isOneTimeAccessActive,
  normalizeEmail,
  oneTimeExpiresAt,
  PG_UNIQUE_VIOLATION,
  RECURRING_MAX_CYCLES,
  unixToIso,
  type AccessRow,
} from '../_shared/payments.ts'

// ── Formas mínimas dos objetos do Stripe usados aqui (API 2023-10-16) ────────

type StripeRef = string | { id: string } | null | undefined

export interface StripeEvent {
  id: string
  type: string
  created: number
  livemode: boolean
  data: { object: Record<string, unknown> }
}

export interface CheckoutSessionObject {
  id: string
  mode: 'payment' | 'subscription' | 'setup'
  payment_status: string
  amount_total: number | null
  currency: string | null
  customer: StripeRef
  customer_email?: string | null
  customer_details?: { email?: string | null } | null
  payment_intent: StripeRef
  subscription: StripeRef
  metadata?: Record<string, string> | null
}

export interface SubscriptionObject {
  id: string
  status: string
  cancel_at: number | null
  canceled_at?: number | null
  ended_at?: number | null
  start_date: number
  billing_cycle_anchor?: number | null
  latest_invoice?: string | { id: string; payment_intent?: StripeRef } | null
}

interface InvoiceObject {
  id: string
  subscription: StripeRef
  customer: StripeRef
  billing_reason: string | null
  amount_paid: number
  currency: string
  payment_intent: StripeRef
  next_payment_attempt: number | null
  status_transitions?: { paid_at?: number | null } | null
}

interface ChargeObject {
  id: string
  payment_intent: StripeRef
  invoice?: StripeRef
  refunded: boolean
}

interface DisputeObject {
  id: string
  payment_intent: StripeRef
}

export interface StripeWebhookClient {
  webhooks: {
    constructEventAsync(payload: string, header: string, secret: string): Promise<unknown>
  }
  subscriptions: {
    retrieve(id: string, params?: Record<string, unknown>): Promise<SubscriptionObject>
    update(id: string, params: Record<string, unknown>): Promise<SubscriptionObject>
    cancel(id: string, params?: Record<string, unknown>): Promise<SubscriptionObject>
  }
}

export interface WebhookDeps {
  stripe: StripeWebhookClient
  supabase: SupabaseClient
  webhookSecret: string
  /** APP_URL — base dos links enviados por e-mail. */
  appUrl: string
  /** INTERNAL_SECRET exigido pela function send-email. */
  internalSecret: string
  now?: () => Date
}

interface Ctx extends WebhookDeps {
  now: () => Date
  event: StripeEvent
}

interface ProcessResult {
  userId?: string | null
}

// ── Constantes ───────────────────────────────────────────────────────────────

// Sem Access-Control-Allow-Origin: o CORS (allowlist ou nenhum) é aplicado no index.ts
// por _shared/cors.ts, que substitui qualquer Access-Control-* daqui (DI-082).
const corsHeaders = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
}

/** Reivindicação "processing" mais velha que isso é considerada abandonada. */
const STALE_CLAIM_MS = 10 * 60 * 1000

/** Status do Stripe com acesso recorrente concedido. */
const GRANTING_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing'])
/** Status do Stripe em que a assinatura terminou ou foi suspensa. */
const ENDED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired', 'paused'])

// ── Utilitários ──────────────────────────────────────────────────────────────

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function asId(ref: StripeRef): string | null {
  if (!ref) return null
  return typeof ref === 'string' ? ref : ref.id ?? null
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatEur(cents: number | null | undefined): string {
  return `€${((cents ?? 0) / 100).toFixed(2)}`
}

export interface MinimalEventPayload {
  id: string
  type: string
  livemode: boolean
  object_id: string | null
  amount: number | null
  currency: string | null
}

/** Payload guardado em payment_events: só identificadores e valores (DI-020). */
export function summarizeEvent(event: StripeEvent): MinimalEventPayload {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>
  let amount: number | null = null
  if (event.type.startsWith('checkout.session.')) amount = numberOrNull(obj.amount_total)
  else if (event.type === 'charge.refunded') amount = numberOrNull(obj.amount_refunded)
  else if (event.type.startsWith('charge.dispute.')) amount = numberOrNull(obj.amount)
  else if (event.type === 'invoice.payment_failed') amount = numberOrNull(obj.amount_due)
  else if (event.type.startsWith('invoice.')) amount = numberOrNull(obj.amount_paid)
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode === true,
    object_id: typeof obj.id === 'string' ? obj.id : null,
    amount,
    currency: typeof obj.currency === 'string' ? obj.currency : null,
  }
}

/** Fim do 12º ciclo: âncora de cobrança + 12 meses de calendário (DI-021). */
export function computeSubscriptionCap(subscription: SubscriptionObject): number {
  const anchor = subscription.billing_cycle_anchor ?? subscription.start_date
  return addCalendarMonthsUtc(anchor, RECURRING_MAX_CYCLES)
}

// ── Idempotência (payment_events) ────────────────────────────────────────────

type ClaimResult = 'claimed' | 'duplicate' | 'in_progress'

async function claimEvent(ctx: Ctx): Promise<ClaimResult> {
  const { supabase, event } = ctx
  const summary = summarizeEvent(event)
  const row = {
    stripe_event_id: event.id,
    stripe_event_type: event.type,
    stripe_object_id: summary.object_id,
    amount: summary.amount !== null ? summary.amount / 100 : null,
    currency: summary.currency,
    status: 'processing',
    payload: summary,
    processed_at: null,
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.from('payment_events').insert(row)
    if (!error) return 'claimed'
    if (error.code !== PG_UNIQUE_VIOLATION) {
      throw new Error(`payment_events insert failed: ${error.message}`)
    }

    const { data: existing, error: readErr } = await supabase
      .from('payment_events')
      .select('status, created_at')
      .eq('stripe_event_id', event.id)
      .maybeSingle()
    if (readErr) throw new Error(`payment_events read failed: ${readErr.message}`)
    // Liberado entre o INSERT e a leitura (tentativa anterior falhou): tentar de novo.
    if (!existing) continue
    // 'processed' ou linhas legadas (status NULL, gravadas já processadas).
    if (existing.status !== 'processing') return 'duplicate'

    const createdAt = existing.created_at ? Date.parse(existing.created_at) : NaN
    const now = ctx.now().getTime()
    if (attempt === 0 && Number.isFinite(createdAt) && now - createdAt > STALE_CLAIM_MS) {
      // Reivindicação abandonada (a execução anterior morreu sem liberar).
      const { error: delErr } = await supabase
        .from('payment_events')
        .delete()
        .eq('stripe_event_id', event.id)
        .eq('status', 'processing')
        .lt('created_at', new Date(now - STALE_CLAIM_MS).toISOString())
      if (delErr) throw new Error(`payment_events stale release failed: ${delErr.message}`)
      continue
    }
    return 'in_progress'
  }
  return 'in_progress'
}

async function markEventProcessed(ctx: Ctx, userId: string | null | undefined): Promise<void> {
  const { error } = await ctx.supabase
    .from('payment_events')
    .update({
      status: 'processed',
      processed_at: ctx.now().toISOString(),
      ...(userId ? { user_id: userId } : {}),
    })
    .eq('stripe_event_id', ctx.event.id)
  if (error) throw new Error(`payment_events update failed: ${error.message}`)
}

async function releaseEventClaim(ctx: Ctx): Promise<void> {
  const { error } = await ctx.supabase
    .from('payment_events')
    .delete()
    .eq('stripe_event_id', ctx.event.id)
    .eq('status', 'processing')
  if (error) console.error(`stripe-webhook: failed to release claim ${ctx.event.id}: ${error.message}`)
}

// ── Escritas compartilhadas ──────────────────────────────────────────────────

interface PaymentRow {
  user_id: string
  assessment_id?: string | null
  stripe_payment_intent_id: string | null
  stripe_subscription_id?: string | null
  stripe_customer_id: string | null
  product: 'one_time_analysis' | 'recurring_monthly'
  amount_cents: number
  currency: string
  status: 'succeeded'
  paid_at: string
  metadata: Record<string, string>
}

/**
 * Registra o pagamento sem duplicar: upsert por PaymentIntent; sem
 * PaymentIntent (ex.: cupom de 100%), deduplica pela referência do Stripe
 * guardada em metadata.
 */
async function recordPayment(
  supabase: SupabaseClient,
  row: PaymentRow,
  dedupe: { key: 'checkout_session_id' | 'invoice_id'; value: string },
): Promise<void> {
  if (row.stripe_payment_intent_id) {
    const { error } = await supabase
      .from('payments')
      .upsert(row, { onConflict: 'stripe_payment_intent_id' })
    if (error) throw new Error(`payments upsert failed: ${error.message}`)
    return
  }
  const { data: existing, error: readErr } = await supabase
    .from('payments')
    .select('id')
    .eq(`metadata->>${dedupe.key}`, dedupe.value)
    .maybeSingle()
  if (readErr) throw new Error(`payments read failed: ${readErr.message}`)
  if (existing) return
  const { error } = await supabase.from('payments').insert(row)
  if (error) throw new Error(`payments insert failed: ${error.message}`)
}

async function sendEmail(ctx: Ctx, body: Record<string, unknown>): Promise<void> {
  const { error } = await ctx.supabase.functions.invoke('send-email', {
    body,
    headers: { 'x-internal-secret': ctx.internalSecret },
  })
  if (error) throw new Error(`send-email failed: ${error.message}`)
}

type SubscriptionAccessRow = AccessRow & { user_id: string }

async function findSubscriptionByStripeId(
  supabase: SupabaseClient,
  stripeSubscriptionId: string,
): Promise<SubscriptionAccessRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('user_id, one_time_paid, one_time_access_expires_at, recurring_active')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle()
  if (error) throw new Error(`subscriptions read failed: ${error.message}`)
  return (data as SubscriptionAccessRow | null) ?? null
}

async function updateSubscriptionByStripeId(
  supabase: SupabaseClient,
  stripeSubscriptionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update(patch)
    .eq('stripe_subscription_id', stripeSubscriptionId)
  if (error) throw new Error(`subscriptions update failed: ${error.message}`)
}

/**
 * Fim do acesso recorrente. O chat continua liberado só se o €30 ainda
 * estiver dentro dos 30 dias (DI-012).
 */
function recurringEndedPatch(row: AccessRow, now: Date): Record<string, unknown> {
  return {
    recurring_active: false,
    tier: row.one_time_paid ? 'one_time' : 'free',
    has_chat_access: isOneTimeAccessActive(row, now),
  }
}

/** Aplica o limite de 12 ciclos (idempotente; nunca adia um cancelamento já agendado). */
async function applySubscriptionCap(
  ctx: Ctx,
  subscription: SubscriptionObject,
): Promise<SubscriptionObject> {
  if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) return subscription
  const cap = computeSubscriptionCap(subscription)
  if (subscription.cancel_at && subscription.cancel_at <= cap) return subscription
  return await ctx.stripe.subscriptions.update(subscription.id, {
    cancel_at: cap,
    proration_behavior: 'none',
    expand: ['latest_invoice'],
  })
}

function latestInvoiceRefs(subscription: SubscriptionObject): {
  invoiceId: string | null
  paymentIntentId: string | null
} {
  const invoice = subscription.latest_invoice
  if (!invoice) return { invoiceId: null, paymentIntentId: null }
  if (typeof invoice === 'string') return { invoiceId: invoice, paymentIntentId: null }
  return { invoiceId: invoice.id, paymentIntentId: asId(invoice.payment_intent) }
}

// ── Checkout ─────────────────────────────────────────────────────────────────

async function linkAnonymousAssessment(
  ctx: Ctx,
  userId: string,
  assessmentId: string | undefined,
  anonSessionId: string | undefined,
): Promise<void> {
  if (!assessmentId || !anonSessionId) return
  // Service role ignora RLS; id + session_id provam a posse do assessment anônimo.
  const { error } = await ctx.supabase
    .from('assessments')
    .update({ user_id: userId, updated_at: ctx.now().toISOString() })
    .eq('id', assessmentId)
    .eq('session_id', anonSessionId)
    .is('user_id', null)
  if (error) throw new Error(`assessment link failed: ${error.message}`)
}

async function grantOneTime(
  ctx: Ctx,
  session: CheckoutSessionObject,
  userId: string,
  paidAt: Date,
): Promise<void> {
  const { supabase } = ctx
  const { data: current, error: readErr } = await supabase
    .from('subscriptions')
    .select('recurring_active')
    .eq('user_id', userId)
    .maybeSingle()
  if (readErr) throw new Error(`subscriptions read failed: ${readErr.message}`)

  const customerId = asId(session.customer)
  const paymentIntentId = asId(session.payment_intent)

  const { error: subErr } = await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      tier: current?.recurring_active ? 'recurring' : 'one_time',
      one_time_paid: true,
      one_time_paid_at: paidAt.toISOString(),
      one_time_payment_amount: session.amount_total != null ? session.amount_total / 100 : null,
      // Acesso com PRAZO de 30 dias (decisão do dono, 2026-06-30).
      one_time_access_expires_at: oneTimeExpiresAt(paidAt),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      stripe_payment_intent_id: paymentIntentId,
      has_dashboard_access: true,
      has_full_analysis: true,
      // DI-012: o €30 inclui o chat IA durante os 30 dias de acesso.
      has_chat_access: true,
    },
    { onConflict: 'user_id' },
  )
  if (subErr) throw new Error(`subscriptions upsert failed: ${subErr.message}`)

  await recordPayment(
    supabase,
    {
      user_id: userId,
      assessment_id: session.metadata?.assessment_id || null,
      stripe_payment_intent_id: paymentIntentId,
      stripe_customer_id: customerId,
      product: 'one_time_analysis',
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? 'eur',
      status: 'succeeded',
      paid_at: paidAt.toISOString(),
      metadata: { checkout_session_id: session.id },
    },
    { key: 'checkout_session_id', value: session.id },
  )

  await sendEmail(ctx, {
    trigger_key: 'payment_confirmed',
    user_id: userId,
    variables: {
      amount: formatEur(session.amount_total),
      dashboard_link: `${ctx.appUrl}/dashboard`,
    },
  })
}

async function grantRecurring(
  ctx: Ctx,
  session: CheckoutSessionObject,
  userId: string,
  paidAt: Date,
): Promise<void> {
  const subscriptionId = asId(session.subscription)
  if (!subscriptionId) {
    throw new Error(`subscription checkout ${session.id} has no subscription id`)
  }

  // DI-021: limite de 12 ciclos aplicado na assinatura criada pelo Checkout.
  const retrieved = await ctx.stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['latest_invoice'],
  })
  const subscription = await applySubscriptionCap(ctx, retrieved)
  const customerId = asId(session.customer)

  const { error } = await ctx.supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      tier: 'recurring',
      recurring_active: true,
      recurring_started_at: unixToIso(subscription.start_date) ?? paidAt.toISOString(),
      recurring_amount: session.amount_total != null ? session.amount_total / 100 : null,
      recurring_cancel_at: unixToIso(subscription.cancel_at),
      recurring_cancelled_at: null,
      ...(customerId ? { stripe_customer_id: customerId } : {}),
      stripe_subscription_id: subscriptionId,
      has_dashboard_access: true,
      has_chat_access: true,
      has_full_analysis: true,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw new Error(`subscriptions upsert failed: ${error.message}`)

  const { invoiceId, paymentIntentId } = latestInvoiceRefs(subscription)
  await recordPayment(
    ctx.supabase,
    {
      user_id: userId,
      assessment_id: session.metadata?.assessment_id || null,
      stripe_payment_intent_id: paymentIntentId,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      product: 'recurring_monthly',
      amount_cents: session.amount_total ?? 0,
      currency: session.currency ?? 'eur',
      status: 'succeeded',
      paid_at: paidAt.toISOString(),
      metadata: {
        checkout_session_id: session.id,
        ...(invoiceId ? { invoice_id: invoiceId } : {}),
      },
    },
    { key: 'checkout_session_id', value: session.id },
  )
}

async function handleCheckoutSettled(
  ctx: Ctx,
  session: CheckoutSessionObject,
): Promise<ProcessResult> {
  if (!isCheckoutSettled(session.payment_status)) {
    console.log(
      `stripe-webhook: session ${session.id} payment_status=${session.payment_status} — nada concedido`,
    )
    return {}
  }

  const metadata = session.metadata ?? {}
  let userId = metadata.user_id || null

  if (!userId) {
    // Funil P0: checkout anônimo do €30 — a conta é criada aqui.
    if (session.mode !== 'payment') {
      console.error(`stripe-webhook: session ${session.id} (${session.mode}) sem user_id — ignorada`)
      return {}
    }
    const email =
      normalizeEmail(metadata.email) ??
      normalizeEmail(session.customer_details?.email) ??
      normalizeEmail(session.customer_email)
    if (!email) {
      // Reenviar não resolve: registrar e confirmar o recebimento.
      console.error(`stripe-webhook: session ${session.id} anônima sem e-mail — ignorada`)
      return {}
    }
    const buyer = await findOrCreateBuyer(ctx.supabase, email, session.id)
    userId = buyer.userId
    await linkAnonymousAssessment(ctx, userId, metadata.assessment_id, metadata.session_id)
  }

  // Instante estável entre reenvios: o do evento (pagamento confirmado).
  const paidAt = new Date(ctx.event.created * 1000)
  if (session.mode === 'payment') await grantOneTime(ctx, session, userId, paidAt)
  else if (session.mode === 'subscription') await grantRecurring(ctx, session, userId, paidAt)
  else console.log(`stripe-webhook: session ${session.id} mode=${session.mode} — ignorada`)

  return { userId }
}

// ── Assinatura ───────────────────────────────────────────────────────────────

async function handleSubscriptionUpdated(
  ctx: Ctx,
  subscription: SubscriptionObject,
): Promise<ProcessResult> {
  const row = await findSubscriptionByStripeId(ctx.supabase, subscription.id)
  if (!row) {
    // Ainda não vinculada: o checkout.session.completed grava tudo.
    console.log(`stripe-webhook: subscription ${subscription.id} sem linha local — ignorada`)
    return {}
  }

  let patch: Record<string, unknown>
  if (GRANTING_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    // Reaplica o limite se ele sumiu (ex.: "renovar" no portal do cliente).
    const capped = await applySubscriptionCap(ctx, subscription)
    patch = {
      tier: 'recurring',
      recurring_active: true,
      recurring_cancel_at: unixToIso(capped.cancel_at),
      has_dashboard_access: true,
      has_chat_access: true,
      has_full_analysis: true,
    }
  } else if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    patch = {
      ...recurringEndedPatch(row, ctx.now()),
      recurring_cancel_at: unixToIso(subscription.cancel_at),
    }
  } else {
    // past_due: o acesso segue as tentativas de cobrança (invoice.payment_failed);
    // incomplete: aguarda o checkout. Só sincroniza a data de término agendada.
    patch = { recurring_cancel_at: unixToIso(subscription.cancel_at) }
  }

  await updateSubscriptionByStripeId(ctx.supabase, subscription.id, patch)
  return { userId: row.user_id }
}

async function handleSubscriptionDeleted(
  ctx: Ctx,
  subscription: SubscriptionObject,
): Promise<ProcessResult> {
  const row = await findSubscriptionByStripeId(ctx.supabase, subscription.id)
  if (!row) return {}
  const now = ctx.now()
  await updateSubscriptionByStripeId(ctx.supabase, subscription.id, {
    ...recurringEndedPatch(row, now),
    recurring_cancelled_at:
      unixToIso(subscription.ended_at ?? subscription.canceled_at) ?? now.toISOString(),
    recurring_cancel_at: unixToIso(subscription.cancel_at),
  })
  return { userId: row.user_id }
}

// ── Faturas da assinatura ────────────────────────────────────────────────────

async function handleInvoicePaid(ctx: Ctx, invoice: InvoiceObject): Promise<ProcessResult> {
  const subscriptionId = asId(invoice.subscription)
  // A primeira cobrança é registrada pelo checkout.session.completed.
  if (!subscriptionId || invoice.billing_reason === 'subscription_create') return {}

  const row = await findSubscriptionByStripeId(ctx.supabase, subscriptionId)
  if (!row) {
    console.warn(`stripe-webhook: invoice ${invoice.id} sem subscription local`)
    return {}
  }

  await recordPayment(
    ctx.supabase,
    {
      user_id: row.user_id,
      stripe_payment_intent_id: asId(invoice.payment_intent),
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: asId(invoice.customer),
      product: 'recurring_monthly',
      amount_cents: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      paid_at: unixToIso(invoice.status_transitions?.paid_at) ?? ctx.now().toISOString(),
      metadata: { invoice_id: invoice.id, billing_reason: invoice.billing_reason ?? '' },
    },
    { key: 'invoice_id', value: invoice.id },
  )

  // Reativa se uma falha anterior tinha suspendido o acesso.
  await updateSubscriptionByStripeId(ctx.supabase, subscriptionId, {
    tier: 'recurring',
    recurring_active: true,
    has_dashboard_access: true,
    has_chat_access: true,
    has_full_analysis: true,
  })
  return { userId: row.user_id }
}

async function handleInvoiceFailed(ctx: Ctx, invoice: InvoiceObject): Promise<ProcessResult> {
  const subscriptionId = asId(invoice.subscription)
  if (!subscriptionId) return {}
  if (invoice.next_payment_attempt) {
    console.log(`stripe-webhook: invoice ${invoice.id} falhou; nova tentativa agendada — acesso mantido`)
    return {}
  }

  const row = await findSubscriptionByStripeId(ctx.supabase, subscriptionId)
  if (!row) return {}
  // Última tentativa: suspende o acesso recorrente.
  await updateSubscriptionByStripeId(ctx.supabase, subscriptionId, recurringEndedPatch(row, ctx.now()))
  return { userId: row.user_id }
}

// ── Reembolso e disputa ──────────────────────────────────────────────────────

interface PaymentLookup {
  user_id: string | null
  product: 'one_time_analysis' | 'recurring_monthly'
  stripe_subscription_id: string | null
}

async function findPaymentByIntent(
  supabase: SupabaseClient,
  paymentIntentId: string,
): Promise<PaymentLookup | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('user_id, product, stripe_subscription_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (error) throw new Error(`payments read failed: ${error.message}`)
  return (data as PaymentLookup | null) ?? null
}

async function markPayment(
  supabase: SupabaseClient,
  paymentIntentId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('payments')
    .update(patch)
    .eq('stripe_payment_intent_id', paymentIntentId)
  if (error) throw new Error(`payments update failed: ${error.message}`)
}

/**
 * Revoga o acesso do €30 concedido por este PaymentIntent. Se o usuário tiver
 * comprado de novo depois (outro PaymentIntent), nada muda.
 */
async function revokeOneTimeAccess(ctx: Ctx, paymentIntentId: string): Promise<string | null> {
  const { data: row, error } = await ctx.supabase
    .from('subscriptions')
    .select('user_id, recurring_active')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (error) throw new Error(`subscriptions read failed: ${error.message}`)
  if (!row) {
    console.warn(`stripe-webhook: nenhum acesso vigente ligado ao PaymentIntent ${paymentIntentId}`)
    return null
  }

  const keepRecurring = row.recurring_active === true
  const { error: upErr } = await ctx.supabase
    .from('subscriptions')
    .update({
      one_time_paid: false,
      one_time_access_expires_at: ctx.now().toISOString(),
      tier: keepRecurring ? 'recurring' : 'free',
      has_dashboard_access: keepRecurring,
      has_full_analysis: keepRecurring,
      has_chat_access: keepRecurring,
    })
    .eq('stripe_payment_intent_id', paymentIntentId)
  if (upErr) throw new Error(`subscriptions update failed: ${upErr.message}`)
  return row.user_id as string
}

async function handleChargeRefunded(ctx: Ctx, charge: ChargeObject): Promise<ProcessResult> {
  // `refunded` só é true quando o valor inteiro foi reembolsado.
  if (!charge.refunded) {
    console.log(`stripe-webhook: reembolso parcial em ${charge.id} — acesso mantido`)
    return {}
  }
  const paymentIntentId = asId(charge.payment_intent)
  if (!paymentIntentId) {
    console.warn(`stripe-webhook: charge ${charge.id} reembolsada sem PaymentIntent`)
    return {}
  }

  const payment = await findPaymentByIntent(ctx.supabase, paymentIntentId)
  await markPayment(ctx.supabase, paymentIntentId, {
    status: 'refunded',
    refunded_at: ctx.now().toISOString(),
  })

  const isRecurringCharge = payment ? payment.product === 'recurring_monthly' : !!charge.invoice
  if (isRecurringCharge) {
    // Mensalidade reembolsada: o acesso segue o ciclo de vida da assinatura.
    console.log(`stripe-webhook: mensalidade reembolsada (${charge.id}) — assinatura inalterada`)
    return { userId: payment?.user_id ?? null }
  }

  const userId = await revokeOneTimeAccess(ctx, paymentIntentId)
  return { userId: userId ?? payment?.user_id ?? null }
}

async function handleDisputeCreated(ctx: Ctx, dispute: DisputeObject): Promise<ProcessResult> {
  const paymentIntentId = asId(dispute.payment_intent)
  if (!paymentIntentId) {
    console.warn(`stripe-webhook: disputa ${dispute.id} sem PaymentIntent`)
    return {}
  }

  const payment = await findPaymentByIntent(ctx.supabase, paymentIntentId)
  await markPayment(ctx.supabase, paymentIntentId, { status: 'disputed' })

  if (payment?.product === 'recurring_monthly') {
    const subscriptionId = payment.stripe_subscription_id
    if (!subscriptionId) {
      console.warn(`stripe-webhook: disputa ${dispute.id} em mensalidade sem subscription`)
      return { userId: payment.user_id }
    }
    // Não continuar cobrando quem contestou: cancela já no Stripe e revoga aqui.
    let current: SubscriptionObject | null = null
    try {
      current = await ctx.stripe.subscriptions.retrieve(subscriptionId)
    } catch (err) {
      // Assinatura que já não existe no Stripe: nada a cancelar.
      if ((err as { statusCode?: number } | null)?.statusCode !== 404) throw err
    }
    if (current && !ENDED_SUBSCRIPTION_STATUSES.has(current.status)) {
      await ctx.stripe.subscriptions.cancel(subscriptionId)
    }
    const row = await findSubscriptionByStripeId(ctx.supabase, subscriptionId)
    if (row) {
      await updateSubscriptionByStripeId(ctx.supabase, subscriptionId, {
        ...recurringEndedPatch(row, ctx.now()),
        recurring_cancelled_at: ctx.now().toISOString(),
      })
    }
    return { userId: payment.user_id }
  }

  const userId = await revokeOneTimeAccess(ctx, paymentIntentId)
  return { userId: userId ?? payment?.user_id ?? null }
}

// ── Roteamento ───────────────────────────────────────────────────────────────

async function processEvent(ctx: Ctx): Promise<ProcessResult> {
  const object = ctx.event.data.object
  switch (ctx.event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return await handleCheckoutSettled(ctx, object as unknown as CheckoutSessionObject)

    case 'checkout.session.async_payment_failed':
      console.log(`stripe-webhook: pagamento assíncrono falhou (${String(object.id)}) — nada concedido`)
      return {}

    case 'customer.subscription.updated':
      return await handleSubscriptionUpdated(ctx, object as unknown as SubscriptionObject)

    case 'customer.subscription.deleted':
      return await handleSubscriptionDeleted(ctx, object as unknown as SubscriptionObject)

    case 'invoice.payment_succeeded':
      return await handleInvoicePaid(ctx, object as unknown as InvoiceObject)

    case 'invoice.payment_failed':
      return await handleInvoiceFailed(ctx, object as unknown as InvoiceObject)

    case 'charge.refunded':
      return await handleChargeRefunded(ctx, object as unknown as ChargeObject)

    case 'charge.dispute.created':
      return await handleDisputeCreated(ctx, object as unknown as DisputeObject)

    default:
      console.log(`stripe-webhook: evento não tratado ${ctx.event.type}`)
      return {}
  }
}

// ── Handler HTTP ─────────────────────────────────────────────────────────────

export function createStripeWebhookHandler(deps: WebhookDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date())

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const signature = req.headers.get('stripe-signature')
    if (!signature) return json({ error: 'Missing stripe-signature header' }, 400)

    const body = await req.text()
    let event: StripeEvent
    try {
      // Deno: a variante assíncrona usa Web Crypto (a síncrona depende do crypto do Node).
      event = (await deps.stripe.webhooks.constructEventAsync(
        body,
        signature,
        deps.webhookSecret,
      )) as StripeEvent
    } catch {
      console.warn('stripe-webhook: assinatura inválida')
      return json({ error: 'Invalid signature' }, 400)
    }

    const ctx: Ctx = { ...deps, now, event }
    let claimed = false
    try {
      const claim = await claimEvent(ctx)
      if (claim === 'duplicate') {
        console.log(`stripe-webhook: evento ${event.id} já processado — ignorado`)
        return json({ received: true, duplicate: true })
      }
      if (claim === 'in_progress') {
        // Não-2xx de propósito: o Stripe reenvia e o reenvio vira 'duplicate'.
        return json({ error: 'Event is being processed' }, 409)
      }
      claimed = true

      const result = await processEvent(ctx)
      await markEventProcessed(ctx, result.userId)
      return json({ received: true })
    } catch (err) {
      console.error(`stripe-webhook: falha em ${event.type} ${event.id}: ${errorMessage(err)}`)
      // Libera a reivindicação para o reenvio do Stripe reprocessar o evento.
      if (claimed) await releaseEventClaim(ctx)
      // Sem detalhes internos na resposta (B03-A07).
      return json({ error: 'Internal server error' }, 500)
    }
  }
}
