/**
 * LoginPage — entrada por link no e-mail, pensada para celular (DI-027).
 *
 *  - Destino: `state.from` (ProtectedRoute) > `state.returnTo` (legado) > `?next=`,
 *    sempre validado por safeInternalPath; viaja no link (`/auth/callback?next=`).
 *  - E-mail pré-preenchido com `state.email` ou o e-mail do quiz neste navegador.
 *  - Faixa pós-compra (`state.postPurchase` ou `?pos_compra=1`).
 *  - Reenvio com espera de 30 s por e-mail (voltar por "Usar outro e-mail" não
 *    zera a espera do mesmo endereço); erros de limite do Supabase tratados.
 *  - Quem já está logado vai direto para o destino.
 *  - Google como opção secundária, com aviso de usar o mesmo e-mail da compra;
 *    escondido em navegadores embutidos (Instagram, Facebook, TikTok…), com
 *    `state.email` e no fluxo pós-compra.
 *  - Código numérico (verifyOtp) atrás de VITE_AUTH_EMAIL_CODE=true, porque o
 *    template de e-mail do Supabase precisa incluir {{ .Token }} (ação do dono).
 *  - Login rápido de desenvolvimento só em `npm run dev` + localhost.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, KeyRound, Loader2, Mail, MailCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { safeInternalPath, safePathFromLocation } from '@/lib/safe-path'
import { isLocalDevHostname } from '@/lib/auth-redirect'
import { isInAppBrowser } from '@/lib/in-app-browser'
import { readStoredQuizIdentity } from '@/lib/stored-quiz-result'

/** Contrato do `location.state` aceito por /login (outros pacotes navegam com ele). */
export interface LoginLocationState {
  /** Rota protegida que mandou para o login (ProtectedRoute). */
  from?: { pathname: string; search?: string; hash?: string }
  /** Destino explícito (legado: CheckoutPage). */
  returnTo?: string
  plan?: string
  assessmentId?: string | null
  /** E-mail para pré-preencher (ex.: e-mail usado no pagamento). */
  email?: string
  /** Veio do fluxo pós-pagamento: mostra a faixa e esconde o Google. */
  postPurchase?: boolean
}

const RESEND_COOLDOWN_SECONDS = 30
const EMAIL_CODE_ENABLED = import.meta.env.VITE_AUTH_EMAIL_CODE === 'true'

const schema = z.object({
  email: z.string().trim().min(1, 'Digite seu e-mail.').email('Digite um e-mail válido.'),
})
type FormValues = z.infer<typeof schema>

const CALLBACK_ERRORS: Record<string, string> = {
  link_expired: 'Este link de acesso expirou ou já foi usado. Peça um novo abaixo.',
  auth_error: 'Não conseguimos concluir o acesso. Peça um novo link abaixo.',
}

const inputClass = (invalid: boolean) =>
  cn(
    'h-12 w-full rounded-xl border bg-card px-3 text-base text-foreground shadow-sm outline-none transition-colors',
    'placeholder:text-muted-foreground',
    'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40',
    invalid ? 'border-destructive' : 'border-input',
  )

const primaryButtonClass = cn(
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4',
  'text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-70',
)

const secondaryButtonClass = cn(
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-input bg-card px-4',
  'text-base font-medium text-foreground transition-colors hover:bg-muted',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  'disabled:cursor-not-allowed disabled:opacity-70',
)

const textLinkClass =
  'font-medium text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm'

/** Chave da espera de reenvio: o mesmo endereço, com ou sem maiúsculas. */
function cooldownKey(email: string): string {
  return email.trim().toLowerCase()
}

/** Segundos de espera pedidos pelo Supabase ("only request this after 42 seconds"). */
function rateLimitSeconds(error: Error): number | null {
  const match = /after (\d+) seconds?/i.exec(error.message)
  return match ? Number(match[1]) : null
}

function sendErrorMessage(error: Error): string {
  const wait = rateLimitSeconds(error)
  if (wait) return `Aguarde ${wait} segundos para pedir um novo link.`
  if (/rate limit/i.test(error.message) || (error as { status?: number }).status === 429) {
    return 'Muitos pedidos de link em pouco tempo. Tente de novo em alguns minutos.'
  }
  return 'Não conseguimos enviar o link. Confira o e-mail e tente de novo.'
}

/** Guarda a intenção de retorno para o callback (reserva caso o `next` se perca). */
function persistReturnIntent(returnTo: string, plan?: string, assessmentId?: string | null) {
  try {
    localStorage.setItem('auth_return_to', returnTo)
    if (plan) localStorage.setItem('auth_return_plan', plan)
    else localStorage.removeItem('auth_return_plan')
    if (assessmentId) localStorage.setItem('auth_return_assessment_id', assessmentId)
    else localStorage.removeItem('auth_return_assessment_id')
  } catch {
    // armazenamento indisponível (modo privado): o `next` do link basta
  }
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export function LoginPage() {
  const { session, signInWithMagicLink, verifyEmailCode, signInWithPassword, signInWithGoogle } =
    useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const state = (location.state ?? null) as LoginLocationState | null

  const emailId = useId()
  const emailHintId = useId()
  const emailErrorId = useId()

  const returnTo = useMemo(() => {
    if (state?.from) return safePathFromLocation(state.from)
    if (state?.returnTo) return safeInternalPath(state.returnTo)
    return safeInternalPath(searchParams.get('next'))
  }, [state, searchParams])

  const returnState = useMemo(() => {
    const next: Record<string, string> = {}
    if (state?.plan) next.plan = state.plan
    if (state?.assessmentId) next.assessmentId = state.assessmentId
    return Object.keys(next).length > 0 ? next : undefined
  }, [state])

  const postPurchase = state?.postPurchase === true || searchParams.get('pos_compra') === '1'
  const emailFromState = typeof state?.email === 'string' ? state.email.trim() : ''
  const initialEmail = useMemo(
    () => emailFromState || readStoredQuizIdentity()?.email || '',
    [emailFromState],
  )
  const callbackError = CALLBACK_ERRORS[searchParams.get('error') ?? ''] ?? null

  const inApp = useMemo(() => isInAppBrowser(), [])
  const showGoogle = !inApp && !emailFromState && !postPurchase
  const showDevLogin =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    isLocalDevHostname(window.location.hostname)

  const [sentEmail, setSentEmail] = useState<string | null>(null)
  /** Segundos de espera exibidos para o e-mail atual. */
  const [cooldown, setCooldown] = useState(0)
  /** Fim da espera de cada e-mail (ms), para não reenviar na hora ao voltar ao formulário. */
  const cooldownUntilRef = useRef(new Map<string, number>())
  const [resending, setResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<string | null>(null)
  const sentHeadingRef = useRef<HTMLHeadingElement>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail },
  })

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  // Leitores de tela: ao trocar para "Confira seu e-mail", o foco vai para o título.
  useEffect(() => {
    if (sentEmail) sentHeadingRef.current?.focus()
  }, [sentEmail])

  // Já logado (ou acabou de entrar em outra aba / pelo código): segue para o destino.
  if (session) {
    return <Navigate to={returnTo} replace state={returnState} />
  }

  const startCooldown = (email: string, seconds: number) => {
    cooldownUntilRef.current.set(cooldownKey(email), Date.now() + seconds * 1000)
    setCooldown(seconds)
  }

  const remainingCooldown = (email: string): number => {
    const until = cooldownUntilRef.current.get(cooldownKey(email))
    return until ? Math.max(0, Math.ceil((until - Date.now()) / 1000)) : 0
  }

  const onSubmit = async ({ email }: FormValues) => {
    // Mesmo e-mail ainda na espera (voltou por "Usar outro e-mail"): não reenvia,
    // volta para a tela do link já enviado com o tempo que falta.
    const remaining = remainingCooldown(email)
    if (remaining > 0) {
      setResendStatus(null)
      setSentEmail(email)
      setCooldown(remaining)
      return
    }
    persistReturnIntent(returnTo, state?.plan, state?.assessmentId)
    const { error } = await signInWithMagicLink(email, returnTo)
    if (error) {
      // Só bloqueia o botão: nada foi enviado agora, então não entra no mapa
      // (que leva à tela "Enviamos um link").
      const wait = rateLimitSeconds(error)
      if (wait) setCooldown(wait)
      setError('email', { message: sendErrorMessage(error) })
      return
    }
    setResendStatus(null)
    setSentEmail(email)
    startCooldown(email, RESEND_COOLDOWN_SECONDS)
  }

  const handleResend = async () => {
    if (!sentEmail || cooldown > 0) return
    setResending(true)
    setResendStatus(null)
    const { error } = await signInWithMagicLink(sentEmail, returnTo)
    setResending(false)
    if (error) {
      const wait = rateLimitSeconds(error)
      startCooldown(sentEmail, wait ?? RESEND_COOLDOWN_SECONDS)
      setResendStatus(sendErrorMessage(error))
      return
    }
    startCooldown(sentEmail, RESEND_COOLDOWN_SECONDS)
    setResendStatus('Enviamos um novo link. Use sempre o e-mail mais recente.')
  }

  const handleGoogleLogin = async () => {
    persistReturnIntent(returnTo, state?.plan, state?.assessmentId)
    const { error } = await signInWithGoogle(returnTo)
    if (error) toast.error('Não foi possível entrar com o Google. Tente pelo link no e-mail.')
  }

  if (sentEmail) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] justify-center bg-background px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <MailCheck aria-hidden="true" className="h-6 w-6 text-primary" />
            </div>
            <h1
              ref={sentHeadingRef}
              tabIndex={-1}
              className="text-2xl font-bold text-foreground outline-none [text-wrap:balance]"
            >
              Confira seu e-mail
            </h1>
            <p className="mt-2 text-base text-muted-foreground [text-wrap:pretty]">
              Enviamos um link de acesso para{' '}
              <strong className="break-words font-semibold text-foreground">{sentEmail}</strong>.
              Abra o e-mail neste aparelho e toque no link para entrar.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Não chegou em alguns minutos? Veja as pastas de spam e promoções.</li>
              <li>O link expira depois de um tempo e só funciona uma vez.</li>
            </ul>

            {EMAIL_CODE_ENABLED && <EmailCodeForm email={sentEmail} verify={verifyEmailCode} />}

            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || resending}
                aria-busy={resending}
                className={secondaryButtonClass}
              >
                {resending ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail aria-hidden="true" className="h-4 w-4" />
                )}
                {cooldown > 0 ? `Reenviar link em ${cooldown} s` : 'Reenviar link'}
              </button>
              <p aria-live="polite" className="text-center text-sm text-muted-foreground">
                {resendStatus}
              </p>
              <button
                type="button"
                onClick={() => {
                  // A espera continua valendo para este e-mail (cooldownUntilRef);
                  // o formulário fica livre para digitar outro endereço.
                  setSentEmail(null)
                  setResendStatus(null)
                  setCooldown(0)
                }}
                className="flex h-11 w-full items-center justify-center rounded-xl px-4 text-base font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Usar outro e-mail
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // A faixa pós-compra já pede o e-mail do pagamento; a dica fica para `state.email`.
  const showEmailHint = Boolean(emailFromState) && !postPurchase
  const emailDescribedBy = [errors.email ? emailErrorId : null, showEmailHint ? emailHintId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] justify-center bg-background px-4 py-8 sm:items-center sm:py-12">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
          {postPurchase && (
            <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-base font-semibold text-foreground">Falta só entrar</p>
              <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
                Use o mesmo e-mail do pagamento para abrir sua análise.
              </p>
            </div>
          )}

          {callbackError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-muted p-3 text-sm text-foreground"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{callbackError}</span>
            </div>
          )}

          <h1 className="text-2xl font-bold text-foreground [text-wrap:balance]">
            Entrar na sua conta
          </h1>
          <p className="mt-2 text-base text-muted-foreground [text-wrap:pretty]">
            Vamos enviar um link de acesso para o seu e-mail. Não precisa de senha.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
            <div>
              <label htmlFor={emailId} className="mb-1.5 block text-sm font-medium text-foreground">
                E-mail
              </label>
              <input
                {...register('email')}
                id={emailId}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="voce@email.com"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={emailDescribedBy || undefined}
                className={inputClass(Boolean(errors.email))}
              />
              {showEmailHint && (
                <p id={emailHintId} className="mt-1.5 text-sm text-muted-foreground">
                  Use o mesmo e-mail do pagamento.
                </p>
              )}
              {errors.email && (
                <p id={emailErrorId} role="alert" className="mt-1.5 text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting || cooldown > 0}
              aria-busy={isSubmitting}
              className={primaryButtonClass}
            >
              {isSubmitting ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Mail aria-hidden="true" className="h-4 w-4" />
              )}
              {isSubmitting
                ? 'Enviando…'
                : cooldown > 0
                  ? `Aguarde ${cooldown} s`
                  : 'Enviar link de acesso'}
            </button>
          </form>

          {showGoogle && (
            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-3 text-sm text-muted-foreground [text-wrap:pretty]">
                Use o Google só se for o mesmo e-mail da compra. Com outro e-mail, você entra
                numa conta nova, sem os seus dados.
              </p>
              <button type="button" onClick={handleGoogleLogin} className={secondaryButtonClass}>
                <GoogleIcon />
                Entrar com Google
              </button>
            </div>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Ainda não fez o diagnóstico?{' '}
            <Link to="/quiz" className={textLinkClass}>
              Fazer o diagnóstico gratuito
            </Link>
          </p>

          {showDevLogin && <DevLogin signIn={signInWithPassword} />}
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground [text-wrap:pretty]">
          Ao continuar, você aceita os{' '}
          <Link to="/termos" className={textLinkClass}>
            Termos de Serviço
          </Link>{' '}
          e a{' '}
          <Link to="/privacidade" className={textLinkClass}>
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

// ── Código numérico do e-mail (opcional) ──────────────────────────────────────

function EmailCodeForm({
  email,
  verify,
}: {
  email: string
  verify: (email: string, code: string) => Promise<{ error: Error | null }>
}) {
  const codeId = useId()
  const codeErrorId = useId()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    const digits = code.replace(/\D/g, '')
    if (!/^\d{6,10}$/.test(digits)) {
      setError('Digite o código numérico do e-mail.')
      return
    }
    setVerifying(true)
    setError(null)
    const { error: verifyError } = await verify(email, digits)
    setVerifying(false)
    // Sucesso: o AuthContext recebe SIGNED_IN e esta página redireciona.
    if (verifyError) setError('Código inválido ou expirado. Confira ou peça um novo link.')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-6 border-t border-border pt-5">
      <label htmlFor={codeId} className="mb-1.5 block text-sm font-medium text-foreground">
        Ou digite o código do e-mail
      </label>
      <input
        id={codeId}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={10}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? codeErrorId : undefined}
        className={cn(inputClass(Boolean(error)), 'tracking-[0.3em]')}
      />
      {error && (
        <p id={codeErrorId} role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
      <button type="submit" disabled={verifying} aria-busy={verifying} className={cn(primaryButtonClass, 'mt-3')}>
        {verifying && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
        Entrar com o código
      </button>
    </form>
  )
}

// ── Login rápido de desenvolvimento (só `npm run dev` em localhost) ───────────

function DevLogin({
  signIn,
}: {
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
}) {
  const [devEmail, setDevEmail] = useState('dev@drimigrante.test')
  const [devPassword, setDevPassword] = useState('')
  const [devError, setDevError] = useState('')
  const [devLoading, setDevLoading] = useState(false)

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setDevError('')
    setDevLoading(true)
    const { error } = await signIn(devEmail, devPassword)
    setDevLoading(false)
    // Sucesso: a sessão nova faz o LoginPage redirecionar para o destino.
    if (error) setDevError(error.message)
  }

  return (
    <div className="mt-6 rounded-xl border border-dashed border-border bg-muted p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <KeyRound aria-hidden="true" className="h-4 w-4" />
        Login rápido (desenvolvimento)
      </p>
      <form onSubmit={handleDevLogin} className="space-y-2">
        <input
          type="email"
          aria-label="E-mail de desenvolvimento"
          value={devEmail}
          onChange={(e) => setDevEmail(e.target.value)}
          className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="password"
          aria-label="Senha de desenvolvimento"
          value={devPassword}
          onChange={(e) => setDevPassword(e.target.value)}
          placeholder="senha"
          autoComplete="current-password"
          className="h-11 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {devError && <p className="text-sm text-destructive">{devError}</p>}
        <button
          type="submit"
          disabled={devLoading || !devPassword}
          className="h-11 w-full rounded-xl bg-foreground px-3 text-base font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {devLoading ? 'Entrando…' : `Entrar como ${devEmail}`}
        </button>
      </form>
    </div>
  )
}
