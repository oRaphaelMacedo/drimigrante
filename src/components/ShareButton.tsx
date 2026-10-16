// ShareButton.tsx — "Compartilhar com a família" (DI-053).
//
// Ordem dos canais: folha de partilha nativa (navigator.share, Android/iOS) →
// WhatsApp (wa.me) → copiar o link. Sem navigator.share (desktop, navegadores
// embutidos) ou quando ela falha, o botão mostra as duas opções logo abaixo.
//
// O link leva ao quiz grátis com utm_source=share (src/lib/share.ts): nada de
// nome, e-mail, ids ou score. O analytics recebe só o canal e o lugar.
import { useId, useRef, useState } from 'react'
import { Check, Copy, MessageCircle, Share2 } from 'lucide-react'
import { track } from '@/lib/analytics'
import {
  SHARE_TEXT,
  SHARE_TITLE,
  buildShareUrl,
  buildWhatsAppUrl,
  canUseNativeShare,
  copyToClipboard,
  isShareAbort,
  type ShareMethod,
} from '@/lib/share'
import { Button, type ButtonProps } from '@/components/ui'
import { cn } from '@/lib/utils'

export interface ShareButtonProps {
  /** Onde o botão está (vai para o evento e para utm_campaign). Ex.: 'results', 'analysis'. */
  placement: string
  /** Texto do botão. */
  label?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}

type CopyState = 'idle' | 'copied' | 'manual'

const COPY_MESSAGE: Record<CopyState, string> = {
  idle: '',
  copied: 'Link copiado. Cole na conversa com a sua família.',
  manual: 'Não deu para copiar automaticamente. Copie o link abaixo.',
}

function currentOrigin(): string {
  try {
    return window.location.origin
  } catch {
    return ''
  }
}

export function ShareButton({
  placement,
  label = 'Compartilhar com a família',
  variant = 'secondary',
  size = 'md',
  className,
}: ShareButtonProps) {
  const optionsId = useId()
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const nativeShare = canUseNativeShare()

  const urlFor = (method: ShareMethod) => buildShareUrl(currentOrigin(), { method, placement })
  const copyUrl = urlFor('copy_link')

  const handleShare = async () => {
    if (!nativeShare) {
      setOptionsOpen((open) => !open)
      return
    }
    track('share_clicked', { method: 'native', placement })
    try {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: urlFor('native') })
    } catch (error) {
      // Fechou a folha sem escolher um app: nada a fazer. Outro erro (ex.:
      // navegador que recusa a partilha): mostra WhatsApp e copiar.
      if (!isShareAbort(error)) setOptionsOpen(true)
    }
  }

  const handleCopy = async () => {
    track('share_clicked', { method: 'copy_link', placement })
    const ok = await copyToClipboard(copyUrl)
    setCopyState(ok ? 'copied' : 'manual')
    if (!ok) window.setTimeout(() => inputRef.current?.select(), 0)
  }

  return (
    <div className={cn('flex w-full flex-col items-stretch gap-3 sm:items-center', className)} data-testid="share">
      <Button
        variant={variant}
        size={size}
        onClick={() => void handleShare()}
        aria-expanded={nativeShare ? undefined : optionsOpen}
        aria-controls={nativeShare ? undefined : optionsId}
        className="w-full sm:w-auto"
        data-testid="share-button"
      >
        <Share2 aria-hidden="true" />
        {label}
      </Button>

      <div id={optionsId} hidden={!optionsOpen} className="w-full" data-testid="share-options">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="secondary" size="md" className="w-full sm:w-auto">
            <a
              href={buildWhatsAppUrl(urlFor('whatsapp'))}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('share_clicked', { method: 'whatsapp', placement })}
              data-testid="share-whatsapp"
            >
              <MessageCircle aria-hidden="true" />
              Enviar pelo WhatsApp
            </a>
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={() => void handleCopy()}
            className="w-full sm:w-auto"
            data-testid="share-copy"
          >
            {copyState === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copyState === 'copied' ? 'Link copiado' : 'Copiar link'}
          </Button>
        </div>
        {copyState !== 'idle' && (
          <p aria-hidden="true" className="mt-2 text-center text-sm text-muted-foreground">
            {COPY_MESSAGE[copyState]}
          </p>
        )}
        {copyState === 'manual' && (
          <input
            ref={inputRef}
            readOnly
            value={copyUrl}
            aria-label="Link do diagnóstico gratuito"
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground"
            data-testid="share-manual-link"
          />
        )}
      </div>
      {/* Região sempre presente: o leitor de tela anuncia o resultado da cópia. */}
      <p role="status" className="sr-only">
        {COPY_MESSAGE[copyState]}
      </p>
    </div>
  )
}

export interface ShareWithFamilyProps {
  placement: string
  className?: string
}

/**
 * Bloco "compartilhe com a família": título, aviso de privacidade e o
 * ShareButton. Ação secundária (a primária da tela continua sendo outra).
 */
export function ShareWithFamily({ placement, className }: ShareWithFamilyProps) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={cn('rounded-lg bg-muted p-5 text-center sm:p-6', className)}
      data-testid="share-with-family"
    >
      <h2 id={titleId} className="text-h3 font-semibold text-foreground">
        Alguém da família também pensa na nacionalidade?
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        Envie o diagnóstico gratuito. O link abre o quiz do início: seu resultado e seus dados não vão junto.
      </p>
      <ShareButton placement={placement} className="mt-4" />
    </section>
  )
}
