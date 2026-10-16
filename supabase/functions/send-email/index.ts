// send-email — envio transacional (Resend) chamado só por outras Edge Functions.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Header obrigatório: x-internal-secret = INTERNAL_SECRET.
// Corpo: { trigger_key, user_id?, recipient_email?, variables? }
// Respostas: 200 { success, message_id } · 403 forbidden · 404 template_not_found ·
//            400 no_recipient · 502 { error: 'email_send_failed', code } (falha no Resend).
// Toda falha vira log JSON ({ fn: 'send-email', event: 'email_send', trigger_key, status, code }),
// linha 'failed' em email_send_log (card "Saúde dos e-mails" do admin) e, com
// SENTRY_DSN_BACKEND, evento no Sentry (_shared/observability.ts).
//
// Sem CORS (_shared/cors.ts → withoutCors): o navegador nunca chama esta function.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, INTERNAL_SECRET,
//      EMAIL_FROM (opcional; padrão "Doutor Imigrante <noreply@mail.drimigrante.com>");
//      opcionais SENTRY_DSN_BACKEND, SENTRY_ENVIRONMENT, SENTRY_RELEASE.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { withoutCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { createSendEmailHandler } from './handler.ts'
import { createSendEmailRepo } from './repo.ts'

const obs = createObservability('send-email')
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const handler = createSendEmailHandler({
  repo: createSendEmailRepo(supabase),
  fetch: (input, init) => fetch(input, init),
  log: obs.log,
  now: () => Date.now(),
  env: {
    internalSecret: Deno.env.get('INTERNAL_SECRET') ?? undefined,
    resendKey: Deno.env.get('RESEND_API_KEY') ?? undefined,
    from: Deno.env.get('EMAIL_FROM') ?? undefined,
  },
})

// Os erros 5xx do handler já saem pelo logger observado (email_send failed...).
Deno.serve(withoutCors(obs.wrap(handler, { reportServerErrors: false })))
