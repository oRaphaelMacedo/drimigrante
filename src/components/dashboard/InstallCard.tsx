/**
 * Convite discreto para instalar o app (DI-078).
 *
 * Só no dashboard, para quem já pagou e está com o acesso vigente (quem decide
 * é a página). Nunca na landing, no quiz nem no resultado.
 *
 * - Android/Chrome: "Instalar app" abre o prompt nativo do navegador.
 * - iOS (com login por código ligado): "Ver como instalar" abre um sheet com o
 *   passo a passo do Safari.
 * - "Agora não" esconde o convite por 30 dias neste aparelho.
 */
import { useEffect, useRef, useState } from 'react'
import { Share, Smartphone, PlusSquare, X } from 'lucide-react'
import { BottomSheet, Button, Card } from '@/components/ui'
import { usePwaInstall, type UsePwaInstallOptions } from '@/hooks/usePwaInstall'
import { track } from '@/lib/analytics'
import { cn } from '@/lib/utils'

export interface InstallCardProps extends UsePwaInstallOptions {
  className?: string
}

export function InstallCard({ className, ...options }: InstallCardProps) {
  const install = usePwaInstall(options)
  const [iosOpen, setIosOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const viewedRef = useRef(false)

  const visible = install.eligible
  useEffect(() => {
    if (!visible || viewedRef.current) return
    viewedRef.current = true
    track('pwa_install_card_viewed', { platform: install.platform })
  }, [visible, install.platform])

  if (!visible && !iosOpen) return null

  const openIosInstructions = () => {
    setIosOpen(true)
    track('pwa_ios_instructions_viewed')
  }

  const handleInstall = async () => {
    setBusy(true)
    try {
      await install.promptInstall()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {visible && (
        <Card
          variant="muted"
          role="region"
          aria-labelledby="install-card-title"
          data-testid="pwa-install-card"
          className={cn('flex items-start gap-3', className)}
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary"
          >
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="install-card-title" className="text-base font-semibold leading-snug text-foreground">
              Tenha o painel na tela inicial
            </h2>
            <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
              Volte à sua análise e aos seus documentos com um toque, como um app.
            </p>
            <div className="mt-3">
              {install.canPromptNative ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  data-testid="pwa-install-btn"
                  onClick={() => void handleInstall()}
                >
                  Instalar app
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-haspopup="dialog"
                  data-testid="pwa-ios-instructions-btn"
                  onClick={openIosInstructions}
                >
                  Ver como instalar
                </Button>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Agora não (esconder o convite)"
            className="-mr-2 -mt-2 text-muted-foreground"
            data-testid="pwa-install-dismiss"
            onClick={install.dismiss}
          >
            <X aria-hidden="true" />
          </Button>
        </Card>
      )}

      <BottomSheet
        open={iosOpen}
        onOpenChange={setIosOpen}
        title="Instalar no iPhone ou iPad"
        description="Leva menos de um minuto, pelo Safari."
        footer={
          <Button className="w-full" onClick={() => setIosOpen(false)}>
            Entendi
          </Button>
        }
      >
        <ol className="space-y-4" data-testid="pwa-ios-steps">
          <li className="flex items-start gap-3">
            <StepNumber n={1} />
            <p className="text-base text-foreground">
              Toque em <strong className="font-semibold">Compartilhar</strong>{' '}
              <Share aria-hidden="true" className="inline h-4 w-4 align-[-2px] text-primary" /> na barra do Safari.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <StepNumber n={2} />
            <p className="text-base text-foreground">
              Escolha <strong className="font-semibold">Adicionar à Tela de Início</strong>{' '}
              <PlusSquare aria-hidden="true" className="inline h-4 w-4 align-[-2px] text-primary" />.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <StepNumber n={3} />
            <p className="text-base text-foreground">
              Toque em <strong className="font-semibold">Adicionar</strong>. O ícone do Doutor Imigrante aparece na
              sua tela inicial.
            </p>
          </li>
        </ol>
        <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-foreground [text-wrap:pretty]">
          Na primeira vez que abrir o app, entre com o código de 6 dígitos que enviamos para o seu e-mail.
        </p>
      </BottomSheet>
    </>
  )
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/[.08] text-sm font-semibold text-primary"
    >
      {n}
    </span>
  )
}
