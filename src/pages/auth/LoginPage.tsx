import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, Loader2, CheckCircle, KeyRound, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const schema = z.object({
  email: z.string().email('Email inválido'),
})
type FormValues = z.infer<typeof schema>

// B04-A07: guard by env var, not hostname — prevents panel appearing in `npm run preview`
const isDev = import.meta.env.VITE_APP_ENV === 'development'

export function LoginPage() {
  const { signInWithMagicLink, signInWithPassword, signInWithGoogle } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // B04-A06: feedback when magic link has expired (set by AuthCallbackPage)
  const linkExpired = searchParams.get('error') === 'link_expired'
  const [sent, setSent] = useState(false)
  const [sentEmail, setSentEmail] = useState('')
  const [devPassword, setDevPassword] = useState('')
  const [devEmail, setDevEmail] = useState('dev@drimigrante.test')
  const [devError, setDevError] = useState('')
  const [devLoading, setDevLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }: FormValues) => {
    // Store return intent so AuthCallbackPage can redirect after auth
    try {
      const returnTo = (location.state?.returnTo as string) ?? '/dashboard'
      const returnPlan = (location.state?.plan as string) ?? null
      const returnAssessmentId = (location.state?.assessmentId as string) ?? null
      // Use localStorage so the intent survives across tabs/windows (magic link opens new tab)
      localStorage.setItem('auth_return_to', returnTo)
      if (returnPlan) localStorage.setItem('auth_return_plan', returnPlan)
      else localStorage.removeItem('auth_return_plan')
      if (returnAssessmentId) localStorage.setItem('auth_return_assessment_id', returnAssessmentId)
      else localStorage.removeItem('auth_return_assessment_id')
    } catch {
      // ignore storage errors
    }

    const { error } = await signInWithMagicLink(email)
    if (error) {
      setError('email', { message: 'Erro ao enviar link. Tente novamente.' })
      return
    }
    setSentEmail(email)
    setSent(true)
  }

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setDevError('')
    setDevLoading(true)
    const { error } = await signInWithPassword(devEmail, devPassword)
    setDevLoading(false)
    if (error) { setDevError(error.message); return }
    navigate('/dashboard')
  }

  const handleGoogleLogin = async () => {
    try {
      const returnTo = (location.state?.returnTo as string) ?? '/dashboard'
      const returnPlan = (location.state?.plan as string) ?? null
      const returnAssessmentId = (location.state?.assessmentId as string) ?? null
      localStorage.setItem('auth_return_to', returnTo)
      if (returnPlan) localStorage.setItem('auth_return_plan', returnPlan)
      else localStorage.removeItem('auth_return_plan')
      if (returnAssessmentId) localStorage.setItem('auth_return_assessment_id', returnAssessmentId)
      else localStorage.removeItem('auth_return_assessment_id')
    } catch {
      // ignore storage errors
    }
    // B04-A09: handle Google OAuth errors instead of silently ignoring them
    const { error } = await signInWithGoogle()
    if (error) toast.error('Erro ao autenticar com Google. Tente novamente.')
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-blue-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mb-2 text-2xl font-bold text-gray-900">Verifique o seu email</h2>
          <p className="mb-4 text-gray-600">
            Enviámos um link de acesso para{' '}
            <strong className="text-brand-700">{sentEmail}</strong>
          </p>
          <p className="text-sm text-gray-500">
            Não recebeu? Verifique a pasta de spam ou{' '}
            <button
              onClick={() => setSent(false)}
              className="text-brand-600 underline hover:text-brand-700"
            >
              tente novamente
            </button>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-gradient-to-br from-brand-50 to-blue-50 p-4 pt-16 sm:items-center sm:pt-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link to="/" className="inline-block">
            <span className="text-2xl font-bold text-brand-700">Doutor Imigrante</span>
          </Link>
          <p className="mt-2 text-gray-600">Aceda à sua conta</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-lg">
          {/* B04-A06: feedback when redirected from an expired magic link */}
          {linkExpired && (
            <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>O link de acesso expirou ou já foi utilizado. Solicite um novo abaixo.</span>
            </div>
          )}
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Entrar</h1>
          <p className="mb-6 text-sm text-gray-500">
            Enviaremos um link de acesso para o seu email. Sem senha necessária.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  {...register('email')}
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="o.seu@email.com"
                  className={cn(
                    'w-full rounded-lg border py-2.5 pl-10 pr-3 text-sm outline-none transition',
                    'focus:border-brand-500 focus:ring-2 focus:ring-brand-100',
                    errors.email ? 'border-red-400' : 'border-gray-300',
                  )}
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'flex w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5',
                'text-sm font-semibold text-white transition hover:bg-brand-800',
                'disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {isSubmitting ? 'A enviar...' : 'Enviar link de acesso'}
            </button>
          </form>

          <div className="relative mt-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-gray-500">ou continue com</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGoogleLogin}
              type="button"
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              <span>Continuar com Google</span>
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            Ainda não tem conta?{' '}
            <Link to="/quiz" className="font-medium text-brand-600 hover:text-brand-700">
              Faça o quiz gratuitamente
            </Link>
          </div>

          {isDev && (
            <div className="mt-6 rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4">
              <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
                <KeyRound className="h-3.5 w-3.5" />
                DEV — Login rápido
              </p>
              <form onSubmit={handleDevLogin} className="space-y-2">
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  className="w-full rounded border border-amber-200 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-amber-400"
                />
                <input
                  type="password"
                  value={devPassword}
                  onChange={(e) => setDevPassword(e.target.value)}
                  placeholder="password"
                  className="w-full rounded border border-amber-200 bg-white px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-amber-400"
                />
                {devError && <p className="text-xs text-red-500">{devError}</p>}
                <button
                  type="submit"
                  disabled={devLoading || !devPassword}
                  className="w-full rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                >
                  {devLoading ? 'A entrar...' : 'Entrar como dev@drimigrante.test'}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Ao continuar, aceita os nossos{' '}
          <Link to="/termos" className="underline">Termos de Serviço</Link> e{' '}
          <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
        </p>
      </div>
    </div>
  )
}
