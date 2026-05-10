// AdminQuizHistoryPage.tsx — Phase 4: list of quiz versions with revert action.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Loader2, History, AlertCircle } from 'lucide-react'
import { useQuizVersions, useRestoreVersion, type QuizVersion } from '@/hooks/useQuizAdmin'
import { cn } from '@/lib/utils'

export function AdminQuizHistoryPage() {
  const { data: versions = [], isLoading, error } = useQuizVersions()
  const restore = useRestoreVersion()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link
            to="/admin/quiz"
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Quiz
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Histórico de Versões</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cada edição cria automaticamente um snapshot. Pode reverter a qualquer momento.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {(error as Error).message}
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <History className="h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">Sem versões anteriores ainda.</p>
          <p className="text-xs text-gray-400">A primeira edição irá criar um snapshot automático.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Versão</th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Criada em</th>
                <th className="px-4 py-3 font-medium text-right">Acções</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {versions.map((v) => (
                <Row
                  key={v.id}
                  v={v}
                  isConfirming={confirmId === v.id}
                  isRestoring={restore.isPending}
                  onAskConfirm={() => setConfirmId(v.id)}
                  onCancelConfirm={() => setConfirmId(null)}
                  onRestore={() => {
                    restore.mutate(v.id, { onSettled: () => setConfirmId(null) })
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Row({
  v,
  isConfirming,
  isRestoring,
  onAskConfirm,
  onCancelConfirm,
  onRestore,
}: {
  v: QuizVersion
  isConfirming: boolean
  isRestoring: boolean
  onAskConfirm: () => void
  onCancelConfirm: () => void
  onRestore: () => void
}) {
  return (
    <tr className={cn(isConfirming && 'bg-amber-50/50')}>
      <td className="px-4 py-3 font-mono text-xs text-gray-600">v{v.version_number}</td>
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">{v.name ?? '—'}</div>
        {v.description && <div className="text-xs text-gray-500">{v.description}</div>}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(v.created_at).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
      </td>
      <td className="px-4 py-3 text-right">
        {isConfirming ? (
          <div className="flex items-center justify-end gap-2">
            <span className="text-xs text-amber-700">Tem a certeza?</span>
            <button
              onClick={onCancelConfirm}
              className="rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              onClick={onRestore}
              disabled={isRestoring}
              className="flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50"
            >
              {isRestoring ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Restaurar
            </button>
          </div>
        ) : (
          <button
            onClick={onAskConfirm}
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <RotateCcw className="h-3 w-3" />
            Restaurar
          </button>
        )}
      </td>
    </tr>
  )
}
