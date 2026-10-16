import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const HISTORY_KEY = '__adminDrawer'

const markerOf = (state: unknown) =>
  state && typeof state === 'object' ? (state as Record<string, unknown>)[HISTORY_KEY] : undefined

/**
 * `history.back()` disparado ao fechar um painel e ainda não concluído. O
 * próximo painel só empilha a sua entrada depois dele: senão o `popstate`
 * atrasado fecharia o painel recém-aberto (ex.: fechar e abrir outro tema em
 * seguida, ou a montagem dupla do StrictMode, já que os editores montam abertos).
 */
let pendingBack: Promise<void> | null = null

function goBack(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('popstate', done)
      window.clearTimeout(fallback)
      pendingBack = null
      resolve()
    }
    // Rede de segurança: se o navegador não emitir o popstate, não trava o próximo painel.
    const fallback = window.setTimeout(done, 1000)
    window.addEventListener('popstate', done)
    window.history.back()
  })
}

/**
 * "Voltar" do navegador/Android fecha o painel em vez de sair da página: ao abrir
 * empilha uma entrada (mesma URL, preservando o estado do react-router) e o
 * `popstate` fecha. Ao fechar pela interface, desfaz a entrada se ela ainda for a
 * atual. Mesma ideia do BottomSheet (src/components/ui/BottomSheet.tsx), mais a
 * fila de `pendingBack`, porque os editores montam já abertos.
 */
function useCloseOnHistoryBack(open: boolean, onClose: () => void, enabled: boolean) {
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    if (!open || !enabled || typeof window === 'undefined') return

    const marker = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const isOurEntry = () => markerOf(window.history.state) === marker
    let active = true
    let pushed = false
    let closedByHistory = false

    const handlePopState = () => {
      if (isOurEntry()) return
      closedByHistory = true
      onCloseRef.current()
    }

    const start = () => {
      if (!active) return
      const currentState: unknown = window.history.state
      const baseState = currentState && typeof currentState === 'object' ? currentState : {}
      const nextState = { ...baseState, [HISTORY_KEY]: marker }
      // Entrada órfã de um painel anterior (ex.: depois de "avançar"): reaproveita.
      if (markerOf(currentState)) window.history.replaceState(nextState, '')
      else window.history.pushState(nextState, '')
      pushed = true
      window.addEventListener('popstate', handlePopState)
    }

    if (pendingBack) void pendingBack.then(start)
    else start()

    return () => {
      active = false
      if (!pushed) return
      window.removeEventListener('popstate', handlePopState)
      // Fechou pela interface (X, overlay, Esc, Cancelar, Salvar): desfaz a entrada.
      if (!closedByHistory && isOurEntry()) pendingBack = goBack()
    }
  }, [open, enabled])
}

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
  /**
   * O "voltar" do navegador/Android fecha o painel (padrão: false). Ligue nos
   * editores, para o "voltar" não sair da página e perder o que foi digitado.
   * O menu do admin deixa desligado: ele navega entre rotas.
   */
  closeOnBack?: boolean
}

/**
 * Painel lateral do admin (Radix Dialog: foco preso, Esc fecha, rolagem do fundo
 * bloqueada, foco volta ao botão que abriu). Usado pelo menu do admin no celular
 * e pelo editor de temas do quiz.
 *
 * - z-index 60 (camada de sheets), acima do header e do banner de cookies.
 * - Altura 100dvh com rolagem interna e respiro das safe-areas.
 * - Por padrão não empilha entrada no histórico: o menu navega entre rotas, e
 *   uma entrada extra faria o "voltar" repetir a página. Os editores ligam
 *   `closeOnBack` (padrão do BottomSheet).
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
  closeOnBack = false,
}: AdminDrawerProps) {
  const close = React.useCallback(() => onOpenChange(false), [onOpenChange])
  useCloseOnHistoryBack(open, close, closeOnBack)

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
