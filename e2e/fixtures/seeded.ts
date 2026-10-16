import type { Page } from '@playwright/test'
import { test as base, type AuthedUser } from './auth'
import { supabaseAdmin } from '../utils/supabase-admin'
import { OFFER } from '../../src/lib/offer'

export type PaidUser = {
  page: Page
  user: AuthedUser
  assessmentId: string
}

type SeededFixtures = {
  paidUser: PaidUser
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Usuário que pagou o €30 agora (modelo P0): acesso de OFFER.accessDays dias,
 * com análise, painel e chat. Mesmos campos que o stripe-webhook grava no
 * pagamento único.
 *
 * Só roda contra o Supabase LOCAL (ou staging permitido): o cliente admin
 * recusa produção (scripts/lib/test-target-guard.mjs). Os dados são apagados
 * ao fim do teste e os usuários de teste, no globalTeardown.
 */
export const test = base.extend<SeededFixtures>({
  paidUser: async ({ authedPage, authedUser }, use) => {
    const paidAt = new Date()
    const expiresAt = new Date(paidAt.getTime() + OFFER.accessDays * DAY_MS)

    const { data: assessment, error: aErr } = await supabaseAdmin
      .from('assessments')
      .insert({
        user_id: authedUser.id,
        email: authedUser.email,
        full_name: 'E2E Seeded Tester',
        answers: { processo_tipo: 'nacionalidade', caso_tipo: 'A', a1_antepassado: 'pai_mae' },
        status: 'completed',
        questions_answered: 3,
        total_questions: 3,
        completion_percentage: 100,
      })
      .select('id')
      .single()
    if (aErr || !assessment) throw new Error(`seed: insert em assessments falhou: ${aErr?.message}`)

    try {
      const { error: rErr } = await supabaseAdmin.from('assessment_results').insert({
        assessment_id: assessment.id,
        score_numeric: 85,
        score_category: 'alta',
        suggested_visa_types: ['D7'],
        ia_explanation_short: 'E2E seeded result',
      })
      if (rErr) throw new Error(`seed: insert em assessment_results falhou: ${rErr.message}`)

      // A linha 'free' já existe (trigger handle_new_user); user_id é UNIQUE.
      const { error: sErr } = await supabaseAdmin.from('subscriptions').upsert(
        {
          user_id: authedUser.id,
          tier: 'one_time',
          one_time_paid: true,
          one_time_paid_at: paidAt.toISOString(),
          one_time_payment_amount: OFFER.price,
          one_time_access_expires_at: expiresAt.toISOString(),
          recurring_active: false,
          has_dashboard_access: true,
          has_full_analysis: true,
          has_chat_access: OFFER.includesChat,
        },
        { onConflict: 'user_id' },
      )
      if (sErr) throw new Error(`seed: upsert em subscriptions falhou: ${sErr.message}`)

      await use({ page: authedPage, user: authedUser, assessmentId: assessment.id })
    } finally {
      // assessment_results e messages caem em cascata com o assessment.
      await supabaseAdmin.from('assessments').delete().eq('id', assessment.id)
      await supabaseAdmin.from('subscriptions').delete().eq('user_id', authedUser.id)
    }
  },
})

export { expect } from '@playwright/test'
