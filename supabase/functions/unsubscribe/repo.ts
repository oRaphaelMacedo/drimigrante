// unsubscribe/repo.ts — grava o descadastro (service role) em public.email_suppressions
// (migration 20261030000000_lifecycle_emails.sql).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import type { UnsubscribeRepo } from './handler.ts'

export function createUnsubscribeRepo(db: SupabaseClient): UnsubscribeRepo {
  return {
    async addSuppression(emailHash, scope, source) {
      // Idempotente: o primeiro registro (e a data dele) fica.
      const { error } = await db
        .from('email_suppressions')
        .upsert({ email_hash: emailHash, scope, source }, { onConflict: 'email_hash,scope', ignoreDuplicates: true })
      if (error) throw error
    },
  }
}
