// delete-account/handler.ts — exclusão da conta pelo próprio titular (DI-083, LGPD/RGPD)
//
// Fluxo (nesta ordem; cada passo só roda se o anterior deu certo):
//  1. JWT obrigatório; o usuário vem SEMPRE do token (nada do corpo decide quem
//     é apagado).
//  2. Confirmação: o corpo traz { confirm_email } e ele precisa ser o e-mail da
//     conta (sem diferenciar maiúsculas). A tela pede para digitar o e-mail.
//  3. Conta da equipe (qualquer papel além de 'client') → 403 staff_account.
//     Processo (case) em andamento → 409 open_case. As duas recusas vêm ANTES
//     de mexer no Stripe e no Storage: quem tem processo em andamento não perde
//     assinatura nem documentos numa exclusão que seria recusada no passo 6 (a
//     RPC confere de novo, para o caso de um processo aberto no meio do caminho).
//  4. Assinatura de €4,90/mês: cancelada na hora no Stripe. Se o Stripe falhar,
//     NADA é apagado (502) — apagar a conta com a cobrança ainda ativa seria pior.
//     O customer e as faturas ficam no Stripe (dados fiscais).
//  5. Arquivos do bucket user-documents na pasta {user_id}/ — removidos. Falhou →
//     502, nada do banco foi apagado ainda (dá para tentar de novo). A assinatura
//     já pode ter sido cancelada no passo 4 e parte dos arquivos já pode ter
//     saído (remoção em lotes): a mensagem da tela não diz que "nada foi apagado".
//  6. public.lgpd_erase_user (migration 20261030000100): apaga/anonimiza tudo no
//     banco numa transação; pagamentos ficam sem o vínculo com a conta.
//  7. Anexos de processos encerrados (bucket case-documents) devolvidos pela RPC
//     — remoção best effort (log sem caminhos).
//  8. auth.admin.deleteUser — o login deixa de existir.
//
// Respostas:
//  200 { deleted: true, retained: { payments } }
//  400 { error: 'confirmation_required' | 'confirmation_mismatch' }
//  401 { error: 'unauthorized' }
//  403 { error: 'staff_account' }
//  405 { error: 'method_not_allowed' }
//  409 { error: 'open_case' }                 → processo em andamento: pedido pelo e-mail de privacidade
//  502 { error: 'subscription_cancel_failed' | 'storage_cleanup_failed' }
//  500 { error: 'internal_error' | 'auth_delete_failed' }
//
// Idempotente: repetir depois de uma falha retoma de onde parou. Logs sem
// e-mail, nome, token ou caminhos de arquivo.

/** Bucket dos documentos enviados pelo cliente ({user_id}/...). */
export const USER_DOCUMENTS_BUCKET = 'user-documents'
/** Bucket dos anexos de processos (cases). */
export const CASE_DOCUMENTS_BUCKET = 'case-documents'

export interface AuthenticatedUser {
  id: string
  email: string | null
}

export interface BillingInfo {
  stripeSubscriptionId: string | null
}

export interface EraseResult {
  paymentsRetained: number
  caseDocumentPaths: string[]
}

/** Erro conhecido da RPC lgpd_erase_user. */
export class EraseRefusedError extends Error {
  constructor(readonly code: 'staff_account' | 'open_case') {
    super(code)
    this.name = 'EraseRefusedError'
  }
}

export interface DeleteAccountRepo {
  /** true se a conta tem papel de equipe (qualquer papel além de 'client'). */
  hasStaffRole(userId: string): Promise<boolean>
  /** true se há processo (case) da pessoa fora de concluded/cancelled — mesmo critério da RPC. */
  hasOpenCase(userId: string): Promise<boolean>
  getBilling(userId: string): Promise<BillingInfo | null>
  /** Caminhos de todos os arquivos do bucket sob `${userId}/`. */
  listUserFiles(userId: string): Promise<string[]>
  removeFiles(bucket: string, paths: string[]): Promise<void>
  /** Chama public.lgpd_erase_user. Lança EraseRefusedError para recusas conhecidas. */
  eraseUser(userId: string): Promise<EraseResult>
  deleteAuthUser(userId: string): Promise<void>
}

export interface StripeSubscriptionsClient {
  subscriptions: {
    retrieve(id: string): Promise<{ id: string; status: string }>
    cancel(id: string): Promise<{ id: string; status: string }>
  }
}

export type LogFn = (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void

export interface DeleteAccountDeps {
  /** Usuário do JWT da chamada, ou null (token ausente/inválido). */
  getUser: (authHeader: string) => Promise<AuthenticatedUser | null>
  repo: DeleteAccountRepo
  /** null quando STRIPE_SECRET_KEY não está configurada. */
  stripe: StripeSubscriptionsClient | null
  log?: LogFn
}

// Sem Access-Control-Allow-Origin: o CORS (allowlist) é aplicado no index.ts por
// _shared/cors.ts, que substitui qualquer Access-Control-* daqui.
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/** Normaliza para comparar e-mails (sem espaços nas pontas, minúsculas). */
export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

const SUBSCRIPTION_ID_RE = /^sub_[A-Za-z0-9]{6,64}$/
/** Status em que a assinatura já não cobra mais nada. */
const ENDED_STATUSES = new Set(['canceled', 'incomplete_expired'])

function isMissingResource(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { code?: unknown; statusCode?: unknown }
  return e.code === 'resource_missing' || e.statusCode === 404
}

function errorKind(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; type?: unknown; name?: unknown }
    for (const value of [e.code, e.type, e.name]) {
      if (typeof value === 'string' && value) return value.slice(0, 80)
    }
  }
  return 'unknown'
}

async function readConfirmEmail(req: Request): Promise<string> {
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return normalizeEmail((body as Record<string, unknown>).confirm_email)
    }
  } catch {
    // corpo ausente ou inválido → sem confirmação
  }
  return ''
}

export function createDeleteAccountHandler(deps: DeleteAccountDeps): (req: Request) => Promise<Response> {
  const log: LogFn = deps.log ?? ((level, event, data) => {
    const line = JSON.stringify({ fn: 'delete-account', level, event, ...data })
    if (level === 'error') console.error(line)
    else if (level === 'warn') console.warn(line)
    else console.log(line)
  })

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    const authHeader = req.headers.get('Authorization')
    if (!bearerToken(authHeader)) return json({ error: 'unauthorized' }, 401)

    let user: AuthenticatedUser | null
    try {
      user = await deps.getUser(authHeader as string)
    } catch {
      user = null
    }
    if (!user) return json({ error: 'unauthorized' }, 401)

    // ── 2. Confirmação digitada ───────────────────────────────────────────────
    const confirmEmail = await readConfirmEmail(req)
    const accountEmail = normalizeEmail(user.email)
    if (!confirmEmail) return json({ error: 'confirmation_required' }, 400)
    if (!accountEmail || confirmEmail !== accountEmail) return json({ error: 'confirmation_mismatch' }, 400)

    // ── 3. Conta da equipe e processo em andamento ────────────────────────────
    let billing: BillingInfo | null
    try {
      if (await deps.repo.hasStaffRole(user.id)) return json({ error: 'staff_account' }, 403)
      if (await deps.repo.hasOpenCase(user.id)) {
        log('warn', 'erase_refused', { reason: 'open_case' })
        return json({ error: 'open_case' }, 409)
      }
      billing = await deps.repo.getBilling(user.id)
    } catch (err) {
      log('error', 'read_failed', { kind: errorKind(err) })
      return json({ error: 'internal_error' }, 500)
    }

    // ── 4. Assinatura no Stripe ───────────────────────────────────────────────
    const subscriptionId = billing?.stripeSubscriptionId ?? null
    let subscriptionCancelled = false
    if (subscriptionId && SUBSCRIPTION_ID_RE.test(subscriptionId)) {
      if (!deps.stripe) {
        log('error', 'stripe_not_configured')
        return json({ error: 'internal_error' }, 500)
      }
      try {
        const current = await deps.stripe.subscriptions.retrieve(subscriptionId)
        if (!ENDED_STATUSES.has(current.status)) {
          await deps.stripe.subscriptions.cancel(subscriptionId)
          subscriptionCancelled = true
        }
      } catch (err) {
        if (!isMissingResource(err)) {
          log('error', 'subscription_cancel_failed', { kind: errorKind(err) })
          return json({ error: 'subscription_cancel_failed' }, 502)
        }
        // Assinatura já não existe no Stripe: nada a cancelar.
      }
    } else if (subscriptionId) {
      log('warn', 'subscription_id_invalid')
    }

    // ── 5. Arquivos do cliente ────────────────────────────────────────────────
    let filesRemoved = 0
    try {
      const paths = await deps.repo.listUserFiles(user.id)
      // Defesa extra: só caminhos dentro da pasta da própria conta.
      const own = paths.filter((path) => path.startsWith(`${user!.id}/`))
      if (own.length > 0) await deps.repo.removeFiles(USER_DOCUMENTS_BUCKET, own)
      filesRemoved = own.length
    } catch (err) {
      log('error', 'storage_cleanup_failed', { kind: errorKind(err) })
      return json({ error: 'storage_cleanup_failed' }, 502)
    }

    // ── 6. Banco ──────────────────────────────────────────────────────────────
    let erased: EraseResult
    try {
      erased = await deps.repo.eraseUser(user.id)
    } catch (err) {
      if (err instanceof EraseRefusedError) {
        log('warn', 'erase_refused', { reason: err.code })
        return json({ error: err.code }, err.code === 'staff_account' ? 403 : 409)
      }
      log('error', 'erase_failed', { kind: errorKind(err) })
      return json({ error: 'internal_error' }, 500)
    }

    // ── 7. Anexos de processos encerrados (best effort) ───────────────────────
    if (erased.caseDocumentPaths.length > 0) {
      try {
        await deps.repo.removeFiles(CASE_DOCUMENTS_BUCKET, erased.caseDocumentPaths)
      } catch (err) {
        log('warn', 'case_files_cleanup_failed', {
          kind: errorKind(err),
          count: erased.caseDocumentPaths.length,
        })
      }
    }

    // ── 8. Login ──────────────────────────────────────────────────────────────
    try {
      await deps.repo.deleteAuthUser(user.id)
    } catch (err) {
      log('error', 'auth_delete_failed', { kind: errorKind(err) })
      return json({ error: 'auth_delete_failed' }, 500)
    }

    log('info', 'account_deleted', {
      subscription_cancelled: subscriptionCancelled,
      files_removed: filesRemoved,
      payments_retained: erased.paymentsRetained,
    })
    return json({ deleted: true, retained: { payments: erased.paymentsRetained } })
  }
}
