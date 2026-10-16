/**
 * Sair da conta com confirmação (DI-045).
 *
 * Voltar exige um novo link de acesso por e-mail, então sair nunca acontece
 * com um toque acidental: o botão abre um sheet de confirmação. O sheet é
 * carregado só no primeiro toque (fica fora do chunk de entrada).
 */
import { lazy, Suspense, useState } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const loadSheet = () => import('./SignOutSheet')
const SignOutSheet = lazy(() => loadSheet().then((m) => ({ default: m.SignOutSheet })))

export interface SignOutButtonProps {
  /** `icon`: botão só com ícone (44×44, barra lateral). `block`: botão com rótulo. */
  variant?: 'icon' | 'block'
  className?: string
}

export function SignOutButton({ variant = 'block', className }: SignOutButtonProps) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const handleOpen = () => {
    setMounted(true)
    setOpen(true)
  }
  // Adianta o download quando o dedo/mouse chega no botão.
  const preload = () => {
    void loadSheet().catch(() => undefined)
  }

  return (
    <>
      {variant === 'icon' ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sair da conta"
          aria-haspopup="dialog"
          title="Sair da conta"
          className={cn('text-muted-foreground', className)}
          data-testid="sign-out-open"
          onPointerEnter={preload}
          onFocus={preload}
          onClick={handleOpen}
        >
          <LogOut aria-hidden="true" />
        </Button>
      ) : (
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          className={cn('w-full sm:w-auto', className)}
          data-testid="sign-out-open"
          onPointerEnter={preload}
          onFocus={preload}
          onClick={handleOpen}
        >
          <LogOut aria-hidden="true" />
          Sair da conta
        </Button>
      )}
      {mounted && (
        <Suspense fallback={null}>
          <SignOutSheet open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}
