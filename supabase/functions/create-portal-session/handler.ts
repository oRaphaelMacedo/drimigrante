// create-portal-session/handler.ts — lógica testável do portal do cliente (DI-052)
//
// O cliente logado abre o Customer Portal do Stripe para cancelar a assinatura
// de €4,90/mês, trocar o cartão e ver as faturas ("Cancele a qualquer momento"
// passa a ser self-service).
//
// Fluxo:
//  - JWT obrigatório (Authorization: Bearer <access_token do usuário>);
//  - o customer vem SEMPRE de subscriptions.stripe_customer_id do próprio
//    usuário (lido com service role) — nada vindo do corpo da requisição;
//  - return_url → <app>/dashboard/settings?aba=plano (origem pela allowlist de
//    _shared/origin.ts, sem open redirect).
//
// Respostas:
//  200 { url }                                  → redirecionar para o portal
//  401 { error: 'unauthorized' }                → sem token ou token inválido
//  404 { error: 'customer_not_found', message } → a conta não tem customer no Stripe
//  405 { error: 'method_not_allowed' }
//  502 { error: 'portal_unavailable' }          → o Stripe recusou (ex.: portal ainda
//                                                 não ativado no painel, customer de
//                                                 outro modo test/live)
//  500 { error: 'internal_error' }
//
// Nenhum detalhe interno vai na resposta; o log não leva e-mail nem token.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'

export interface PortalSessionCreateParams {
  customer: string
  return_url: string
  locale?: string
}

export interface StripePortalClient {
  billingPortal: {
    sessions: {
      create(params: PortalSessionCreateParams): Promise<{ id: string; url: string | null }>
    }
  }
}

export interface PortalDeps {
  stripe: StripePortalClient
  /** Cliente service role (ignora RLS). */
  supabase: SupabaseClient
  /** Usuário do JWT da chamada, ou null (token ausente/inválido). */
  getUser: (authHeader: string) => Promise<{ id: string } | null>
  /** Base URL do frontend para esta chamada (ver _shared/origin.ts). */
  resolveAppUrl: (req: Request) => string
}

/** Para onde o portal devolve a pessoa (aba "Meu plano" da Conta). */
export const PORTAL_RETURN_PATH = '/dashboard/settings?aba=plano'

// Sem Access-Control-Allow-Origin: o CORS (allowlist) é aplicado no index.ts por
// _shared/cors.ts, que substitui qualquer Access-Control-* daqui (DI-082).
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

/** Customer do Stripe (`cus_…`) válido o bastante para mandar ao Stripe. */
const CUSTOMER_ID_RE = /^cus_[A-Za-z0-9]{6,64}$/

function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/** Erro devolvido pela API do Stripe (tem `type` ou `statusCode`), não falha nossa. */
function isStripeError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { type?: unknown; statusCode?: unknown; rawType?: unknown }
  return (
    (typeof e.type === 'string' && e.type.startsWith('Stripe')) ||
    typeof e.statusCode === 'number' ||
    typeof e.rawType === 'string'
  )
}

export function createPortalHandler(deps: PortalDeps): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

    const authHeader = req.headers.get('Authorization')
    if (!bearerToken(authHeader)) return json({ error: 'unauthorized' }, 401)

    let user: { id: string } | null
    try {
      user = await deps.getUser(authHeader as string)
    } catch {
      user = null
    }
    if (!user) return json({ error: 'unauthorized' }, 401)

    let customerId: string | null
    try {
      const { data, error } = await deps.supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) throw new Error(`subscriptions read failed: ${error.message}`)
      const raw = (data as { stripe_customer_id?: unknown } | null)?.stripe_customer_id
      customerId = typeof raw === 'string' && CUSTOMER_ID_RE.test(raw) ? raw : null
    } catch (err) {
      console.error('create-portal-session:', err instanceof Error ? err.message : String(err))
      return json({ error: 'internal_error' }, 500)
    }

    if (!customerId) {
      return json(
        { error: 'customer_not_found', message: 'Não encontramos uma assinatura ou compra nesta conta.' },
        404,
      )
    }

    try {
      const session = await deps.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${deps.resolveAppUrl(req)}${PORTAL_RETURN_PATH}`,
        locale: 'pt-BR',
      })
      if (!session.url || !session.url.startsWith('https://')) {
        console.error('create-portal-session: sessão do portal sem url https')
        return json({ error: 'portal_unavailable' }, 502)
      }
      return json({ url: session.url })
    } catch (err) {
      if (isStripeError(err)) {
        // Ex.: portal não configurado no painel do Stripe, customer de outro modo.
        const code = (err as { code?: unknown; type?: unknown }).code ?? (err as { type?: unknown }).type
        console.error(`create-portal-session: Stripe recusou a sessão (${String(code ?? 'sem código')})`)
        return json({ error: 'portal_unavailable' }, 502)
      }
      console.error('create-portal-session error:', err instanceof Error ? err.message : String(err))
      return json({ error: 'internal_error' }, 500)
    }
  }
}
