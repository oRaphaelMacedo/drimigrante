// e2e-login — gera uma sessão para os testes E2E do Playwright.
//
// SÓ PARA SUPABASE LOCAL OU STAGING. NUNCA faça deploy em produção (DI-003):
// o supabase/config.toml marca esta function com enabled = false e o handler
// recusa o projeto de produção. Ver docs/testes.md.
//
// Regras (handler.ts):
//   1. E2E_MODE === 'true'.
//   2. SUPABASE_URL não pode ser o projeto de produção.
//   3. Cabeçalho x-e2e-login-secret igual ao secret E2E_LOGIN_SECRET
//      (≥ 32 caracteres, comparação em tempo constante).
//   4. E-mail na allowlist e2e+<n>-<id>@drimigrante.test.
//   5. Erros devolvem mensagem genérica; o detalhe fica só no log.
//
// Fluxo da sessão:
//   cria o usuário se faltar (idempotente) → admin.generateLink (magic link)
//   → auth.verifyOtp troca o token por uma sessão real → devolve os tokens.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHandler, type E2ESession } from './handler.ts'

async function createSession(email: string): Promise<E2ESession> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error('Server misconfigured')
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Criação idempotente — ignora "already registered".
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  })
  if (createErr && !/already (registered|exists)/i.test(createErr.message)) {
    throw createErr
  }

  // Token de magic link de uso único.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (linkErr) throw linkErr
  const hashedToken = (linkData as { properties?: { hashed_token?: string } }).properties
    ?.hashed_token
  if (!hashedToken) {
    throw new Error('generateLink returned no hashed_token')
  }

  // Troca o token por uma sessão real (verifyOtp é público: chave anon).
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: sessionData, error: verifyErr } = await client.auth.verifyOtp({
    token_hash: hashedToken,
    type: 'magiclink',
  })
  if (verifyErr) throw verifyErr
  if (!sessionData.session) {
    throw new Error('verifyOtp returned no session')
  }

  return {
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    user: { id: sessionData.user?.id, email: sessionData.user?.email },
  }
}

serve(
  createHandler({
    env: (name) => Deno.env.get(name),
    createSession,
    logError: (message) => console.error(`e2e-login: ${message}`),
  }),
)
