/**
 * Confirmação da exclusão da conta (DI-083, LGPD/RGPD).
 *
 * Confirmação dupla: (1) o sheet explica o que é apagado e o que fica guardado;
 * (2) o botão final só habilita quando a pessoa digita o e-mail da conta. O
 * servidor (delete-account) confere o e-mail de novo.
 *
 * Depois de apagar: limpa os dados deste aparelho, encerra a sessão local e
 * volta para a página inicial (replace: o "voltar" não reabre o painel).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { BottomSheet, Button, Input } from '@/components/ui'
import { formatFullDate } from '@/components/dashboard/plan-summary'
import { PRIVACY_EMAIL, mailtoHref } from '@/config/contact'
import { useAuth } from '@/hooks/useAuth'
import { AccountPrivacyError, clearLocalAccountData, deleteMyAccount, emailsMatch } from '@/lib/account-privacy'
import { OFFER } from '@/lib/offer'
import { supabase } from '@/lib/supabase'

export interface DeleteAccountSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Baixar os dados antes de apagar (mesma ação da aba Privacidade). */
  onExport: () => void
  exportPending: boolean
}

export function DeleteAccountSheet({ open, onOpenChange, onExport, exportPending }: DeleteAccountSheetProps) {
  const { authUser, session, access } = useAuth()
  const navigate = useNavigate()
  const email = authUser?.user.email ?? session?.user.email ?? ''
  const userId = authUser?.user.id ?? session?.user.id ?? null
  const formId = useId()

  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)

  // O erro fica embaixo do campo, perto do rodapé fixo do sheet: traz para a vista.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [error])

  // Fechou: começa do zero na próxima vez.
  useEffect(() => {
    if (open) return
    setTyped('')
    setError(null)
  }, [open])

  const confirmed = emailsMatch(typed, email)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!confirmed || pending) return
    setPending(true)
    setError(null)
    try {
      await deleteMyAccount(typed)
    } catch (err) {
      setPending(false)
      setError(err instanceof AccountPrivacyError ? err.message : 'Não foi possível apagar a conta agora. Tente de novo.')
      return
    }
    clearLocalAccountData(userId)
    // O usuário já não existe no servidor: encerra só a sessão deste aparelho.
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // sem conexão/storage: a sessão local expira sozinha
    }
    toast.success('Sua conta foi apagada.', {
      description: 'Os seus dados foram removidos. Obrigado por ter usado o Doutor Imigrante.',
    })
    navigate('/', { replace: true })
  }

  const recurringActive = access.state === 'recurring'
  const oneTimeActive = (access.state === 'active' || access.state === 'expiring') && access.expiresAt

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
      }}
      title="Apagar sua conta?"
      description="É definitivo: depois de apagada, a conta não pode ser recuperada."
      footer={
        <>
          {!confirmed && (
            <p id={`${formId}-locked`} className="mb-2 text-center text-sm text-muted-foreground sm:text-right">
              Digite o e-mail da conta no campo acima para liberar o botão.
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" className="w-full sm:w-auto" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="destructive"
              className="w-full sm:w-auto"
              loading={pending}
              disabled={!confirmed}
              aria-describedby={confirmed ? undefined : `${formId}-locked`}
              data-testid="delete-account-confirm"
            >
              Apagar minha conta
            </Button>
          </div>
        </>
      }
    >
      <div className="space-y-5 text-base text-foreground">
        <section aria-labelledby={`${formId}-deleted`}>
          <h3 id={`${formId}-deleted`} className="font-semibold">
            O que será apagado
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground marker:text-muted-foreground">
            <li>Seu perfil: nome, e-mail e telefone.</li>
            <li>Seus diagnósticos, a análise e o checklist.</li>
            <li>As conversas com o chat IA.</li>
            <li>Os documentos que você enviou.</li>
            <li>Seu acesso ao painel.</li>
          </ul>
        </section>

        {recurringActive && (
          <p className="rounded-xl bg-muted p-4 [text-wrap:pretty]" data-testid="delete-account-recurring">
            Sua assinatura de {OFFER.recurring.priceLabel} é cancelada na hora e não haverá novas cobranças.
          </p>
        )}
        {!recurringActive && oneTimeActive && (
          <p className="rounded-xl bg-muted p-4 [text-wrap:pretty]" data-testid="delete-account-one-time">
            Você perde agora o acesso à análise e ao painel, que iria até {formatFullDate(access.expiresAt as Date)}.
          </p>
        )}

        <section aria-labelledby={`${formId}-kept`}>
          <h3 id={`${formId}-kept`} className="font-semibold">
            O que fica guardado
          </h3>
          <p className="mt-2 text-muted-foreground [text-wrap:pretty]">
            Se você fez algum pagamento, o registro dele (valor, data e identificadores do Stripe) continua guardado para
            cumprir obrigações fiscais e contábeis, sem ligação com o seu perfil.
          </p>
        </section>

        <p className="text-muted-foreground [text-wrap:pretty]">
          Quer uma cópia antes?{' '}
          <Button
            variant="link"
            size="sm"
            className="h-auto min-h-11 px-0 align-baseline"
            loading={exportPending}
            disabled={pending}
            onClick={onExport}
          >
            Baixar meus dados
          </Button>
        </p>

        <form id={formId} onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-3">
          <Input
            label={
              <>
                Para confirmar, digite <span className="break-all font-semibold">{email}</span>
              </>
            }
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            disabled={pending}
            onChange={(event) => {
              setTyped(event.target.value)
              if (error) setError(null)
            }}
            data-testid="delete-account-email"
          />
          <div aria-live="polite">
            {error && (
              <p
                ref={errorRef}
                role="alert"
                className="flex items-start gap-2 text-sm font-medium text-destructive"
                data-testid="delete-account-error"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="[text-wrap:pretty]">{error}</span>
              </p>
            )}
          </div>
        </form>

        <p className="text-sm text-muted-foreground [text-wrap:pretty]">
          Dúvidas sobre os seus dados?{' '}
          <a
            href={mailtoHref(PRIVACY_EMAIL, 'Pedido sobre meus dados')}
            className="inline-flex min-h-11 items-center break-all font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {PRIVACY_EMAIL}
          </a>
        </p>
      </div>
    </BottomSheet>
  )
}
