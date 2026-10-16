// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAccessState, hasFeatureAccess, type AccessSubscription } from '@/lib/access'

// ── Mocks (nada de rede) ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  auth: null as unknown,
  result: null as unknown,
  docs: [] as Array<Record<string, unknown>>,
  upload: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  deleteEq: vi.fn(),
  signedUrl: vi.fn(),
  track: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }))
vi.mock('@/hooks/useAssessmentResult', () => ({
  useAssessmentResult: () => ({ result: mocks.result, isLoading: false }),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: async () => ({ data: mocks.docs, error: null }) }),
      insert: (row: unknown) => mocks.insert(row),
      delete: () => ({ eq: (column: string, value: unknown) => mocks.deleteEq(column, value) }),
    }),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mocks.upload(...args),
        remove: (...args: unknown[]) => mocks.remove(...args),
        createSignedUrl: (...args: unknown[]) => mocks.signedUrl(...args),
      }),
    },
  },
}))
vi.mock('@/lib/analytics', () => ({ track: mocks.track }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { DocumentsPage } from './DocumentsPage'

const DAY = 86_400_000
const USER_ID = '00000000-0000-4000-8000-000000000001'
const ASSESSMENT_ID = '00000000-0000-4000-8000-0000000000aa'

function setAuth(daysLeft: number) {
  const sub: AccessSubscription = {
    one_time_paid: true,
    one_time_access_expires_at: new Date(Date.now() + daysLeft * DAY).toISOString(),
    recurring_active: false,
    has_dashboard_access: true,
    has_full_analysis: true,
    has_chat_access: true,
  }
  mocks.auth = {
    authUser: { user: { id: USER_ID, email: 'ana@example.com' }, profile: null, subscription: sub, roles: [] },
    access: getAccessState(sub),
    hasAccess: (feature: Parameters<typeof hasFeatureAccess>[1]) => hasFeatureAccess(sub, feature),
  }
}

function setPathway(code: string, name: string) {
  mocks.result = {
    assessmentId: ASSESSMENT_ID,
    pathways: [{ code, name, match: 'strong' }],
    localVisas: [],
  }
}

function uploadedDoc(extra: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    document_type: 'passaporte',
    display_name: 'Passaporte',
    file_name: 'passaporte-ana.pdf',
    storage_path: `${USER_ID}/${ASSESSMENT_ID}/passaporte/1.pdf`,
    file_size: 850 * 1024,
    mime_type: 'application/pdf',
    status: 'uploaded',
    feedback: null,
    created_at: new Date(Date.now() - DAY).toISOString(),
    ...extra,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function pickFile(testId: string, file: File) {
  fireEvent.change(screen.getByTestId(testId), { target: { files: [file] } })
}

function fakeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

beforeEach(() => {
  window.localStorage.clear()
  mocks.docs = []
  for (const fn of [mocks.upload, mocks.remove, mocks.insert, mocks.deleteEq, mocks.signedUrl, mocks.track]) fn.mockReset()
  mocks.upload.mockResolvedValue({ data: { path: 'ok' }, error: null })
  mocks.remove.mockResolvedValue({ data: [], error: null })
  mocks.insert.mockResolvedValue({ data: null, error: null })
  mocks.deleteEq.mockResolvedValue({ data: null, error: null })
  setAuth(20)
  setPathway('nacionalidade_casamento', 'Naturalização pelo Casamento')
})

describe('DocumentsPage — lista por caminho', () => {
  it('via casamento: certidão de casamento, sem "Doc. Parentes Portugueses"', async () => {
    const { container } = renderPage()
    await screen.findByTestId('documents-list')
    expect(screen.getByTestId('doc-item-certidao_casamento')).toBeInTheDocument()
    expect(screen.queryByTestId('doc-item-documento_parentes')).toBeNull()
    expect(container.textContent).not.toMatch(/Parentes Portugueses|familiar português/i)
    expect(container.textContent).not.toContain('A_PREENCHER')
  })

  it('via descendência: inclui os documentos do familiar português', async () => {
    setPathway('nacionalidade_descendencia_1', 'Nacionalidade por Descendência (1.º grau)')
    renderPage()
    expect(await screen.findByTestId('doc-item-documento_parentes')).toBeInTheDocument()
  })

  it('descrição completa (sem corte) e status "Recebido" no arquivo enviado', async () => {
    mocks.docs = [uploadedDoc()]
    const { container } = renderPage()
    const item = await screen.findByTestId('doc-item-passaporte')
    expect(item).toHaveAttribute('data-state', 'sent')
    expect(within(item).getByTestId('file-status')).toHaveTextContent('Recebido')
    expect(container.textContent).not.toMatch(/Em Análise/i)
    expect(container.querySelector('.line-clamp-1, .line-clamp-2')).toBeNull()
    expect(screen.getByTestId('documents-progress')).toHaveTextContent('1 de 3 itens prontos')
  })

  it('"Já tenho" marca o item e conta no progresso', async () => {
    renderPage()
    fireEvent.click(await screen.findByTestId('doc-have-assento_nascimento'))
    expect(screen.getByTestId('doc-item-assento_nascimento')).toHaveAttribute('data-state', 'have')
    expect(screen.getByTestId('documents-progress')).toHaveTextContent('1 de 3')
    expect(mocks.track).toHaveBeenCalledWith('checklist_item_checked', expect.objectContaining({ item_key: 'assento_nascimento', state: 'have' }))
  })
})

describe('DocumentsPage — envio', () => {
  it('arquivo de 11 MB é recusado sem nenhuma requisição', async () => {
    renderPage()
    await screen.findByTestId('documents-list')
    pickFile('file-input-passaporte', fakeFile('grande.pdf', 'application/pdf', 11 * 1024 * 1024))

    const item = screen.getByTestId('doc-item-passaporte')
    expect(await within(item).findByRole('alert')).toHaveTextContent('10 MB')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.track).toHaveBeenCalledWith('document_upload_failed', { doc_type: 'passaporte', reason: 'too_large' })
  })

  it('formato não aceito (HEIC) é recusado sem requisição', async () => {
    renderPage()
    await screen.findByTestId('documents-list')
    pickFile('file-input-passaporte', fakeFile('IMG_1.HEIC', 'image/heic', 1024 * 1024))
    expect(await screen.findByText(/Formato não aceito/)).toBeInTheDocument()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('arquivo válido: envia para a pasta do usuário, registra e dispara os eventos', async () => {
    renderPage()
    await screen.findByTestId('documents-list')
    pickFile('file-input-certidao_casamento', fakeFile('certidao.pdf', 'application/pdf', 2 * 1024 * 1024))

    await waitFor(() => expect(mocks.insert).toHaveBeenCalledTimes(1))
    const [path, , options] = mocks.upload.mock.calls[0] as [string, File, { upsert: boolean; contentType: string }]
    expect(path.startsWith(`${USER_ID}/${ASSESSMENT_ID}/certidao_casamento/`)).toBe(true)
    expect(path.endsWith('.pdf')).toBe(true)
    expect(options).toMatchObject({ upsert: false, contentType: 'application/pdf' })
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({
      user_id: USER_ID,
      document_type: 'certidao_casamento',
      status: 'uploaded',
    })
    expect(mocks.track).toHaveBeenCalledWith('document_upload_started', { doc_type: 'certidao_casamento' })
    await waitFor(() =>
      expect(mocks.track).toHaveBeenCalledWith('document_upload_succeeded', { doc_type: 'certidao_casamento', size_kb: 2048 }),
    )
    // Nenhuma propriedade de evento leva o nome do arquivo.
    expect(JSON.stringify(mocks.track.mock.calls)).not.toContain('certidao.pdf')
  })

  it('falha no registro: desfaz o arquivo no storage e mostra erro na linha', async () => {
    mocks.insert.mockResolvedValue({ data: null, error: { message: 'rls', status: 403 } })
    renderPage()
    await screen.findByTestId('documents-list')
    pickFile('file-input-passaporte', fakeFile('p.png', 'image/png', 1024))
    const item = screen.getByTestId('doc-item-passaporte')
    expect(await within(item).findByRole('alert')).toHaveTextContent('Sua sessão expirou')
    expect(mocks.remove).toHaveBeenCalledTimes(1)
  })
})

describe('DocumentsPage — remover', () => {
  it('pede confirmação antes de apagar', async () => {
    mocks.docs = [uploadedDoc()]
    renderPage()
    fireEvent.click(await screen.findByTestId('delete-doc-1'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Remover este arquivo?')
    expect(within(dialog).getByTestId('delete-file-name')).toHaveTextContent('passaporte-ana.pdf')
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.deleteEq).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByTestId('confirm-delete-btn'))
    await waitFor(() => expect(mocks.deleteEq).toHaveBeenCalledWith('id', 'doc-1'))
    expect(mocks.remove).toHaveBeenCalledWith([uploadedDoc().storage_path])
    expect(mocks.track).toHaveBeenCalledWith('document_deleted', { doc_type: 'passaporte' })
  })

  it('cancelar não apaga nada', async () => {
    mocks.docs = [uploadedDoc()]
    renderPage()
    fireEvent.click(await screen.findByTestId('delete-doc-1'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.remove).not.toHaveBeenCalled()
  })
})

describe('DocumentsPage — acesso expirado', () => {
  it('só leitura: sem envio, mas com baixar e remover; arquivos antigos continuam visíveis', async () => {
    setAuth(-3)
    mocks.docs = [uploadedDoc(), uploadedDoc({ id: 'doc-2', document_type: 'comprovativo_morada', file_name: 'luz.pdf', display_name: 'Comprovativo de Morada' })]
    renderPage()
    expect(await screen.findByTestId('documents-readonly')).toBeInTheDocument()
    await screen.findByTestId('documents-list')
    expect(screen.queryByTestId('file-input-passaporte')).toBeNull()
    expect(screen.queryByTestId('doc-have-assento_nascimento')).toBeNull()
    expect(screen.getByRole('button', { name: 'Baixar passaporte-ana.pdf' })).toBeInTheDocument()
    expect(screen.getByTestId('delete-doc-1')).toBeInTheDocument()
    // Tipo da lista antiga, fora do caminho atual: aparece em "Outros arquivos".
    expect(screen.getByTestId('file-row-doc-2')).toHaveTextContent('luz.pdf')
  })
})
