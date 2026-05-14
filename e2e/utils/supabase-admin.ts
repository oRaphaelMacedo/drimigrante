import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

/**
 * Lazy admin client — throws only when actually used, so `test.skip()` in suites
 * that don't have the env vars set can take effect before this throws.
 */
function getAdmin(): SupabaseClient {
  if (cached) return cached
  const url = process.env.VITE_SUPABASE_URL ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing Supabase admin env vars: set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
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

export async function cleanupE2EData() {
  await supabaseAdmin.from('assessments').delete().ilike('email', '%e2e@%')
}
