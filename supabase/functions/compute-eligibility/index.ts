// compute-eligibility — calcula score e regras de elegibilidade de um assessment.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { assessment_id: uuid, session_id?: string }
// Posse: JWT do dono OU session_id do assessment ainda anônimo → senão 404.
// Resposta: 200 { result } só com colunas de score (nunca as análises de IA).
// Score: _shared/quiz-engine.ts, o mesmo cálculo do front (DI-006). Query com erro → 500
// sem gravar nada. Para corrigir resultados antigos: scripts/backfill-scores.mjs (dono).
//
// Boas-vindas (DI-077, modelo welcome_free_v2): saem daqui, depois da resposta, sem
// depender da OpenAI — com a categoria certa, o link /results?r=<token> e o descadastro.
// DRY-RUN por padrão: só envia com LIFECYCLE_EMAILS_DRY_RUN=false (ver
// lifecycle-emails/index.ts).
// ORDEM DE RELEASE: pode ir no passo 1 do runbook (antes das migrations), como hoje: em
// dry-run não envia nada e, sem a migration 20261030000000, o welcome_free_v2 não existe
// e nada sai. O modelo antigo 'welcome_free' não é tocado (o generate-explanation em
// produção ainda o usa). Desligar o dry-run só depois das migrations 20261025000200 e
// 20261030000000 E do generate-explanation novo no ar (senão saem dois e-mails).
//
// CORS: allowlist de _shared/cors.ts (chamada pelo navegador, no fim do quiz).
// Observabilidade: _shared/observability.ts (logs JSON e Sentry com SENTRY_DSN_BACKEND).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INTERNAL_SECRET (send-email), APP_URL,
//      LIFECYCLE_EMAILS_DRY_RUN (padrão: dry-run), EMAIL_UNSUBSCRIBE_SECRET;
//      opcionais CORS_ALLOWED_ORIGINS, SENTRY_DSN_BACKEND, SENTRY_ENVIRONMENT, SENTRY_RELEASE.

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { withCors } from '../_shared/cors.ts'
import { parseDryRun, unsubscribeFunctionUrl } from '../_shared/email-lifecycle.ts'
import { createObservability, defaultSchedule } from '../_shared/observability.ts'
import { getAppUrl } from '../_shared/origin.ts'
import { createComputeEligibilityHandler } from './handler.ts'
import { createEligibilityRepo } from './repo.ts'

const obs = createObservability('compute-eligibility')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const internalSecret = Deno.env.get('INTERNAL_SECRET') ?? ''

const handler = createComputeEligibilityHandler({
  repo: createEligibilityRepo(supabase),
  log: obs.log,
  now: () => Date.now(),
  env: { serviceRoleKey },
  welcome: {
    dryRun: parseDryRun(Deno.env.get('LIFECYCLE_EMAILS_DRY_RUN')),
    appUrl: getAppUrl(),
    unsubscribeSecret: Deno.env.get('EMAIL_UNSUBSCRIBE_SECRET') ?? undefined,
    unsubscribeUrl: unsubscribeFunctionUrl(supabaseUrl),
    async send(body) {
      const { error } = await supabase.functions.invoke('send-email', {
        body,
        headers: { 'x-internal-secret': internalSecret },
      })
      return { error: error ?? null }
    },
  },
  // O e-mail não segura a resposta do quiz: termina em segundo plano.
  defer: defaultSchedule,
})

Deno.serve(
  withCors(obs.wrap(handler, { reportServerErrors: false }), {
    onRejected: (origin, method) => obs.log('warn', 'cors_rejected', { origin, method }),
  }),
)
