// delete-account/repo.ts — acesso ao banco, ao Storage e ao Auth (service role).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import { type DeleteAccountRepo, EraseRefusedError, type EraseResult, USER_DOCUMENTS_BUCKET } from './handler.ts'

/** Itens por página na listagem do Storage. */
const LIST_PAGE = 1000
/** Profundidade máxima de pastas: {user_id}/{assessment|general}/{tipo}/{arquivo}. */
const MAX_DEPTH = 6
/** Teto de arquivos por conta (o bucket limita 10 MB por arquivo). */
const MAX_FILES = 10_000
/** Caminhos por chamada de remove(). */
const REMOVE_BATCH = 100
/** Processos encerrados (public.case_status); os demais contam como em andamento. */
export const CLOSED_CASE_STATUSES = ['concluded', 'cancelled'] as const

interface StorageItem {
  name: string
  id: string | null
}

export function createDeleteAccountRepo(db: SupabaseClient): DeleteAccountRepo {
  return {
    async hasStaffRole(userId) {
      const { data, error } = await db
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .neq('role', 'client')
        .limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async hasOpenCase(userId) {
      // Mesmo critério de lgpd_erase_user: status fora de concluded/cancelled.
      const { data, error } = await db
        .from('cases')
        .select('id')
        .eq('primary_user_id', userId)
        .not('status', 'in', `(${CLOSED_CASE_STATUSES.join(',')})`)
        .limit(1)
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async getBilling(userId) {
      const { data, error } = await db
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      const raw = (data as { stripe_subscription_id?: unknown } | null)?.stripe_subscription_id
      return { stripeSubscriptionId: typeof raw === 'string' && raw ? raw : null }
    },

    async listUserFiles(userId) {
      const files: string[] = []
      const bucket = db.storage.from(USER_DOCUMENTS_BUCKET)
      const walk = async (prefix: string, depth: number): Promise<void> => {
        if (depth > MAX_DEPTH) return
        for (let offset = 0;; offset += LIST_PAGE) {
          const { data, error } = await bucket.list(prefix, { limit: LIST_PAGE, offset })
          if (error) throw error
          const items = (data ?? []) as StorageItem[]
          for (const item of items) {
            if (!item.name || item.name === '.emptyFolderPlaceholder') continue
            const path = `${prefix}/${item.name}`
            // Pastas vêm com id null na API do Storage.
            if (item.id === null) await walk(path, depth + 1)
            else files.push(path)
            if (files.length > MAX_FILES) throw new Error('too_many_files')
          }
          if (items.length < LIST_PAGE) break
        }
      }
      await walk(userId, 1)
      return files
    },

    async removeFiles(bucketName, paths) {
      const bucket = db.storage.from(bucketName)
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const { error } = await bucket.remove(paths.slice(i, i + REMOVE_BATCH))
        if (error) throw error
      }
    },

    async eraseUser(userId): Promise<EraseResult> {
      const { data, error } = await db.rpc('lgpd_erase_user', { p_user_id: userId, p_source: 'self_service' })
      if (error) {
        const message = String((error as { message?: unknown }).message ?? '')
        if (message === 'staff_account' || message === 'open_case') throw new EraseRefusedError(message)
        throw error
      }
      const result = (data ?? {}) as Record<string, unknown>
      const paths = Array.isArray(result.case_document_paths)
        ? result.case_document_paths.filter((p): p is string => typeof p === 'string' && p.length > 0)
        : []
      const retained = Number(result.payments_retained ?? 0)
      return { paymentsRetained: Number.isFinite(retained) ? retained : 0, caseDocumentPaths: paths }
    },

    async deleteAuthUser(userId) {
      const { error } = await db.auth.admin.deleteUser(userId)
      if (error) {
        // Já não existe (ex.: repetição depois de um sucesso parcial): tudo certo.
        const status = (error as { status?: unknown }).status
        if (status === 404) return
        throw error
      }
    },
  }
}
