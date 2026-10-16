// AccessEmail.tsx — "Seu acesso será criado para: …  Alterar" (DI-031).
//
// O e-mail do quiz vira o login da conta depois do pagamento. Aqui ele aparece
// acima do botão de compra e pode ser corrigido em linha (campo de 16px,
// validação com zod), com sugestão de correção do domínio ("gmial.com" →
// "gmail.com"). Quem grava é o `onSave` da ResultsPage (localStorage + diagnóstico).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { CheckCircle2, Pencil, Wand2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { sameEmail, validateAccessEmail, type UpdateAccessEmailResult } from '@/lib/access-email'
import { suggestEmailCorrection } from '@/lib/email-typo'

export interface AccessEmailProps {
  email: string
  /** `false` quando a compra é com a conta já logada (o e-mail é o da conta). */
  editable: boolean
  onSave: (email: string, source: 'manual' | 'suggestion') => Promise<UpdateAccessEmailResult>
}

type Notice = { tone: 'ok' | 'error'; text: string } | null

const RESULT_NOTICE: Record<UpdateAccessEmailResult, Notice> = {
  saved: { tone: 'ok', text: 'E-mail atualizado. O acesso será criado para este endereço.' },
  saved_locally: { tone: 'ok', text: 'E-mail atualizado neste aparelho. O acesso será criado para este endereço.' },
  linked: {
    tone: 'error',
    text: 'Este diagnóstico já está ligado a uma conta. Entre com o e-mail usado no quiz para continuar.',
  },
  unavailable: { tone: 'error', text: 'Não conseguimos alterar o e-mail neste aparelho. Tente de novo.' },
}

export function AccessEmail({ email, editable, onSave }: AccessEmailProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(email)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(false)
  const hintId = useId()

  // Sugestão para o e-mail salvo (vale avisar mesmo sem abrir a edição).
  const savedSuggestion = editable ? suggestEmailCorrection(email) : null
  const draftSuggestion = editing ? suggestEmailCorrection(draft) : null

  useEffect(() => {
    if (editing) inputRef.current?.focus()
    else if (restoreFocusRef.current) {
      restoreFocusRef.current = false
      editButtonRef.current?.focus()
    }
  }, [editing])

  const startEditing = () => {
    setDraft(email)
    setError(null)
    setNotice(null)
    setEditing(true)
  }

  const cancel = () => {
    restoreFocusRef.current = true
    setEditing(false)
    setError(null)
  }

  const save = async (value: string, source: 'manual' | 'suggestion') => {
    const checked = validateAccessEmail(value)
    if (!checked.ok) {
      setError(checked.message)
      inputRef.current?.focus()
      return
    }
    if (sameEmail(checked.email, email)) {
      restoreFocusRef.current = true
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await onSave(checked.email, source)
      setNotice(RESULT_NOTICE[result])
      if (result === 'saved' || result === 'saved_locally' || result === 'linked') {
        restoreFocusRef.current = true
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void save(draft, 'manual')
  }

  if (!editable) {
    return (
      <p className="mb-4 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
        Compra na sua conta: <strong className="font-semibold text-foreground [overflow-wrap:anywhere]">{email}</strong>
      </p>
    )
  }

  return (
    <div className="mb-4 rounded-xl border border-border bg-card p-3" data-testid="results-access-email">
      {editing ? (
        <form onSubmit={handleSubmit} noValidate>
          <Input
            ref={inputRef}
            label="E-mail de acesso"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') cancel()
            }}
            hint="É com ele que você vai entrar no painel depois do pagamento."
            error={error ?? undefined}
            data-testid="results-access-email-input"
          />
          {draftSuggestion && <SuggestionButton suggestion={draftSuggestion} onUse={() => setDraft(draftSuggestion)} />}
          <div className="mt-3 flex gap-2">
            <Button type="submit" variant="secondary" size="sm" className="flex-1" loading={saving}>
              Salvar e-mail
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="-mt-1 flex items-center justify-between gap-2">
            <p id={hintId} className="text-sm text-muted-foreground">
              Seu acesso será criado para
            </p>
            <Button
              ref={editButtonRef}
              variant="ghost"
              size="sm"
              onClick={startEditing}
              aria-describedby={hintId}
              data-testid="results-access-email-edit"
              className="-mr-1.5 shrink-0 px-2.5 text-primary"
            >
              <Pencil aria-hidden="true" />
              Alterar
            </Button>
          </div>
          {/* Linha inteira para o e-mail: no celular ele não quebra no meio do endereço à toa. */}
          <strong className="block text-base font-semibold text-foreground [overflow-wrap:anywhere]">{email}</strong>
          {savedSuggestion && (
            <SuggestionButton
              suggestion={savedSuggestion}
              disabled={saving}
              onUse={() => void save(savedSuggestion, 'suggestion')}
            />
          )}
        </>
      )}
      {notice && !editing && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={
            notice.tone === 'error'
              ? 'mt-2 text-sm font-medium text-destructive'
              : 'mt-2 flex items-start gap-1.5 text-sm text-[hsl(var(--success))]'
          }
        >
          {notice.tone === 'ok' && <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{notice.text}</span>
        </p>
      )}
    </div>
  )
}

function SuggestionButton({
  suggestion,
  onUse,
  disabled,
}: {
  suggestion: string
  onUse: () => void
  disabled?: boolean
}) {
  const domain = suggestion.slice(suggestion.lastIndexOf('@') + 1)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[hsl(var(--warning)/0.08)] px-3 py-2 text-sm text-foreground">
      <Wand2 aria-hidden="true" className="h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        Você quis dizer <strong className="font-semibold">@{domain}</strong>?
      </span>
      <Button
        variant="link"
        size="sm"
        onClick={onUse}
        disabled={disabled}
        className="min-h-10 px-1"
        data-testid="results-access-email-suggestion"
        aria-label={`Usar o e-mail ${suggestion}`}
      >
        Usar este
      </Button>
    </div>
  )
}
