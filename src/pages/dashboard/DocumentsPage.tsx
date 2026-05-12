// DocumentsPage.tsx — Upload real via Supabase Storage + user_documents table
import { useRef } from 'react'
import { FileUp, FileText, CheckCircle2, Clock, AlertCircle, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult } from '@/hooks/useAssessmentResult'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocStatus = 'uploaded' | 'reviewing' | 'verified' | 'rejected'

interface UserDocument {
  id: string
  document_type: string
  display_name: string
  file_name: string
  storage_path: string
  file_size: number | null
  status: DocStatus
  feedback: string | null
  created_at: string
}

// ─── Required docs per visa type ─────────────────────────────────────────────

const REQUIRED_DOCS: Array<{ type: string; label: string; description: string }> = [
  { type: 'passaporte', label: 'Passaporte', description: 'Cópia colorida de todas as páginas (incluindo em branco).' },
  { type: 'registo_criminal', label: 'Registo Criminal', description: 'Certificado do país de residência actual, apostilado.' },
  { type: 'comprovativo_morada', label: 'Comprovativo de Morada', description: 'Fatura de água, luz ou internet dos últimos 3 meses.' },
  { type: 'assento_nascimento', label: 'Assento de Nascimento', description: 'Certidão de nascimento apostilada e traduzida (se necessário).' },
  { type: 'documento_parentes', label: 'Doc. Parentes Portugueses', description: 'Assento de nascimento ou naturalização do familiar português.' },
]

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useDocuments(userId: string | undefined, _assessmentId: string | null) {
  return useQuery<UserDocument[]>({
    queryKey: ['user-documents', userId],
    queryFn: async () => {
      // user_documents is a new table not yet in generated types — cast via any
      const { data, error } = await (supabase as any)
        .from('user_documents')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as UserDocument[]
    },
    enabled: !!userId,
    staleTime: 30_000,
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DocumentsPage() {
  const { authUser } = useAuth()
  const { result: assessmentResult } = useAssessmentResult()
  const queryClient = useQueryClient()
  const userId = authUser?.user.id
  const assessmentId = assessmentResult?.assessmentId || null

  const { data: uploadedDocs = [], isLoading } = useDocuments(userId, assessmentId)

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ file, docType, docLabel }: { file: File; docType: string; docLabel: string }) => {
      if (!userId) throw new Error('Não autenticado')

      const ext = file.name.split('.').pop()
      const storagePath = `${userId}/${assessmentId ?? 'general'}/${docType}/${Date.now()}.${ext}`

      // 1. Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from('user-documents')
        .upload(storagePath, file, { upsert: true, contentType: file.type })
      if (uploadErr) throw uploadErr

      // 2. Record in user_documents table (new table, cast via any)
      const { error: dbErr } = await (supabase as any).from('user_documents').insert({
        user_id: userId,
        assessment_id: assessmentId,
        document_type: docType,
        display_name: docLabel,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        status: 'uploaded',
      })
      if (dbErr) throw dbErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-documents', userId] })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (doc: UserDocument) => {
      // Remove from storage
      await supabase.storage.from('user-documents').remove([doc.storage_path])
      // Remove from DB
      const { error } = await (supabase as any).from('user_documents').delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-documents', userId] })
      toast.success('Documento removido.')
    },
  })

  const handleUpload = (docType: string, docLabel: string, file: File) => {
    toast.promise(
      uploadMutation.mutateAsync({ file, docType, docLabel }),
      {
        loading: `A enviar ${file.name}…`,
        success: 'Documento enviado com sucesso!',
        error: (err) => `Erro: ${(err as Error).message}`,
      }
    )
  }

  // Merge required docs with uploaded ones
  const docList = REQUIRED_DOCS.map((req) => {
    const uploaded = uploadedDocs.find((u) => u.document_type === req.type)
    return { ...req, uploaded: uploaded ?? null }
  })

  const verifiedCount = uploadedDocs.filter((d) => d.status === 'verified').length
  const uploadedCount = uploadedDocs.length

  return (
    <div className="mx-auto max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Meus Documentos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Carregue os documentos necessários para a sua candidatura.
          </p>
        </div>
        {uploadedCount > 0 && (
          <div className="text-right">
            <p className="text-xs font-medium text-gray-500">Verificados</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${(verifiedCount / REQUIRED_DOCS.length) * 100}%` }}
                />
              </div>
              <span className="text-sm font-bold text-emerald-600">
                {verifiedCount}/{REQUIRED_DOCS.length}
              </span>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <div className="grid gap-4">
          {docList.map((doc) => (
            <DocRow
              key={doc.type}
              doc={doc}
              onUpload={(file) => handleUpload(doc.type, doc.label, file)}
              onDelete={doc.uploaded ? () => deleteMutation.mutate(doc.uploaded!) : undefined}
              isDeleting={deleteMutation.isPending}
            />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-400">
        Formatos aceites: PDF, JPG, PNG · Tamanho máximo: 10 MB por ficheiro
      </p>
    </div>
  )
}

// ─── DocRow ───────────────────────────────────────────────────────────────────

function DocRow({
  doc,
  onUpload,
  onDelete,
  isDeleting,
}: {
  doc: { type: string; label: string; description: string; uploaded: UserDocument | null }
  onUpload: (file: File) => void
  onDelete?: () => void
  isDeleting: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { uploaded } = doc
  const status: DocStatus | 'pending' = uploaded?.status ?? 'pending'

  const statusConfig = {
    pending:    { icon: FileText,    bg: 'bg-gray-100',    iconColor: 'text-gray-400',   badge: null },
    uploaded:   { icon: Clock,       bg: 'bg-yellow-50',   iconColor: 'text-yellow-500', badge: { label: 'Em Análise',  cls: 'bg-yellow-100 text-yellow-700' } },
    reviewing:  { icon: Clock,       bg: 'bg-blue-50',     iconColor: 'text-blue-500',   badge: { label: 'Em Revisão',  cls: 'bg-blue-100 text-blue-700' } },
    verified:   { icon: CheckCircle2, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', badge: { label: 'Verificado', cls: 'bg-emerald-100 text-emerald-700' } },
    rejected:   { icon: AlertCircle, bg: 'bg-red-50',      iconColor: 'text-red-500',    badge: { label: 'Rejeitado',   cls: 'bg-red-100 text-red-700' } },
  }[status]

  const Icon = statusConfig.icon
  const canUpload = status === 'pending' || status === 'rejected'
  const canDelete = status === 'uploaded' || status === 'reviewing'

  return (
    <div className={`rounded-2xl border bg-white p-5 transition-shadow hover:shadow-sm ${
      status === 'rejected' ? 'border-red-200 bg-red-50/20' : 'border-gray-100'
    }`}>
      <div className="flex items-start gap-4 sm:items-center">
        {/* Icon */}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${statusConfig.bg}`}>
          <Icon className={`h-5 w-5 ${statusConfig.iconColor}`} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-gray-900">{doc.label}</h3>
            {statusConfig.badge && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusConfig.badge.cls}`}>
                {statusConfig.badge.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-sm text-gray-500 sm:line-clamp-1">{doc.description}</p>

          {status === 'rejected' && uploaded?.feedback && (
            <p className="mt-2 inline-block rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-sm text-red-600">
              <strong>Motivo:</strong> {uploaded.feedback}
            </p>
          )}

          {uploaded && status !== 'pending' && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-400">
              <FileUp className="h-3 w-3" />
              {uploaded.file_name}
              {uploaded.file_size && (
                <span className="text-gray-300">
                  · {(uploaded.file_size / 1024).toFixed(0)} KB
                </span>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {canUpload && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUpload(file)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100"
              >
                <FileUp className="h-4 w-4" />
                Enviar
              </button>
            </>
          )}

          {canDelete && onDelete && (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
              title="Remover"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
