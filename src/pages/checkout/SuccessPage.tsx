// SuccessPage.tsx — Day 4
// Confirmation page after successful Stripe payment
// Reads Stripe session_id from URL, shows personalised success state
// and redirects the user to the dashboard after a delay.

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { track } from '@/lib/analytics'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import {
  CheckCircle2,
  ArrowRight,
  Loader2,
  LayoutDashboard,
  Mail,
  Clock,
} from 'lucide-react'

// ── Animation utility: count up number ──────────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) {
        setValue(target)
        clearInterval(timer)
      } else {
        setValue(Math.floor(start))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])
  return value
}

// ─── Component ──────────────────────────────────────────────────────────────

export function SuccessPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { authUser } = useAuth()
  const sessionId = searchParams.get('session_id')
  const [countdown, setCountdown] = useState(8)
  // Guard so the auto-login claim runs at most once per mount.
  const claimedRef = useRef(false)
  // True when claim-session sent a login link by email instead of auto-login.
  const [emailSent, setEmailSent] = useState(false)
  // Set after verifyOtp succeeds; we navigate only once AuthContext has loaded
  // the user, otherwise ProtectedRoute sees authUser=null and bounces to /login.
  const [claimed, setClaimed] = useState(false)

  const percentage = useCountUp(100, 1500)

  // Fire conversion event once on mount
  useEffect(() => {
    track('checkout_completed', { session_id: sessionId })
  }, [sessionId])

  // P0 funnel (2026-06-30): post-payment auto-login for the anonymous flow.
  // If there's no authenticated user but we have a Stripe session_id, exchange it
  // for a Supabase session via claim-session → verifyOtp, then go to /dashboard.
  // On any failure we fall back to the countdown/CTA below (non-breaking).
  useEffect(() => {
    if (authUser || !sessionId || claimedRef.current) return
    claimedRef.current = true

    ;(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('claim-session', {
          body: { session_id: sessionId },
        })
        if (error) throw error
        // Existing account (already used before): no auto-login, link sent by email.
        if (data?.status === 'email_sent') {
          setEmailSent(true)
          return
        }
        const tokenHash = data?.token_hash as string | undefined
        if (!tokenHash) return

        const { error: verifyErr } = await supabase.auth.verifyOtp({
          type: 'magiclink',
          token_hash: tokenHash,
        })
        if (verifyErr) throw verifyErr

        setClaimed(true)
      } catch {
        // Non-fatal: keep showing the success page and let the user navigate
        // manually (CTA) or wait for the countdown fallback.
      }
    })()
  }, [authUser, sessionId, navigate])

  useEffect(() => {
    if (claimed && authUser) navigate('/dashboard', { replace: true })
  }, [claimed, authUser, navigate])

  // Auto-redirect to dashboard
  // (paused when the login link was emailed — /dashboard would bounce to /login)
  useEffect(() => {
    if (emailSent) return
    if (countdown === 0) {
      navigate('/dashboard', { replace: true })
      return
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, navigate, emailSent])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-brand-50 px-4 py-16">
      {/* Animated checkmark */}
      <div className="relative mb-8 flex h-28 w-28 items-center justify-center rounded-full bg-emerald-100">
        <div
          className="absolute inset-0 animate-ping rounded-full bg-emerald-200 opacity-40"
          style={{ animationDuration: '2s' }}
        />
        <CheckCircle2 className="h-14 w-14 text-emerald-500" strokeWidth={1.5} />
      </div>

      <h1 data-testid="checkout-success" className="mb-2 text-center text-3xl font-extrabold text-gray-900 sm:text-4xl">
        Pagamento confirmado! 🎉
      </h1>
      <p className="mb-10 max-w-md text-center text-gray-500">
        O seu perfil de imigração está agora a ser analisado pela nossa equipa jurídica.
        Receberá o resultado completo no seu dashboard em até <strong>24h úteis</strong>.
      </p>

      {/* Progress bar animation */}
      <div className="mb-10 w-full max-w-sm">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">A preparar a sua análise</span>
          <span className="font-bold text-emerald-600">{percentage}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Next steps */}
      <div className="mb-10 w-full max-w-md space-y-3">
        {[
          {
            icon: Mail,
            title: 'Email de confirmação',
            desc: 'Enviámos um recibo para o seu email.',
            done: true,
          },
          {
            icon: Clock,
            title: 'Análise jurídica em curso',
            desc: 'A nossa equipa recebeu o seu perfil e está a trabalhar.',
            done: false,
          },
          {
            icon: LayoutDashboard,
            title: 'Dashboard desbloqueado',
            desc: 'Aceda à análise completa a qualquer momento.',
            done: false,
          },
        ].map(({ icon: Icon, title, desc, done }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                done ? 'bg-emerald-100' : 'bg-gray-100'
              }`}
            >
              <Icon className={`h-4 w-4 ${done ? 'text-emerald-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{title}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
            {done && (
              <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-emerald-500" />
            )}
          </div>
        ))}
      </div>

      {emailSent && (
        <div
          data-testid="checkout-success-email-sent"
          className="mb-6 flex w-full max-w-md items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-800"
        >
          <Mail className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Este email já tem conta no Doutor Imigrante. Enviámos-lhe um{' '}
            <strong>link de acesso</strong> — abra-o para entrar no seu dashboard.
          </p>
        </div>
      )}

      {/* CTA */}
      <Link
        to="/dashboard"
        className="flex items-center gap-2 rounded-xl bg-brand-700 px-8 py-4 text-base font-bold text-white shadow-md transition hover:bg-brand-600"
      >
        <LayoutDashboard className="h-4 w-4" />
        Ir para o Dashboard
        <ArrowRight className="h-4 w-4" />
      </Link>

      {/* Auto-redirect notice */}
      {!emailSent && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-gray-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Redirecionando automaticamente em {countdown}s...
        </p>
      )}

      {/* Debug session id */}
      {sessionId && (
        <p className="mt-6 text-xs text-gray-300">Ref: {sessionId}</p>
      )}
    </div>
  )
}
