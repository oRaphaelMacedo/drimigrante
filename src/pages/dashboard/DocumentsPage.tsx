import { useState } from 'react'
import { FileUp, FileText, CheckCircle2, Clock, AlertCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

type DocStatus = 'pending' | 'uploaded' | 'verified' | 'rejected'

interface DocumentItem {
  id: string
  name: string
  description: string
  status: DocStatus
  fileName?: string
  uploadedAt?: string
  feedback?: string
}

const mockDocuments: DocumentItem[] = [
  {
    id: '1',
    name: 'Passaporte',
    description: 'Cópia colorida do passaporte (todas as páginas, incluindo em branco).',
    status: 'verified',
    fileName: 'passaporte_completo.pdf',
    uploadedAt: '12 Out 2026',
  },
  {
    id: '2',
    name: 'Comprovativo de Morada',
    description: 'Fatura de eletricidade, água ou internet dos últimos 3 meses.',
    status: 'uploaded',
    fileName: 'fatura_luz_setembro.pdf',
    uploadedAt: 'Hoje, 10:45',
  },
  {
    id: '3',
    name: 'Registo Criminal',
    description: 'Certificado de Registo Criminal do país de residência atual.',
    status: 'rejected',
    fileName: 'registo_criminal.jpg',
    uploadedAt: '10 Out 2026',
    feedback: 'O documento está ilegível. Por favor, envie uma cópia em formato PDF com boa resolução.',
  },
  {
    id: '4',
    name: 'Comprovativos de Rendimento',
    description: 'Extratos bancários dos últimos 6 meses.',
    status: 'pending',
  },
]

export function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>(mockDocuments)

  const handleUploadClick = (docId: string) => {
    // Mock upload action
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png'
    input.onchange = (e: any) => {
      const file = e.target.files?.[0]
      if (file) {
        toast.promise(
          new Promise((resolve) => setTimeout(resolve, 2000)),
          {
            loading: `A enviar ${file.name}...`,
            success: () => {
              setDocuments(docs => docs.map(d => 
                d.id === docId ? { 
                  ...d, 
                  status: 'uploaded', 
                  fileName: file.name, 
                  uploadedAt: 'Agora',
                  feedback: undefined
                } : d
              ))
              return 'Documento enviado com sucesso!'
            },
            error: 'Erro ao enviar documento.',
          }
        )
      }
    }
    input.click()
  }

  const handleDelete = (docId: string) => {
    setDocuments(docs => docs.map(d => 
      d.id === docId ? { 
        ...d, 
        status: 'pending', 
        fileName: undefined, 
        uploadedAt: undefined,
        feedback: undefined
      } : d
    ))
    toast.success('Documento removido.')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Meus Documentos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Faça a gestão dos documentos necessários para a sua candidatura.
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">Progresso</p>
          <div className="flex items-center gap-3">
            <div className="h-2 w-32 rounded-full bg-gray-100 overflow-hidden">
              <div 
                className="h-full bg-brand-500 rounded-full" 
                style={{ width: `${(documents.filter(d => d.status === 'verified').length / documents.length) * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold text-brand-600">
              {documents.filter(d => d.status === 'verified').length}/{documents.length}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {documents.map((doc) => {
          const isPending = doc.status === 'pending'
          const isUploaded = doc.status === 'uploaded'
          const isVerified = doc.status === 'verified'
          const isRejected = doc.status === 'rejected'

          return (
            <div 
              key={doc.id}
              className={`rounded-2xl border bg-white p-5 transition-shadow hover:shadow-sm ${
                isRejected ? 'border-red-200 bg-red-50/30' : 'border-gray-100'
              }`}
            >
              <div className="flex items-start gap-4 sm:items-center">
                
                {/* Icon Status */}
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  isPending ? 'bg-gray-100 text-gray-400' :
                  isUploaded ? 'bg-yellow-50 text-yellow-500' :
                  isVerified ? 'bg-green-50 text-green-500' :
                  'bg-red-50 text-red-500'
                }`}>
                  {isPending && <FileText className="h-5 w-5" />}
                  {isUploaded && <Clock className="h-5 w-5" />}
                  {isVerified && <CheckCircle2 className="h-5 w-5" />}
                  {isRejected && <AlertCircle className="h-5 w-5" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 truncate">{doc.name}</h3>
                    {isVerified && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700">Verificado</span>}
                    {isUploaded && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-yellow-700">Em Análise</span>}
                    {isRejected && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-700">Rejeitado</span>}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-500 line-clamp-2 sm:line-clamp-1">{doc.description}</p>
                  
                  {isRejected && doc.feedback && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 inline-block">
                      <strong className="font-semibold">Motivo:</strong> {doc.feedback}
                    </div>
                  )}

                  {(isUploaded || isVerified) && doc.fileName && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                      <FileUp className="h-3.5 w-3.5" />
                      {doc.fileName}
                      <span className="mx-1">•</span>
                      {doc.uploadedAt}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                  {(isPending || isRejected) && (
                    <button
                      onClick={() => handleUploadClick(doc.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 transition hover:bg-brand-100 hover:text-brand-800"
                    >
                      <FileUp className="h-4 w-4" />
                      Enviar Arquivo
                    </button>
                  )}

                  {isUploaded && (
                    <>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Remover Documento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>

              </div>
            </div>
          )
        })}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
        <h3 className="font-bold text-blue-900 flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600" />
          Importante
        </h3>
        <p className="mt-2 text-sm text-blue-800">
          Certifique-se de que todos os documentos estão nítidos e completos. Documentos ilegíveis ou incompletos atrasarão a sua análise. Os formatos aceites são PDF, JPG e PNG (máx. 10MB por arquivo).
        </p>
      </div>

    </div>
  )
}
