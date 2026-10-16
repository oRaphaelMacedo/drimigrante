// lifecycle-emails — e-mails do ciclo de vida (DI-077, W4-02): nutrição (nurture_d1/d3/d7,
// só com opt-in), avisos de prazo do €30 (access_expiring_d7/d3, access_expired) e aviso
// de lançamento para a lista de espera (waitlist_launch, disparo manual).
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// DESLIGADO POR PADRÃO: sem LIFECYCLE_EMAILS_DRY_RUN=false explícito, toda chamada é
// dry-run — lista quem receberia (e-mail mascarado) sem nenhuma requisição ao Resend.
//   curl -s -X POST <SUPABASE_URL>/functions/v1/lifecycle-emails \
//     -H 'Content-Type: application/json' -H "x-internal-secret: $INTERNAL_SECRET" \
//     -d '{"sequence":"all"}'
//   Simular outro dia (só em dry-run): -d '{"sequence":"all","now":"2026-11-05T12:00:00Z"}'
//   Lista de espera:                   -d '{"sequence":"waitlist_launch","product":"visto"}'
//   (envio real da lista de espera exige também "confirm": true no corpo)
//
// Quem chama: o agendador (pg_cron + pg_net, exemplo no fim da migration
// 20261030000000_lifecycle_emails.sql) ou o dono. Nunca o navegador (sem CORS).
// Autenticação: x-internal-secret = INTERNAL_SECRET (ou Bearer da service role).
//
// DEPLOY (ação do dono, depois das migrations 20261025000200 e 20261030000000):
//   supabase functions deploy lifecycle-emails --project-ref krjirhlmdnxqqrpzmowz --no-verify-jwt
//   (a function confere o segredo sozinha; o pg_net não precisa mandar JWT).
// ANTES DE DESLIGAR O DRY-RUN (ações do dono): domínio verificado no Resend (DI-014),
//   EMAIL_UNSUBSCRIBE_SECRET definido (openssl rand -hex 32; nunca trocar depois),
//   página de descadastro utilizável (ver unsubscribe/index.ts), textos e frequência
//   aprovados, pg_cron/pg_net ligados e o agendamento criado.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_SECRET, APP_URL,
//      LIFECYCLE_EMAILS_DRY_RUN (padrão: dry-run), RESEND_API_KEY, EMAIL_FROM (opcional),
//      EMAIL_UNSUBSCRIBE_SECRET; opcionais SENTRY_DSN_BACKEND, SENTRY_ENVIRONMENT, SENTRY_RELEASE.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { withoutCors } from '../_shared/cors.ts'
import { parseDryRun, unsubscribeFunctionUrl } from '../_shared/email-lifecycle.ts'
import { createObservability } from '../_shared/observability.ts'
import { getAppUrl } from '../_shared/origin.ts'
import { createLifecycleEmailsHandler } from './handler.ts'
import { createLifecycleRepo } from './repo.ts'

const obs = createObservability('lifecycle-emails')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const handler = createLifecycleEmailsHandler({
  repo: createLifecycleRepo(supabase),
  fetch: (input, init) => fetch(input, init),
  log: obs.log,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  env: {
    dryRun: parseDryRun(Deno.env.get('LIFECYCLE_EMAILS_DRY_RUN')),
    internalSecret: Deno.env.get('INTERNAL_SECRET') ?? undefined,
    serviceRoleKey: serviceRoleKey || undefined,
    resendKey: Deno.env.get('RESEND_API_KEY') ?? undefined,
    from: Deno.env.get('EMAIL_FROM') ?? undefined,
    unsubscribeSecret: Deno.env.get('EMAIL_UNSUBSCRIBE_SECRET') ?? undefined,
    appUrl: getAppUrl(),
    unsubscribeUrl: unsubscribeFunctionUrl(supabaseUrl),
  },
})

// Os erros do handler já saem pelo logger observado (lifecycle_failed, email_send failed...).
Deno.serve(withoutCors(obs.wrap(handler, { reportServerErrors: false })))
