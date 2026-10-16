// lifecycle-emails/repo.ts — leituras e trava de envio (service role).
// Depende das migrations 20261025000200_resume_token.sql (assessments.resume_token) e
// 20261030000000_lifecycle_emails.sql (email_suppressions e índices de dedupe_key).
// Toda query checa `error` e lança: o handler responde 500 sem enviar nada.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.105.4'
import type { AccessCandidate, NurtureCandidate, WaitlistCandidate } from '../_shared/email-lifecycle.ts'
import { normalizeEmail, PG_UNIQUE_VIOLATION } from '../_shared/payments.ts'
import type { EmailTemplateRow, LifecycleRepo } from './handler.ts'

/** Teto de linhas por consulta (o volume diário real é bem menor). */
const MAX_ROWS = 2000
/** Itens por filtro `in` (mantém a URL do PostgREST curta). */
const CHUNK = 50

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

interface AssessmentRow {
  id: string
  user_id: string | null
  email: string | null
  full_name: string | null
  answers: unknown
  completed_at: string | null
  resume_token: string | null
  assessment_results: { score_category: string | null } | Array<{ score_category: string | null }> | null
}

export function createLifecycleRepo(db: SupabaseClient): LifecycleRepo {
  return {
    async listCompletedAssessments(sinceIso, untilIso) {
      const { data, error } = await db
        .from('assessments')
        .select('id, user_id, email, full_name, answers, completed_at, resume_token, assessment_results(score_category)')
        .eq('status', 'completed')
        .not('email', 'is', null)
        .gte('completed_at', sinceIso)
        .lte('completed_at', untilIso)
        .order('completed_at', { ascending: false })
        .limit(MAX_ROWS)
      if (error) throw error
      return ((data ?? []) as unknown as AssessmentRow[]).map((row): NurtureCandidate => {
        const rel = row.assessment_results
        const result = Array.isArray(rel) ? rel[0] ?? null : rel
        return {
          assessmentId: row.id,
          userId: row.user_id,
          email: row.email,
          fullName: row.full_name,
          answers: row.answers,
          completedAt: row.completed_at,
          resumeToken: row.resume_token,
          scoreCategory: result?.score_category ?? null,
        }
      })
    },

    async getPaidAccounts(userIds, emails) {
      const emailById = new Map<string, string>()
      for (const part of chunks(emails)) {
        const { data, error } = await db.from('profiles').select('id, email').in('email', part)
        if (error) throw error
        for (const p of (data ?? []) as Array<{ id: string; email: string | null }>) {
          const email = normalizeEmail(p.email)
          if (email) emailById.set(p.id, email)
        }
      }
      const ids = [...new Set([...userIds, ...emailById.keys()])]
      const paidUserIds = new Set<string>()
      const paidEmails = new Set<string>()
      for (const part of chunks(ids)) {
        const { data, error } = await db
          .from('subscriptions')
          .select('user_id')
          .in('user_id', part)
          .or('one_time_paid.eq.true,recurring_active.eq.true')
        if (error) throw error
        for (const s of (data ?? []) as Array<{ user_id: string }>) {
          paidUserIds.add(s.user_id)
          const email = emailById.get(s.user_id)
          if (email) paidEmails.add(email)
        }
      }
      return { userIds: paidUserIds, emails: paidEmails }
    },

    async listAccessCandidates(fromIso, toIso) {
      const { data, error } = await db
        .from('subscriptions')
        .select('user_id, one_time_paid, one_time_access_expires_at, recurring_active')
        .eq('one_time_paid', true)
        .gte('one_time_access_expires_at', fromIso)
        .lte('one_time_access_expires_at', toIso)
        .limit(MAX_ROWS)
      if (error) throw error
      const subs = (data ?? []) as Array<{
        user_id: string
        one_time_paid: boolean | null
        one_time_access_expires_at: string | null
        recurring_active: boolean | null
      }>
      const profiles = new Map<string, {
        email: string | null
        full_name: string | null
        timezone: string | null
        notification_preferences: unknown
      }>()
      for (const part of chunks(subs.map((s) => s.user_id))) {
        const { data: rows, error: pErr } = await db
          .from('profiles')
          .select('id, email, full_name, timezone, notification_preferences')
          .in('id', part)
        if (pErr) throw pErr
        for (const p of (rows ?? []) as Array<Record<string, unknown>>) {
          profiles.set(p.id as string, {
            email: (p.email as string | null) ?? null,
            full_name: (p.full_name as string | null) ?? null,
            timezone: (p.timezone as string | null) ?? null,
            notification_preferences: p.notification_preferences,
          })
        }
      }
      return subs.map((s): AccessCandidate => {
        const p = profiles.get(s.user_id)
        return {
          userId: s.user_id,
          email: p?.email ?? null,
          fullName: p?.full_name ?? null,
          timezone: p?.timezone ?? null,
          expiresAt: s.one_time_access_expires_at,
          oneTimePaid: s.one_time_paid === true,
          recurringActive: s.recurring_active === true,
          notificationPreferences: p?.notification_preferences ?? null,
        }
      })
    },

    async listWaitlist(product) {
      const { data, error } = await db
        .from('assessments')
        .select('id, email, answers')
        .eq('answers->>waitlist', 'true')
        .eq('answers->>processo_tipo', product)
        .not('email', 'is', null)
        .order('created_at', { ascending: true })
        .limit(MAX_ROWS)
      if (error) throw error
      return ((data ?? []) as Array<{ id: string; email: string | null; answers: unknown }>).map((r) => ({
        assessmentId: r.id,
        email: r.email,
        answers: r.answers,
      }))
    },

    async getSentState(dedupeKeys) {
      const sent = new Set<string>()
      const failedAttempts = new Map<string, number>()
      for (const part of chunks(dedupeKeys)) {
        const { data, error } = await db
          .from('email_send_log')
          .select('status, dedupe_key:variables_used->>dedupe_key')
          .in('variables_used->>dedupe_key', part)
        if (error) throw error
        for (const row of (data ?? []) as Array<{ status: string | null; dedupe_key: string | null }>) {
          if (!row.dedupe_key) continue
          if (row.status === 'failed') {
            failedAttempts.set(row.dedupe_key, (failedAttempts.get(row.dedupe_key) ?? 0) + 1)
          } else {
            // 'sent', 'pending' ou status legado: conta como enviado (nunca reenvia).
            sent.add(row.dedupe_key)
          }
        }
      }
      return { sent, failedAttempts }
    },

    async getSuppressions(emailHashes) {
      const out = new Map<string, Set<string>>()
      for (const part of chunks(emailHashes)) {
        const { data, error } = await db.from('email_suppressions').select('email_hash, scope').in('email_hash', part)
        if (error) throw error
        for (const row of (data ?? []) as Array<{ email_hash: string; scope: string }>) {
          const scopes = out.get(row.email_hash) ?? new Set<string>()
          scopes.add(row.scope)
          out.set(row.email_hash, scopes)
        }
      }
      return out
    },

    async getTemplates(keys) {
      const out = new Map<string, EmailTemplateRow>()
      if (keys.length === 0) return out
      const { data, error } = await db
        .from('email_templates')
        .select('id, trigger_key, subject_pt, body_html_pt')
        .in('trigger_key', keys)
        .eq('is_active', true)
      if (error) throw error
      for (const row of (data ?? []) as EmailTemplateRow[]) out.set(row.trigger_key, row)
      return out
    },

    async claimSend(row) {
      const { data, error } = await db.from('email_send_log').insert(row).select('id').single()
      if (error) {
        // Índice único email_send_log_dedupe_key_active: outra execução já travou.
        if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) return null
        throw error
      }
      return { id: (data as { id: string }).id }
    },

    async finishSend(id, patch) {
      const { error } = await db.from('email_send_log').update(patch).eq('id', id)
      if (error) throw error
    },
  }
}
