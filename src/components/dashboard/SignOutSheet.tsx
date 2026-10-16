/**
 * Confirmação de saída da conta (DI-045). Carregado sob demanda pelo
 * SignOutButton: o layout do dashboard faz parte do chunk de entrada, e o
 * sheet (Radix Dialog) e os toasts só são baixados quando a pessoa toca em "Sair".
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BottomSheet, Button } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export interface SignOutSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SignOutSheet({ open, onOpenChange }: SignOutSheetProps) {
  const { signOut, authUser } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const email = authUser?.user.email

  // O sheet é carregado sob demanda e montaria já aberto. Montar fechado e abrir
  // no efeito seguinte mantém a entrada do histórico (voltar fecha o sheet)
  // estável também no StrictMode, que monta, desmonta e remonta os efeitos.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    setVisible(open)
  }, [open])

  const handleConfirm = async () => {
    setPending(true)
    let signedOut = false
    try {
      await signOut()
      // Sem conexão, o supabase-js mantém a sessão: confere antes de dizer que saiu
      // (num aparelho compartilhado, "achar que saiu" é pior do que um erro).
      const { data } = await supabase.auth.getSession()
      signedOut = !data.session
    } catch {
      signedOut = false
    }
    setPending(false)
    if (!signedOut) {
      toast.error('Não foi possível sair', { description: 'Verifique sua conexão e tente de novo.' })
      return
    }
    // replace: o "voltar" não reabre o painel (nem o sheet) depois de sair.
    navigate('/', { replace: true })
  }

  return (
    <BottomSheet
      open={visible}
      onOpenChange={(next) => {
        if (pending) return
        setVisible(next)
        onOpenChange(next)
      }}
      title="Sair da conta?"
      description={
        email
          ? `Para entrar de novo, você vai receber um link de acesso em ${email}.`
          : 'Para entrar de novo, você vai receber um link de acesso no seu e-mail.'
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="w-full sm:w-auto" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="w-full sm:w-auto"
            loading={pending}
            onClick={() => void handleConfirm()}
            data-testid="sign-out-confirm"
          >
            Sair
          </Button>
        </div>
      }
    />
  )
}
