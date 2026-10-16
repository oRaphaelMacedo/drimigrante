// export-my-data/handler.ts — exportação dos dados do titular (DI-083, LGPD art. 18 / RGPD art. 15 e 20)
//
// O usuário logado baixa um JSON com os dados da PRÓPRIA conta:
//   conta (Auth), perfil, plano, diagnósticos (+ resultado e análise), mensagens
//   do chat, documentos enviados (só a lista; os arquivos ficam na página
//   Documentos), pagamentos e e-mails enviados (sem o corpo).
//
// Regras:
//  - JWT obrigatório; o usuário vem SEMPRE do token (o corpo é ignorado).
//  - Cada tabela é lida filtrando pelo user_id do token (repo.ts) e, por
//    defesa extra, o handler descarta qualquer linha de outro user_id.
//  - Colunas por allowlist: segredos e campos internos ficam de fora
//    (session_id, resume_token, ia_model_used, ids do provedor de e-mail, corpo
//    dos e-mails com links de acesso, storage_path...).
//  - Resposta com Cache-Control: no-store e Content-Disposition de anexo.
//
// Respostas:
//  200 <JSON da exportação>
//  401 { error: 'unauthorized' }
//  405 { error: 'method_not_allowed' }
//  500 { error: 'internal_error' }

export type Row = Record<string, unknown>

export interface ExportUser {
  id: string
  email: string | null
  phone?: string | null
  created_at?: string | null
  last_sign_in_at?: string | null
}

export interface ExportRepo {
  profile(userId: string): Promise<Row | null>
  subscription(userId: string): Promise<Row | null>
  assessments(userId: string, limit: number): Promise<Row[]>
  results(assessmentIds: string[]): Promise<Row[]>
  messages(userId: string, limit: number): Promise<Row[]>
  documents(userId: string, limit: number): Promise<Row[]>
  payments(userId: string, limit: number): Promise<Row[]>
  emails(userId: string, limit: number): Promise<Row[]>
}

export type LogFn = (level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) => void

export interface ExportDeps {
  getUser: (authHeader: string) => Promise<ExportUser | null>
  repo: ExportRepo
  now?: () => Date
  log?: LogFn
}

/** Versão do formato do arquivo (mudou o formato → mude a versão). */
export const EXPORT_FORMAT = 'doutor-imigrante/meus-dados@1'

/** Tetos por seção (o arquivo avisa quando algum foi atingido). */
export const LIMITS = {
  assessments: 500,
  messages: 5000,
  documents: 1000,
  payments: 1000,
  emails: 1000,
} as const

/** Colunas exportadas de cada tabela (allowlist). */
export const COLUMNS = {
  profile: [
    'full_name',
    'email',
    'phone',
    'language',
    'timezone',
    'notification_preferences',
    'created_at',
    'updated_at',
    'last_login_at',
  ],
  subscription: [
    'tier',
    'one_time_paid',
    'one_time_paid_at',
    'one_time_payment_amount',
    'one_time_access_expires_at',
    'recurring_active',
    'recurring_started_at',
    'recurring_cancelled_at',
    'recurring_cancel_at',
    'recurring_amount',
    'has_dashboard_access',
    'has_chat_access',
    'has_full_analysis',
    'stripe_customer_id',
    'created_at',
    'updated_at',
  ],
  assessment: [
    'id',
    'status',
    'full_name',
    'email',
    'phone',
    'answers',
    'questions_answered',
    'total_questions',
    'completion_percentage',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'referrer',
    'first_page',
    'user_agent',
    'ip_address',
    'started_at',
    'completed_at',
    'expires_at',
    'created_at',
    'updated_at',
  ],
  result: [
    'score_numeric',
    'score_category',
    'suggested_visa_types',
    'ia_explanation_short',
    'ia_explanation_full',
    'computed_at',
  ],
  message: ['assessment_id', 'role', 'content', 'created_at'],
  document: [
    'assessment_id',
    'document_type',
    'display_name',
    'file_name',
    'file_size',
    'mime_type',
    'status',
    'feedback',
    'created_at',
    'updated_at',
  ],
  payment: ['assessment_id', 'product', 'amount_cents', 'currency', 'status', 'paid_at', 'refunded_at', 'created_at'],
  email: ['recipient_email', 'subject', 'status', 'sent_at', 'created_at'],
} as const

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(payload: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload, null, status === 200 ? 2 : undefined), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    },
  })
}

function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/** Copia só as colunas permitidas (as que não existirem na linha ficam de fora). */
export function pick(row: Row, columns: readonly string[]): Row {
  const out: Row = {}
  for (const column of columns) {
    if (Object.prototype.hasOwnProperty.call(row, column)) out[column] = row[column]
  }
  return out
}

/** Linhas cujo dono declarado é o usuário (ou que não trazem user_id). */
function ownRows(rows: Row[], userId: string, key = 'user_id'): Row[] {
  return rows.filter((row) => !(key in row) || row[key] === userId)
}

export function exportFileName(now: Date): string {
  return `doutor-imigrante-meus-dados-${now.toISOString().slice(0, 10)}.json`
}

function errorKind(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; name?: unknown }
    for (const value of [e.code, e.name]) {
      if (typeof value === 'string' && value) return value.slice(0, 80)
    }
  }
  return 'unknown'
}

export function createExportHandler(deps: ExportDeps): (req: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date())
  const log: LogFn = deps.log ?? ((level, event, data) => {
    const line = JSON.stringify({ fn: 'export-my-data', level, event, ...data })
    if (level === 'error') console.error(line)
    else console.log(line)
  })

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    const authHeader = req.headers.get('Authorization')
    if (!bearerToken(authHeader)) return json({ error: 'unauthorized' }, 401)

    let user: ExportUser | null
    try {
      user = await deps.getUser(authHeader as string)
    } catch {
      user = null
    }
    if (!user) return json({ error: 'unauthorized' }, 401)
    const userId = user.id

    try {
      const [profileRow, subscriptionRow, assessmentRows, messageRows, documentRows, paymentRows, emailRows] =
        await Promise.all([
          deps.repo.profile(userId),
          deps.repo.subscription(userId),
          deps.repo.assessments(userId, LIMITS.assessments),
          deps.repo.messages(userId, LIMITS.messages),
          deps.repo.documents(userId, LIMITS.documents),
          deps.repo.payments(userId, LIMITS.payments),
          deps.repo.emails(userId, LIMITS.emails),
        ])

      const profile = profileRow && (!('id' in profileRow) || profileRow.id === userId) ? profileRow : null
      const subscription = subscriptionRow && ownRows([subscriptionRow], userId).length > 0 ? subscriptionRow : null
      const assessments = ownRows(assessmentRows, userId)
      const assessmentIds = assessments
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
      const resultRows = assessmentIds.length > 0 ? await deps.repo.results(assessmentIds) : []
      const resultsByAssessment = new Map<string, Row>()
      for (const row of resultRows) {
        const id = row.assessment_id
        if (typeof id === 'string' && assessmentIds.includes(id)) resultsByAssessment.set(id, row)
      }

      const messages = ownRows(messageRows, userId)
      const documents = ownRows(documentRows, userId)
      const payments = ownRows(paymentRows, userId)
      const emails = ownRows(emailRows, userId)

      const truncated = [
        assessmentRows.length >= LIMITS.assessments && 'diagnosticos',
        messageRows.length >= LIMITS.messages && 'mensagens_chat',
        documentRows.length >= LIMITS.documents && 'documentos',
        paymentRows.length >= LIMITS.payments && 'pagamentos',
        emailRows.length >= LIMITS.emails && 'emails_enviados',
      ].filter((value): value is string => typeof value === 'string')

      const generatedAt = now()
      const payload = {
        formato: EXPORT_FORMAT,
        gerado_em: generatedAt.toISOString(),
        sobre: 'Dados pessoais da sua conta no Doutor Imigrante. Os arquivos de documentos ficam na página ' +
          'Documentos do painel (aqui vai só a lista). Guarde este arquivo em local seguro.',
        ...(truncated.length > 0
          ? {
            aviso_limite: `Algumas seções chegaram ao limite do arquivo: ${
              truncated.join(', ')
            }. Peça o restante pelo e-mail de privacidade.`,
          }
          : {}),
        conta: {
          id: userId,
          email: user.email ?? null,
          ...(user.phone ? { phone: user.phone } : {}),
          created_at: user.created_at ?? null,
          last_sign_in_at: user.last_sign_in_at ?? null,
        },
        perfil: profile ? pick(profile, COLUMNS.profile) : null,
        plano: subscription ? pick(subscription, COLUMNS.subscription) : null,
        diagnosticos: assessments.map((row) => {
          const result = resultsByAssessment.get(row.id as string)
          return { ...pick(row, COLUMNS.assessment), resultado: result ? pick(result, COLUMNS.result) : null }
        }),
        mensagens_chat: messages.map((row) => pick(row, COLUMNS.message)),
        documentos: documents.map((row) => pick(row, COLUMNS.document)),
        pagamentos: payments.map((row) => pick(row, COLUMNS.payment)),
        emails_enviados: emails.map((row) => pick(row, COLUMNS.email)),
      }

      log('info', 'export_ok', {
        assessments: assessments.length,
        messages: messages.length,
        documents: documents.length,
        payments: payments.length,
        emails: emails.length,
      })
      return json(payload, 200, { 'Content-Disposition': `attachment; filename="${exportFileName(generatedAt)}"` })
    } catch (err) {
      log('error', 'export_failed', { kind: errorKind(err) })
      return json({ error: 'internal_error' }, 500)
    }
  }
}
