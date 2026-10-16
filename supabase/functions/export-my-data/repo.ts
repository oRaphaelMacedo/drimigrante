// export-my-data/repo.ts — leituras com a service role, SEMPRE filtradas pelo
// user_id do token. `select('*')` + allowlist no handler: a exportação não quebra
// se uma coluna ainda não existir em produção (migration pendente) e nenhuma
// coluna nova vaza sem passar pela allowlist.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import type { ExportRepo, Row } from './handler.ts'

/** Lotes do filtro `in` (URL do PostgREST tem limite de tamanho). */
const IN_BATCH = 100

export function createExportRepo(db: SupabaseClient): ExportRepo {
  const many = async (table: string, userId: string, limit: number): Promise<Row[]> => {
    const { data, error } = await db
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as Row[]
  }

  return {
    async profile(userId) {
      const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle()
      if (error) throw error
      return (data as Row | null) ?? null
    },

    async subscription(userId) {
      const { data, error } = await db.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
      if (error) throw error
      return (data as Row | null) ?? null
    },

    assessments: (userId, limit) => many('assessments', userId, limit),
    messages: (userId, limit) => many('messages', userId, limit),
    documents: (userId, limit) => many('user_documents', userId, limit),
    payments: (userId, limit) => many('payments', userId, limit),
    emails: (userId, limit) => many('email_send_log', userId, limit),

    async results(assessmentIds) {
      const out: Row[] = []
      for (let i = 0; i < assessmentIds.length; i += IN_BATCH) {
        const { data, error } = await db
          .from('assessment_results')
          .select('*')
          .in('assessment_id', assessmentIds.slice(i, i + IN_BATCH))
        if (error) throw error
        out.push(...((data ?? []) as Row[]))
      }
      return out
    },
  }
}
