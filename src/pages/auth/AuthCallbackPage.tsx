/**
 * AuthCallbackPage — handles the redirect after magic link / OAuth.
 *
 * Fixes applied:
 *  B04-A02 — validate returnTo before navigating (open redirect prevention)
 *  B04-A06 — use onAuthStateChange instead of getSession() to avoid race
 *             condition with detectSessionInUrl processing the URL hash.
 *             Show error feedback when magic link is expired/invalid.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        try {
          const returnTo = sessionStorage.getItem('auth_return_to') ?? '/dashboard'
          const returnPlan = sessionStorage.getItem('auth_return_plan')
          const returnAssessmentId = sessionStorage.getItem('auth_return_assessment_id')
          sessionStorage.removeItem('auth_return_to')
          sessionStorage.removeItem('auth_return_plan')
          sessionStorage.removeItem('auth_return_assessment_id')

          // B04-A02: prevent open redirect — only allow same-origin paths
          const safeReturn = returnTo.startsWith('/') ? returnTo : '/dashboard'

          const returnState: Record<string, string> = {}
          if (returnPlan) returnState.plan = returnPlan
          if (returnAssessmentId) returnState.assessmentId = returnAssessmentId

          navigate(safeReturn, {
            replace: true,
            state: Object.keys(returnState).length > 0 ? returnState : undefined,
          })
        } catch {
          navigate('/dashboard', { replace: true })
        }
      } else if (event === 'INITIAL_SESSION' && !session) {
        // No session detected — magic link may have expired or already been used
        navigate('/login?error=link_expired', { replace: true })
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-brand-600" />
        <p className="text-gray-600">A verificar acesso...</p>
        <p className="mt-1 text-xs text-gray-400">A redirecionar...</p>
      </div>
    </div>
  )
}
