// @vitest-environment jsdom
/**
 * DI-043 — formulário de captura antes do resultado:
 *  - sem bolha nativa (noValidate) e erros ligados ao campo (aria-invalid,
 *    aria-describedby, role="alert");
 *  - opt-in de novidades desmarcado por padrão e enviado no LeadInfo;
 *  - linha de privacidade com link para /privacidade;
 *  - campos com 16px (text-base) e Enter levando ao próximo campo.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { QuizCaptureForm } from './QuizCaptureForm'

function renderForm() {
  const onSubmit = vi.fn()
  render(
    <MemoryRouter>
      <QuizCaptureForm onSubmit={onSubmit} isSubmitting={false} />
    </MemoryRouter>,
  )
  return { onSubmit, user: userEvent.setup() }
}

const nameInput = () => screen.getByLabelText(/Como podemos te chamar\?/)
const emailInput = () => screen.getByLabelText(/^E-mail/)
const phoneInput = () => screen.getByLabelText(/WhatsApp/)
const optIn = () => screen.getByRole('checkbox', { name: /novidades/ })
const submitButton = () => screen.getByRole('button', { name: /Ver meu resultado/ })

describe('QuizCaptureForm (DI-043)', () => {
  it('não usa a validação nativa e mostra os erros ligados aos campos', async () => {
    const { onSubmit, user } = renderForm()
    const form = document.getElementById('quiz-capture-form') as HTMLFormElement
    expect(form.noValidate).toBe(true)

    await user.click(submitButton())

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.map((a) => a.textContent)).toEqual([
      expect.stringContaining('Informe como podemos te chamar'),
      expect.stringContaining('Informe o seu e-mail'),
    ])
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(emailInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput().getAttribute('aria-describedby')).toContain('capture-name-error')
    expect(onSubmit).not.toHaveBeenCalled()
    // O foco vai para o primeiro campo com erro.
    expect(nameInput()).toHaveFocus()
  })

  it('e-mail incompleto: mensagem própria; telefone opcional inválido também avisa', async () => {
    const { onSubmit, user } = renderForm()
    await user.type(nameInput(), 'Ana')
    await user.type(emailInput(), 'ana@')
    await user.type(phoneInput(), '12ab')
    await user.click(submitButton())

    expect(await screen.findByText(/Confira o e-mail/)).toBeInTheDocument()
    expect(screen.getByText(/Confira o número/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('opt-in começa desmarcado e chega como false; marcado chega como true', async () => {
    const { onSubmit, user } = renderForm()
    expect(optIn()).not.toBeChecked()

    await user.type(nameInput(), '  Ana Silva ')
    await user.type(emailInput(), 'ana@example.com')
    await user.click(submitButton())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenLastCalledWith({
      fullName: 'Ana Silva',
      email: 'ana@example.com',
      phone: undefined,
      marketingOptIn: false,
    })

    await user.click(optIn())
    await user.type(phoneInput(), '+55 11 99999-9999')
    await user.click(submitButton())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ phone: '+55 11 99999-9999', marketingOptIn: true }),
    )
  })

  it('linha de privacidade com link para /privacidade (sem prometer "nunca partilhados")', () => {
    renderForm()
    expect(screen.getByText(/Usamos seus dados para o seu diagnóstico/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Política de Privacidade/ })
    expect(link).toHaveAttribute('href', '/privacidade')
    expect(document.body.textContent).not.toMatch(/terceiros|partilhad|Introduza|Quase lá/i)
  })

  it('campos com 16px, teclado certo e sem emoji no cabeçalho', () => {
    renderForm()
    for (const input of [nameInput(), emailInput(), phoneInput()]) {
      expect(input.className).toContain('text-base')
    }
    expect(emailInput()).toHaveAttribute('inputmode', 'email')
    expect(emailInput()).toHaveAttribute('autocapitalize', 'none')
    expect(phoneInput()).toHaveAttribute('inputmode', 'tel')
    expect(nameInput()).toHaveAttribute('enterkeyhint', 'next')
    expect(document.body.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('Enter no nome leva ao e-mail e não envia', () => {
    const { onSubmit } = renderForm()
    nameInput().focus()
    fireEvent.keyDown(nameInput(), { key: 'Enter' })
    expect(emailInput()).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
