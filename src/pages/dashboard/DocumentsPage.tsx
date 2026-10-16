/**
 * Documentos — checklist do caminho + envio de arquivos (DI-049, DI-071).
 *
 * - A lista vem do caminho identificado no diagnóstico (useChecklist, a partir
 *   de src/data/nationality-paths.ts). Sem lista confirmada pelo dono, entra a
 *   lista genérica e neutra, com aviso de que os requisitos estão na análise.
 * - Cada item: "Já tenho" (guardado neste aparelho) ou o envio do arquivo
 *   (vira "Enviado"). Vários arquivos por item (ex.: uma foto por página).
 * - Validação no cliente antes de qualquer requisição: até 10 MB, PDF/JPG/PNG.
 * - Remover sempre pede confirmação. Spinner só na linha que está enviando.
 * - Status honesto: o arquivo recebido aparece como "Recebido" (ninguém
 *   promete análise do documento); "Conferido"/"Precisa de novo envio" só
 *   quando a equipe marca.
 * - Acesso expirado: continua listando, baixando e apagando (documents_read),
 *   sem novos envios (documents_upload).
 * - Eventos: document_upload_started/succeeded/failed, document_deleted e
 *   checklist_item_checked (sem nome de arquivo nem dado pessoal).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Info,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge, BottomSheet, Button, Card } from '@/components/ui'
import { formatDayMonth } from '@/components/dashboard/dashboard-access'
import { useAuth } from '@/hooks/useAuth'
import { useAssessmentResult } from '@/hooks/useAssessmentResult'
import {
  OTHER_DOCUMENT_TYPE,
  checklistItemAnchor,
  useChecklist,
  userDocumentsQueryKey,
  type ChecklistDocumentItem,
  type ChecklistStepItem,
  type UserDocument,
} from '@/hooks/useChecklist'
import { track } from '@/lib/analytics'
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_FORMATS_LABEL,
  DOCUMENT_MAX_LABEL,
  formatFileSize,
  validateDocumentFile,
  type DocumentMime,
} from '@/lib/document-file'
import { getErrorStatus, toUserMessage } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const BUCKET = 'user-documents'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Envio ────────────────────────────────────────────────────────────────────

interface UploadInput {
  userId: string
  assessmentId: string | null
  docType: string
  label: string
  file: File
  mime: DocumentMime
  extension: string
}

async function uploadDocument({ userId, assessmentId, docType, label, file, mime, extension }: UploadInput) {
  const folder = assessmentId && UUID_RE.test(assessmentId) ? assessmentId : 'general'
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const storagePath = `${userId}/${folder}/${docType}/${unique}.${extension}`

  // upsert:false — o bucket não tem policy de UPDATE (DI-023); cada envio é um caminho novo.
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: mime })
  if (uploadError) throw uploadError

  const { error: dbError } = await supabase.from('user_documents').insert({
    user_id: userId,
    assessment_id: assessmentId && UUID_RE.test(assessmentId) ? assessmentId : null,
    document_type: docType,
    display_name: label,
    file_name: file.name.slice(0, 200),
    storage_path: storagePath,
    file_size: file.size,
    mime_type: mime,
    status: 'uploaded',
  })
  if (dbError) {
    // Sem o registro o arquivo ficaria órfão (invisível para a pessoa): desfaz.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
    throw dbError
  }
}

/** Motivo (para o evento) e mensagem amigável de uma falha de envio. */
function describeUploadError(error: unknown): { reason: string; message: string } {
  const status = getErrorStatus(error)
  const storageCode = String((error as { statusCode?: unknown } | null)?.statusCode ?? '')
  if (status === 413 || storageCode === '413') {
    return { reason: 'too_large', message: `O arquivo passou do limite de ${DOCUMENT_MAX_LABEL}. Envie uma versão menor.` }
  }
  if (status === 415 || storageCode === '415') {
    return { reason: 'unsupported_type', message: `Formato não aceito. Envie um arquivo ${DOCUMENT_FORMATS_LABEL}.` }
  }
  if (status === 401 || status === 403 || storageCode === '401' || storageCode === '403') {
    return { reason: 'unauthorized', message: 'Sua sessão expirou. Entre de novo e envie o arquivo outra vez.' }
  }
  return {
    reason: status ? `http_${status}` : 'network',
    message: toUserMessage(error, 'Não foi possível enviar o arquivo. Verifique sua conexão e tente de novo.'),
  }
}

// ── Página ───────────────────────────────────────────────────────────────────

export function DocumentsPage() {
  const { authUser, hasAccess } = useAuth()
  const { result } = useAssessmentResult()
  const queryClient = useQueryClient()
  const location = useLocation()
  const userId = authUser?.user.id ?? null
  const assessmentId = result?.assessmentId || null
  const canUpload = hasAccess('documents_upload')
  const canAnalysis = hasAccess('full_analysis')

  const { checklist, isLoading, isError, refetch, setHave, setStepDone } = useChecklist()

  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string | undefined>>({})
  const [pendingDelete, setPendingDelete] = useState<UserDocument | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const setRowError = (key: string, message?: string) => setRowErrors((current) => ({ ...current, [key]: message }))
  const invalidate = () => queryClient.invalidateQueries({ queryKey: userDocumentsQueryKey(userId) })

  // Link da home (#doc-…): rola até o item depois que a lista carrega.
  const scrolledRef = useRef(false)
  useEffect(() => {
    if (isLoading || scrolledRef.current || !location.hash) return
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (!target) return
    scrolledRef.current = true
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    target.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
    target.focus({ preventScroll: true })
  }, [isLoading, location.hash])

  const handleFile = async (docType: string, label: string, file: File) => {
    setRowError(docType)
    const check = validateDocumentFile(file)
    if (!check.ok) {
      // Recusado aqui: nenhuma requisição é feita.
      track('document_upload_failed', { doc_type: docType, reason: check.reason })
      setRowError(docType, check.message)
      return
    }
    if (!userId || !canUpload) return

    setUploading((current) => ({ ...current, [docType]: true }))
    track('document_upload_started', { doc_type: docType })
    try {
      await uploadDocument({ userId, assessmentId, docType, label, file, mime: check.mime, extension: check.extension })
      track('document_upload_succeeded', { doc_type: docType, size_kb: Math.round(file.size / 1024) })
      toast.success('Arquivo enviado.')
      await invalidate()
    } catch (error) {
      const { reason, message } = describeUploadError(error)
      track('document_upload_failed', { doc_type: docType, reason })
      setRowError(docType, message)
    } finally {
      setUploading((current) => ({ ...current, [docType]: false }))
    }
  }

  const handleDownload = async (doc: UserDocument) => {
    setDownloadingId(doc.id)
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(doc.storage_path, 60, { download: doc.file_name })
      if (error || !data?.signedUrl) throw error ?? new Error('signed_url_missing')
      window.location.assign(data.signedUrl)
    } catch (error) {
      toast.error(toUserMessage(error, 'Não foi possível baixar o arquivo. Tente de novo.'))
    } finally {
      setDownloadingId(null)
    }
  }

  const confirmDelete = async () => {
    const doc = pendingDelete
    if (!doc) return
    setDeleting(true)
    try {
      const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path])
      if (storageError) throw storageError
      const { error } = await supabase.from('user_documents').delete().eq('id', doc.id)
      if (error) throw error
      track('document_deleted', { doc_type: doc.document_type })
      toast.success('Arquivo removido.')
      setPendingDelete(null)
      await invalidate()
    } catch (error) {
      toast.error(toUserMessage(error, 'Não foi possível remover o arquivo. Tente de novo.'))
    } finally {
      setDeleting(false)
    }
  }

  const fileActions = {
    onDownload: (doc: UserDocument) => void handleDownload(doc),
    onDelete: (doc: UserDocument) => setPendingDelete(doc),
    downloadingId,
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-[1.75rem] font-bold leading-tight text-foreground [text-wrap:balance] sm:text-3xl">
          Documentos
        </h1>
        <p className="mt-1 text-base text-muted-foreground [text-wrap:pretty]">
          {canUpload
            ? 'Marque o que você já tem e envie os arquivos para deixar tudo organizado num só lugar.'
            : 'Seus arquivos enviados continuam aqui para baixar ou apagar.'}
        </p>
      </header>

      {!canUpload && (
        <Card variant="muted" role="status" data-testid="documents-readonly" className="flex items-start gap-3">
          <Lock aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Envio de novos arquivos pausado</p>
            <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
              O seu prazo de acesso terminou. Você ainda pode baixar ou apagar o que enviou.
            </p>
            <Button asChild variant="link" size="sm" className="mt-1 px-0">
              <Link to="/dashboard">Ver como voltar a enviar</Link>
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div aria-hidden="true" className="space-y-3">
          <div className="h-28 animate-pulse rounded-lg bg-muted" />
          <div className="h-36 animate-pulse rounded-lg bg-muted" />
          <div className="h-36 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : isError ? (
        <Card role="alert" className="text-center" data-testid="documents-error">
          <AlertCircle aria-hidden="true" className="mx-auto mb-2 h-6 w-6 text-destructive" />
          <p className="font-medium text-foreground">Não conseguimos carregar seus documentos.</p>
          <p className="mt-1 text-sm text-muted-foreground">Verifique sua conexão e tente de novo.</p>
          <Button variant="secondary" className="mt-4" onClick={() => void refetch()}>
            <RefreshCw aria-hidden="true" />
            Tentar de novo
          </Button>
        </Card>
      ) : (
        <>
          <ChecklistSummary
            completed={checklist.completed}
            total={checklist.total}
            generic={checklist.source === 'generic'}
            canAnalysis={canAnalysis}
          />

          {checklist.steps.length > 0 && (
            <section aria-labelledby="documents-steps-title" className="space-y-3">
              <h2 id="documents-steps-title" className="text-lg font-semibold text-foreground">
                Etapas do seu caminho
              </h2>
              <ul className="space-y-3">
                {checklist.steps.map((step) => (
                  <li key={step.key}>
                    <StepRow step={step} canEdit={canUpload} onToggle={(value) => setStepDone(step.key, value)} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="documents-list-title" className="space-y-3">
            <h2 id="documents-list-title" className="text-lg font-semibold text-foreground">
              Seus documentos
            </h2>
            <ul className="space-y-3" data-testid="documents-list">
              {checklist.documents.map((item) => (
                <li key={item.key}>
                  <DocumentItem
                    item={item}
                    canUpload={canUpload}
                    uploading={!!uploading[item.key]}
                    error={rowErrors[item.key]}
                    onFile={(file) => void handleFile(item.key, item.label, file)}
                    onToggleHave={(value) => setHave(item.key, value)}
                    {...fileActions}
                  />
                </li>
              ))}
            </ul>
          </section>

          {(checklist.otherFiles.length > 0 || canUpload) && (
            <OtherFiles
              files={checklist.otherFiles}
              canUpload={canUpload}
              uploading={!!uploading[OTHER_DOCUMENT_TYPE]}
              error={rowErrors[OTHER_DOCUMENT_TYPE]}
              onFile={(file) => void handleFile(OTHER_DOCUMENT_TYPE, 'Outro documento', file)}
              {...fileActions}
            />
          )}

          <p className="text-center text-sm text-muted-foreground">
            Formatos aceitos: {DOCUMENT_FORMATS_LABEL} · até {DOCUMENT_MAX_LABEL} por arquivo
          </p>
        </>
      )}

      <BottomSheet
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
        title="Remover este arquivo?"
        description="O arquivo é apagado da sua conta e não pode ser recuperado."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={deleting} onClick={() => setPendingDelete(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={deleting}
              data-testid="confirm-delete-btn"
              onClick={() => void confirmDelete()}
            >
              <Trash2 aria-hidden="true" />
              Remover
            </Button>
          </div>
        }
      >
        {pendingDelete && (
          <p className="break-words rounded-xl bg-muted p-4 text-base text-foreground" data-testid="delete-file-name">
            {pendingDelete.file_name}
          </p>
        )}
      </BottomSheet>
    </div>
  )
}

// ── Resumo do checklist ──────────────────────────────────────────────────────

function ChecklistSummary({
  completed,
  total,
  generic,
  canAnalysis,
}: {
  completed: number
  total: number
  generic: boolean
  canAnalysis: boolean
}) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <Card data-testid="documents-summary">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Seu checklist</h2>
        <span className="text-sm font-medium text-foreground" data-testid="documents-progress">
          {completed} de {total} {total === 1 ? 'item pronto' : 'itens prontos'}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Progresso do checklist"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={completed}
        aria-valuetext={`${completed} de ${total}`}
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-base ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-4 flex gap-2 text-sm text-muted-foreground [text-wrap:pretty]">
        <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {generic
            ? 'Esta é uma lista inicial para você se organizar. Os requisitos e documentos de cada caminho estão na sua análise.'
            : 'Lista do caminho identificado no seu diagnóstico. Detalhes de cada item estão na sua análise.'}
          {canAnalysis && (
            <>
              {' '}
              <Link
                to="/dashboard/analysis"
                className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                Abrir minha análise
              </Link>
            </>
          )}
        </span>
      </p>
    </Card>
  )
}

// ── Etapa ────────────────────────────────────────────────────────────────────

function StepRow({
  step,
  canEdit,
  onToggle,
}: {
  step: ChecklistStepItem
  canEdit: boolean
  onToggle: (value: boolean) => void
}) {
  const done = step.state === 'done'
  return (
    <Card
      id={checklistItemAnchor('step', step.key)}
      tabIndex={-1}
      className="flex scroll-mt-20 items-start gap-3 focus:outline-none"
    >
      <StateIcon state={done ? 'done' : 'pending'} />
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-foreground">{step.label}</h3>
        {step.hint && <p className="mt-0.5 text-sm text-muted-foreground [text-wrap:pretty]">{step.hint}</p>}
        {canEdit && (
          <Button
            variant={done ? 'ghost' : 'secondary'}
            size="sm"
            className="mt-3 min-h-11"
            aria-pressed={done}
            onClick={() => onToggle(!done)}
          >
            {done ? 'Desmarcar' : 'Marcar como feito'}
          </Button>
        )}
      </div>
    </Card>
  )
}

// ── Documento ────────────────────────────────────────────────────────────────

const ITEM_BADGE: Record<ChecklistDocumentItem['state'], { label: string; variant: 'neutral' | 'primary' | 'success' }> = {
  pending: { label: 'Pendente', variant: 'neutral' },
  have: { label: 'Já tenho', variant: 'primary' },
  sent: { label: 'Enviado', variant: 'success' },
}

interface FileActions {
  onDownload: (doc: UserDocument) => void
  onDelete: (doc: UserDocument) => void
  downloadingId: string | null
}

function DocumentItem({
  item,
  canUpload,
  uploading,
  error,
  onFile,
  onToggleHave,
  ...fileActions
}: {
  item: ChecklistDocumentItem
  canUpload: boolean
  uploading: boolean
  error?: string
  onFile: (file: File) => void
  onToggleHave: (value: boolean) => void
} & FileActions) {
  const titleId = useId()
  const badge = ITEM_BADGE[item.state]
  const hasFiles = item.files.length > 0

  return (
    <Card
      id={checklistItemAnchor('document', item.key)}
      tabIndex={-1}
      role="group"
      aria-labelledby={titleId}
      data-testid={`doc-item-${item.key}`}
      data-state={item.state}
      className="scroll-mt-20 focus:outline-none"
    >
      <div className="flex items-start gap-3">
        <StateIcon state={item.state} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 id={titleId} className="font-semibold leading-snug text-foreground">
              {item.label}
            </h3>
            <Badge variant={badge.variant} size="sm">
              {badge.label}
            </Badge>
          </div>
          {item.hint && <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">{item.hint}</p>}
        </div>
      </div>

      {hasFiles && (
        <ul className="mt-4 space-y-2" aria-label={`Arquivos de ${item.label}`}>
          {item.files.map((file) => (
            <li key={file.id}>
              <FileRow file={file} {...fileActions} />
            </li>
          ))}
        </ul>
      )}

      {canUpload && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <UploadButton
            label={hasFiles ? 'Adicionar' : 'Enviar'}
            itemLabel={item.label}
            testId={`file-input-${item.key}`}
            uploading={uploading}
            onFile={onFile}
          />
          {item.state !== 'sent' && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'min-h-11 border',
                item.state === 'have' ? 'border-primary/30 bg-primary/[.08] text-primary hover:bg-primary/[.12]' : 'border-input',
              )}
              aria-pressed={item.state === 'have'}
              aria-label={`Já tenho: ${item.label}`}
              data-testid={`doc-have-${item.key}`}
              onClick={() => onToggleHave(item.state !== 'have')}
            >
              {item.state === 'have' ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
              Já tenho
            </Button>
          )}
        </div>
      )}

      <UploadError message={error} />
    </Card>
  )
}

function OtherFiles({
  files,
  canUpload,
  uploading,
  error,
  onFile,
  ...fileActions
}: {
  files: UserDocument[]
  canUpload: boolean
  uploading: boolean
  error?: string
  onFile: (file: File) => void
} & FileActions) {
  return (
    <section aria-labelledby="documents-other-title">
      <Card variant="muted">
        <h2 id="documents-other-title" className="text-lg font-semibold text-foreground">
          Outros arquivos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
          {canUpload ? 'Qualquer outro documento que você queira guardar aqui.' : 'Arquivos que você enviou fora da lista acima.'}
        </p>
        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((file) => (
              <li key={file.id}>
                <FileRow file={file} showType {...fileActions} />
              </li>
            ))}
          </ul>
        )}
        {canUpload && (
          <div className="mt-4">
            <UploadButton
              label="Enviar outro documento"
              itemLabel="Outro documento"
              testId={`file-input-${OTHER_DOCUMENT_TYPE}`}
              uploading={uploading}
              onFile={onFile}
              icon="plus"
            />
          </div>
        )}
        <UploadError message={error} />
      </Card>
    </section>
  )
}

function UploadButton({
  label,
  itemLabel,
  testId,
  uploading,
  onFile,
  icon = 'upload',
}: {
  label: string
  itemLabel: string
  testId: string
  uploading: boolean
  onFile: (file: File) => void
  icon?: 'upload' | 'plus'
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const Icon = icon === 'plus' ? Plus : Upload
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid={testId}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="min-h-11"
        loading={uploading}
        aria-label={`${label}: ${itemLabel}`}
        onClick={() => inputRef.current?.click()}
      >
        {!uploading && <Icon aria-hidden="true" />}
        {uploading ? 'Enviando…' : label}
      </Button>
    </>
  )
}

function UploadError({ message }: { message?: string }) {
  return (
    <div aria-live="polite">
      {message && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-destructive">
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </p>
      )}
    </div>
  )
}

// ── Arquivo enviado ──────────────────────────────────────────────────────────

const FILE_STATUS: Record<string, { label: string; variant: 'neutral' | 'primary' | 'success' | 'danger' }> = {
  uploaded: { label: 'Recebido', variant: 'neutral' },
  reviewing: { label: 'Em revisão', variant: 'primary' },
  verified: { label: 'Conferido', variant: 'success' },
  rejected: { label: 'Precisa de novo envio', variant: 'danger' },
}

function FileRow({
  file,
  showType = false,
  onDownload,
  onDelete,
  downloadingId,
}: { file: UserDocument; showType?: boolean } & FileActions) {
  const status = FILE_STATUS[file.status] ?? FILE_STATUS.uploaded
  const size = formatFileSize(file.file_size)
  const sentAt = (() => {
    const date = new Date(file.created_at)
    return Number.isNaN(date.getTime()) ? null : formatDayMonth(date)
  })()

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-3',
        file.status === 'rejected' && 'border-destructive/30',
      )}
      data-testid={`file-row-${file.id}`}
    >
      <div className="flex items-start gap-3">
        <FileText aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-foreground">{file.file_name}</p>
          {showType && file.display_name && (
            <p className="text-sm text-muted-foreground">{file.display_name}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <Badge variant={status.variant} size="sm" data-testid="file-status">
              {status.label}
            </Badge>
            {[size, sentAt && `enviado em ${sentAt}`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="-mr-1 -mt-1 flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Baixar ${file.file_name}`}
            loading={downloadingId === file.id}
            onClick={() => onDownload(file)}
          >
            {downloadingId !== file.id && <Download aria-hidden="true" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remover ${file.file_name}`}
            aria-haspopup="dialog"
            className="hover:text-destructive"
            data-testid={`delete-${file.id}`}
            onClick={() => onDelete(file)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      {file.status === 'rejected' && file.feedback && (
        <p className="mt-2 rounded-lg bg-destructive/[.06] px-3 py-2 text-sm text-foreground">
          <span className="font-semibold">Motivo:</span> {file.feedback}
        </p>
      )}
    </div>
  )
}

function StateIcon({ state }: { state: 'pending' | 'have' | 'sent' | 'done' }) {
  const done = state === 'sent' || state === 'done'
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        done && 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]',
        state === 'have' && 'bg-primary/[.08] text-primary',
        state === 'pending' && 'bg-muted text-muted-foreground',
      )}
    >
      {state === 'pending' ? <Circle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
    </span>
  )
}
