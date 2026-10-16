// claim-session/handler.ts — auto-login pós-pagamento (W1-03: DI-002, DI-022)
//
// Depois do checkout anônimo do €30, a /checkout/success chama esta function
// com o session_id do Stripe. Se a compra for elegível, devolvemos um
// token_hash de magic link (uso único) que o frontend troca por sessão via
// supabase.auth.verifyOtp({ type: 'magiclink', token_hash }).
//
// O token SÓ é emitido quando TODAS as condições valem:
//  - pagamento confirmado (payment_status 'paid' ou 'no_payment_required');
//  - compra anônima do €30: mode 'payment', metadata.product_type 'one_time'
//    e SEM metadata.user_id (quem comprou logado já tem sessão);
//  - Checkout Session criada há menos de 24h;
//  - a conta foi criada POR ESTA compra (app_metadata.checkout_session_id) e
//    nunca fez login — o e-mail do checkout não é verificado, então uma conta
//    preexistente só entra provando a posse da caixa de e-mail;
//  - primeira reivindicação do session_id: INSERT em checkout_claims (PK)
//    antes de gerar o token; repetição → caminho de e-mail.
// Fora disso, um link de entrada é enviado ao e-mail da compra e a resposta é
// { status: 'email_sent' }.
//
// Respostas: 200 { status:'token', token_hash } | 200 { status:'email_sent' }
//            400 invalid_request/no_email · 403 payment_not_completed
//            404 not_found · 500 internal_error

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import { findOrCreateBuyer, wasCreatedByCheckout } from '../_shared/buyer.ts'
import { isCheckoutSettled, normalizeEmail, PG_UNIQUE_VIOLATION } from '../_shared/payments.ts'

export interface ClaimCheckoutSession {
  id: string
  mode: string
  payment_status: string
  created: number
  customer_email?: string | null
  customer_details?: { email?: string | null } | null
  metadata?: Record<string, string> | null
}

export interface StripeClaimClient {
  checkout: { sessions: { retrieve(id: string): Promise<ClaimCheckoutSession> } }
}

export interface ClaimDeps {
  stripe: StripeClaimClient
  /** Cliente service role. */
  supabase: SupabaseClient
  /** Base URL do frontend para o link de login (ver _shared/origin.ts). */
  resolveAppUrl: (req: Request) => string
  now?: () => Date
}

/** Janela em que o session_id ainda pode virar login automático. */
export const CLAIM_TOKEN_WINDOW_SECONDS = 24 * 60 * 60

const SESSION_ID_RE = /^cs_(?:test|live)_[A-Za-z0-9]+$/

// Sem Access-Control-Allow-Origin: o CORS (allowlist ou nenhum) é aplicado no index.ts
// por _shared/cors.ts, que substitui qualquer Access-Control-* daqui (DI-082).
const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isStripeNotFound(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string } | null
  return e?.statusCode === 404 || e?.code === 'resource_missing'
}

async function sendLoginLink(
  supabase: SupabaseClient,
  email: string,
  appUrl: string,
): Promise<Response> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/callback` },
  })
  // 429 = um link acabou de ser enviado para este e-mail (limite do Auth).
  if (error && (error as { status?: number }).status !== 429) {
    throw new Error(`signInWithOtp failed: ${error.message}`)
  }
  return json({ status: 'email_sent' })
}

export function createClaimSessionHandler(deps: ClaimDeps): (req: Request) => Promise<Response> {
  const clock = deps.now ?? (() => new Date())

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    let sessionId: unknown
    try {
      sessionId = ((await req.json()) as { session_id?: unknown })?.session_id
    } catch {
      return json({ error: 'invalid_request' }, 400)
    }
    if (typeof sessionId !== 'string' || sessionId.length > 255 || !SESSION_ID_RE.test(sessionId)) {
      return json({ error: 'invalid_request' }, 400)
    }

    const { supabase } = deps
    const appUrl = deps.resolveAppUrl(req)

    try {
      let session: ClaimCheckoutSession
      try {
        session = await deps.stripe.checkout.sessions.retrieve(sessionId)
      } catch (err) {
        if (isStripeNotFound(err)) return json({ error: 'not_found' }, 404)
        throw err
      }

      if (!isCheckoutSettled(session.payment_status)) {
        return json({ error: 'payment_not_completed' }, 403)
      }

      const metadata = session.metadata ?? {}
      const email =
        normalizeEmail(session.customer_details?.email) ??
        normalizeEmail(session.customer_email) ??
        normalizeEmail(metadata.email)
      if (!email) return json({ error: 'no_email' }, 400)

      const ageSeconds = clock().getTime() / 1000 - session.created
      const tokenEligible =
        session.mode === 'payment' &&
        metadata.product_type === 'one_time' &&
        !metadata.user_id &&
        ageSeconds < CLAIM_TOKEN_WINDOW_SECONDS

      if (!tokenEligible) return await sendLoginLink(supabase, email, appUrl)

      // O webhook pode ainda não ter chegado: a conta é criada marcada com esta
      // compra (o webhook depois resolve a mesma conta pelo e-mail).
      const { userId } = await findOrCreateBuyer(supabase, email, session.id)
      const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(userId)
      if (userErr || !userData?.user) {
        throw new Error(`getUserById failed: ${userErr?.message ?? 'user not found'}`)
      }
      const user = userData.user

      // Anti-takeover: só contas criadas por esta compra e ainda sem login.
      if (!wasCreatedByCheckout(user, session.id) || user.last_sign_in_at) {
        return await sendLoginLink(supabase, email, appUrl)
      }

      // Uso único: a reivindicação é gravada ANTES de gerar o token.
      const { error: claimErr } = await supabase
        .from('checkout_claims')
        .insert({ stripe_session_id: session.id, user_id: userId })
      if (claimErr) {
        if (claimErr.code === PG_UNIQUE_VIOLATION) return await sendLoginLink(supabase, email, appUrl)
        throw new Error(`checkout_claims insert failed: ${claimErr.message}`)
      }

      try {
        const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email,
        })
        if (linkErr) throw new Error(`generateLink failed: ${linkErr.message}`)
        const tokenHash = (linkData as { properties?: { hashed_token?: string } } | null)
          ?.properties?.hashed_token
        if (!tokenHash) throw new Error('generateLink returned no hashed_token')
        return json({ status: 'token', token_hash: tokenHash })
      } catch (err) {
        // Nenhum token saiu: libera a reivindicação para uma nova tentativa.
        const { error: releaseErr } = await supabase
          .from('checkout_claims')
          .delete()
          .eq('stripe_session_id', session.id)
        if (releaseErr) console.error(`claim-session: falha ao liberar claim: ${releaseErr.message}`)
        throw err
      }
    } catch (err) {
      console.error('claim-session error:', err instanceof Error ? err.message : String(err))
      return json({ error: 'internal_error' }, 500)
    }
  }
}
