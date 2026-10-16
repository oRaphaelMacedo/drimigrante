// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AccessState } from '@/lib/access'

// ── Mocks (nada de rede: Supabase, auth e analytics falsos) ──────────────────

const h = vi.hoisted(() => {
  const state = {
    row: null as Record<string, unknown> | null,
    rowError: null as unknown,
    rpc: { data: null as unknown, error: null as unknown },
    hasAccess: (() => true) as (feature: string) => boolean,
    access: { state: 'active', expiresAt: null, daysLeft: 20, hasPaidOnce: true, isStaff: false } as AccessState,
    selects: [] as string[],
  }
  const builder: Record<string, unknown> = {}
  for (const method of ['eq', 'order', 'limit']) builder[method] = () => builder
  builder.select = (columns: string) => {
    state.selects.push(columns)
    return builder
  }
  builder.maybeSingle = async () => (state.rowError ? { data: null, error: state.rowError } : { data: state.row, error: null })
  const rpc = vi.fn(async () => state.rpc)
  // generate-explanation (DI-018) — nunca chega à rede nem à OpenAI.
  const invoke = vi.fn(async (_name: string, _options?: unknown) => ({ data: { status: 'ready' } as unknown, error: null as unknown }))
  const track = vi.fn()
  const refreshUser = vi.fn(async () => null)
  return { state, builder, rpc, invoke, track, refreshUser }
})

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => h.builder, rpc: h.rpc, functions: { invoke: h.invoke } },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    authUser: { user: { id: '00000000-0000-4000-8000-000000000001', email: 'ana@example.com' } },
    hasAccess: (feature: string) => h.state.hasAccess(feature),
    access: h.state.access,
    refreshUser: h.refreshUser,
  }),
}))

vi.mock('@/lib/analytics', () => ({ track: h.track }))

import { AnalysisPage } from './AnalysisPage'
import { SUPPORT_EMAIL } from '@/config/contact'

// jsdom + markdown ficam lentos com a máquina carregada: folga no tempo de cada teste.
vi.setConfig({ testTimeout: 20_000 })

// ── Dados ────────────────────────────────────────────────────────────────────

const ASSESSMENT_ID = '00000000-0000-4000-8000-0000000000aa'

const ANSWERS = {
  processo_tipo: 'nacionalidade',
  caso_tipo: 'A,B',
  a1_antepassado: 'pai_mae',
  a2_documento: 'sim',
  b1_tempo_casamento: 'mais_3_anos',
}

const FULL_MARKDOWN = [
  '## Avaliação geral',
  'Seu perfil é **muito compatível** com a descendência.',
  '',
  '## Caminho mais indicado',
  'A via de **descendência** é a mais direta. Texto com ** solto.',
  '',
  '## Requisitos principais',
  '- Certidão de nascimento',
  '',
  '## Pontos de atenção',
  '<script>alert(1)</script>Confirme as regras.',
  '',
  '## Próximos passos',
  '1. Reúna os documentos.',
].join('\n')

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    full_name: 'Ana Souza',
    email: 'ana@example.com',
    completed_at: '2026-10-01T10:00:00.000Z',
    answers: ANSWERS,
    // Score 0 do banco (bug antigo): deve ser ignorado quando há respostas.
    assessment_results: { assessment_id: ASSESSMENT_ID, score_numeric: 0, score_category: 'baixa', suggested_visa_types: [], ia_explanation_short: 'Resumo', computed_at: null },
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dashboard/analysis']}>
        <AnalysisPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  h.state.row = dbRow()
  h.state.rowError = null
  h.state.rpc = { data: [{ assessment_id: ASSESSMENT_ID, ia_explanation_full: FULL_MARKDOWN, computed_at: null }], error: null }
  h.state.hasAccess = () => true
  h.state.access = { state: 'active', expiresAt: null, daysLeft: 20, hasPaidOnce: true, isStaff: false }
  h.state.selects = []
  h.rpc.mockClear()
  h.invoke.mockReset()
  h.invoke.mockImplementation(async () => ({ data: { status: 'ready' }, error: null }))
  h.track.mockClear()
  h.refreshUser.mockClear()
})

// ── Testes ───────────────────────────────────────────────────────────────────

describe('AnalysisPage — pagante', () => {
  it('sem localStorage, recalcula as vias a partir das respostas do banco (DI-007)', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Caminhos para a nacionalidade' })).toBeInTheDocument()
    const paths = screen.getByRole('region', { name: 'Caminhos para a nacionalidade' })
    const titles = within(paths).getAllByRole('heading', { level: 3 }).map((el) => el.textContent)
    expect(titles).toEqual(['Nacionalidade por descendência (1.º grau)', 'Nacionalidade pelo casamento ou união estável'])
    // O reason de suggestVisas aparece.
    expect(within(paths).getByText(/Com documentação do antepassado português e descendência direta/)).toBeInTheDocument()
    // Score 0 do banco foi ignorado (recalculado das respostas).
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(h.track).toHaveBeenCalledWith('analysis_viewed', { pathway: 'nacionalidade_descendencia_1' })
  })

  it('não mostra textos genéricos de visto, domínio antigo, placeholders nem ** literais', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Avaliação geral' })
    const text = document.body.textContent ?? ''
    expect(text).not.toContain('Opção de visto com base no seu perfil')
    expect(text.toLowerCase()).not.toMatch(/\bvisto/)
    expect(text).not.toContain('doutorimigrante.com')
    expect(text).not.toContain('A_PREENCHER')
    expect(text).not.toContain('**')
    expect(document.querySelector('script')).toBeNull()
    expect(document.body.innerHTML).not.toContain('A_PREENCHER')
  })

  it('usa colunas explícitas e a RPC get_full_analysis (DI-016)', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Avaliação geral' })
    expect(h.rpc).toHaveBeenCalledWith('get_full_analysis', { p_assessment_id: ASSESSMENT_ID })
    for (const columns of h.state.selects) {
      expect(columns).not.toMatch(/\*/)
      expect(columns).not.toContain('ia_explanation_full')
    }
  })

  it('acordeão: a primeira seção abre, as outras ficam recolhidas e abrem ao tocar', async () => {
    renderPage()
    const first = await screen.findByRole('button', { name: 'Avaliação geral' })
    const second = screen.getByRole('button', { name: 'Caminho mais indicado' })
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(second).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('muito compatível').tagName).toBe('STRONG')
    expect(screen.queryByText(/A via de/)).not.toBeVisible()
    await userEvent.click(second)
    expect(second).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/A via de/)).toBeVisible()
  })

  it('atalho abre a seção correspondente', async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    renderPage()
    await screen.findByRole('button', { name: 'Avaliação geral' })
    const nav = screen.getByRole('navigation', { name: 'Atalhos da análise' })
    await userEvent.click(within(nav).getByRole('link', { name: 'Próximos passos' }))
    expect(screen.getByRole('button', { name: 'Próximos passos' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('análise já gerada → nenhuma chamada ao generate-explanation', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Avaliação geral' })
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('DI-018: pagante sem a análise → "Preparando", pede o modo full uma vez e mostra o texto quando fica pronto', async () => {
    const EMPTY = { data: [{ assessment_id: ASSESSMENT_ID, ia_explanation_full: null, computed_at: null }], error: null }
    const READY = { data: [{ assessment_id: ASSESSMENT_ID, ia_explanation_full: FULL_MARKDOWN, computed_at: null }], error: null }
    h.state.rpc = EMPTY
    let finish: (value: { data: unknown; error: unknown }) => void = () => undefined
    h.invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    renderPage()
    expect(await screen.findByText('Preparando sua análise detalhada…')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-preparing')).toHaveAttribute('role', 'status')
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(1))
    expect(h.invoke).toHaveBeenCalledWith('generate-explanation', expect.objectContaining({
      body: { assessment_id: ASSESSMENT_ID, mode: 'full' },
    }))
    // O corpo nunca leva session_id: a posse é provada pelo JWT da sessão.
    expect(JSON.stringify(h.invoke.mock.calls[0][1])).not.toContain('session_id')

    h.state.rpc = READY
    finish({ data: { status: 'ready' }, error: null })
    expect(await screen.findByRole('button', { name: 'Avaliação geral' })).toBeInTheDocument()
    expect(screen.queryByText('Preparando sua análise detalhada…')).not.toBeInTheDocument()
    expect(h.invoke).toHaveBeenCalledTimes(1)
  })

  it('DI-018: generate-explanation responde 403 → acesso não ativo, assinatura recarregada e sem nova tentativa', async () => {
    h.state.rpc = { data: [{ assessment_id: ASSESSMENT_ID, ia_explanation_full: null, computed_at: null }], error: null }
    h.invoke.mockImplementation(async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 403 } } }))
    renderPage()
    expect(await screen.findByText('Seu acesso à análise completa não está ativo')).toBeInTheDocument()
    await waitFor(() => expect(h.refreshUser).toHaveBeenCalledTimes(1))
    expect(h.invoke).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link', { name: /chat IA/ })).not.toBeInTheDocument()
  })

  it('DI-018: muita procura (202 deferred) → aviso com "Tentar de novo", sem repetir sozinho', async () => {
    h.state.rpc = { data: [{ assessment_id: ASSESSMENT_ID, ia_explanation_full: null, computed_at: null }], error: null }
    h.invoke.mockImplementation(async () => ({ data: { status: 'deferred', reason: 'capacity' }, error: null }))
    renderPage()
    expect(await screen.findByText('Muitas análises sendo preparadas agora')).toBeInTheDocument()
    expect(h.invoke).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2))
  })

  it('DI-018: erro 500 da função → mensagem amigável e "Tentar de novo" (sem detalhes técnicos)', async () => {
    h.state.rpc = { data: [{ assessment_id: ASSESSMENT_ID, ia_explanation_full: null, computed_at: null }], error: null }
    h.invoke.mockImplementation(async () => ({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status: 502 } },
    }))
    renderPage()
    expect(await screen.findByText('Não foi possível preparar sua análise agora')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('non-2xx')
  })

  it('DI-018: sessão expirada na geração (401) → pede para entrar de novo', async () => {
    h.state.rpc = { data: [{ assessment_id: ASSESSMENT_ID, ia_explanation_full: null, computed_at: null }], error: null }
    h.invoke.mockImplementation(async () => ({ data: null, error: { name: 'FunctionsHttpError', context: { status: 401 } } }))
    renderPage()
    expect(await screen.findByText('Sua sessão expirou')).toBeInTheDocument()
  })

  it('servidor responde Payment required → acesso não ativo e a assinatura é recarregada uma vez', async () => {
    h.state.rpc = { data: null, error: { code: 'PT402', message: 'Payment required' } }
    renderPage()
    expect(await screen.findByText('Seu acesso à análise completa não está ativo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver opções no painel' })).toHaveAttribute('href', '/dashboard?acesso=expirado')
    // Uma ação só: os atalhos para chat e documentos somem.
    expect(screen.queryByRole('link', { name: /chat IA/ })).not.toBeInTheDocument()
    await waitFor(() => expect(h.refreshUser).toHaveBeenCalledTimes(1))
    // Payment required não é tentado de novo e não dispara a geração.
    expect(h.rpc).toHaveBeenCalledTimes(1)
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('sessão expirada (PT401) → pede para entrar de novo e voltar para a análise', async () => {
    h.state.rpc = { data: null, error: { code: 'PT401', message: 'Authentication required' } }
    renderPage()
    expect(await screen.findByText('Sua sessão expirou')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar de novo' })).toHaveAttribute(
      'href',
      '/login?next=%2Fdashboard%2Fanalysis',
    )
  })

  it('assessment que não é da conta (PT404) → explica e não oferece repetir', async () => {
    h.state.rpc = { data: null, error: { code: 'PT404', message: 'Not found' } }
    renderPage()
    expect(await screen.findByText('Não encontramos a análise deste diagnóstico na sua conta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
  })

  it('banco fora do ar e sem localStorage → erro com "Tentar de novo" (não "faça o diagnóstico")', async () => {
    h.state.rowError = { code: '500', message: 'network' }
    renderPage()
    // O hook tenta 1 vez de novo (~1 s) antes de mostrar o erro.
    expect(await screen.findByText('Não foi possível carregar seu diagnóstico', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Fazer o diagnóstico' })).not.toBeInTheDocument()
  })

  it('banco fora do ar, mas com o localStorage deste navegador → mostra as vias', async () => {
    h.state.rowError = { code: '500', message: 'network' }
    localStorage.setItem(
      'dr_imigrante_quiz_result',
      JSON.stringify({ assessmentId: ASSESSMENT_ID, answers: ANSWERS, score: { percentage: 80, category: 'alta' } }),
    )
    renderPage()
    const paths = await screen.findByRole('region', { name: 'Caminhos para a nacionalidade' }, { timeout: 4000 })
    expect(within(paths).getByText('Nacionalidade por descendência (1.º grau)')).toBeInTheDocument()
  })

  it('aponta para a seção de requisitos da análise enquanto os documentos de cada via não foram preenchidos', async () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    renderPage()
    await screen.findByRole('button', { name: 'Avaliação geral' })
    const paths = screen.getByRole('region', { name: 'Caminhos para a nacionalidade' })
    const link = within(paths).getByRole('link', { name: 'Requisitos principais' })
    expect(link).toHaveAttribute('href', '#analise-requisitos-principais')
    const requirements = screen.getByRole('button', { name: 'Requisitos principais' })
    expect(requirements).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(link)
    expect(requirements).toHaveAttribute('aria-expanded', 'true')
  })

  it('análise antiga com títulos em negrito também vira acordeão, sem ** na tela', async () => {
    h.state.rpc = {
      data: [
        {
          assessment_id: ASSESSMENT_ID,
          ia_explanation_full: '**1) Avaliação geral**\nTexto um.\n\n**2) Próximos passos**\nTexto dois.',
          computed_at: null,
        },
      ],
      error: null,
    }
    renderPage()
    expect(await screen.findByRole('button', { name: 'Avaliação geral' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Próximos passos' })).toHaveAttribute('aria-expanded', 'false')
    expect(document.body.textContent).not.toContain('**')
  })

  it('contato de suporte usa o e-mail de src/config/contact.ts', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Avaliação geral' })
    const support = screen.getByRole('link', { name: /Falar com o suporte/ })
    expect(support.getAttribute('href')?.startsWith(`mailto:${SUPPORT_EMAIL}`)).toBe(true)
  })

  it('PDF: o botão chama window.print e registra o evento', async () => {
    const print = vi.fn()
    window.print = print
    renderPage()
    await screen.findByRole('button', { name: 'Avaliação geral' })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar em PDF' }))
    expect(print).toHaveBeenCalledTimes(1)
    expect(h.track).toHaveBeenCalledWith('analysis_pdf_clicked')
  })

  it('localStorage antigo com vias de visto (D7) não aparece: as vias vêm das respostas', async () => {
    localStorage.setItem(
      'dr_imigrante_quiz_result',
      JSON.stringify({
        assessmentId: ASSESSMENT_ID,
        answers: ANSWERS,
        visas: [{ code: 'D7', name: 'Visto D7', match: 'strong' }],
        score: { percentage: 80, category: 'alta' },
      }),
    )
    renderPage()
    const paths = await screen.findByRole('region', { name: 'Caminhos para a nacionalidade' })
    expect(within(paths).queryByText(/D7/)).not.toBeInTheDocument()
    expect(within(paths).getByText('Nacionalidade por descendência (1.º grau)')).toBeInTheDocument()
  })
})

describe('AnalysisPage — sem acesso', () => {
  it('quem não pagou vê a oferta de €30 e a análise não é pedida', async () => {
    h.state.hasAccess = () => false
    h.state.access = { state: 'none', expiresAt: null, daysLeft: null, hasPaidOnce: false, isStaff: false }
    renderPage()
    expect(await screen.findByRole('link', { name: 'Desbloquear por €30' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('4,90')
    await waitFor(() => expect(h.rpc).not.toHaveBeenCalled())
    // DI-018: sem pagamento, a análise completa nunca é gerada.
    expect(h.invoke).not.toHaveBeenCalled()
  })

  it('acesso expirado leva ao painel', async () => {
    h.state.hasAccess = () => false
    h.state.access = { state: 'expired', expiresAt: new Date(0), daysLeft: 0, hasPaidOnce: true, isStaff: false }
    renderPage()
    expect(await screen.findByRole('link', { name: 'Ver opções no painel' })).toHaveAttribute('href', '/dashboard?acesso=expirado')
    expect(h.rpc).not.toHaveBeenCalled()
    expect(h.invoke).not.toHaveBeenCalled()
  })
})

describe('AnalysisPage — partilha com a família (DI-053)', () => {
  it('convite para o quiz grátis, fora da impressão e sem dados da conta no link', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'share')
    Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: undefined })
    try {
      renderPage()
      await screen.findByRole('heading', { name: 'Caminhos para a nacionalidade' })

      const share = screen.getByTestId('share-with-family')
      expect(share.closest('[data-print-hide]')).not.toBeNull()
      await userEvent.click(within(share).getByRole('button', { name: 'Compartilhar com a família' }))

      const href = within(share).getByRole('link', { name: 'Enviar pelo WhatsApp' }).getAttribute('href') ?? ''
      const text = new URL(href).searchParams.get('text') ?? ''
      const shared = new URL(text.slice(text.indexOf('http')))
      expect(shared.pathname).toBe('/quiz')
      expect(Object.fromEntries(shared.searchParams)).toEqual({
        utm_source: 'share',
        utm_medium: 'whatsapp',
        utm_campaign: 'analysis',
      })
      expect(text).not.toMatch(/Ana|ana@example\.com|0000-|%/)
    } finally {
      if (original) Object.defineProperty(navigator, 'share', original)
      else delete (navigator as { share?: unknown }).share
    }
  })
})
