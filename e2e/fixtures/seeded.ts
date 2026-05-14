import type { Page } from '@playwright/test'
import { test as base, type AuthedUser } from './auth'
import { supabaseAdmin } from '../utils/supabase-admin'

export type PaidUser = {
  page: Page
  user: AuthedUser
  assessmentId: string
}

type SeededFixtures = {
  paidUser: PaidUser
}

export const test = base.extend<SeededFixtures>({
  paidUser: async ({ authedPage, authedUser }, use) => {
    // 1. Create assessment for this user
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
      .select()
      .single()
    if (aErr || !assessment) throw new Error(`seed: assessments insert failed: ${aErr?.message}`)

    // 2. Create assessment_results
    const { error: rErr } = await supabaseAdmin.from('assessment_results').insert({
      assessment_id: assessment.id,
      score_numeric: 85,
      score_category: 'alta',
      suggested_visa_types: ['D7'],
      ia_explanation_short: 'E2E seeded result',
    })
    if (rErr) throw new Error(`seed: assessment_results insert failed: ${rErr.message}`)

    // 3. Subscription with all access flags. Delete any pre-existing row first
    //    so the test starts from a clean state regardless of prior runs.
    await supabaseAdmin.from('subscriptions').delete().eq('user_id', authedUser.id)
    const { error: sErr } = await supabaseAdmin.from('subscriptions').insert({
      user_id: authedUser.id,
      tier: 'recurring',
      recurring_active: true,
      has_dashboard_access: true,
      has_chat_access: true,
      has_full_analysis: true,
    })
    if (sErr) throw new Error(`seed: subscriptions insert failed: ${sErr.message}`)

    await use({ page: authedPage, user: authedUser, assessmentId: assessment.id })

    // Cleanup — order matters because of FKs.
    await supabaseAdmin.from('messages').delete().eq('assessment_id', assessment.id)
    await supabaseAdmin.from('assessment_results').delete().eq('assessment_id', assessment.id)
    await supabaseAdmin.from('assessments').delete().eq('id', assessment.id)
    await supabaseAdmin.from('subscriptions').delete().eq('user_id', authedUser.id)
  },
})

export { expect } from '@playwright/test'
