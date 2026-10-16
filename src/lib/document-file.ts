/**
 * Validação dos arquivos de documento ANTES do envio (DI-071).
 *
 * Espelha os limites do bucket `user-documents` (migration
 * 20261016000500_user_documents_storage.sql): até 10 MB e só PDF, JPG ou PNG.
 * Recusar no cliente evita um envio longo pelo 4G que o servidor negaria no
 * fim, e permite uma mensagem clara em português.
 *
 * Alguns seletores de arquivo do Android entregam `file.type` vazio: nesse
 * caso o tipo é deduzido pela extensão.
 */

/** Limite do bucket (10 MB = 10 × 1024 × 1024 bytes). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export const ACCEPTED_DOCUMENT_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type DocumentMime = (typeof ACCEPTED_DOCUMENT_MIME)[number]

/** Valor do atributo `accept` do `<input type="file">`. */
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

export const DOCUMENT_FORMATS_LABEL = 'PDF, JPG ou PNG'
export const DOCUMENT_MAX_LABEL = '10 MB'

const EXTENSION_BY_MIME: Record<DocumentMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

const MIME_BY_EXTENSION: Record<string, DocumentMime> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

export type DocumentFileProblem = 'empty' | 'too_large' | 'unsupported_type'

export type DocumentFileCheck =
  | { ok: true; mime: DocumentMime; extension: string }
  | { ok: false; reason: DocumentFileProblem; message: string }

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot >= 0 ? fileName.slice(dot + 1).trim().toLowerCase() : ''
}

/** Tamanho legível em pt-BR: "850 KB", "2,4 MB". */
export function formatFileSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

/** Confere tamanho e tipo. Não lê o conteúdo do arquivo nem faz requisição. */
export function validateDocumentFile(file: Pick<File, 'name' | 'size' | 'type'>): DocumentFileCheck {
  if (!file.size) {
    return { ok: false, reason: 'empty', message: 'O arquivo está vazio. Escolha outro arquivo.' }
  }

  const declared = (file.type || '').toLowerCase()
  const byExtension = MIME_BY_EXTENSION[extensionOf(file.name)]
  const mime: DocumentMime | undefined = (ACCEPTED_DOCUMENT_MIME as readonly string[]).includes(declared)
    ? (declared as DocumentMime)
    : !declared || declared === 'application/octet-stream'
      ? byExtension
      : undefined

  if (!mime) {
    return {
      ok: false,
      reason: 'unsupported_type',
      message: `Formato não aceito. Envie um arquivo ${DOCUMENT_FORMATS_LABEL}.`,
    }
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    const size = formatFileSize(file.size)
    return {
      ok: false,
      reason: 'too_large',
      message: `O arquivo tem ${size} e o limite é ${DOCUMENT_MAX_LABEL}. Envie uma versão menor (por exemplo, uma foto em resolução mais baixa ou um PDF comprimido).`,
    }
  }

  return { ok: true, mime, extension: EXTENSION_BY_MIME[mime] }
}
