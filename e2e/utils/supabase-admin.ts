import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertSafeTestTarget } from '../../scripts/lib/test-target-guard.mjs'

/**
 * Cliente com a service role, SÓ para preparar e limpar dados de teste no
 * Supabase LOCAL (ou num staging listado em E2E_ALLOWED_REMOTE_HOSTS).
 *
 * A trava roda antes de criar o cliente: o projeto de produção é recusado
 * sempre (DI-060). O cliente é preguiçoso — só lança erro quando usado, para
 * que `test.skip()` nos specs sem variáveis tenha efeito antes.
 */
let cached: SupabaseClient | null = null

/**
 * E-mails criados pela e2e-login: a mesma allowlist de
 * supabase/functions/e2e-login/handler.ts (domínio reservado .test).
 */
export const E2E_EMAIL_PATTERN = /^e2e\+[0-9]+-[a-z0-9]+@drimigrante\.test$/

/** Há credenciais de admin para o ambiente de teste? (não valida o alvo) */
export function hasAdminEnv(): boolean {
  return Boolean(process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function getAdmin(): SupabaseClient {
  if (cached) return cached
  const url = process.env.VITE_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltam VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do Supabase LOCAL ' +
        '(rode `npm run supabase:env`; veja "Testes" no README.md).',
    )
  }
  assertSafeTestTarget({ supabaseUrl: url, allowedRemoteHosts: process.env.E2E_ALLOWED_REMOTE_HOSTS })
  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return cached
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return Reflect.get(getAdmin(), prop)
  },
})

export interface CleanupReport {
  users: number
  assessments: number
}

/**
 * Apaga os usuários de teste da e2e-login (e2e+<n>-<id>@drimigrante.test) e os
 * dados ligados a eles. Usuários do seed (dev@, cliente2@, admin@) não casam
 * com o padrão e ficam intactos.
 */
export async function cleanupE2EData(): Promise<CleanupReport> {
  const report: CleanupReport = { users: 0, assessments: 0 }
  const userIds: string[] = []

  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`cleanup: listUsers falhou: ${error.message}`)
    for (const user of data.users) {
      if (user.email && E2E_EMAIL_PATTERN.test(user.email)) userIds.push(user.id)
    }
    if (data.users.length < 200) break
  }

  for (const userId of userIds) {
    // assessments.user_id é ON DELETE SET NULL: apagar antes do usuário para
    // não deixar diagnósticos órfãos (assessment_results e messages caem junto).
    const { data: rows, error: aErr } = await supabaseAdmin
      .from('assessments')
      .delete()
      .eq('user_id', userId)
      .select('id')
    if (aErr) throw new Error(`cleanup: assessments falhou: ${aErr.message}`)
    report.assessments += rows?.length ?? 0

    const { error: uErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (uErr) throw new Error(`cleanup: deleteUser falhou: ${uErr.message}`)
    report.users += 1
  }

  return report
}
