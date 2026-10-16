/**
 * Direitos do titular na Conta (DI-083, LGPD/RGPD): exportar e apagar os dados.
 *
 * - `exportMyData()` chama a Edge Function export-my-data (JWT anexado pelo
 *   supabase-js) e devolve o JSON pronto para baixar.
 * - `deleteMyAccount(confirmEmail)` chama a delete-account com o e-mail digitado
 *   (o servidor confere de novo; a tela só habilita o botão quando confere).
 * - Erros viram frases em pt-BR (toUserError), com o caminho do e-mail de
 *   privacidade quando a exclusão precisa de atendimento.
 *
 * Sem analytics: nada destes fluxos vai para PostHog/GA/Meta.
 */
import { PRIVACY_EMAIL } from '@/config/contact'
import { toUserError } from '@/lib/errors'
import { QUIZ_RESULT_KEY, SUBMITTED_SESSIONS_KEY } from '@/lib/quiz-submission'
import { supabase } from '@/lib/supabase'

/** Exclusão pode levar alguns segundos (Stripe + Storage + banco + Auth). */
export const DELETE_ACCOUNT_TIMEOUT_MS = 45_000
export const EXPORT_TIMEOUT_MS = 30_000

/** Normaliza para comparar o e-mail digitado com o da conta. */
export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** O e-mail digitado é o da conta (sem diferenciar maiúsculas e espaços nas pontas). */
export function emailsMatch(typed: string | null | undefined, account: string | null | undefined): boolean {
  const a = normalizeEmail(typed)
  return a.length > 0 && a === normalizeEmail(account)
}

export const DELETE_ACCOUNT_CODE_MESSAGES: Readonly<Record<string, string>> = {
  confirmation_required: 'Digite o e-mail da sua conta para confirmar.',
  confirmation_mismatch: 'O e-mail digitado não é o desta conta. Confira e tente de novo.',
  staff_account: `Contas da equipe não podem ser apagadas por aqui. Fale com o administrador ou escreva para ${PRIVACY_EMAIL}.`,
  open_case: `Há um processo em andamento nesta conta. Para apagar os dados, escreva para ${PRIVACY_EMAIL}.`,
  subscription_cancel_failed:
    'Não conseguimos cancelar sua assinatura agora, então nada foi apagado. Tente de novo em alguns minutos.',
  storage_cleanup_failed: 'Não conseguimos apagar seus documentos agora, então nada foi apagado. Tente de novo.',
  auth_delete_failed:
    'Seus dados foram apagados, mas o acesso ainda não foi encerrado. Tente de novo para concluir.',
}

const EXPORT_FALLBACK = 'Não foi possível gerar o arquivo com os seus dados. Tente de novo.'
const DELETE_FALLBACK = `Não foi possível apagar a conta agora. Tente de novo ou escreva para ${PRIVACY_EMAIL}.`

export interface ExportFile {
  blob: Blob
  fileName: string
}

export function exportFileName(now: Date = new Date()): string {
  return `doutor-imigrante-meus-dados-${now.toISOString().slice(0, 10)}.json`
}

export class AccountPrivacyError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message)
    this.name = 'AccountPrivacyError'
  }
}

export async function exportMyData(now: Date = new Date()): Promise<ExportFile> {
  try {
    const { data, error } = await supabase.functions.invoke<unknown>('export-my-data', {
      body: {},
      timeout: EXPORT_TIMEOUT_MS,
    })
    if (error) throw error
    if (!data || typeof data !== 'object') throw new Error('export_empty')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
    return { blob, fileName: exportFileName(now) }
  } catch (err) {
    const userError = await toUserError(err, { fallback: EXPORT_FALLBACK })
    // 404 sem código = function ainda não publicada.
    throw new AccountPrivacyError(userError.status === 404 && !userError.code ? EXPORT_FALLBACK : userError.message, userError.code)
  }
}

/** Baixa o arquivo no navegador (no iPhone abre a pré-visualização com "Compartilhar/Salvar"). */
export function downloadFile({ blob, fileName }: ExportFile): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Dá tempo ao navegador de começar o download antes de liberar a URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/**
 * Chaves deste aparelho com dados da pessoa (resultado do quiz com nome e
 * e-mail, sessão do quiz, retorno do login, checkout). A escolha de cookies
 * (di_cookie_consent) e a atribuição de campanha (sem PII) ficam.
 */
export const LOCAL_PERSONAL_KEYS: readonly string[] = [
  QUIZ_RESULT_KEY,
  SUBMITTED_SESSIONS_KEY,
  'dr_imigrante_quiz_session',
  'dr_imigrante_quiz_step_events',
  'auth_return_to',
  'auth_return_plan',
  'auth_return_assessment_id',
  'di_checkout_session_id',
]

/**
 * Depois de apagar a conta, tira deste aparelho o que identificava a pessoa:
 * as chaves de LOCAL_PERSONAL_KEYS e qualquer chave com o id da conta (checklist
 * e marcas do painel). Sem storage (navegação privada), não faz nada.
 */
export function clearLocalAccountData(userId: string | null | undefined): void {
  for (const getStorage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      const storage = getStorage()
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key) keys.push(key)
      }
      for (const key of keys) {
        if (LOCAL_PERSONAL_KEYS.includes(key) || (userId && key.includes(userId))) storage.removeItem(key)
      }
    } catch {
      // storage indisponível
    }
  }
}

export interface DeleteAccountResult {
  /** Registros de pagamento guardados (sem vínculo com a conta) por obrigação legal. */
  paymentsRetained: number
}

export async function deleteMyAccount(confirmEmail: string): Promise<DeleteAccountResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{ deleted?: boolean; retained?: { payments?: number } }>(
      'delete-account',
      { body: { confirm_email: normalizeEmail(confirmEmail) }, timeout: DELETE_ACCOUNT_TIMEOUT_MS },
    )
    if (error) throw error
    if (!data?.deleted) throw new Error('delete_not_confirmed')
    const retained = Number(data.retained?.payments ?? 0)
    return { paymentsRetained: Number.isFinite(retained) ? retained : 0 }
  } catch (err) {
    const userError = await toUserError(err, {
      fallback: DELETE_FALLBACK,
      codeMessages: DELETE_ACCOUNT_CODE_MESSAGES,
    })
    const message = userError.status === 404 && !userError.code ? DELETE_FALLBACK : userError.message
    throw new AccountPrivacyError(message, userError.code)
  }
}
