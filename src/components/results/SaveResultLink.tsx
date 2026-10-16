// SaveResultLink.tsx — "Guardar meu resultado" (DI-024).
//
// Copia o link /results?r=<token>, que abre este resultado em outro aparelho.
// Sem token (migration ainda não aplicada ou diagnóstico não salvo), não aparece.
// O token é um segredo do portador: nada dele vai para o analytics.
import { useRef, useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import { track } from '@/lib/analytics'
import { buildResumeUrl } from '@/lib/resume-token'
import { Button } from '@/components/ui'

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // segue para o método antigo
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

type CopyState = 'idle' | 'copied' | 'manual'

export function SaveResultLink({ token }: { token: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const url = buildResumeUrl(token, window.location.origin)

  const handleCopy = async () => {
    track('share_clicked', { method: 'copy_link', placement: 'results' })
    const ok = await copyText(url)
    setState(ok ? 'copied' : 'manual')
    if (!ok) window.setTimeout(() => inputRef.current?.select(), 0)
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center" data-testid="results-save-link">
      <Button variant="secondary" size="md" onClick={() => void handleCopy()} className="w-full sm:w-auto">
        {state === 'copied' ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        {state === 'copied' ? 'Link copiado' : 'Guardar meu resultado'}
      </Button>
      <p role="status" className="max-w-sm text-sm text-muted-foreground">
        {state === 'copied'
          ? 'Guarde o link para abrir este resultado em outro aparelho. Ele mostra suas respostas: não compartilhe.'
          : state === 'manual'
            ? 'Copie o link abaixo para abrir este resultado em outro aparelho. Ele mostra suas respostas: não compartilhe.'
            : 'Copia um link para abrir este resultado em outro aparelho.'}
      </p>
      {state === 'manual' && (
        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="Link do seu resultado"
          onFocus={(event) => event.currentTarget.select()}
          className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground"
        />
      )}
    </div>
  )
}
