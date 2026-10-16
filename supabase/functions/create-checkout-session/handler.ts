// create-checkout-session/handler.ts — lógica testável (W1-03: DI-019, DI-021)
//
// Fluxos:
//  (a) ANÔNIMO, €30 one-time (funil 1-clique, sem conta ainda)
//      Body: { plan:'one_time', assessmentId, sessionId, email }
//      - posse do assessment validada por get_anon_assessment(id, session_id);
//      - sem customer antecipado: customer_email + customer_creation:'always'
//        (o Stripe só cria o customer se a pessoa pagar);
//      - cancel_url → /results?checkout=cancelled;
//      - e-mail que JÁ tem acesso pago vigente: nenhuma sessão é criada; um link
//        de entrada é enviado para o e-mail e a resposta é genérica
//        { status: 'email_sent', url: '<app>/login' } (sem dizer se o e-mail
//        tem conta). O frontend deve checar `status` antes de `url`; o `url`
//        existe só para o frontend antigo, que redireciona para qualquer url.
//  (b) AUTENTICADO (JWT)
//      - one_time com acesso vigente (ou assinatura ativa) → 409 already_active;
//      - recurring (€4,90/mês) só para quem já pagou o €30 (403 one_time_required)
//        e nunca em dobro (409 already_active);
//      - recurring: success_url → /dashboard?subscribed=1, cancel_url → /dashboard;
//      - o limite de 12 ciclos NÃO vai no Checkout (subscription_data.cancel_at
//        não existe nessa API): o stripe-webhook aplica via subscriptions.update.
//
// Respostas:
//  200 { url, sessionId }           → redirecionar para o Stripe
//  200 { status: 'email_sent', url } → (anônimo) mostrar "enviamos um link para o seu e-mail"
//  400 { error: 'invalid_request', message }
//  401 { error: 'unauthorized' }    → plano recorrente sem login
//  403 { error: 'assessment_not_found' | 'one_time_required', message }
//  409 { error: 'already_active', message }
//  500 { error: 'internal_error' }

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { findAuthUserIdByEmail } from '../_shared/buyer.ts'
import { hasActivePaidAccess, normalizeEmail } from '../_shared/payments.ts'

export interface CheckoutSessionCreateResult {
  id: string
  url: string | null
}

export interface StripeCheckoutClient {
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<CheckoutSessionCreateResult>
    }
  }
}

export interface CheckoutDeps {
  stripe: StripeCheckoutClient
  /** Cliente service role (ignora RLS). */
  supabase: SupabaseClient
  /** Usuário do JWT da chamada, ou null (anônimo / token inválido). */
  getUser: (authHeader: string) => Promise<{ id: string; email?: string | null } | null>
  /** Base URL do frontend para esta chamada (ver _shared/origin.ts). */
  resolveAppUrl: (req: Request) => string
  prices: { oneTime?: string | null; recurring?: string | null }
  now?: () => Date
}

type Plan = 'one_time' | 'recurring'

interface RequestBody {
  plan?: unknown
  assessmentId?: unknown
  sessionId?: unknown
  email?: unknown
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function badRequest(message: string): Response {
  return json({ error: 'invalid_request', message }, 400)
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

interface SubscriptionSnapshot {
  one_time_paid: boolean | null
  one_time_access_expires_at: string | null
  recurring_active: boolean | null
  stripe_customer_id: string | null
}

async function loadSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionSnapshot | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('one_time_paid, one_time_access_expires_at, recurring_active, stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`subscriptions read failed: ${error.message}`)
  return (data as SubscriptionSnapshot | null) ?? null
}

export function createCheckoutHandler(deps: CheckoutDeps): (req: Request) => Promise<Response> {
  const clock = deps.now ?? (() => new Date())

  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    let body: RequestBody
    try {
      body = (await req.json()) as RequestBody
    } catch {
      return badRequest('JSON inválido.')
    }
    if (!body || typeof body !== 'object') return badRequest('JSON inválido.')

    if (body.plan !== 'one_time' && body.plan !== 'recurring') {
      return badRequest('Plano inválido.')
    }
    const plan: Plan = body.plan
    const assessmentId = optionalString(body.assessmentId)
    if (assessmentId && !UUID_RE.test(assessmentId)) return badRequest('assessmentId inválido.')
    const anonSessionId = optionalString(body.sessionId)
    if (anonSessionId && anonSessionId.length > 128) return badRequest('sessionId inválido.')
    const rawEmail = optionalString(body.email)
    // Auth guarda e-mails em minúsculas; normalizar mantém o webhook consistente.
    const email = normalizeEmail(rawEmail)
    if (rawEmail && !email) return badRequest('E-mail inválido.')

    const priceId = plan === 'one_time' ? deps.prices.oneTime : deps.prices.recurring
    if (!priceId) {
      console.error(`create-checkout-session: price não configurado para ${plan}`)
      return json({ error: 'internal_error' }, 500)
    }

    const appUrl = deps.resolveAppUrl(req)
    const now = clock()

    try {
      // A function roda com --no-verify-jwt: o JWT é opcional. Presente e válido
      // → fluxo autenticado; ausente/anon key → fluxo anônimo.
      const authHeader = req.headers.get('Authorization')
      const user = authHeader ? await deps.getUser(authHeader) : null

      // ── (a) ANÔNIMO ─────────────────────────────────────────────────────────
      if (!user) {
        if (plan !== 'one_time') return json({ error: 'unauthorized' }, 401)
        if (!assessmentId || !anonSessionId || !email) {
          return badRequest('assessmentId, sessionId e email são obrigatórios no checkout anônimo.')
        }

        const { data: assessments, error: rpcError } = await deps.supabase.rpc(
          'get_anon_assessment',
          { p_id: assessmentId, p_session_id: anonSessionId },
        )
        if (rpcError || !assessments || (Array.isArray(assessments) && assessments.length === 0)) {
          return json(
            { error: 'assessment_not_found', message: 'Diagnóstico não encontrado ou já vinculado a uma conta.' },
            403,
          )
        }

        // Sem recompra: quem já tem acesso vigente recebe um link de entrada.
        // Melhor esforço: se a checagem falhar, a venda segue (não bloquear o funil).
        let alreadyActive = false
        try {
          const existingUserId = await findAuthUserIdByEmail(deps.supabase, email)
          if (existingUserId) {
            alreadyActive = hasActivePaidAccess(
              await loadSubscription(deps.supabase, existingUserId),
              now,
            )
          }
        } catch (err) {
          console.error(
            'create-checkout-session: checagem de acesso vigente falhou:',
            err instanceof Error ? err.message : String(err),
          )
        }
        if (alreadyActive) {
          const { error: otpErr } = await deps.supabase.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false, emailRedirectTo: `${appUrl}/auth/callback` },
          })
          // Resposta genérica mesmo se o envio falhar (ex.: limite de envio do Auth).
          if (otpErr) console.error(`create-checkout-session: falha ao enviar link: ${otpErr.message}`)
          // `url` é só um fallback para frontends que ainda não tratam `status`.
          return json({ status: 'email_sent', url: `${appUrl}/login` })
        }

        const session = await deps.stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [{ price: priceId, quantity: 1 }],
          customer_email: email,
          customer_creation: 'always',
          success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${appUrl}/results?checkout=cancelled`,
          // Sem user_id: a conta é criada pelo stripe-webhook após o pagamento.
          metadata: {
            product_type: 'one_time',
            assessment_id: assessmentId,
            session_id: anonSessionId,
            email,
          },
          locale: 'pt',
          allow_promotion_codes: true,
        })
        return json({ url: session.url, sessionId: session.id })
      }

      // ── (b) AUTENTICADO ─────────────────────────────────────────────────────
      const sub = await loadSubscription(deps.supabase, user.id)

      if (plan === 'one_time' && hasActivePaidAccess(sub, now)) {
        return json({ error: 'already_active', message: 'Você já tem acesso ativo.' }, 409)
      }
      if (plan === 'recurring') {
        if (sub?.recurring_active) {
          return json({ error: 'already_active', message: 'Sua assinatura já está ativa.' }, 409)
        }
        // Modelo sequencial: €4,90/mês só para quem já pagou o €30.
        if (!sub?.one_time_paid) {
          return json(
            {
              error: 'one_time_required',
              message: 'A assinatura mensal fica disponível depois da compra da análise (€30).',
            },
            403,
          )
        }
      }

      const customerId = sub?.stripe_customer_id ?? null
      const customerEmail = normalizeEmail(user.email)
      const params: Record<string, unknown> = {
        mode: plan === 'recurring' ? 'subscription' : 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url:
          plan === 'recurring'
            ? `${appUrl}/dashboard?subscribed=1`
            : `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:
          plan === 'recurring' ? `${appUrl}/dashboard` : `${appUrl}/results?checkout=cancelled`,
        metadata: {
          user_id: user.id,
          product_type: plan,
          assessment_id: assessmentId ?? '',
        },
        locale: 'pt',
        allow_promotion_codes: true,
      }

      // Reaproveita o customer existente; senão o Stripe cria no pagamento.
      if (customerId) params.customer = customerId
      else if (customerEmail) params.customer_email = customerEmail
      if (!customerId && plan === 'one_time') params.customer_creation = 'always'

      if (plan === 'recurring') {
        params.subscription_data = {
          metadata: { user_id: user.id, assessment_id: assessmentId ?? '' },
        }
      }

      const session = await deps.stripe.checkout.sessions.create(params)
      return json({ url: session.url, sessionId: session.id })
    } catch (err) {
      console.error(
        'create-checkout-session error:',
        err instanceof Error ? err.message : String(err),
      )
      // B03-A07: nunca expor detalhes internos.
      return json({ error: 'internal_error' }, 500)
    }
  }
}
