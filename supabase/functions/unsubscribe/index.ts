// unsubscribe — descadastro dos e-mails do ciclo de vida (DI-077, W4-02).
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Link dos e-mails: <SUPABASE_URL>/functions/v1/unsubscribe?t=<token>
//   GET mostra a confirmação (botão), POST descadastra; o cabeçalho List-Unsubscribe
//   do lifecycle-emails usa o mesmo endereço para o one-click (RFC 8058).
// O token leva só o HASH do e-mail (HMAC com EMAIL_UNSUBSCRIBE_SECRET) e o escopo
// ('marketing' ou 'all'); a tabela email_suppressions guarda só o hash.
//
// DEPLOY (ação do dono, depois da migration 20261030000000_lifecycle_emails.sql):
//   supabase functions deploy unsubscribe --project-ref krjirhlmdnxqqrpzmowz --no-verify-jwt
//   (quem clica no link não tem JWT; a autenticidade vem da assinatura do token).
// ATENÇÃO: no domínio padrão *.supabase.co, respostas de GET com text/html são
//   reescritas para text/plain pela plataforma (docs do Supabase, "Routing"). Antes de
//   desligar o dry-run, publique uma página /descadastro no front que faça POST JSON
//   { token } para esta function (resposta JSON) ou use um domínio próprio para as
//   functions. O one-click (POST) e o JSON funcionam em qualquer domínio.
//
// CORS: o navegador só precisa de CORS no POST JSON vindo do front (allowlist de
// _shared/cors.ts). GET e o formulário da própria página são navegação comum.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EMAIL_UNSUBSCRIBE_SECRET, APP_URL;
//      opcionais CORS_ALLOWED_ORIGINS, SENTRY_DSN_BACKEND, SENTRY_ENVIRONMENT, SENTRY_RELEASE.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { applyCors, corsHeadersFor, createCorsPolicy } from '../_shared/cors.ts'
import { isUsableSecret } from '../_shared/email-lifecycle.ts'
import { createObservability } from '../_shared/observability.ts'
import { getAppUrl } from '../_shared/origin.ts'
import { createUnsubscribeHandler } from './handler.ts'
import { createUnsubscribeRepo } from './repo.ts'

const obs = createObservability('unsubscribe')
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
)
const secret = Deno.env.get('EMAIL_UNSUBSCRIBE_SECRET') ?? ''

const handler = createUnsubscribeHandler({
  repo: createUnsubscribeRepo(supabase),
  log: obs.log,
  env: { secret: isUsableSecret(secret) ? secret : undefined, appUrl: getAppUrl() },
})

const cors = createCorsPolicy()
const observed = obs.wrap(handler, { reportServerErrors: false })

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const allowed = cors.isAllowed(origin)
  if (req.method === 'OPTIONS') {
    return allowed
      ? new Response(null, { status: 204, headers: corsHeadersFor(origin, true) })
      : new Response(null, { status: 403, headers: { Vary: 'Origin' } })
  }
  const res = await observed(req)
  return allowed ? applyCors(res, origin, true) : res
})
