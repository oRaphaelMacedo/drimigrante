// _shared/buyer.ts — resolução do comprador por e-mail (DI-002, W1-03)
//
// O comprador é identificado SEMPRE por auth.users (fonte de verdade do e-mail
// verificado pelo Supabase Auth), via RPC public.get_auth_user_id_by_email
// (SECURITY DEFINER, executável só pelo service_role — migration
// 20261016000100_profiles_hardening_email_resolver.sql).
// NUNCA usar profiles.email para isso: era editável pelo próprio cliente e
// permitia sequestrar a compra de outra pessoa.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Chave em app_metadata (só o service_role escreve) com o id da Checkout
 * Session que criou a conta. O claim-session só faz auto-login de contas
 * criadas pela própria compra (DI-022).
 */
export const CHECKOUT_SESSION_APP_METADATA_KEY = 'checkout_session_id'

export async function findAuthUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.rpc('get_auth_user_id_by_email', { p_email: email })
  if (error) throw new Error(`get_auth_user_id_by_email failed: ${error.message}`)
  return typeof data === 'string' && data ? data : null
}

/**
 * Encontra a conta do e-mail ou cria uma nova marcada com a Checkout Session.
 * Seguro sob concorrência: se o createUser falhar porque outra chamada (webhook
 * ou claim-session) criou a conta no meio do caminho, resolve de novo.
 */
export async function findOrCreateBuyer(
  admin: SupabaseClient,
  email: string,
  checkoutSessionId: string,
): Promise<{ userId: string; created: boolean }> {
  const existing = await findAuthUserIdByEmail(admin, email)
  if (existing) return { userId: existing, created: false }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: {
      signup_source: 'checkout',
      [CHECKOUT_SESSION_APP_METADATA_KEY]: checkoutSessionId,
    },
  })
  if (!error && data?.user?.id) return { userId: data.user.id, created: true }

  const raced = await findAuthUserIdByEmail(admin, email)
  if (raced) return { userId: raced, created: false }
  throw new Error(`Failed to create or resolve buyer account: ${error?.message ?? 'unknown'}`)
}

/** true quando a conta foi criada por esta Checkout Session. */
export function wasCreatedByCheckout(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined,
  checkoutSessionId: string,
): boolean {
  return user?.app_metadata?.[CHECKOUT_SESSION_APP_METADATA_KEY] === checkoutSessionId
}
