// export-my-data — entrada da Edge Function (DI-083, LGPD/RGPD)
//
// O titular baixa um JSON com os dados da própria conta pela aba "Privacidade"
// da Conta (/dashboard/settings?aba=privacidade). A lógica e o contrato estão
// em ./handler.ts (testados em ./handler_test.ts com um banco falso, incluindo o
// isolamento entre contas); as leituras ficam em ./repo.ts.
//
// Depende de 20261020000000_full_analysis_paywall.sql (public.has_active_access,
// que o generate-explanation também usa): a análise completa paga só vai no
// arquivo com acesso vigente. Sem a RPC, a checagem falha e a análise fica de
// fora (fail closed); o resto da exportação funciona. Não depende da 20261030000100.
// CORS: allowlist de _shared/cors.ts. Observabilidade: _shared/observability.ts.
// JWT: verify_jwt fica no padrão (true) — não precisa de entrada no config.toml.
//
// AÇÃO DO DONO: incluir `export-my-data` na lista explícita de functions de
// produção de docs/operacao/release.md e fazer o deploy:
//   `supabase functions deploy export-my-data`
// (secrets já existentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY).

import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { withCors } from '../_shared/cors.ts'
import { createObservability } from '../_shared/observability.ts'
import { createExportHandler } from './handler.ts'
import { createExportRepo } from './repo.ts'

const obs = createObservability('export-my-data')
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

const handler = supabaseUrl && serviceRoleKey && anonKey
  ? createExportHandler({
    repo: createExportRepo(
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
      return {
        id: data.user.id,
        email: data.user.email ?? null,
        phone: data.user.phone ?? null,
        created_at: data.user.created_at ?? null,
        last_sign_in_at: data.user.last_sign_in_at ?? null,
      }
    },
    log: obs.log,
  })
  : null

if (!handler) {
  obs.log('error', 'config_missing', { keys: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY' })
}

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
