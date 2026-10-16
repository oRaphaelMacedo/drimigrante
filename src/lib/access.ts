/**
 * access — regras de acesso do cliente, puras e testáveis (DI-025).
 *
 * Fonte única para "o que esta pessoa pode ver agora". O AuthContext, o
 * ProtectedRoute e as telas do dashboard usam estas funções em vez de
 * reimplementar a regra de expiração.
 *
 * Modelo comercial (decisões do dono):
 *  - €30 (pagamento único) libera análise, painel, documentos e chat IA
 *    por 30 dias (`one_time_access_expires_at`).
 *  - €4,90/mês (assinatura, só depois do €30) mantém tudo enquanto ativa.
 *  - Staff (super_admin, hub_admin, lawyer, paralegal) não expira.
 *  - Depois que o acesso expira, quem pagou continua podendo listar, baixar e
 *    apagar os próprios documentos (`documents_read`), mas não envia novos.
 *
 * O servidor continua sendo a autoridade (RLS e edge functions); estas regras
 * só decidem a navegação e o que mostrar. O chat espelha a regra do
 * chat-completion: assinatura ativa, ou `has_chat_access` dentro do prazo.
 */
import type { Subscription } from '@/lib/database.types'

export type AccessStateName = 'none' | 'active' | 'expiring' | 'expired' | 'recurring'

export type AccessFeature =
  | 'dashboard'
  | 'full_analysis'
  | 'chat'
  /** Listar, baixar e apagar os próprios documentos (continua após expirar). */
  | 'documents_read'
  /** Enviar novos documentos (só com acesso vigente). */
  | 'documents_upload'

/** Campos de `subscriptions` usados nas regras (permite mocks parciais). */
export type AccessSubscription = Pick<
  Subscription,
  | 'one_time_paid'
  | 'one_time_access_expires_at'
  | 'recurring_active'
  | 'has_dashboard_access'
  | 'has_full_analysis'
  | 'has_chat_access'
>

export interface AccessOptions {
  /** Staff (super_admin, hub_admin, lawyer, paralegal) nunca expira. */
  isStaff?: boolean
  /** Instante de referência (padrão: agora). Facilita testes. */
  now?: Date | number
}

export interface AccessState {
  state: AccessStateName
  /** Fim do acesso do €30. `null` quando não há prazo (staff, assinatura ou registro sem data). */
  expiresAt: Date | null
  /**
   * Dias restantes, arredondados para cima. 0 no último dia (e no instante
   * exato de `expiresAt`, que ainda tem acesso) e depois de expirar.
   * `null` quando não há prazo.
   */
  daysLeft: number | null
  /** Já pagou o €30 (`one_time_paid`). Só quem pagou pode receber a oferta de €4,90. */
  hasPaidOnce: boolean
  isStaff: boolean
}

/** A partir de quantos dias restantes o estado passa de 'active' para 'expiring'. */
export const EXPIRING_SOON_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

function toMs(now: Date | number | undefined): number {
  if (now === undefined) return Date.now()
  return typeof now === 'number' ? now : now.getTime()
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  // Data inválida no banco não pode tirar o acesso de quem pagou.
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Estado de acesso da pessoa a partir da linha de `subscriptions`.
 *
 * - `none`: nunca pagou (ou o pagamento foi revogado, ex.: reembolso).
 * - `active`: €30 dentro do prazo, com mais de 7 dias restantes (ou sem prazo).
 * - `expiring`: €30 dentro do prazo, com 7 dias ou menos. Em `now === expiresAt`
 *   ainda tem acesso.
 * - `expired`: pagou o €30 e o prazo passou, sem assinatura ativa.
 * - `recurring`: assinatura de €4,90 ativa (não expira enquanto ativa).
 *
 * Staff sempre recebe `active` sem prazo (`isStaff: true`).
 */
export function getAccessState(
  sub: AccessSubscription | null | undefined,
  options: AccessOptions = {},
): AccessState {
  const isStaff = options.isStaff === true
  const nowMs = toMs(options.now)
  const hasPaidOnce = sub?.one_time_paid === true
  const expiresAt = parseDate(sub?.one_time_access_expires_at)

  if (isStaff) {
    return { state: 'active', expiresAt: null, daysLeft: null, hasPaidOnce, isStaff }
  }

  const none: AccessState = {
    state: 'none',
    expiresAt: null,
    daysLeft: null,
    hasPaidOnce,
    isStaff,
  }
  if (!sub) return none

  if (sub.recurring_active === true) {
    return { state: 'recurring', expiresAt: null, daysLeft: null, hasPaidOnce, isStaff }
  }

  const grantsAccess = sub.has_dashboard_access === true || sub.has_full_analysis === true
  if (!hasPaidOnce && !grantsAccess) return none

  if (expiresAt && nowMs > expiresAt.getTime()) {
    return { state: 'expired', expiresAt, daysLeft: 0, hasPaidOnce, isStaff }
  }

  // Pagou, mas as flags foram revogadas dentro do prazo (reembolso/disputa).
  if (!grantsAccess) return none

  if (!expiresAt) {
    // Registro anterior ao prazo de 30 dias: acesso sem data de fim.
    return { state: 'active', expiresAt: null, daysLeft: null, hasPaidOnce, isStaff }
  }

  const daysLeft = Math.max(0, Math.ceil((expiresAt.getTime() - nowMs) / DAY_MS))
  return {
    state: daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'active',
    expiresAt,
    daysLeft,
    hasPaidOnce,
    isStaff,
  }
}

/**
 * Próximo instante em que `getAccessState` muda só com o passar do tempo
 * (um dia a menos em `daysLeft`, entrada em 'expiring' ou fim do acesso).
 *
 * `null` quando o estado não muda sozinho: staff, assinatura ativa, acesso
 * sem data de fim, já expirado ou quem nunca pagou. O AuthContext usa isto
 * para recalcular o acesso com a aba aberta, sem depender de um refresh.
 */
export function nextAccessChangeAt(
  sub: AccessSubscription | null | undefined,
  options: AccessOptions = {},
): Date | null {
  const access = getAccessState(sub, options)
  const nowMs = toMs(options.now)
  const expiresAt = parseDate(sub?.one_time_access_expires_at)
  if (!expiresAt || access.isStaff) return null
  const endMs = expiresAt.getTime()
  if (nowMs > endMs) return null

  // Pagou, mas as flags estão revogadas: só muda ao passar o prazo ('expired').
  if (access.state === 'none') return access.hasPaidOnce ? new Date(endMs + 1) : null
  if (access.state !== 'active' && access.state !== 'expiring') return null

  // daysLeft = ceil(restante / dia) cai de k + 1 para k no instante endMs − k·dia.
  // Com 0 dias (now === expiresAt ainda tem acesso), a próxima mudança é 1 ms depois.
  const k = Math.ceil((endMs - nowMs) / DAY_MS) - 1
  return new Date(k >= 0 ? endMs - k * DAY_MS : endMs + 1)
}

/** Acesso vigente ao conteúdo pago (€30 no prazo ou assinatura). */
export function hasActiveAccess(access: AccessState): boolean {
  return (
    access.isStaff ||
    access.state === 'active' ||
    access.state === 'expiring' ||
    access.state === 'recurring'
  )
}

/**
 * A oferta de €4,90/mês só pode aparecer para quem já pagou o €30 e ainda não
 * assina (estados 'active', 'expiring' ou 'expired'). Nunca para 'none'.
 */
export function canOfferRecurring(access: AccessState): boolean {
  if (access.isStaff || !access.hasPaidOnce) return false
  return access.state === 'active' || access.state === 'expiring' || access.state === 'expired'
}

/**
 * A pessoa pode usar `feature` agora?
 *
 * Em 'active'/'expiring' as flags do banco continuam valendo (o chat depende
 * de `has_chat_access`, como no servidor). Em 'expired' só sobra
 * `documents_read`.
 */
export function hasFeatureAccess(
  sub: AccessSubscription | null | undefined,
  feature: AccessFeature,
  options: AccessOptions = {},
): boolean {
  const access = getAccessState(sub, options)
  if (access.isStaff) return true

  switch (access.state) {
    case 'none':
      return false
    case 'recurring':
      return true
    case 'expired':
      return feature === 'documents_read'
    case 'active':
    case 'expiring': {
      if (!sub) return false
      switch (feature) {
        case 'dashboard':
        case 'documents_read':
        case 'documents_upload':
          return sub.has_dashboard_access === true
        case 'full_analysis':
          return sub.has_full_analysis === true
        case 'chat':
          return sub.has_chat_access === true
      }
    }
  }
  return false
}

// ── Navegação (usado pelo ProtectedRoute) ─────────────────────────────────────

/**
 * Rotas cujo conteúdo próprio continua acessível, em modo leitura, depois que
 * o acesso de 30 dias termina. Enquanto o router declarar
 * `requireFeature="dashboard"` em /dashboard/documents, este mapa garante que
 * quem já pagou continue listando, baixando e apagando os próprios arquivos.
 * (O ideal é o router passar `requireFeature="documents_read"` direto.)
 */
const READ_ONLY_ROUTES: ReadonlyArray<{ pathPrefix: string; feature: AccessFeature }> = [
  { pathPrefix: '/dashboard/documents', feature: 'documents_read' },
]

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

/** Funcionalidade efetivamente exigida por uma rota (aplica READ_ONLY_ROUTES). */
export function routeFeature(required: AccessFeature, pathname: string): AccessFeature {
  if (required !== 'dashboard') return required
  const readOnly = READ_ONLY_ROUTES.find((route) => matchesPrefix(pathname, route.pathPrefix))
  return readOnly ? readOnly.feature : required
}

/**
 * Para onde mandar quem não tem acesso à funcionalidade (DI-025).
 * Nunca para /checkout nem /results: o dashboard decide a oferta certa
 * (€30 para quem não pagou, €4,90 só para quem já pagou).
 */
export function accessDeniedRedirect(feature: AccessFeature, access: AccessState): string {
  if (access.state === 'expired') return '/dashboard?acesso=expirado'
  if (feature === 'chat') return '/dashboard?upsell=chat'
  return '/dashboard'
}
