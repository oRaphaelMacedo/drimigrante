// delete-account — entrada da Edge Function (DI-083, LGPD/RGPD)
//
// O titular apaga a própria conta pela aba "Privacidade" da Conta
// (/dashboard/settings?aba=privacidade), depois de digitar o e-mail da conta.
// A lógica e o contrato de respostas estão em ./handler.ts (testados em
// ./handler_test.ts com Stripe, Storage e banco falsos — nenhuma chamada real);
// o acesso ao banco/Storage/Auth fica em ./repo.ts.
//
// O que é apagado, anonimizado e guardado: ver o cabeçalho de
// supabase/migrations/20261030000100_retention_lgpd.sql (RPC lgpd_erase_user).
// Pagamentos ficam guardados sem o vínculo com a conta (obrigação legal); o
// customer e as faturas continuam no Stripe.
//
// CORS: allowlist de _shared/cors.ts. Observabilidade: _shared/observability.ts
// (5xx e exceções no Sentry, sem PII).
// JWT: verify_jwt fica no padrão (true) — não precisa de entrada no config.toml.
//
// ORDEM DE RELEASE / AÇÕES DO DONO (nada disso foi feito por este código):
//  1. Aplicar a migration 20261030000100_retention_lgpd.sql ANTES do deploy
//     (sem a RPC lgpd_erase_user a function responde 500 e nada é apagado).
//  2. Incluir `delete-account` na lista explícita de functions de produção de
//     docs/operacao/release.md e fazer o deploy:
//     `supabase functions deploy delete-account`
//     (secrets já usados pelas outras functions: STRIPE_SECRET_KEY,
//     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY).

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import Stripe from 'npm:stripe@14.14.0'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { createDeleteAccountHandler, type StripeSubscriptionsClient } from './handler.ts'
import { createDeleteAccountRepo } from './repo.ts'

const obs = createObservability('delete-account')
const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const handler = supabaseUrl && serviceRoleKey && anonKey
  ? createDeleteAccountHandler({
    // Sem STRIPE_SECRET_KEY, quem tem assinatura recebe 500 (nada é apagado);
    // quem não tem segue normalmente.
    stripe: stripeKey
      ? (new Stripe(stripeKey, {
        apiVersion: '2023-10-16',
        httpClient: Stripe.createFetchHttpClient(),
      }) as unknown as StripeSubscriptionsClient)
      : null,
    repo: createDeleteAccountRepo(
      createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    ),
    getUser: async (authHeader) => {
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      })
      const { data, error } = await client.auth.getUser()
      if (error || !data.user) return null
      return { id: data.user.id, email: data.user.email ?? null }
    },
    log: obs.log,
  })
  : null

if (!handler) {
  obs.log('error', 'config_missing', { keys: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY' })
}
if (handler && !stripeKey) obs.log('warn', 'config_missing', { keys: 'STRIPE_SECRET_KEY' })

Deno.serve(
  withCors(
    obs.wrap((req) =>
      handler ? handler(req) : new Response(JSON.stringify({ error: 'internal_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    ),
    { onRejected: (origin, method) => obs.log('warn', 'cors_rejected', { origin, method }) },
  ),
)
