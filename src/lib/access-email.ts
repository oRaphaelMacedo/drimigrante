/**
 * E-mail de acesso visível e editável antes de pagar (DI-031).
 *
 * O e-mail do quiz vira o login da conta criada depois do pagamento
 * (create-checkout-session usa o e-mail enviado no corpo; o stripe-webhook cria
 * a conta com ele). Corrigir aqui:
 *  1. grava o novo e-mail no resultado deste aparelho (localStorage) — o próximo
 *     POST do useStartCheckout já sai com ele;
 *  2. salva o diagnóstico de novo (upsert_anon_assessment pelo mesmo
 *     session_id), para o lead e o vínculo da conta ficarem com o e-mail certo.
 *
 * Se o diagnóstico já está ligado a uma conta, nada muda (a pessoa entra com o
 * e-mail usado no quiz). Falha de rede no passo 2 não desfaz o passo 1.
 *
 * Resultado aberto pelo link de retomada (DI-024, sem assessmentId neste
 * aparelho): só o passo 1. Salvar agora criaria um diagnóstico novo (lead
 * duplicado) antes de qualquer compra; o useStartCheckout já salva o
 * diagnóstico, com o e-mail corrigido, quando a pessoa clica em pagar.
 */
import { z } from 'zod'
import { persistAssessment } from '@/hooks/useAssessment'
import { getAttribution } from '@/lib/attribution'
import { QUIZ_RESULT_KEY } from '@/lib/quiz-submission'

export const accessEmailSchema = z
  .string()
  .trim()
  .min(1, 'Informe o e-mail de acesso.')
  .max(254, 'Esse e-mail é longo demais.')
  .email('Confira o e-mail: ele precisa ter o formato nome@provedor.com.')

export type EmailValidation = { ok: true; email: string } | { ok: false; message: string }

export function validateAccessEmail(value: string): EmailValidation {
  const parsed = accessEmailSchema.safeParse(value)
  if (parsed.success) return { ok: true, email: parsed.data }
  return { ok: false, message: parsed.error.issues[0]?.message ?? 'Confira o e-mail.' }
}

/** Mesmo e-mail, sem diferenciar maiúsculas nem espaços nas pontas. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

/**
 * - `saved`: e-mail trocado neste aparelho e no diagnóstico salvo;
 * - `saved_locally`: trocado neste aparelho (o diagnóstico não pôde ser salvo agora;
 *   a compra usa o e-mail novo mesmo assim);
 * - `linked`: o diagnóstico já é de uma conta — nada mudou;
 * - `unavailable`: não há resultado neste aparelho.
 */
export type UpdateAccessEmailResult = 'saved' | 'saved_locally' | 'linked' | 'unavailable'

export const PERSIST_EMAIL_TIMEOUT_MS = 8_000

type StoredRecord = Record<string, unknown> & {
  sessionId?: unknown
  assessmentId?: unknown
  /** Presente quando o resultado veio do link de retomada (src/lib/resume-token.ts). */
  resumedAt?: unknown
  answers?: unknown
  leadInfo?: { fullName?: unknown; email?: unknown; phone?: unknown } | null
}

function readRecord(): StoredRecord | null {
  try {
    const raw = window.localStorage.getItem(QUIZ_RESULT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as StoredRecord) : null
  } catch {
    return null
  }
}

function writeRecord(record: StoredRecord): boolean {
  try {
    window.localStorage.setItem(QUIZ_RESULT_KEY, JSON.stringify(record))
    return true
  } catch {
    return false
  }
}

function withEmail(record: StoredRecord, email: string): StoredRecord {
  const lead = record.leadInfo && typeof record.leadInfo === 'object' ? record.leadInfo : {}
  return { ...record, leadInfo: { ...lead, fullName: typeof lead.fullName === 'string' ? lead.fullName : '', email } }
}

function stringAnswers(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )
  return entries.length > 0 ? Object.fromEntries(entries) : null
}

function usableSessionId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 64
}

function timeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('timeout'), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** Troca o e-mail de acesso do resultado deste aparelho (já validado). */
export async function updateAccessEmail(
  email: string,
  { timeoutMs = PERSIST_EMAIL_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<UpdateAccessEmailResult> {
  const record = readRecord()
  if (!record) return 'unavailable'
  const previous = record.leadInfo?.email
  // 1. Primeiro o aparelho: um clique em "pagar" logo depois já usa o e-mail novo.
  if (!writeRecord(withEmail(record, email))) return 'unavailable'

  const sessionId = record.sessionId
  const answers = stringAnswers(record.answers)
  if (!usableSessionId(sessionId) || !answers) return 'saved_locally'
  // Aberto pelo link e ainda sem diagnóstico neste aparelho: salva só na compra.
  if (!record.assessmentId && record.resumedAt) return 'saved_locally'

  // 2. Depois o diagnóstico salvo (mesmo session_id → mesmo assessment).
  let attribution: ReturnType<typeof getAttribution> = {}
  try {
    attribution = getAttribution()
  } catch {
    attribution = {}
  }
  const answered = Object.keys(answers).length
  const lead = record.leadInfo ?? {}
  try {
    const outcome = await timeout(
      persistAssessment({
        sessionId,
        answers,
        fullName: typeof lead.fullName === 'string' ? lead.fullName : '',
        email,
        phone: typeof lead.phone === 'string' && lead.phone ? lead.phone : undefined,
        questionsAnswered: answered,
        totalQuestions: answered,
        utmSource: attribution.utm_source ?? null,
        utmMedium: attribution.utm_medium ?? null,
        utmCampaign: attribution.utm_campaign ?? null,
      }),
      timeoutMs,
    )
    if (outcome === 'timeout' || !outcome) return 'saved_locally'
    if (outcome.error && /already linked/i.test(outcome.error)) {
      // Diagnóstico de uma conta: volta ao e-mail anterior (é o login dessa conta).
      const current = readRecord()
      if (current) writeRecord(withEmail(current, typeof previous === 'string' ? previous : ''))
      return 'linked'
    }
    const assessmentId = outcome.assessment?.id
    if (!assessmentId) return 'saved_locally'
    if (!record.assessmentId) {
      const current = readRecord()
      if (current && current.sessionId === sessionId) writeRecord({ ...current, assessmentId })
    }
    return 'saved'
  } catch {
    return 'saved_locally'
  }
}
