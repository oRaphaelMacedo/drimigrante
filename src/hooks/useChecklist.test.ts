// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NATIONALITY_PATH_CODES, PENDING } from '@/data/nationality-paths'

const mocks = vi.hoisted(() => ({
  docs: [] as unknown[],
  result: null as unknown,
  track: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    authUser: { user: { id: 'user-1' } },
    hasAccess: () => true,
  }),
}))
vi.mock('@/hooks/useAssessmentResult', () => ({
  useAssessmentResult: () => ({ result: mocks.result, isLoading: false }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: async () => ({ data: mocks.docs, error: null }) }) }),
  },
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))

import {
  buildChecklist,
  checklistStorageKey,
  GENERIC_LINK_DOCUMENTS,
  readChecklistMarks,
  useChecklist,
  type UserDocument,
} from './useChecklist'

function doc(extra: Partial<UserDocument>): UserDocument {
  return {
    id: 'doc-1',
    document_type: 'passaporte',
    display_name: 'Passaporte',
    file_name: 'passaporte.pdf',
    storage_path: 'user-1/general/passaporte/1.pdf',
    file_size: 1000,
    mime_type: 'application/pdf',
    status: 'uploaded',
    feedback: null,
    created_at: '2026-10-10T10:00:00Z',
    ...extra,
  }
}

const NO_MARKS = { have: [], done: [] }

describe('buildChecklist', () => {
  it('via casamento não lista os documentos de parentes portugueses', () => {
    const list = buildChecklist({ pathwayCodes: ['nacionalidade_casamento'], documents: [], marks: NO_MARKS })
    const keys = list.documents.map((item) => item.key)
    expect(keys).toContain('certidao_casamento')
    expect(keys).not.toContain('documento_parentes')
    expect(list.documents.map((item) => item.label).join(' ')).not.toMatch(/parentes portugueses|familiar português/i)
  })

  it('via descendência lista os documentos do familiar português', () => {
    const list = buildChecklist({ pathwayCodes: ['nacionalidade_descendencia_2'], documents: [], marks: NO_MARKS })
    expect(list.documents.map((item) => item.key)).toEqual(['passaporte', 'assento_nascimento', 'documento_parentes'])
    expect(list.source).toBe('generic')
  })

  it('mais de um caminho: une os documentos sem repetir', () => {
    const list = buildChecklist({
      pathwayCodes: ['nacionalidade_casamento', 'naturalizacao_residencia', 'nacionalidade_casamento'],
      documents: [],
      marks: NO_MARKS,
    })
    const keys = list.documents.map((item) => item.key)
    expect(keys).toEqual(['passaporte', 'assento_nascimento', 'certidao_casamento', 'titulo_residencia'])
    expect(list.documents[0].pathways).toEqual(['nacionalidade_casamento', 'naturalizacao_residencia'])
  })

  it('sem caminho conhecido: só os documentos pessoais', () => {
    const list = buildChecklist({ pathwayCodes: ['CODIGO_ANTIGO'], documents: [], marks: NO_MARKS })
    expect(list.documents.map((item) => item.key)).toEqual(['passaporte', 'assento_nascimento'])
    expect(list.pathwayCodes).toEqual([])
  })

  it('estados: enviado vem do upload, "Já tenho" das marcações, rejeitado volta a pendente', () => {
    const list = buildChecklist({
      pathwayCodes: ['nacionalidade_casamento'],
      documents: [
        doc({ id: 'a', document_type: 'passaporte' }),
        doc({ id: 'b', document_type: 'certidao_casamento', status: 'rejected' }),
      ],
      marks: { have: ['assento_nascimento'], done: [] },
    })
    const state = Object.fromEntries(list.documents.map((item) => [item.key, item.state]))
    expect(state).toEqual({ passaporte: 'sent', assento_nascimento: 'have', certidao_casamento: 'pending' })
    expect(list.completed).toBe(2)
    expect(list.total).toBe(3)
    expect(list.next?.key).toBe('certidao_casamento')
  })

  it('arquivos de tipos fora da lista (lista antiga) ficam em otherFiles', () => {
    const list = buildChecklist({
      pathwayCodes: ['nacionalidade_casamento'],
      documents: [doc({ id: 'x', document_type: 'comprovativo_morada' }), doc({ id: 'y', document_type: 'outro' })],
      marks: NO_MARKS,
    })
    expect(list.otherFiles.map((file) => file.id).sort()).toEqual(['x', 'y'])
    expect(list.uploadedCount).toBe(2)
  })

  it('tudo pronto: next = null', () => {
    const list = buildChecklist({
      pathwayCodes: [],
      documents: [],
      marks: { have: ['passaporte', 'assento_nascimento'], done: [] },
    })
    expect(list.completed).toBe(list.total)
    expect(list.next).toBeNull()
  })

  it('nenhum texto pendente (A_PREENCHER) chega ao checklist, para nenhum caminho', () => {
    for (const code of NATIONALITY_PATH_CODES) {
      const list = buildChecklist({ pathwayCodes: [code], documents: [], marks: NO_MARKS })
      expect(JSON.stringify(list)).not.toContain(PENDING)
      expect(GENERIC_LINK_DOCUMENTS[code]).toBeDefined()
    }
  })
})

describe('useChecklist', () => {
  function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return createElement(QueryClientProvider, { client }, children)
  }

  beforeEach(() => {
    window.localStorage.clear()
    mocks.docs = []
    mocks.track.mockClear()
    mocks.result = {
      assessmentId: 'a-1',
      pathways: [{ code: 'nacionalidade_casamento', name: 'Casamento', match: 'strong' }],
      localVisas: [],
    }
  })

  it('"Já tenho" persiste depois de recarregar (novo hook lê o localStorage)', async () => {
    const first = renderHook(() => useChecklist(), { wrapper })
    act(() => first.result.current.setHave('passaporte', true))
    expect(first.result.current.checklist.documents.find((d) => d.key === 'passaporte')?.state).toBe('have')
    expect(readChecklistMarks('user-1').have).toEqual(['passaporte'])
    expect(mocks.track).toHaveBeenCalledWith('checklist_item_checked', {
      item_key: 'passaporte',
      state: 'have',
      pathway: 'nacionalidade_casamento',
    })
    first.unmount()

    const reloaded = renderHook(() => useChecklist(), { wrapper })
    expect(reloaded.result.current.checklist.documents.find((d) => d.key === 'passaporte')?.state).toBe('have')

    act(() => reloaded.result.current.setHave('passaporte', false))
    expect(reloaded.result.current.checklist.documents.find((d) => d.key === 'passaporte')?.state).toBe('pending')
  })

  it('upload marca o item como enviado', async () => {
    mocks.docs = [doc({ document_type: 'certidao_casamento' })]
    const { result } = renderHook(() => useChecklist(), { wrapper })
    await waitFor(() =>
      expect(result.current.checklist.documents.find((d) => d.key === 'certidao_casamento')?.state).toBe('sent'),
    )
  })

  it('storage corrompido não quebra', () => {
    window.localStorage.setItem(checklistStorageKey('user-1'), '{nao é json')
    const { result } = renderHook(() => useChecklist(), { wrapper })
    expect(result.current.checklist.completed).toBe(0)
  })
})
