// compute-eligibility — calcula score e regras de elegibilidade de um assessment.
// A lógica fica em handler.ts (testável); aqui só a ligação com Deno, Supabase e env.
//
// Corpo: { assessment_id: uuid, session_id?: string }
// Posse: JWT do dono OU session_id do assessment ainda anônimo → senão 404.
// Resposta: 200 { result } só com colunas de score (nunca as análises de IA).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLogger } from '../_shared/http.ts'
import { createComputeEligibilityHandler } from './handler.ts'
import { createEligibilityRepo } from './repo.ts'

const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

serve(
  createComputeEligibilityHandler({
    repo: createEligibilityRepo(supabase),
    log: createLogger('compute-eligibility'),
    now: () => Date.now(),
    env: { serviceRoleKey },
  }),
)
