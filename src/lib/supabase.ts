import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { getClientEnv } from './env'

// URL e chave anon validadas por src/lib/env.ts (DI-084): ausentes ou com a
// service role por engano, o app falha cedo com uma mensagem clara.
const { supabaseUrl, supabaseAnonKey } = getClientEnv()

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
