/**
 * AuthContext — singleton auth state shared across the entire app.
 *
 * Fixes applied:
 *  B04-A01 — Context Provider: single instance, no per-component state
 *  B04-A03 — onAuthStateChange(INITIAL_SESSION) replaces getSession() — eliminates double-fetch
 *  B04-A04 — queryClient.clear() on SIGNED_OUT event
 *  B04-A05 — isHubUser (super_admin | hub_admin) split from isStaffUser (+ lawyer | paralegal)
 *  B04-A12 — redirectTo uses VITE_APP_URL with fallback
 *  B04-A13 — Sentry replaces console.error/warn on auth failures
 *  B02-A21 — link anonymous assessment to user on SIGNED_IN (when localStorage holds session_id)
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import * as Sentry from '@sentry/react'
import { supabase } from '@/lib/supabase'
import { queryClient } from '@/lib/query-client'
import { linkAnonAssessmentToUser } from '@/hooks/useAssessment'
import type { Profile, Subscription, AppRole } from '@/lib/database.types'

// B02-A21: after signup, link the anonymous assessment saved in localStorage
// to the authenticated user. Best-effort: failure is logged but non-fatal.
async function linkStoredAnonAssessment(): Promise<void> {
  try {
    const raw = localStorage.getItem('dr_imigrante_quiz_result')
    if (!raw) return
    const parsed = JSON.parse(raw) as { assessmentId?: string; sessionId?: string }
    if (!parsed.assessmentId || !parsed.sessionId) return

    const { error } = await linkAnonAssessmentToUser(parsed.assessmentId, parsed.sessionId)
    if (error) {
      // Not fatal — user can still access the dashboard. Log for visibility.
      Sentry.captureMessage('linkAnonAssessment failed', {
        level: 'warning',
        tags: { ctx: 'auth.link' },
        extra: { error },
      })
    }
  } catch (err) {
    // Swallow JSON parse / localStorage errors — non-critical path
    Sentry.captureException(err, { tags: { ctx: 'auth.link.parse' } })
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  user: User
  profile: Profile | null
  subscription: Subscription | null
  roles: AppRole[]
}

export interface UseAuthReturn {
  authUser: AuthUser | null
  session: Session | null
  loading: boolean
  signInWithMagicLink: (email: string) => Promise<{ error: Error | null }>
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  /** Full admin access: super_admin | hub_admin */
  isHubUser: boolean
  /** Cases/leads access: hub + lawyer | paralegal */
  isStaffUser: boolean
  hasAccess: (feature: 'dashboard' | 'chat' | 'full_analysis') => boolean
}

// ── Internal hook (not exported — used only by AuthProvider) ──────────────────

function useAuthInternal(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUserData = useCallback(async (user: User) => {
    try {
      const withTimeout = <T,>(p: PromiseLike<T>, ms = 8000): Promise<T> =>
        Promise.race([
          Promise.resolve(p),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error('loadUserData timeout')), ms),
          ),
        ])

      const [
        { data: profile, error: errP },
        { data: subscription, error: errS },
        { data: roles, error: errR },
      ] = await withTimeout(
        Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.from('user_roles').select('role').eq('user_id', user.id),
        ]),
      )

      if (errP && errP.code !== 'PGRST116')
        Sentry.captureException(errP, { tags: { ctx: 'auth.profile' } })
      if (errS && errS.code !== 'PGRST116')
        Sentry.captureException(errS, { tags: { ctx: 'auth.subscription' } })
      if (errR)
        Sentry.captureException(errR, { tags: { ctx: 'auth.roles' } })

      setAuthUser({
        user,
        profile: profile ?? null,
        subscription: subscription ?? null,
        roles: (roles ?? []).map((r) => r.role as AppRole),
      })
    } catch (error) {
      Sentry.captureException(error, { tags: { ctx: 'auth.loadUserData.critical' } })
      // Fallback: user is authenticated but profile failed — don't block UI
      setAuthUser({ user, profile: null, subscription: null, roles: [] })
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // B04-A03: INITIAL_SESSION event replaces getSession() — fires once on mount
    // with the current session, avoiding the double-fetch that occurred before.
    // Defer DB calls via setTimeout to prevent blocking the Supabase auth client
    // (awaiting inside onAuthStateChange deadlocks further events).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      setSession(session)

      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          const user = session.user
          setTimeout(() => {
            if (!mounted) return
            loadUserData(user).finally(() => {
              if (mounted) setLoading(false)
            })
          }, 0)
        } else {
          setLoading(false)
        }
      } else if (event === 'SIGNED_IN') {
        const user = session!.user
        setTimeout(() => {
          if (!mounted) return
          // B02-A21: link any anonymous assessment saved before signup.
          // Fire-and-forget — non-blocking for loadUserData.
          linkStoredAnonAssessment()
          loadUserData(user).finally(() => {
            if (mounted) setLoading(false)
          })
        }, 0)
      } else if (event === 'SIGNED_OUT') {
        // B04-A04: clear TanStack Query cache — prevents data leak between sessions
        queryClient.clear()
        setAuthUser(null)
        setLoading(false)
      } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        setSession(session)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadUserData])

  // B04-A12: use VITE_APP_URL env var with window.location.origin fallback
  const redirectBase =
    import.meta.env.VITE_APP_URL ?? window.location.origin

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${redirectBase}/auth/callback` },
    })
    return { error: error as Error | null }
  }, [redirectBase])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${redirectBase}/auth/callback` },
    })
    return { error: error as Error | null }
  }, [redirectBase])

  const signOut = useCallback(async () => {
    // SIGNED_OUT event handler above clears cache and resets state
    await supabase.auth.signOut()
  }, [])

  // B04-A05: split roles — hub = full admin; staff = cases/leads access
  const isHubUser = authUser?.roles.some((r) =>
    ['super_admin', 'hub_admin'].includes(r),
  ) ?? false

  const isStaffUser = authUser?.roles.some((r) =>
    ['super_admin', 'hub_admin', 'lawyer', 'paralegal'].includes(r),
  ) ?? false

  const hasAccess = useCallback(
    (feature: 'dashboard' | 'chat' | 'full_analysis') => {
      if (isStaffUser) return true
      const sub = authUser?.subscription
      if (!sub) return false
      if (feature === 'dashboard') return sub.has_dashboard_access ?? false
      if (feature === 'chat') return sub.has_chat_access ?? false
      if (feature === 'full_analysis') return sub.has_full_analysis ?? false
      return false
    },
    [authUser, isStaffUser],
  )

  return {
    authUser,
    session,
    loading,
    signInWithMagicLink,
    signInWithPassword,
    signInWithGoogle,
    signOut,
    isHubUser,
    isStaffUser,
    hasAccess,
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<UseAuthReturn | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthInternal()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
