// chat-completion — chat com IA em streaming SSE para quem tem acesso pago.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { message: string (1–2000), assessmentId: uuid }; exige JWT do dono.
// Erros: 401 unauthorized · 400 empty_message|message_too_long|invalid_request ·
//        404 not_found · 403 no_access · 429 rate_limited · 502 ai_unavailable.
//
// CORS: allowlist de _shared/cors.ts (chamada pelo painel, no navegador).
// Observabilidade: _shared/observability.ts (logs JSON e Sentry com SENTRY_DSN_BACKEND).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY; opcionais APP_URL,
//      CORS_ALLOWED_ORIGINS, SENTRY_DSN_BACKEND, SENTRY_ENVIRONMENT, SENTRY_RELEASE.
// Ordem de release: fazer o deploy desta versão ANTES de aplicar a migration
// 20261016000300_messages_server_only_insert.sql (que tira o INSERT do cliente).

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { createChatHandler } from './handler.ts'
import { createChatRepo } from './repo.ts'

const obs = createObservability('chat-completion')
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const handler = createChatHandler({
  repo: createChatRepo(supabase),
  fetch: (input, init) => fetch(input, init),
  log: obs.log,
  now: () => Date.now(),
  env: { openaiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined },
})

// Os erros 5xx do handler já saem pelo logger observado (openai_failed, chat_failed...).
Deno.serve(
  withCors(obs.wrap(handler, { reportServerErrors: false }), {
    onRejected: (origin, method) => obs.log('warn', 'cors_rejected', { origin, method }),
  }),
)
