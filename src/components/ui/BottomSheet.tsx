import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const HISTORY_KEY = '__bottomSheet'

/**
 * Integra o sheet com o histórico: ao abrir empilha uma entrada (mesma URL) e o
 * "voltar" do navegador/Android fecha o sheet em vez de sair da página. Ao fechar
 * pela interface, remove a entrada empilhada (se ainda for a atual).
 */
function useCloseOnHistoryBack(open: boolean, onClose: () => void, enabled: boolean) {
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!open || !enabled || typeof window === 'undefined') return

    const marker = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const currentState: unknown = window.history.state
    const baseState = currentState && typeof currentState === 'object' ? currentState : {}
    // Preserva o estado do react-router (idx/key/usr) para ele tratar a entrada como a mesma rota.
    window.history.pushState({ ...baseState, [HISTORY_KEY]: marker }, '')

    let closedByHistory = false
    const isOurEntry = () => {
      const state: unknown = window.history.state
      return Boolean(state && typeof state === 'object' && (state as Record<string, unknown>)[HISTORY_KEY] === marker)
    }

    const handlePopState = () => {
      if (isOurEntry()) return
      closedByHistory = true
      onCloseRef.current()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      // Fechou pela interface (X, overlay, Esc ou estado controlado): desfaz a entrada.
      // Se a página já navegou para outra rota, a entrada atual não é a nossa e nada é feito.
      if (!closedByHistory && isOurEntry()) window.history.back()
    }
  }, [open, enabled])
}

export interface BottomSheetProps {
  /** Estado controlado de abertura. */
  open: boolean
  /** Chamado ao abrir/fechar (X, toque fora, Esc ou botão voltar do celular). */
  onOpenChange: (open: boolean) => void
  /** Título (obrigatório para leitores de tela). */
  title: React.ReactNode
  /** Descrição curta abaixo do título. */
  description?: React.ReactNode
  /** Esconde o título visualmente (continua acessível). */
  hideTitle?: boolean
  /** Elemento que abre o sheet (envolvido em `Dialog.Trigger` com asChild). */
  trigger?: React.ReactElement
  /** Ações fixas no rodapé (ex.: botão primário em largura total). */
  footer?: React.ReactNode
  /** Conteúdo rolável do sheet. */
  children?: React.ReactNode
  /** Classe extra do painel. */
  className?: string
  /**
   * Integração com o botão voltar (padrão: true). Desligue só se o sheet for
   * aberto/fechado por mudança de rota.
   */
  closeOnBack?: boolean
}

/**
 * Painel modal que sobe de baixo no celular e aparece centralizado no desktop
 * (Radix Dialog: foco preso, Esc fecha, rolagem do fundo bloqueada).
 *
 * - z-index 60 (acima das barras fixas, header e banner de cookies; abaixo dos toasts).
 * - Altura máxima de 90dvh com rolagem interna e respiro da safe-area.
 * - O "voltar" do Android/navegador fecha o sheet (history.pushState/popstate).
 *
 * @example
 * <BottomSheet
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="O que está incluído"
 *   footer={<Button variant="pay" className="w-full">Desbloquear por €30</Button>}
 * >
 *   ...
 * </BottomSheet>
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  trigger,
  footer,
  children,
  className,
  closeOnBack = true,
}: BottomSheetProps) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])
  useCloseOnHistoryBack(open, close, closeOnBack)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-[60] flex items-end justify-center bg-foreground/50 sm:items-center sm:p-6',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-[250ms]',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150',
          )}
        >
          <Dialog.Content
            className={cn(
              'relative flex max-h-[90dvh] w-full flex-col overflow-hidden bg-card text-card-foreground shadow-[var(--shadow-md)] focus:outline-none',
              'rounded-t-2xl sm:max-w-lg sm:rounded-2xl',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=open]:duration-[250ms] data-[state=open]:ease-[cubic-bezier(.25,1,.5,1)]',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=closed]:duration-150',
              'sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-bottom-4 sm:data-[state=closed]:zoom-out-95',
              className,
            )}
            {...(description ? {} : { 'aria-describedby': undefined })}
          >
            {/* Alça visual (decorativa) no celular */}
            <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>

            <div className="flex items-start gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-6">
              <div className="min-w-0 flex-1">
                <Dialog.Title
                  className={cn(
                    'text-lg font-semibold leading-snug text-foreground [text-wrap:balance]',
                    hideTitle && 'sr-only',
                  )}
                >
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close
                className={cn(
                  '-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground',
                  'transition-colors duration-150 hover:bg-muted hover:text-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6 sm:pb-6">
              {children}
            </div>

            {footer && (
              <div className="border-t bg-card px-5 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">
                {footer}
              </div>
            )}
            {!footer && <div className="h-[env(safe-area-inset-bottom)] shrink-0" aria-hidden="true" />}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
