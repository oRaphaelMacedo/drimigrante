import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AdminDrawerProps {
  /** Estado controlado de abertura. */
  open: boolean
  /** Chamado ao abrir/fechar (X, toque fora ou Esc). */
  onOpenChange: (open: boolean) => void
  /** Título (obrigatório para leitores de tela). */
  title: React.ReactNode
  /** Linha de apoio abaixo do título. */
  description?: React.ReactNode
  /** Esconde o título visualmente (continua acessível). */
  hideTitle?: boolean
  /** Lado de onde o painel entra: menu à esquerda, editores à direita. */
  side?: 'left' | 'right'
  /** Ações fixas no rodapé. */
  footer?: React.ReactNode
  /** Conteúdo rolável. */
  children?: React.ReactNode
  /** Classe extra do painel (ex.: largura). */
  className?: string
  /** id do painel (para `aria-controls` do botão que o abre). */
  id?: string
}

/**
 * Painel lateral do admin (Radix Dialog: foco preso, Esc fecha, rolagem do fundo
 * bloqueada, foco volta ao botão que abriu). Usado pelo menu do admin no celular
 * e pelo editor de temas do quiz.
 *
 * - z-index 60 (camada de sheets), acima do header e do banner de cookies.
 * - Altura 100dvh com rolagem interna e respiro das safe-areas.
 * - Diferente do BottomSheet, não empilha entrada no histórico: o menu navega
 *   entre rotas, e uma entrada extra faria o "voltar" repetir a página.
 */
export function AdminDrawer({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  side = 'right',
  footer,
  children,
  className,
  id,
}: AdminDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-[60] bg-foreground/50',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-base',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150',
          )}
        />
        <Dialog.Content
          id={id}
          className={cn(
            'fixed inset-y-0 z-[60] flex h-dvh w-full max-w-md flex-col overflow-hidden bg-card text-card-foreground shadow-lg focus:outline-none',
            'pt-[env(safe-area-inset-top)]',
            side === 'left'
              ? 'left-0 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left'
              : 'right-0 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
            'data-[state=open]:animate-in data-[state=open]:duration-base data-[state=open]:ease-out',
            'data-[state=closed]:animate-out data-[state=closed]:duration-150',
            className,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex shrink-0 items-start gap-3 border-b px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1 py-1.5">
              <Dialog.Title
                className={cn('text-base font-semibold leading-snug text-foreground', hideTitle && 'sr-only')}
              >
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-0.5 text-sm text-muted-foreground">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className={cn(
                '-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground',
                'transition-colors duration-150 hover:bg-muted hover:text-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              aria-label="Fechar"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

          {footer ? (
            <div className="shrink-0 border-t bg-muted px-4 pt-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:px-6">
              {footer}
            </div>
          ) : (
            <div className="h-[env(safe-area-inset-bottom)] shrink-0" aria-hidden="true" />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
