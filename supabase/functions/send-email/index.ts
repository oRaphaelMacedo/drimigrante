// send-email — envio transacional (Resend) chamado só por outras Edge Functions.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Header obrigatório: x-internal-secret = INTERNAL_SECRET.
// Corpo: { trigger_key, user_id?, recipient_email?, variables? }
// Respostas: 200 { success, message_id } · 403 forbidden · 404 template_not_found ·
//            400 no_recipient · 502 { error: 'email_send_failed', code } (falha no Resend).
// Toda falha vira log JSON ({ fn: 'send-email', event: 'email_send', trigger_key, status, code })
// e linha 'failed' em email_send_log (visível no card "Saúde dos e-mails" do admin).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, INTERNAL_SECRET,
//      EMAIL_FROM (opcional; padrão "Doutor Imigrante <noreply@mail.drimigrante.com>").

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/http.ts'
import { createSendEmailHandler } from './handler.ts'
import { createSendEmailRepo } from './repo.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

serve(
  createSendEmailHandler({
    repo: createSendEmailRepo(supabase),
    fetch: (input, init) => fetch(input, init),
    log: createLogger('send-email'),
    now: () => Date.now(),
    env: {
      internalSecret: Deno.env.get('INTERNAL_SECRET') ?? undefined,
      resendKey: Deno.env.get('RESEND_API_KEY') ?? undefined,
      from: Deno.env.get('EMAIL_FROM') ?? undefined,
    },
  }),
)
