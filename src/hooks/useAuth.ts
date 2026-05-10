import { useState, useEffect, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile, Subscription, AppRole } from '@/lib/database.types'

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
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  isHubUser: boolean
  hasAccess: (feature: 'dashboard' | 'chat' | 'full_analysis') => boolean
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUserData = useCallback(async (user: User) => {
    try {
      // 8s timeout to guarantee loading flag is cleared even if a query hangs
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

      if (errP && errP.code !== 'PGRST116') console.warn('Error loading profile:', errP)
      if (errS && errS.code !== 'PGRST116') console.warn('Error loading subscription:', errS)
      if (errR) console.warn('Error loading roles:', errR)

      setAuthUser({
        user,
        profile: profile ?? null,
        subscription: subscription ?? null,
        roles: (roles ?? []).map((r) => r.role as AppRole),
      })
    } catch (error) {
      console.error('Critical error in loadUserData:', error)
      // Fallback state so user isn't stuck on loading screen
      setAuthUser({
        user,
        profile: null,
        subscription: null,
        roles: [],
      })
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // Get initial session — wrap in try/catch + finally so loading always ends
    ;(async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) console.warn('getSession error:', error)
        if (!mounted) return
        setSession(data.session ?? null)
        if (data.session?.user) {
          await loadUserData(data.session.user)
        }
      } catch (err) {
        console.error('Auth init failed:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    // IMPORTANT: keep this callback synchronous and defer DB calls.
    // Awaiting Supabase queries inside onAuthStateChange deadlocks the
    // auth client (no further events fire) and freezes loading state.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      setSession(session)
      if (session?.user) {
        // Defer to next tick so we don't block the auth client
        const user = session.user
        setTimeout(() => {
          if (!mounted) return
          loadUserData(user).finally(() => {
            if (mounted) setLoading(false)
          })
        }, 0)
      } else {
        setAuthUser(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadUserData])

  const signInWithMagicLink = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { error: error as Error | null }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { error: error as Error | null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setAuthUser(null)
    setSession(null)
  }, [])

  const isHubUser = authUser?.roles.some((r) =>
    ['super_admin', 'hub_admin', 'lawyer', 'paralegal'].includes(r)
  ) ?? false

  const hasAccess = useCallback((feature: 'dashboard' | 'chat' | 'full_analysis') => {
    if (isHubUser) return true

    const sub = authUser?.subscription
    if (!sub) return false
    if (feature === 'dashboard') return sub.has_dashboard_access ?? false
    if (feature === 'chat') return sub.has_chat_access ?? false
    if (feature === 'full_analysis') return sub.has_full_analysis ?? false
    return false
  }, [authUser, isHubUser])

  return { authUser, session, loading, signInWithMagicLink, signInWithGoogle, signOut, isHubUser, hasAccess }
}
