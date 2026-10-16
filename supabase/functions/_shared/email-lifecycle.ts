// _shared/email-lifecycle.ts — regras dos e-mails do ciclo de vida (DI-077), sem I/O.
//
// Usado por compute-eligibility (welcome_free), lifecycle-emails (nutrição, avisos de
// prazo e lista de espera), unsubscribe (descadastro) e stripe-webhook
// (subscription_cancelled). Módulo puro: sem Deno.*, sem imports remotos — roda no
// Deno e no Vitest (_shared/email-lifecycle.test.ts).
//
// Regras do dono (não mudar sem decisão dele):
//  · Tudo começa DESLIGADO: LIFECYCLE_EMAILS_DRY_RUN só desliga o dry-run com o valor
//    explícito "false" (parseDryRun). Em dry-run nada vai para o Resend nem para o
//    send-email; só logs e a lista de quem receberia.
//  · Nutrição (nurture_*) e aviso da lista de espera são MARKETING: só com opt-in
//    explícito (answers.marketing_opt_in === true no quiz) e sem descadastro.
//  · welcome_free e avisos de prazo (access_*) são de SERVIÇO: não pedem opt-in de
//    marketing, mas respeitam o descadastro geral ('all') e, para quem tem conta, a
//    preferência "Sua conta e sua análise" (profiles.notification_preferences.process_updates).
//  · payment_confirmed e subscription_cancelled são transacionais (dinheiro): saem
//    para todos, sem link de descadastro.
//  · Descadastro por HMAC: o link leva só o hash do e-mail (nunca o e-mail) e uma
//    assinatura; a lista de descadastro guarda só o hash (tabela email_suppressions).
//    EMAIL_UNSUBSCRIBE_SECRET NÃO pode ser trocado depois de entrar em uso: os hashes
//    já gravados deixariam de bater e quem se descadastrou voltaria a receber.

import { safeEqual } from './assessment-access.ts'
import { normalizeEmail } from './payments.ts'

// ── Interruptor geral ────────────────────────────────────────────────────────

/**
 * true (dry-run) em qualquer caso, menos com o valor explícito "false"/"0"/"off"/"no".
 * Variável ausente, vazia ou com erro de digitação mantém tudo desligado.
 */
export function parseDryRun(raw: string | null | undefined): boolean {
  const value = (raw ?? '').trim().toLowerCase()
  return !(value === 'false' || value === '0' || value === 'off' || value === 'no')
}

// ── Catálogo de modelos ──────────────────────────────────────────────────────

export type EmailCategory = 'marketing' | 'service' | 'transactional'
export type UnsubscribeScope = 'marketing' | 'all'

export type LifecycleTemplateKey =
  | 'welcome_free'
  | 'nurture_d1'
  | 'nurture_d3'
  | 'nurture_d7'
  | 'access_expiring_d7'
  | 'access_expiring_d3'
  | 'access_expired'
  | 'waitlist_launch'
  | 'subscription_cancelled'
  | 'payment_confirmed'
  | 'analysis_ready'

export interface TemplateSpec {
  readonly category: EmailCategory
  /**
   * Variáveis que o código SEMPRE fornece a este modelo. O teste da migration
   * (email-lifecycle.test.ts) garante que o HTML/assunto só usam estas chaves —
   * nenhum `{{x}}` cru chega à caixa de entrada.
   */
  readonly variables: readonly string[]
}

export const TEMPLATE_SPECS: Readonly<Record<LifecycleTemplateKey, TemplateSpec>> = {
  welcome_free: { category: 'service', variables: ['greeting', 'category_label', 'result_link', 'unsubscribe_link'] },
  nurture_d1: { category: 'marketing', variables: ['greeting', 'category_label', 'result_link', 'unsubscribe_link'] },
  nurture_d3: { category: 'marketing', variables: ['greeting', 'category_label', 'result_link', 'unsubscribe_link'] },
  nurture_d7: { category: 'marketing', variables: ['greeting', 'category_label', 'result_link', 'unsubscribe_link'] },
  access_expiring_d7: {
    category: 'service',
    variables: ['greeting', 'days_left_label', 'expires_on', 'dashboard_link', 'unsubscribe_link'],
  },
  access_expiring_d3: {
    category: 'service',
    variables: ['greeting', 'days_left_label', 'expires_on', 'dashboard_link', 'unsubscribe_link'],
  },
  access_expired: { category: 'service', variables: ['greeting', 'expires_on', 'dashboard_link', 'unsubscribe_link'] },
  waitlist_launch: {
    category: 'marketing',
    variables: ['product_label', 'product_phrase', 'cta_link', 'unsubscribe_link'],
  },
  // Enviados pelo send-email com user_id: `name` vem do perfil (padrão 'Cliente').
  subscription_cancelled: { category: 'transactional', variables: ['name', 'dashboard_link'] },
  payment_confirmed: { category: 'transactional', variables: ['name', 'amount', 'dashboard_link'] },
  analysis_ready: { category: 'transactional', variables: ['name', 'dashboard_link'] },
}

/** Escopo do link de descadastro de cada categoria (transacional não tem link). */
export function scopeForCategory(category: EmailCategory): UnsubscribeScope | null {
  if (category === 'marketing') return 'marketing'
  if (category === 'service') return 'all'
  return null
}

/** Descadastro 'all' bloqueia marketing e serviço; 'marketing' só bloqueia marketing. */
export function isSuppressedFor(category: EmailCategory, scopes: ReadonlySet<string> | null | undefined): boolean {
  if (!scopes || scopes.size === 0 || category === 'transactional') return false
  if (scopes.has('all')) return true
  return category === 'marketing' && scopes.has('marketing')
}

// ── Respostas do quiz ────────────────────────────────────────────────────────

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

/** Opt-in explícito do formulário de captura (DI-043). Ausente/false/qualquer outra coisa = não. */
export function hasMarketingOptIn(answers: unknown): boolean {
  const value = asRecord(answers).marketing_opt_in
  return value === true || value === 'true'
}

/** Linha da lista de espera "em breve" (answers.waitlist = true, session_id com -wl). */
export function isWaitlistAnswers(answers: unknown): boolean {
  const value = asRecord(answers).waitlist
  return value === true || value === 'true'
}

export function answerText(answers: unknown, key: string): string | null {
  const value = asRecord(answers)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// ── Textos ───────────────────────────────────────────────────────────────────

/** Espelho dos rótulos de src/lib/category.ts (paridade testada no Vitest). */
export const CATEGORY_LABELS = {
  alta: 'Alta elegibilidade',
  media: 'Média elegibilidade',
  baixa: 'Elegibilidade baixa no momento',
} as const

/** Categoria desconhecida cai em "baixa", que não promete nada (como no front). */
export function categoryLabel(category: unknown): string {
  return typeof category === 'string' && category in CATEGORY_LABELS
    ? CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]
    : CATEGORY_LABELS.baixa
}

const MAX_FIRST_NAME = 40

/** "Olá, Ana." com o primeiro nome; "Olá." sem nome. */
export function greetingFor(fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]?.slice(0, MAX_FIRST_NAME) ?? ''
  return first ? `Olá, ${first}.` : 'Olá.'
}

/** Produtos da lista de espera (mesmas opções da tela "em breve" do quiz). */
export const WAITLIST_PRODUCTS = {
  visto: { label: 'Diagnóstico de vistos', phrase: 'o diagnóstico de vistos' },
  regularizacao: { label: 'Diagnóstico de regularização', phrase: 'o diagnóstico de regularização' },
  nao_sei: { label: 'Orientação guiada', phrase: 'a orientação guiada' },
} as const

export type WaitlistProduct = keyof typeof WAITLIST_PRODUCTS

export function isWaitlistProduct(value: unknown): value is WaitlistProduct {
  return typeof value === 'string' && value in WAITLIST_PRODUCTS
}

export function daysLeftLabel(days: number): string {
  const n = Math.max(1, Math.round(days))
  return n === 1 ? '1 dia' : `${n} dias`
}

/** Fuso padrão do perfil (schema: profiles.timezone DEFAULT 'Europe/Lisbon'). */
export const DEFAULT_TIMEZONE = 'Europe/Lisbon'

/** dd/mm/aaaa no fuso do perfil (fuso inválido → padrão). */
export function formatDatePtBr(date: Date, timeZone?: string | null): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz }).format(date)
  try {
    return format(timeZone?.trim() || DEFAULT_TIMEZONE)
  } catch {
    return format(DEFAULT_TIMEZONE)
  }
}

/** "pe***@example.com" — para listas do dry-run e logs (nunca o e-mail inteiro). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  const local = email.slice(0, at)
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2)
  return `${visible}***${email.slice(at)}`
}

// ── Links ────────────────────────────────────────────────────────────────────

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** Link de retomada do resultado (DI-024): /results?r=<token>. */
export function buildResultUrl(appUrl: string, resumeToken: string): string {
  return `${trimSlash(appUrl)}/results?r=${encodeURIComponent(resumeToken)}`
}

/** URL pública da function de descadastro no projeto. */
export function unsubscribeFunctionUrl(supabaseUrl: string): string {
  return `${trimSlash(supabaseUrl)}/functions/v1/unsubscribe`
}

export function buildUnsubscribeUrl(baseUrl: string, token: string): string {
  const base = trimSlash(baseUrl)
  return `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`
}

// ── HMAC (descadastro) ───────────────────────────────────────────────────────

/** Tamanho mínimo de EMAIL_UNSUBSCRIBE_SECRET (ex.: `openssl rand -hex 32` = 64). */
export const MIN_SECRET_LENGTH = 32

export function isUsableSecret(secret: string | null | undefined): secret is string {
  return typeof secret === 'string' && secret.trim().length >= MIN_SECRET_LENGTH
}

const encoder = new TextEncoder()

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)))
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const HASH_RE = /^[0-9a-f]{64}$/

export function isEmailHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_RE.test(value)
}

/** Identificador estável e não reversível do e-mail (o que a tabela email_suppressions guarda). */
export async function emailHash(secret: string, email: string): Promise<string | null> {
  const normalized = normalizeEmail(email)
  if (!normalized || !isUsableSecret(secret)) return null
  return toHex(await hmacSha256(secret, `email:v1:${normalized}`))
}

const SCOPE_CODE: Record<UnsubscribeScope, string> = { marketing: 'm', all: 'a' }
const TOKEN_RE = /^([0-9a-f]{64})\.([ma])\.([A-Za-z0-9_-]{43})$/

async function signature(secret: string, hash: string, scope: UnsubscribeScope): Promise<string> {
  return toBase64Url(await hmacSha256(secret, `unsubscribe:v1:${hash}:${scope}`))
}

/** Token do link: `<hash do e-mail>.<m|a>.<assinatura>` — sem o e-mail. */
export async function createUnsubscribeToken(
  secret: string,
  email: string,
  scope: UnsubscribeScope,
): Promise<string | null> {
  const hash = await emailHash(secret, email)
  if (!hash) return null
  return `${hash}.${SCOPE_CODE[scope]}.${await signature(secret, hash, scope)}`
}

/** Token válido → hash e escopo; qualquer outra coisa → null (sem lançar). */
export async function verifyUnsubscribeToken(
  secret: string | null | undefined,
  token: unknown,
): Promise<{ emailHash: string; scope: UnsubscribeScope } | null> {
  if (!isUsableSecret(secret) || typeof token !== 'string' || token.length > 200) return null
  const match = TOKEN_RE.exec(token.trim())
  if (!match) return null
  const [, hash, code, sig] = match
  const scope: UnsubscribeScope = code === 'a' ? 'all' : 'marketing'
  const expected = await signature(secret, hash, scope)
  return safeEqual(sig, expected) ? { emailHash: hash, scope } : null
}

// ── Agenda ───────────────────────────────────────────────────────────────────

export const DAY_MS = 24 * 60 * 60 * 1000

export interface WindowStep<K extends LifecycleTemplateKey> {
  readonly template: K
  /** Início da janela, em dias (inclusivo). */
  readonly fromDays: number
  /** Fim da janela, em dias (exclusivo). */
  readonly toDays: number
}

/**
 * Nutrição: dias desde a conclusão do quiz. Janelas sem sobreposição: cada pessoa
 * recebe no máximo um e-mail da série por execução, e um passo perdido (cron parado)
 * não é reenviado fora da janela. Frequência sujeita à aprovação do dono.
 */
export const NURTURE_STEPS: readonly WindowStep<'nurture_d1' | 'nurture_d3' | 'nurture_d7'>[] = [
  { template: 'nurture_d1', fromDays: 1, toDays: 3 },
  { template: 'nurture_d3', fromDays: 3, toDays: 6 },
  { template: 'nurture_d7', fromDays: 7, toDays: 10 },
]

/** Quanto voltar no tempo ao buscar quizzes concluídos (fim da última janela). */
export const NURTURE_LOOKBACK_DAYS = 10

export function nurtureStepFor(completedAtMs: number, nowMs: number) {
  const age = nowMs - completedAtMs
  return NURTURE_STEPS.find((s) => age >= s.fromDays * DAY_MS && age < s.toDays * DAY_MS) ?? null
}

/**
 * Prazo do €30 (one_time_access_expires_at):
 *  · access_expiring_d7: faltam mais de 3 e até 7 dias;
 *  · access_expiring_d3: faltam até 3 dias (ainda com acesso — igual ao src/lib/access.ts,
 *    em que o instante exato do fim ainda tem acesso);
 *  · access_expired: terminou há menos de 3 dias.
 */
export const ACCESS_WINDOW = { expiringFromDays: 7, lastDaysFrom: 3, expiredUntilDays: 3 } as const

export type AccessTemplate = 'access_expiring_d7' | 'access_expiring_d3' | 'access_expired'

export function accessStepFor(expiresAtMs: number, nowMs: number): AccessTemplate | null {
  const remaining = expiresAtMs - nowMs
  if (remaining >= 0) {
    if (remaining <= ACCESS_WINDOW.lastDaysFrom * DAY_MS) return 'access_expiring_d3'
    if (remaining <= ACCESS_WINDOW.expiringFromDays * DAY_MS) return 'access_expiring_d7'
    return null
  }
  return -remaining < ACCESS_WINDOW.expiredUntilDays * DAY_MS ? 'access_expired' : null
}

/** Dias restantes arredondados para cima (mesma regra do daysLeft de src/lib/access.ts). */
export function daysLeft(expiresAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((expiresAtMs - nowMs) / DAY_MS))
}

// ── Planejamento (puro) ──────────────────────────────────────────────────────

export type SkipReason =
  | 'invalid_email'
  | 'waitlist'
  | 'no_opt_in'
  | 'paid'
  | 'superseded'
  | 'not_due'
  | 'no_resume_token'
  | 'not_paid'
  | 'recurring'
  | 'prefs_off'
  | 'suppressed'
  | 'already_sent'
  | 'gave_up'
  | 'duplicate_recipient'
  | 'other_product'

export type SkipCounts = Partial<Record<SkipReason, number>>

export interface PlannedEmail {
  template: LifecycleTemplateKey
  category: EmailCategory
  /** Chave única do envio (email_send_log.variables_used->>'dedupe_key'). */
  dedupeKey: string
  email: string
  userId: string | null
  assessmentId: string | null
  /** Variáveis do modelo, menos unsubscribe_link (montado na hora do envio). */
  variables: Record<string, string>
}

/** Estado de envio de uma chave: já enviada/em envio, ou tentativas que falharam. */
export interface SentState {
  sent: ReadonlySet<string>
  failedAttempts: ReadonlyMap<string, number>
}

/** Depois de tantas falhas na mesma chave, para de tentar (ex.: domínio não verificado). */
export const MAX_FAILED_ATTEMPTS = 2

export interface PlanContext {
  nowMs: number
  appUrl: string
  sentState: SentState
  /** Escopos de descadastro por e-mail normalizado; null = não conferido (dry-run sem segredo). */
  suppressions: ReadonlyMap<string, ReadonlySet<string>> | null
  /** Hash de cada e-mail normalizado (chaves que não podem levar o e-mail em claro). */
  emailHashes?: ReadonlyMap<string, string>
}

export interface PlanResult {
  due: PlannedEmail[]
  skipped: SkipCounts
}

function bump(counts: SkipCounts, reason: SkipReason): void {
  counts[reason] = (counts[reason] ?? 0) + 1
}

/** Checagens finais comuns (descadastro e duplicidade). Devolve o motivo ou null. */
function finalSkip(plan: PlannedEmail, ctx: PlanContext): SkipReason | null {
  if (ctx.suppressions && isSuppressedFor(plan.category, ctx.suppressions.get(plan.email))) return 'suppressed'
  if (ctx.sentState.sent.has(plan.dedupeKey)) return 'already_sent'
  if ((ctx.sentState.failedAttempts.get(plan.dedupeKey) ?? 0) >= MAX_FAILED_ATTEMPTS) return 'gave_up'
  return null
}

export interface NurtureCandidate {
  assessmentId: string
  userId: string | null
  email: string | null
  fullName: string | null
  answers: unknown
  completedAt: string | null
  resumeToken: string | null
  scoreCategory: string | null
}

export interface NurtureContext extends PlanContext {
  /** Contas com €30 pago ou assinatura ativa (por user_id e por e-mail normalizado). */
  paidUserIds: ReadonlySet<string>
  paidEmails: ReadonlySet<string>
}

const RESUME_TOKEN_RE = /^[0-9a-f]{64}$/

/** Chaves dos e-mails que dependem de cada candidato (para consultar o log antes do plano). */
export function nurtureDedupeKey(template: string, assessmentId: string): string {
  return `${template}:${assessmentId}`
}

/**
 * Série de nutrição: uma pessoa (e-mail) por vez, sempre pelo quiz mais recente.
 * Só entra quem marcou o opt-in nesse quiz, ainda não pagou e não se descadastrou.
 */
export function planNurture(candidates: readonly NurtureCandidate[], ctx: NurtureContext): PlanResult {
  const skipped: SkipCounts = {}
  const due: PlannedEmail[] = []

  // Mais recente primeiro; os anteriores do mesmo e-mail ficam de fora.
  const sorted = [...candidates].sort((a, b) => Date.parse(b.completedAt ?? '') - Date.parse(a.completedAt ?? ''))
  const seen = new Set<string>()

  for (const c of sorted) {
    const email = normalizeEmail(c.email)
    if (!email) {
      bump(skipped, 'invalid_email')
      continue
    }
    if (seen.has(email)) {
      bump(skipped, 'superseded')
      continue
    }
    seen.add(email)

    if (isWaitlistAnswers(c.answers)) {
      bump(skipped, 'waitlist')
      continue
    }
    if (!hasMarketingOptIn(c.answers)) {
      bump(skipped, 'no_opt_in')
      continue
    }
    if ((c.userId && ctx.paidUserIds.has(c.userId)) || ctx.paidEmails.has(email)) {
      bump(skipped, 'paid')
      continue
    }
    const completedMs = Date.parse(c.completedAt ?? '')
    const step = Number.isFinite(completedMs) ? nurtureStepFor(completedMs, ctx.nowMs) : null
    if (!step) {
      bump(skipped, 'not_due')
      continue
    }
    if (!c.resumeToken || !RESUME_TOKEN_RE.test(c.resumeToken)) {
      bump(skipped, 'no_resume_token')
      continue
    }

    const plan: PlannedEmail = {
      template: step.template,
      category: TEMPLATE_SPECS[step.template].category,
      dedupeKey: nurtureDedupeKey(step.template, c.assessmentId),
      email,
      userId: c.userId,
      assessmentId: c.assessmentId,
      variables: {
        greeting: greetingFor(c.fullName),
        category_label: categoryLabel(c.scoreCategory),
        result_link: buildResultUrl(ctx.appUrl, c.resumeToken),
      },
    }
    const reason = finalSkip(plan, ctx)
    if (reason) bump(skipped, reason)
    else due.push(plan)
  }
  return { due, skipped }
}

export interface AccessCandidate {
  userId: string
  email: string | null
  fullName: string | null
  timezone: string | null
  expiresAt: string | null
  oneTimePaid: boolean
  recurringActive: boolean
  /** profiles.notification_preferences (preferência "Sua conta e sua análise"). */
  notificationPreferences: unknown
}

/** Preferência "Sua conta e sua análise" da SettingsPage: padrão ligado. */
export function wantsProcessUpdates(preferences: unknown): boolean {
  return asRecord(preferences).process_updates !== false
}

export function accessDedupeKey(template: string, userId: string, expiresAtIso: string): string {
  return `${template}:${userId}:${expiresAtIso.slice(0, 10)}`
}

/** Avisos do prazo do €30 para quem pagou e não tem assinatura ativa. */
export function planAccess(candidates: readonly AccessCandidate[], ctx: PlanContext): PlanResult {
  const skipped: SkipCounts = {}
  const due: PlannedEmail[] = []
  const seen = new Set<string>()
  const base = trimSlash(ctx.appUrl)

  for (const c of candidates) {
    if (seen.has(c.userId)) continue
    seen.add(c.userId)
    if (!c.oneTimePaid) {
      bump(skipped, 'not_paid')
      continue
    }
    if (c.recurringActive) {
      bump(skipped, 'recurring')
      continue
    }
    const email = normalizeEmail(c.email)
    if (!email) {
      bump(skipped, 'invalid_email')
      continue
    }
    if (!wantsProcessUpdates(c.notificationPreferences)) {
      bump(skipped, 'prefs_off')
      continue
    }
    const expiresMs = Date.parse(c.expiresAt ?? '')
    const template = Number.isFinite(expiresMs) ? accessStepFor(expiresMs, ctx.nowMs) : null
    if (!template || !c.expiresAt) {
      bump(skipped, 'not_due')
      continue
    }

    const expiresOn = formatDatePtBr(new Date(expiresMs), c.timezone)
    const variables: Record<string, string> = {
      greeting: greetingFor(c.fullName),
      expires_on: expiresOn,
      dashboard_link: template === 'access_expired' ? `${base}/dashboard?acesso=expirado` : `${base}/dashboard`,
    }
    if (template !== 'access_expired') {
      variables.days_left_label = daysLeftLabel(daysLeft(expiresMs, ctx.nowMs))
    }
    const plan: PlannedEmail = {
      template,
      category: TEMPLATE_SPECS[template].category,
      dedupeKey: accessDedupeKey(template, c.userId, new Date(expiresMs).toISOString()),
      email,
      userId: c.userId,
      assessmentId: null,
      variables,
    }
    const reason = finalSkip(plan, ctx)
    if (reason) bump(skipped, reason)
    else due.push(plan)
  }
  return { due, skipped }
}

export interface WaitlistCandidate {
  assessmentId: string
  email: string | null
  answers: unknown
}

/**
 * Uma vez por pessoa e produto. Leva o hash do e-mail (nunca o e-mail): a chave fica
 * gravada em email_send_log.variables_used. Sem hash (dry-run sem segredo) usa uma
 * marca que nunca coincide com um envio real.
 */
export function waitlistDedupeKey(product: WaitlistProduct, emailHashOrNull: string | null | undefined): string {
  return `waitlist_launch:${product}:${emailHashOrNull ?? 'sem-hash'}`
}

/** Aviso de lançamento para a lista de espera de UM produto (disparo manual do dono). */
export function planWaitlist(
  candidates: readonly WaitlistCandidate[],
  product: WaitlistProduct,
  ctx: PlanContext,
): PlanResult {
  const skipped: SkipCounts = {}
  const due: PlannedEmail[] = []
  const seen = new Set<string>()
  const info = WAITLIST_PRODUCTS[product]

  for (const c of candidates) {
    if (!isWaitlistAnswers(c.answers)) continue
    if (answerText(c.answers, 'processo_tipo') !== product) {
      bump(skipped, 'other_product')
      continue
    }
    const email = normalizeEmail(c.email)
    if (!email) {
      bump(skipped, 'invalid_email')
      continue
    }
    if (seen.has(email)) {
      bump(skipped, 'duplicate_recipient')
      continue
    }
    seen.add(email)
    const plan: PlannedEmail = {
      template: 'waitlist_launch',
      category: TEMPLATE_SPECS.waitlist_launch.category,
      dedupeKey: waitlistDedupeKey(product, ctx.emailHashes?.get(email)),
      email,
      userId: null,
      assessmentId: c.assessmentId,
      variables: {
        product_label: info.label,
        product_phrase: info.phrase,
        cta_link: `${trimSlash(ctx.appUrl)}/quiz`,
      },
    }
    const reason = finalSkip(plan, ctx)
    if (reason) bump(skipped, reason)
    else due.push(plan)
  }
  return { due, skipped }
}

export function mergeSkips(...all: SkipCounts[]): SkipCounts {
  const out: SkipCounts = {}
  for (const counts of all) {
    for (const [reason, n] of Object.entries(counts) as Array<[SkipReason, number]>) {
      out[reason] = (out[reason] ?? 0) + n
    }
  }
  return out
}

// ── Renderização ─────────────────────────────────────────────────────────────

/** Mesmo escape do send-email: variáveis entram no HTML sempre escapadas. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

/** Chaves `{{x}}` usadas num texto. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))]
}

export interface RenderedEmail {
  subject: string
  html: string
  /** Placeholders sem valor (o envio é bloqueado se sobrar algum). */
  missing: string[]
}

/** Assunto em texto puro; corpo HTML com as variáveis escapadas. */
export function renderEmail(
  template: { subject_pt: string; body_html_pt: string },
  vars: Record<string, string>,
): RenderedEmail {
  const missing = [...placeholdersIn(template.subject_pt), ...placeholdersIn(template.body_html_pt)].filter(
    (key) => vars[key] === undefined,
  )
  const safe = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]))
  return {
    subject: interpolate(template.subject_pt, vars),
    html: interpolate(template.body_html_pt, safe),
    missing: [...new Set(missing)],
  }
}
