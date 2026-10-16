// AdminQuizHistoryPage.tsx — versões do quiz (snapshots automáticos) com restauração.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, History, Loader2, RotateCcw } from 'lucide-react'
import { useQuizVersions, useRestoreVersion, type QuizVersion } from '@/hooks/useQuizAdmin'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function AdminQuizHistoryPage() {
  const { data: versions = [], isLoading, error } = useQuizVersions()
  const restore = useRestoreVersion()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const actionProps = (v: QuizVersion) => ({
    version: v.version_number,
    isConfirming: confirmId === v.id,
    isRestoring: restore.isPending,
    onAskConfirm: () => setConfirmId(v.id),
    onCancelConfirm: () => setConfirmId(null),
    onRestore: () => restore.mutate(v.id, { onSettled: () => setConfirmId(null) }),
  })

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <Link
          to="/admin/quiz"
          className="-ml-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Voltar ao quiz
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Histórico de versões</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada edição cria automaticamente um snapshot. Você pode restaurar uma versão anterior a qualquer momento.
        </p>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center" role="status" aria-label="Carregando versões">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/[.08] p-4 text-sm text-destructive"
        >
          <AlertCircle aria-hidden="true" className="h-5 w-5 shrink-0" />
          {(error as Error).message}
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border bg-card px-4 py-16 text-center">
          <History aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-foreground/80">Ainda não há versões anteriores.</p>
          <p className="text-sm text-muted-foreground">A primeira edição vai criar um snapshot automático.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          {/* Celular: lista */}
          <ul className="divide-y md:hidden">
            {versions.map((v) => (
              <li key={v.id} className={cn('space-y-3 p-4', confirmId === v.id && 'bg-warning/[.08]')}>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    <span className="mr-2 font-mono text-xs text-foreground/80">v{v.version_number}</span>
                    {v.name ?? '—'}
                  </p>
                  {v.description && <p className="text-sm text-muted-foreground">{v.description}</p>}
                  <p className="text-xs text-muted-foreground">{dateTimeFormat.format(new Date(v.created_at))}</p>
                </div>
                <VersionActions {...actionProps(v)} align="start" />
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Versão</th>
                  <th scope="col" className="px-4 py-3 font-medium">Nome</th>
                  <th scope="col" className="px-4 py-3 font-medium">Criada em</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {versions.map((v) => (
                  <tr key={v.id} className={cn(confirmId === v.id && 'bg-warning/[.08]')}>
                    <td className="px-4 py-3 font-mono text-xs text-foreground/80">v{v.version_number}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{v.name ?? '—'}</div>
                      {v.description && <div className="text-xs text-muted-foreground">{v.description}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {dateTimeFormat.format(new Date(v.created_at))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VersionActions {...actionProps(v)} align="end" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function VersionActions({
  version,
  isConfirming,
  isRestoring,
  onAskConfirm,
  onCancelConfirm,
  onRestore,
  align,
}: {
  version: number
  isConfirming: boolean
  isRestoring: boolean
  onAskConfirm: () => void
  onCancelConfirm: () => void
  onRestore: () => void
  align: 'start' | 'end'
}) {
  if (!isConfirming) {
    return (
      <Button variant="secondary" size="sm" onClick={onAskConfirm} aria-label={`Restaurar v${version}`}>
        <RotateCcw aria-hidden="true" />
        Restaurar
      </Button>
    )
  }
  return (
    <div
      role="group"
      aria-label={`Confirmar restauração da v${version}`}
      className={cn('flex flex-wrap items-center gap-2', align === 'end' ? 'justify-end' : 'justify-start')}
    >
      <span className="text-sm font-medium text-warning">Tem certeza?</span>
      <Button variant="ghost" size="sm" onClick={onCancelConfirm} disabled={isRestoring}>
        Cancelar
      </Button>
      <Button variant="destructive" size="sm" onClick={onRestore} loading={isRestoring}>
        {!isRestoring && <RotateCcw aria-hidden="true" />}
        Restaurar
      </Button>
    </div>
  )
}
