// AuthCallbackPage.tsx — Day 3: Smart redirect after magic link auth
// Reads returnTo intent from sessionStorage (set by LoginPage) and redirects accordingly

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // Read return intent that LoginPage may have stored before redirecting to magic link
        try {
          const returnTo = sessionStorage.getItem('auth_return_to') ?? '/dashboard'
          const returnPlan = sessionStorage.getItem('auth_return_plan')
          sessionStorage.removeItem('auth_return_to')
          sessionStorage.removeItem('auth_return_plan')

          navigate(returnTo, {
            replace: true,
            state: returnPlan ? { plan: returnPlan } : undefined,
          })
        } catch {
          navigate('/dashboard', { replace: true })
        }
      } else {
        navigate('/login', { replace: true })
      }
    })
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
