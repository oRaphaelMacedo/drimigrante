/**
 * O que o /results mostra no lugar da oferta, conforme o acesso da conta (DI-053).
 *
 * Regra: quem já pagou nunca vê o checkout em /results (risco de cobrança
 * dupla). Enquanto a conta ainda está sendo confirmada, ou se os dados dela não
 * carregaram, a oferta também não aparece: a tela espera ou oferece "Tentar de
 * novo" e "Ir para o painel".
 *
 *  - `none`: sem login, ou logado sem compra → oferta de €30 (PaywallCard).
 *  - `active`: acesso vigente (€30 no prazo, assinatura ou equipe) → "Ir para o painel".
 *  - `expired`: pagou o €30 e o prazo acabou → painel com as opções para continuar
 *    (a oferta de continuidade só aparece no dashboard).
 *  - `checking`: AuthContext ainda carregando a sessão ou a assinatura. Sem
 *    sessão no navegador (`mayHaveSession` falso, o caso de quem acabou de
 *    fazer o quiz), não espera: a oferta aparece na primeira pintura.
 *  - `unknown`: logado, mas a assinatura não carregou (userDataError).
 */
import { hasActiveAccess, type AccessState } from '@/lib/access'

export type ResultsAccessView = 'none' | 'checking' | 'unknown' | 'active' | 'expired'

export interface ResultsAccessInput {
  /** AuthContext ainda confirmando sessão/dados. */
  loading: boolean
  hasSession: boolean
  /** Há sessão do Supabase guardada neste navegador (src/lib/stored-session.ts). */
  mayHaveSession: boolean
  userDataError: unknown
  access: AccessState | null | undefined
  /** hasAccess('dashboard'). */
  canOpenDashboard: boolean
}

export function getResultsAccessView(input: ResultsAccessInput): ResultsAccessView {
  if (input.canOpenDashboard) return 'active'
  if (input.access && hasActiveAccess(input.access)) return 'active'
  if (input.access?.state === 'expired') return 'expired'
  if (input.hasSession && input.userDataError) return 'unknown'
  if (input.loading && (input.hasSession || input.mayHaveSession)) return 'checking'
  return 'none'
}

/** A oferta de compra (e a barra fixa) pode aparecer? */
export function showsCheckout(view: ResultsAccessView): boolean {
  return view === 'none'
}
