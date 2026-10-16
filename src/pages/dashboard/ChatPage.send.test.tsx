// @vitest-environment jsdom
/**
 * Chat no celular (DI-051) com o hook de dados real: histórico recente,
 * sugestões, envio e erro sem perder o texto. Sem rede: Supabase e fetch falsos.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_ASSESSMENT_ID, jsonResponse, makeMessages, sseResponse, type ChatSupabaseState } from '@/test/chat-fakes'

const h = vi.hoisted(() => ({
  state: { rows: [], messageQueries: [] } as unknown as ChatSupabaseState,
  track: vi.fn(),
  refreshUser: vi.fn(async () => null),
}))

vi.mock('@/lib/supabase', async () => {
  const fakes = await import('@/test/chat-fakes')
  return { supabase: fakes.createChatSupabase(h.state) }
})
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    authUser: { user: { id: 'u1', email: 'ana@example.com' } },
    hasAccess: () => true,
    access: { state: 'active', expiresAt: null, daysLeft: 20, hasPaidOnce: true, isStaff: false },
    refreshUser: h.refreshUser,
  }),
}))
vi.mock('@/hooks/useAssessmentResult', () => ({
  useAssessmentResult: () => ({
    result: {
      assessmentId: CHAT_ASSESSMENT_ID,
      pathways: [
        { code: 'naturalizacao_residencia', name: 'Residência', match: 'possible' },
        { code: 'nacionalidade_casamento', name: 'Casamento', match: 'strong' },
      ],
    },
    isLoading: false,
    error: null,
  }),
}))
vi.mock('@/lib/analytics', () => ({ track: h.track }))

import { ChatPage } from './ChatPage'

// jsdom + markdown ficam lentos com a máquina carregada: folga no tempo de cada teste.
vi.setConfig({ testTimeout: 20_000 })

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

function renderChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ChatPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.setItem('dr_imigrante_quiz_result', JSON.stringify({ assessmentId: CHAT_ASSESSMENT_ID }))
  h.state.rows = []
  h.state.messageQueries = []
  h.track.mockClear()
  h.refreshUser.mockClear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ChatPage — DI-051', () => {
  it('campo com 16px, sem 100vh, e conversa marcada como log', async () => {
    const { container } = renderChat()
    const input = await screen.findByTestId('chat-input')
    expect(input.className).toContain('text-base')
    expect(input).toHaveAttribute('enterkeyhint', 'send')
    expect(input).toHaveAttribute('maxlength', '2000')
    expect(container.innerHTML).not.toContain('100vh')
    expect(screen.getByTestId('chat-panel').className).toContain('100dvh')
    expect(screen.getByRole('log', { name: 'Conversa com o assistente' })).toBeInTheDocument()
  })

  it('com 60 mensagens, a mais recente aparece e as antigas ficam em "Carregar mensagens anteriores"', async () => {
    h.state.rows = makeMessages(60)
    renderChat()
    const log = await screen.findByRole('log', { name: 'Conversa com o assistente' })
    await waitFor(() => expect(within(log).getByText('Mensagem 60')).toBeInTheDocument())
    expect(within(log).queryByText('Mensagem 10')).not.toBeInTheDocument()
    expect(within(log).queryByText('Mensagem 1')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Carregar mensagens anteriores' }))
    await waitFor(() => expect(within(log).getByText('Mensagem 1')).toBeInTheDocument())
    expect(within(log).getByText('Mensagem 60')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carregar mensagens anteriores' })).not.toBeInTheDocument()
  }, 20_000)

  it('500 no envio: o texto volta para o campo e aparece uma mensagem clara', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'internal_error' }))
    renderChat()
    const input = await screen.findByTestId('chat-input')
    await waitFor(() => expect(screen.getByTestId('chat-suggestions')).toBeInTheDocument())
    fireEvent.change(input, { target: { value: 'Preciso traduzir a certidão?' } })
    await userEvent.click(screen.getByTestId('chat-send'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sua mensagem voltou para o campo')
    expect(input).toHaveValue('Preciso traduzir a certidão?')
    expect(screen.getByRole('alert').textContent).not.toMatch(/500|internal/)
    expect(h.track).toHaveBeenCalledWith('chat_message_sent', { length_bucket: '0-50', from_suggestion: false })
  }, 15_000)

  it('403 no envio: recarrega o acesso da conta (a tela passa a mostrar a oferta)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: 'no_access' }))
    renderChat()
    const input = await screen.findByTestId('chat-input')
    await waitFor(() => expect(screen.getByTestId('chat-suggestions')).toBeInTheDocument())
    fireEvent.change(input, { target: { value: 'Oi' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByRole('alert')).toHaveTextContent('O chat não está liberado')
    expect(h.refreshUser).toHaveBeenCalledTimes(1)
    expect(input).toHaveValue('Oi')
  }, 15_000)

  it('sem histórico: sugestões pela via mais compatível; tocar envia a pergunta', async () => {
    fetchMock.mockImplementation(async () => {
      h.state.rows = [
        { id: 'q', role: 'user', content: 'O que preciso comprovar no pedido pelo casamento ou união estável?', created_at: '2026-10-02T10:00:00.000Z' },
        { id: 'r', role: 'assistant', content: '**Comprove** a união.', created_at: '2026-10-02T10:00:05.000Z' },
      ]
      return sseResponse(['**Comprove** ', 'a união.'])
    })
    renderChat()
    const chips = await screen.findByTestId('chat-suggestions')
    const buttons = within(chips).getAllByRole('button')
    expect(buttons).toHaveLength(4)
    expect(buttons[0]).toHaveTextContent('casamento ou união estável')

    await userEvent.click(buttons[0])
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.message).toBe('O que preciso comprovar no pedido pelo casamento ou união estável?')
    expect(h.track).toHaveBeenCalledWith('chat_message_sent', expect.objectContaining({ from_suggestion: true }))

    // Resposta em markdown (negrito), sem ** literais; as sugestões somem depois da conversa começar.
    const strong = await screen.findByText('Comprove')
    expect(strong.tagName).toBe('STRONG')
    expect(screen.getByRole('log').textContent).not.toContain('**')
    await waitFor(() => expect(screen.queryByTestId('chat-suggestions')).not.toBeInTheDocument())
  }, 15_000)
})
