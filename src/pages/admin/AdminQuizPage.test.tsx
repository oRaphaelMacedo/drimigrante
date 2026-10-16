// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuizQuestion } from '@/data/quiz-questions'

const mocks = vi.hoisted(() => ({
  questions: [] as unknown[],
  themes: [] as unknown[],
  createTheme: vi.fn(),
  updateTheme: vi.fn(),
}))

vi.mock('@/hooks/useQuizQuestions', () => ({
  useQuizQuestionsAdmin: () => ({ data: mocks.questions, isLoading: false, error: null }),
}))
vi.mock('@/hooks/useQuizAdmin', () => {
  const idle = { mutate: vi.fn(), isPending: false }
  return {
    useReorderQuestion: () => idle,
    useToggleQuestionActive: () => idle,
    useFormThemes: () => ({ data: mocks.themes }),
    useCreateTheme: () => ({ mutate: mocks.createTheme, isPending: false }),
    useUpdateTheme: () => ({ mutate: mocks.updateTheme, isPending: false }),
  }
})
// O editor de perguntas tem testes e E2E próprios; aqui só interessa a página.
vi.mock('@/components/quiz/QuizQuestionEditor', () => ({ QuizQuestionEditor: () => null }))

import { AdminQuizPage } from './AdminQuizPage'

const question = (key: string, extra: Partial<QuizQuestion> = {}): QuizQuestion =>
  ({
    key,
    text: `Pergunta ${key}`,
    fieldType: 'radio',
    themeCode: 'casamento',
    themeName: 'Casamento',
    themeColor: '#1f41c7',
    isRequired: true,
    options: [{ key: 'sim', label: 'Sim', score: 20 }],
    ...extra,
  }) as QuizQuestion

function renderPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminQuizPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mocks.createTheme.mockReset()
  mocks.updateTheme.mockReset()
  mocks.questions = [question('b1_tempo_casamento'), question('b2_filhos', { showIfRepaired: true })]
  mocks.themes = [
    {
      id: 't1',
      code: 'casamento',
      name_pt: 'Casamento',
      name_en: 'Marriage',
      color: '#1f41c7',
      icon: '💼',
      sort_order: 0,
      is_active: true,
    },
  ]
})

describe('AdminQuizPage', () => {
  it('mantém o h1 "Quiz", o aviso de condição incompleta e um botão "Editar" por pergunta', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Quiz' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 pergunta tem')
    const item = screen.getByText('b1_tempo_casamento').closest('li') as HTMLElement
    expect(within(item).getAllByRole('button', { name: /Editar/ })).toHaveLength(1)
  })

  it('o aviso de condição incompleta quebra o nome da migration (sem alargar a página a 360px)', () => {
    // Como em produção hoje: 9 perguntas com condição incompleta (migration 000200 não aplicada).
    mocks.questions = Array.from({ length: 9 }, (_, i) => question(`q${i}`, { showIfRepaired: true }))
    renderPage()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('9 perguntas têm condição de exibição incompleta')
    const text = status.querySelector('p') as HTMLElement
    // Item flex que pode encolher e quebrar em qualquer ponto.
    expect(text).toHaveClass('min-w-0', '[overflow-wrap:anywhere]')
    const file = within(status).getByText('20261016000200_fix_quiz_display_conditions.sql')
    expect(file.tagName).toBe('CODE')
    expect(file).toHaveClass('break-all')
  })

  it('o número da pergunta usa texto escuro sobre cor de tema clara', () => {
    mocks.questions = [question('claro', { themeColor: '#fdba2f' }), question('escuro', { themeColor: '#1f41c7' })]
    renderPage()
    const badge = (key: string) =>
      (screen.getByText(key).closest('li') as HTMLElement).querySelector('span[aria-hidden="true"]') as HTMLElement
    expect(badge('claro')).toHaveClass('text-foreground')
    expect(badge('escuro')).toHaveClass('text-primary-foreground')
  })

  it('o editor de tema abre com os dados do tema e reinicia vazio ao criar outro (sem efeito de sincronização)', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Editar tema Casamento' }))
    let dialog = screen.getByRole('dialog', { name: 'Editar tema' })
    expect(within(dialog).getByLabelText(/Nome \(PT\)/)).toHaveValue('Casamento')
    expect(within(dialog).getByLabelText('Nome (EN)')).toHaveValue('Marriage')
    expect(within(dialog).getByRole('button', { name: 'Usar o ícone 💼' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Novo tema' }))
    dialog = screen.getByRole('dialog', { name: 'Novo tema' })
    expect(within(dialog).getByLabelText(/Código/)).toHaveValue('')
    expect(within(dialog).getByLabelText(/Nome \(PT\)/)).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: 'Criar tema' })).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/Código/), 'Situação Nova')
    expect(within(dialog).getByLabelText(/Código/)).toHaveValue('situacao_nova')
    await user.type(within(dialog).getByLabelText(/Nome \(PT\)/), 'Situação nova')
    await user.click(within(dialog).getByRole('button', { name: 'Criar tema' }))
    expect(mocks.createTheme).toHaveBeenCalledWith(
      { code: 'situacao_nova', name_pt: 'Situação nova', name_en: null, color: '#3b62f6', icon: '❓' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  }, 15_000)

  it('Esc fecha o editor de tema', async () => {
    const user = userEvent.setup({ delay: null })
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Editar tema Casamento' }))
    expect(screen.getByRole('dialog', { name: 'Editar tema' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
