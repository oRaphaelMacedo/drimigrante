/**
 * Conta — perfil, "Meu plano", notificações, segurança e privacidade
 * (DI-052, DI-072, DI-083).
 *
 * - Abas (Radix Tabs, acessíveis por teclado) com a aba na URL: `?aba=perfil|
 *   plano|notificacoes|seguranca|privacidade` (o portal do Stripe volta para
 *   `?aba=plano`).
 * - "Meu plano" a partir de getAccessState: pagamento único (fim do acesso, sem
 *   renovação automática), expirado, assinatura (próxima cobrança prevista,
 *   12ª e última cobrança, data de término) e o botão do portal do cliente
 *   (create-portal-session). Se o portal falhar, o cancelamento pelo suporte
 *   aparece na hora.
 * - "Sair dos outros aparelhos" usa signOut({ scope: 'others' }) — este
 *   aparelho continua conectado.
 * - Depois de salvar o perfil, refreshUser() atualiza o nome no painel.
 * - "Privacidade" (LGPD/RGPD): baixar os dados (export-my-data) e apagar a conta
 *   com confirmação digitando o e-mail (delete-account) — ver PrivacyPanel.
 * - Eventos: settings_plan_viewed e portal_clicked (sem PII).
 */
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import * as Tabs from '@radix-ui/react-tabs'
import * as Switch from '@radix-ui/react-switch'
import {
  AlertCircle,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarX2,
  CreditCard,
  ExternalLink,
  KeyRound,
  Lock,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { PrivacyPanel } from '@/components/dashboard/PrivacyPanel'
import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { SubscriptionUpsellCard } from '@/components/dashboard/SubscriptionUpsellCard'
import { ONE_TIME_CTA_LABEL, daysRemainingLabel } from '@/components/dashboard/dashboard-access'
import { formatFullDate, getPlanSummary, type PlanSummary } from '@/components/dashboard/plan-summary'
import { Badge, Button, Card, Input } from '@/components/ui'
import { SUPPORT_EMAIL, mailtoHref } from '@/config/contact'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult } from '@/hooks/useAssessmentResult'
import { usePortalSession } from '@/hooks/usePortalSession'
import { track } from '@/lib/analytics'
import { toUserMessage } from '@/lib/errors'
import { OFFER } from '@/lib/offer'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const EMAIL_CODE_ENABLED = import.meta.env.VITE_AUTH_EMAIL_CODE === 'true'

type TabId = 'profile' | 'plan' | 'notifications' | 'security' | 'privacy'

const TABS: ReadonlyArray<{ id: TabId; param: string; label: string; icon: typeof UserRound }> = [
  { id: 'profile', param: 'perfil', label: 'Perfil', icon: UserRound },
  { id: 'plan', param: 'plano', label: 'Meu plano', icon: CreditCard },
  { id: 'notifications', param: 'notificacoes', label: 'Notificações', icon: Bell },
  { id: 'security', param: 'seguranca', label: 'Segurança', icon: ShieldCheck },
  { id: 'privacy', param: 'privacidade', label: 'Privacidade', icon: Lock },
]

function tabFromParam(value: string | null): TabId {
  return TABS.find((tab) => tab.param === value)?.id ?? 'profile'
}

export function SettingsPage() {
  const { access } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = tabFromParam(searchParams.get('aba'))

  const changeTab = (value: string) => {
    const tab = TABS.find((item) => item.id === value)
    if (!tab) return
    const next = new URLSearchParams(searchParams)
    next.set('aba', tab.param)
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    if (activeTab === 'plan') track('settings_plan_viewed', { plan_status: access.isStaff ? 'staff' : access.state })
  }, [activeTab, access.state, access.isStaff])

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 sm:space-y-8">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight text-foreground [text-wrap:balance] sm:text-3xl">Conta</h1>
        <p className="mt-1 text-base text-muted-foreground [text-wrap:pretty]">
          Seu perfil, seu plano, a segurança do seu acesso e os seus dados.
        </p>
      </header>

      <Tabs.Root
        value={activeTab}
        onValueChange={changeTab}
        orientation="horizontal"
        className="flex flex-col gap-4 md:flex-row md:gap-8"
      >
        <Tabs.List
          aria-label="Seções da conta"
          className="grid grid-cols-2 gap-2 md:flex md:w-56 md:shrink-0 md:flex-col md:gap-1"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              key={id}
              value={id}
              data-testid={`settings-tab-${id}`}
              className={cn(
                'inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-base font-medium transition-colors duration-150 md:justify-start md:border-transparent md:px-4',
                // 5 abas em 2 colunas no celular: a última ocupa a linha inteira.
                'last:col-span-2 md:last:col-span-1',
                'bg-card text-muted-foreground hover:bg-muted hover:text-foreground md:bg-transparent',
                'data-[state=active]:border-primary/30',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'data-[state=active]:bg-primary/[.08] data-[state=active]:text-primary',
              )}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <div className="min-w-0 flex-1">
          <Tabs.Content value="profile" className="focus-visible:outline-none">
            <ProfilePanel />
          </Tabs.Content>
          <Tabs.Content value="plan" className="focus-visible:outline-none">
            <PlanPanel />
          </Tabs.Content>
          <Tabs.Content value="notifications" className="focus-visible:outline-none">
            <NotificationsPanel />
          </Tabs.Content>
          <Tabs.Content value="security" className="focus-visible:outline-none">
            <SecurityPanel />
          </Tabs.Content>
          <Tabs.Content value="privacy" className="focus-visible:outline-none">
            <PrivacyPanel />
          </Tabs.Content>
        </div>
      </Tabs.Root>

      {/* Sair da conta (DI-045): no celular é o único lugar com "Sair", sempre com confirmação. */}
      <section
        aria-labelledby="settings-sign-out-title"
        className="rounded-lg border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6"
      >
        <h2 id="settings-sign-out-title" className="text-lg font-semibold text-foreground">
          Sair da conta
        </h2>
        <p className="mt-1 text-base text-muted-foreground [text-wrap:pretty]">
          Para entrar de novo, você vai receber um link de acesso no seu e-mail.
        </p>
        <SignOutButton className="mt-4" />
      </section>
    </div>
  )
}

// ── Perfil ───────────────────────────────────────────────────────────────────

const NAME_MAX = 120
const PHONE_RE = /^\+?[0-9\s().-]{7,25}$/

function ProfilePanel() {
  const { authUser, session, refreshUser } = useAuth()
  const profile = authUser?.profile ?? null
  const savedName = profile?.full_name ?? ''
  const savedPhone = profile?.phone ?? ''

  const [fullName, setFullName] = useState(savedName)
  const [phone, setPhone] = useState(savedPhone)
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)

  // Dados novos do servidor (ex.: depois do refreshUser) atualizam o formulário.
  useEffect(() => {
    setFullName(savedName)
    setPhone(savedPhone)
  }, [savedName, savedPhone])

  const email = authUser?.user.email ?? session?.user.email ?? ''
  const dirty = fullName.trim() !== savedName.trim() || phone.trim() !== savedPhone.trim()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!authUser?.profile || isSaving) return
    const cleanPhone = phone.trim()
    if (cleanPhone && !PHONE_RE.test(cleanPhone)) {
      setPhoneError('Confira o número: use só dígitos, espaços e o código do país (ex.: +55).')
      return
    }
    setPhoneError(undefined)
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim().slice(0, NAME_MAX),
          phone: cleanPhone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUser.user.id)
      if (error) throw error
      await refreshUser()
      toast.success('Perfil atualizado.')
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível salvar. Tente de novo.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <PanelTitle>Perfil</PanelTitle>
      <form className="space-y-5" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Input
          label="E-mail"
          type="email"
          value={email}
          disabled
          readOnly
          hint="É o e-mail de acesso. Para trocar, fale com o suporte."
        />
        <Input
          label="Nome completo"
          autoComplete="name"
          maxLength={NAME_MAX}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
        />
        <Input
          label="Telefone ou WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={25}
          value={phone}
          onChange={(event) => {
            setPhone(event.target.value)
            if (phoneError) setPhoneError(undefined)
          }}
          hint="Opcional. Inclua o código do país, por exemplo +55 ou +351."
          error={phoneError}
        />
        <div className="flex justify-end border-t pt-5">
          <Button type="submit" loading={isSaving} disabled={!dirty || !authUser?.profile} className="w-full sm:w-auto">
            Salvar alterações
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ── Meu plano ────────────────────────────────────────────────────────────────

function PlanPanel() {
  const { authUser, access } = useAuth()
  const { result } = useAssessmentResult()
  const summary = getPlanSummary(authUser?.subscription ?? null, access)
  const assessmentId = result?.assessmentId || null

  return (
    <div className="space-y-4" data-testid="settings-plan" data-plan-kind={summary.kind}>
      <Card>
        <PanelTitle>Meu plano</PanelTitle>
        <PlanDetails summary={summary} hasQuizResult={!!result} assessmentId={assessmentId} />
      </Card>

      {(summary.kind === 'one_time' || summary.kind === 'expired') && access.hasPaidOnce && (
        <SubscriptionUpsellCard
          placement="settings_plan"
          emphasis={summary.kind === 'expired' ? 'primary' : 'quiet'}
          assessmentId={assessmentId}
        />
      )}
    </div>
  )
}

function PlanDetails({
  summary,
  hasQuizResult,
  assessmentId,
}: {
  summary: PlanSummary
  hasQuizResult: boolean
  assessmentId: string | null
}) {
  switch (summary.kind) {
    case 'staff':
      return (
        <PlanHeader icon={ShieldCheck} badge={<Badge variant="neutral">Acesso de equipe</Badge>}>
          Contas da equipe não têm plano nem cobrança.
        </PlanHeader>
      )

    case 'free':
      return (
        <>
          <PlanHeader icon={CreditCard} badge={<Badge variant="neutral">Diagnóstico gratuito</Badge>}>
            Você ainda não comprou a análise completa.
          </PlanHeader>
          <div className="mt-5 space-y-2">
            {hasQuizResult ? (
              <>
                <Button asChild variant="pay" size="lg" className="w-full sm:w-auto">
                  <Link
                    to="/checkout"
                    state={{ plan: 'one_time', assessmentId }}
                    onClick={() => track('paywall_cta_clicked', { placement: 'settings_plan' })}
                  >
                    {ONE_TIME_CTA_LABEL}
                  </Link>
                </Button>
                <p className="text-sm text-muted-foreground">
                  Pagamento único · acesso por {OFFER.accessDays} dias · {OFFER.delivery.toLocaleLowerCase('pt-BR')}
                </p>
              </>
            ) : (
              <Button asChild className="w-full sm:w-auto">
                <Link to="/quiz">Fazer o diagnóstico gratuito</Link>
              </Button>
            )}
          </div>
        </>
      )

    case 'one_time':
      return (
        <>
          <PlanHeader icon={CalendarCheck} badge={<Badge variant="primary">Pagamento único</Badge>}>
            {OFFER.includesChat
              ? `Análise completa, painel e chat IA por ${OFFER.accessDays} dias.`
              : `Análise completa e painel por ${OFFER.accessDays} dias.`}
          </PlanHeader>
          <PlanFacts
            facts={[
              summary.paidAt && { label: 'Pago em', value: formatFullDate(summary.paidAt) },
              summary.accessEndsAt && {
                label: 'Acesso até',
                value:
                  summary.daysLeft !== null
                    ? `${formatFullDate(summary.accessEndsAt)} (${daysRemainingLabel(summary.daysLeft)})`
                    : formatFullDate(summary.accessEndsAt),
              },
              { label: 'Renovação', value: 'Não renova sozinho: não há cobrança automática.' },
            ]}
          />
        </>
      )

    case 'expired':
      return (
        <>
          <PlanHeader icon={CalendarX2} badge={<Badge variant="neutral">Acesso encerrado</Badge>}>
            {summary.accessEndsAt
              ? `Seu acesso de ${OFFER.accessDays} dias terminou em ${formatFullDate(summary.accessEndsAt)}.`
              : `Seu acesso de ${OFFER.accessDays} dias terminou.`}{' '}
            Seus documentos continuam disponíveis para baixar ou apagar.
          </PlanHeader>
          <div className="mt-4">
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link
                to="/checkout"
                state={{ plan: 'one_time', assessmentId }}
                onClick={() => track('paywall_cta_clicked', { placement: 'settings_plan_expired' })}
              >
                Comprar mais {OFFER.accessDays} dias por {OFFER.priceLabel}
              </Link>
            </Button>
          </div>
        </>
      )

    case 'recurring':
      return <RecurringDetails summary={summary} />
  }
}

function RecurringDetails({ summary }: { summary: PlanSummary }) {
  const portal = usePortalSession()
  const recurring = summary.recurring
  const facts = [
    { label: 'Valor', value: OFFER.recurring.priceLabel },
    recurring?.startedAt && { label: 'Assinante desde', value: formatFullDate(recurring.startedAt) },
    recurring && {
      label: 'Próxima cobrança',
      value: recurring.nextChargeAt
        ? `${formatFullDate(recurring.nextChargeAt)} (prevista)`
        : 'Nenhuma nova cobrança prevista',
    },
    recurring?.lastChargeAt &&
      !recurring.cancelScheduled && {
        label: `${OFFER.recurring.maxCycles}ª e última cobrança`,
        value: `${formatFullDate(recurring.lastChargeAt)} (prevista)`,
      },
    recurring?.endsAt && {
      label: recurring.cancelScheduled ? 'Cancelamento agendado para' : 'A assinatura termina em',
      value: formatFullDate(recurring.endsAt),
    },
  ]

  return (
    <>
      <PlanHeader icon={BadgeCheck} badge={<Badge variant="success">Assinatura ativa</Badge>}>
        Painel, análise, checklist, documentos e chat IA enquanto a assinatura estiver ativa, por até{' '}
        {OFFER.recurring.maxCycles} meses.
      </PlanHeader>
      <PlanFacts facts={facts} />

      <div className="mt-5 space-y-3 border-t pt-5">
        <p className="text-sm text-muted-foreground [text-wrap:pretty]">
          No portal de pagamentos (Stripe) você pode cancelar, trocar o cartão e ver as faturas.
        </p>
        <Button
          className="w-full sm:w-auto"
          loading={portal.isPending}
          data-testid="settings-portal-btn"
          onClick={() => void portal.open('settings_plan')}
        >
          Gerenciar assinatura
          <ExternalLink aria-hidden="true" />
        </Button>
        <div aria-live="polite">
          {portal.error && (
            <p role="alert" className="flex items-start gap-2 text-sm font-medium text-destructive" data-testid="settings-portal-error">
              <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{portal.error}</span>
            </p>
          )}
        </div>
        <div className="text-sm text-muted-foreground [text-wrap:pretty]">
          <p>Se preferir, peça o cancelamento pelo suporte:</p>
          <a
            href={mailtoHref(SUPPORT_EMAIL, 'Cancelar assinatura')}
            className="inline-flex min-h-11 items-center break-all font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </>
  )
}

function PlanHeader({
  icon: Icon,
  badge,
  children,
}: {
  icon: typeof CreditCard
  badge: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[.08] text-primary"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <div data-testid="settings-plan-status">{badge}</div>
        <p className="text-base text-foreground [text-wrap:pretty]">{children}</p>
      </div>
    </div>
  )
}

type Fact = { label: string; value: string }

function PlanFacts({ facts }: { facts: Array<Fact | null | false | undefined> }) {
  const visible = facts.filter((fact): fact is Fact => !!fact)
  if (visible.length === 0) return null
  return (
    <dl className="mt-5 divide-y rounded-xl border">
      {visible.map((fact) => (
        <div key={fact.label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <dt className="text-sm text-muted-foreground">{fact.label}</dt>
          <dd className="text-base font-medium text-foreground sm:text-right">{fact.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ── Notificações ─────────────────────────────────────────────────────────────

function readPrefs(raw: unknown): { updates: boolean; offers: boolean } {
  const prefs = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    updates: typeof prefs.process_updates === 'boolean' ? prefs.process_updates : true,
    offers: typeof prefs.offers === 'boolean' ? prefs.offers : false,
  }
}

function NotificationsPanel() {
  const { authUser, refreshUser } = useAuth()
  const saved = readPrefs(authUser?.profile?.notification_preferences)
  const [updates, setUpdates] = useState(saved.updates)
  const [offers, setOffers] = useState(saved.offers)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setUpdates(saved.updates)
    setOffers(saved.offers)
  }, [saved.updates, saved.offers])

  const dirty = updates !== saved.updates || offers !== saved.offers

  const handleSave = async () => {
    if (!authUser?.profile || isSaving) return
    setIsSaving(true)
    try {
      const current =
        authUser.profile.notification_preferences &&
        typeof authUser.profile.notification_preferences === 'object' &&
        !Array.isArray(authUser.profile.notification_preferences)
          ? authUser.profile.notification_preferences
          : {}
      const { error } = await supabase
        .from('profiles')
        .update({
          notification_preferences: { ...current, process_updates: updates, offers },
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUser.user.id)
      if (error) throw error
      await refreshUser()
      toast.success('Preferências salvas.')
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível salvar. Tente de novo.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <PanelTitle>Notificações por e-mail</PanelTitle>
      <div className="divide-y">
        <SwitchRow
          label="Sua conta e sua análise"
          description="Avisos sobre o seu acesso e a sua análise."
          checked={updates}
          onChange={setUpdates}
        />
        <SwitchRow
          label="Novidades e dicas"
          description="Dicas sobre imigração e novidades do Doutor Imigrante."
          checked={offers}
          onChange={setOffers}
        />
      </div>
      <div className="mt-2 flex justify-end border-t pt-5">
        <Button loading={isSaving} disabled={!dirty || !authUser?.profile} className="w-full sm:w-auto" onClick={() => void handleSave()}>
          Salvar preferências
        </Button>
      </div>
    </Card>
  )
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  const id = useId()
  const descriptionId = `${id}-description`
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium text-foreground">
          {label}
        </label>
        <p id={descriptionId} className="text-sm text-muted-foreground [text-wrap:pretty]">
          {description}
        </p>
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={descriptionId}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-150',
          "before:absolute before:-inset-2 before:content-['']",
          'bg-input data-[state=checked]:bg-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <Switch.Thumb className="pointer-events-none block h-6 w-6 rounded-full bg-card shadow-[var(--shadow-sm)] transition-transform duration-150 data-[state=checked]:translate-x-5" />
      </Switch.Root>
    </div>
  )
}

// ── Segurança ────────────────────────────────────────────────────────────────

function SecurityPanel() {
  const [isSigningOut, setIsSigningOut] = useState(false)

  const signOutOthers = async () => {
    setIsSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' })
      if (error) throw error
      toast.success('Pronto. Os outros aparelhos vão precisar entrar de novo.')
    } catch (err) {
      toast.error(toUserMessage(err, 'Não foi possível desconectar os outros aparelhos. Tente de novo.'))
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <Card>
      <PanelTitle>Segurança</PanelTitle>
      <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
        <KeyRound aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-base text-foreground [text-wrap:pretty]">
          {EMAIL_CODE_ENABLED
            ? 'Você entra sem senha: enviamos um link ou um código de acesso para o seu e-mail.'
            : 'Você entra sem senha: enviamos um link de acesso para o seu e-mail.'}
        </p>
      </div>

      <div className="mt-6 border-t pt-5">
        <h3 className="font-semibold text-foreground">Sair dos outros aparelhos</h3>
        <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
          Use se você entrou num aparelho que não é seu ou perdeu o celular. Este aparelho continua conectado.
        </p>
        <Button
          variant="secondary"
          className="mt-4 w-full sm:w-auto"
          loading={isSigningOut}
          data-testid="settings-signout-others"
          onClick={() => void signOutOthers()}
        >
          Sair dos outros aparelhos
        </Button>
      </div>
    </Card>
  )
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-5 text-lg font-semibold text-foreground">{children}</h2>
}
