import type { Page } from '@playwright/test'
import { test as base, type AuthedUser } from './auth'
import { supabaseAdmin } from '../utils/supabase-admin'
import { OFFER } from '../../src/lib/offer'
import type { Database } from '../../src/lib/database.types'

// ─────────────────────────────────────────────────────────────────────────────
// Dados de teste do modelo P0 (DI-086), em dois usos:
//
// 1. Cenários de acesso (`subscriptionFor`): a linha de `subscriptions` que o
//    stripe-webhook grava em cada estado — não pagante, €30 no prazo, perto de
//    expirar, expirado e assinatura de €4,90/mês. São funções puras: o backend
//    simulado dos specs 07/08 (e2e/fixtures/mock-backend.ts) serve estas linhas
//    e o fixture `paidUser` abaixo grava as mesmas no Supabase LOCAL.
// 2. Fixture `paidUser`: grava conta + diagnóstico + acesso no Supabase LOCAL
//    (ou staging permitido). O cliente admin recusa produção
//    (scripts/lib/test-target-guard.mjs). Os dados são apagados ao fim do teste
//    e os usuários de teste, no globalTeardown.
// ─────────────────────────────────────────────────────────────────────────────

export const DAY_MS = 24 * 60 * 60 * 1000

type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row']

/** Colunas de `subscriptions` que os cenários preenchem (sem id e carimbos). */
export type SubscriptionSeed = Omit<SubscriptionRow, 'id' | 'created_at' | 'updated_at'>

/**
 * Estados de acesso do modelo P0 (src/lib/access.ts):
 * - `none`: conta sem pagamento (linha criada pelo trigger handle_new_user);
 * - `one_time_active`: €30 pago há 3 dias (faltam 27);
 * - `one_time_expiring`: €30 pago há 25 dias (faltam 5, ≤ 7 → 'expiring');
 * - `one_time_expired`: €30 pago há 33 dias (terminou há 3), sem assinatura;
 * - `recurring`: €30 pago há 40 dias e assinatura de €4,90/mês ativa há 12.
 */
export type AccessScenario =
  | 'none'
  | 'one_time_active'
  | 'one_time_expiring'
  | 'one_time_expired'
  | 'recurring'

/** Cenários de quem já pagou o €30. */
export type PaidScenario = Exclude<AccessScenario, 'none'>

/** Há quantos dias o €30 foi pago em cada cenário. */
export const PAID_DAYS_AGO: Record<PaidScenario, number> = {
  one_time_active: 3,
  one_time_expiring: 25,
  one_time_expired: 33,
  recurring: 40,
}

/** Há quantos dias a assinatura de €4,90/mês começou (cenário `recurring`). */
export const RECURRING_STARTED_DAYS_AGO = 12

/** Valor da mensalidade em euros (o mesmo de OFFER.recurring.priceLabel). */
const RECURRING_AMOUNT = 4.9

/** Instante do pagamento do €30 no cenário (null para `none`). */
export function paidAtFor(scenario: AccessScenario, now: Date = new Date()): Date | null {
  if (scenario === 'none') return null
  return new Date(now.getTime() - PAID_DAYS_AGO[scenario] * DAY_MS)
}

/** Fim do acesso de OFFER.accessDays dias do €30 (null para `none`). */
export function accessExpiresAtFor(scenario: AccessScenario, now: Date = new Date()): Date | null {
  const paidAt = paidAtFor(scenario, now)
  return paidAt ? new Date(paidAt.getTime() + OFFER.accessDays * DAY_MS) : null
}

/**
 * Linha de `subscriptions` de cada cenário, com os mesmos campos que o
 * stripe-webhook grava (grantOneTime / grantRecurring). O €30 inclui o chat IA
 * durante o prazo (DI-012, opção A): `has_chat_access` fica true e quem decide
 * o fim do acesso é `one_time_access_expires_at`.
 */
export function subscriptionFor(
  scenario: AccessScenario,
  userId: string,
  now: Date = new Date(),
): SubscriptionSeed {
  const free: SubscriptionSeed = {
    user_id: userId,
    tier: 'free',
    one_time_paid: false,
    one_time_paid_at: null,
    one_time_payment_amount: null,
    one_time_access_expires_at: null,
    recurring_active: false,
    recurring_amount: null,
    recurring_started_at: null,
    recurring_cancelled_at: null,
    stripe_customer_id: null,
    stripe_payment_intent_id: null,
    stripe_subscription_id: null,
    has_dashboard_access: false,
    has_full_analysis: false,
    has_chat_access: false,
  }
  if (scenario === 'none') return free

  const paidAt = paidAtFor(scenario, now) as Date
  const oneTime: SubscriptionSeed = {
    ...free,
    tier: 'one_time',
    one_time_paid: true,
    one_time_paid_at: paidAt.toISOString(),
    one_time_payment_amount: OFFER.price,
    one_time_access_expires_at: (accessExpiresAtFor(scenario, now) as Date).toISOString(),
    stripe_customer_id: 'cus_e2eTest0001',
    stripe_payment_intent_id: 'pi_e2eTest0001',
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: OFFER.includesChat,
  }
  if (scenario !== 'recurring') return oneTime

  return {
    ...oneTime,
    tier: 'recurring',
    recurring_active: true,
    recurring_amount: RECURRING_AMOUNT,
    recurring_started_at: new Date(now.getTime() - RECURRING_STARTED_DAYS_AGO * DAY_MS).toISOString(),
    stripe_subscription_id: 'sub_e2eTest0001',
    has_chat_access: true,
  }
}

// ── Diagnóstico de teste ─────────────────────────────────────────────────────

/** Respostas do quiz: descendência de 1.º grau (gera um caminho com nome). */
export const SEED_ANSWERS: Record<string, string> = {
  processo_tipo: 'nacionalidade',
  caso_tipo: 'A',
  a1_antepassado: 'pai_mae',
}

/** Resultado gravado pelo compute-eligibility/generate-explanation (sem a análise completa). */
export const SEED_RESULT = {
  score_numeric: 85,
  score_category: 'alta',
  suggested_visa_types: [] as string[],
  ia_explanation_short: 'Resumo de teste da análise (E2E).',
}

/**
 * Análise completa simulada (o que a RPC get_full_analysis devolve). Texto de
 * teste, sem afirmação sobre o caso real de ninguém.
 */
export const SEED_ANALYSIS_MARKDOWN = [
  '## Seu caminho',
  '',
  'Texto de teste da análise completa (E2E).',
  '',
  '## Requisitos e documentos',
  '',
  '- Documento de teste A',
  '- Documento de teste B',
  '',
  '## Próximos passos',
  '',
  '1. Passo de teste',
].join('\n')

// ── Fixture para o Supabase LOCAL ────────────────────────────────────────────

export type PaidUser = {
  page: Page
  user: AuthedUser
  assessmentId: string
  scenario: PaidScenario
}

type SeededFixtures = {
  paidUser: PaidUser
}

type SeededOptions = {
  /**
   * Estado de acesso gravado para o `paidUser` (padrão: €30 no prazo).
   * Ex.: `test.use({ paidScenario: 'one_time_expired' })`.
   */
  paidScenario: PaidScenario
}

/**
 * Usuário que já pagou o €30 (modelo P0), no estado `paidScenario`: diagnóstico,
 * resultado e a linha de `subscriptions` que o stripe-webhook gravaria.
 *
 * Só roda contra o Supabase LOCAL (ou staging permitido): o cliente admin
 * recusa produção (scripts/lib/test-target-guard.mjs).
 */
export const test = base.extend<SeededFixtures & SeededOptions>({
  paidScenario: ['one_time_active', { option: true }],

  paidUser: async ({ authedPage, authedUser, paidScenario }, use) => {
    const { data: assessment, error: aErr } = await supabaseAdmin
      .from('assessments')
      .insert({
        user_id: authedUser.id,
        email: authedUser.email,
        full_name: 'E2E Seeded Tester',
        answers: SEED_ANSWERS,
        status: 'completed',
        questions_answered: Object.keys(SEED_ANSWERS).length,
        total_questions: Object.keys(SEED_ANSWERS).length,
        completion_percentage: 100,
      })
      .select('id')
      .single()
    if (aErr || !assessment) throw new Error(`seed: insert em assessments falhou: ${aErr?.message}`)

    try {
      const { error: rErr } = await supabaseAdmin.from('assessment_results').insert({
        assessment_id: assessment.id,
        ...SEED_RESULT,
      })
      if (rErr) throw new Error(`seed: insert em assessment_results falhou: ${rErr.message}`)

      // A linha 'free' já existe (trigger handle_new_user); user_id é UNIQUE.
      const { error: sErr } = await supabaseAdmin
        .from('subscriptions')
        .upsert(subscriptionFor(paidScenario, authedUser.id), { onConflict: 'user_id' })
      if (sErr) throw new Error(`seed: upsert em subscriptions falhou: ${sErr.message}`)

      await use({ page: authedPage, user: authedUser, assessmentId: assessment.id, scenario: paidScenario })
    } finally {
      // assessment_results e messages caem em cascata com o assessment.
      await supabaseAdmin.from('assessments').delete().eq('id', assessment.id)
      await supabaseAdmin.from('subscriptions').delete().eq('user_id', authedUser.id)
    }
  },
})

export { expect } from '@playwright/test'
