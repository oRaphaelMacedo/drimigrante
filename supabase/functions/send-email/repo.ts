// send-email/repo.ts — acesso ao banco (service role) usado pelo handler.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import type { SendEmailRepo } from './handler.ts'

export function createSendEmailRepo(db: SupabaseClient): SendEmailRepo {
  return {
    async getTemplate(triggerKey) {
      const { data, error } = await db
        .from('email_templates')
        .select('id, subject_pt, body_html_pt')
        .eq('trigger_key', triggerKey)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async getProfile(userId) {
      const { data, error } = await db
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      return data
    },

    async insertLog(row) {
      const { error } = await db.from('email_send_log').insert(row)
      if (error) throw error
    },
  }
}
