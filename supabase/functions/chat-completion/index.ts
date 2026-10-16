// chat-completion — chat com IA em streaming SSE para quem tem acesso pago.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { message: string (1–2000), assessmentId: uuid }; exige JWT do dono.
// Erros: 401 unauthorized · 400 empty_message|message_too_long|invalid_request ·
//        404 not_found · 403 no_access · 429 rate_limited · 502 ai_unavailable.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY.
// Ordem de release: fazer o deploy desta versão ANTES de aplicar a migration
// 20261016000300_messages_server_only_insert.sql (que tira o INSERT do cliente).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/http.ts'
import { createChatHandler } from './handler.ts'
import { createChatRepo } from './repo.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)

serve(
  createChatHandler({
    repo: createChatRepo(supabase),
    fetch: (input, init) => fetch(input, init),
    log: createLogger('chat-completion'),
    now: () => Date.now(),
    env: { openaiKey: Deno.env.get('OPENAI_API_KEY') ?? undefined },
  }),
)
