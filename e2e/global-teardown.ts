import { cleanupE2EData, hasAdminEnv } from './utils/supabase-admin'

/**
 * Limpeza ao fim da suíte (DI-060): apaga os usuários criados pela e2e-login
 * e os dados deles no Supabase LOCAL. Assim o banco não acumula contas de teste
 * entre execuções. A trava de alvo (scripts/lib/test-target-guard.mjs) roda
 * dentro do cliente admin: produção nunca é tocada.
 *
 * Sem service role (specs só com mocks), não há o que limpar.
 */
export default async function globalTeardown(): Promise<void> {
  if (!hasAdminEnv()) return
  try {
    const report = await cleanupE2EData()
    if (report.users > 0) {
      console.log(
        `[e2e] limpeza: ${report.users} usuário(s) de teste e ${report.assessments} diagnóstico(s) removidos.`,
      )
    }
  } catch (error) {
    // Supabase local fora do ar não deve mascarar o resultado dos testes.
    console.warn(`[e2e] limpeza não concluída: ${(error as Error).message}`)
  }
}
