import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_BYTES, formatFileSize, validateDocumentFile } from './document-file'

const MB = 1024 * 1024

describe('validateDocumentFile', () => {
  it('aceita PDF, JPG e PNG até 10 MB', () => {
    expect(validateDocumentFile({ name: 'passaporte.pdf', size: 2 * MB, type: 'application/pdf' })).toEqual({
      ok: true,
      mime: 'application/pdf',
      extension: 'pdf',
    })
    expect(validateDocumentFile({ name: 'foto.JPEG', size: 500_000, type: 'image/jpeg' })).toMatchObject({
      ok: true,
      extension: 'jpg',
    })
    expect(validateDocumentFile({ name: 'scan.png', size: MAX_DOCUMENT_BYTES, type: 'image/png' })).toMatchObject({
      ok: true,
    })
  })

  it('recusa 11 MB com mensagem clara', () => {
    const check = validateDocumentFile({ name: 'grande.pdf', size: 11 * MB, type: 'application/pdf' })
    expect(check.ok).toBe(false)
    if (check.ok) return
    expect(check.reason).toBe('too_large')
    expect(check.message).toContain('11 MB')
    expect(check.message).toContain('10 MB')
  })

  it('recusa formatos fora da lista (ex.: HEIC, Word)', () => {
    expect(validateDocumentFile({ name: 'IMG_0001.HEIC', size: MB, type: 'image/heic' })).toMatchObject({
      ok: false,
      reason: 'unsupported_type',
    })
    expect(
      validateDocumentFile({
        name: 'certidao.docx',
        size: MB,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    ).toMatchObject({ ok: false, reason: 'unsupported_type' })
  })

  it('tipo vazio (alguns Android): deduz pela extensão', () => {
    expect(validateDocumentFile({ name: 'doc.pdf', size: MB, type: '' })).toMatchObject({ ok: true, mime: 'application/pdf' })
    expect(validateDocumentFile({ name: 'sem-extensao', size: MB, type: '' })).toMatchObject({ ok: false })
  })

  it('arquivo vazio é recusado', () => {
    expect(validateDocumentFile({ name: 'vazio.pdf', size: 0, type: 'application/pdf' })).toMatchObject({
      ok: false,
      reason: 'empty',
    })
  })
})

describe('formatFileSize', () => {
  it('formata em KB e MB (pt-BR)', () => {
    expect(formatFileSize(850 * 1024)).toBe('850 KB')
    expect(formatFileSize(2.4 * MB)).toBe('2,4 MB')
    expect(formatFileSize(null)).toBeNull()
  })
})
