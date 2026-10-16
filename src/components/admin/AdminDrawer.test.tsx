// @vitest-environment jsdom
import { StrictMode, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminDrawer } from './AdminDrawer'

const drawerMarker = () => {
  const state: unknown = window.history.state
  return state && typeof state === 'object' ? (state as Record<string, unknown>).__adminDrawer : undefined
}

/** Editor montado só quando aberto, como o editor de tema do quiz. */
function Harness({ closeOnBack, onClosed }: { closeOnBack?: boolean; onClosed?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      {open && (
        <AdminDrawer
          open
          closeOnBack={closeOnBack}
          onOpenChange={(next) => {
            if (!next) {
              setOpen(false)
              onClosed?.()
            }
          }}
          title="Editar tema"
        >
          <p>Conteúdo</p>
        </AdminDrawer>
      )}
    </>
  )
}

afterEach(async () => {
  // Volta o histórico do jsdom ao estado inicial entre os testes.
  window.history.replaceState(null, '')
})

describe('AdminDrawer', () => {
  it('sem closeOnBack, não empilha entrada no histórico (menu do admin)', async () => {
    const user = userEvent.setup({ delay: null })
    render(<Harness />)
    const before = window.history.length
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('dialog', { name: 'Editar tema' })).toBeInTheDocument()
    expect(window.history.length).toBe(before)
    expect(drawerMarker()).toBeUndefined()
  })

  it('com closeOnBack, o "voltar" fecha o painel (também no StrictMode, que monta o efeito duas vezes)', async () => {
    const user = userEvent.setup({ delay: null })
    const onClosed = vi.fn()
    render(
      <StrictMode>
        <Harness closeOnBack onClosed={onClosed} />
      </StrictMode>,
    )
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(drawerMarker()).toEqual(expect.any(String))

    // A montagem dupla não pode fechar o painel sozinha.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(onClosed).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Editar tema' })).toBeInTheDocument()

    window.history.back()
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(drawerMarker()).toBeUndefined()
  })

  it('com closeOnBack, fechar pela interface desfaz a entrada empilhada', async () => {
    const user = userEvent.setup({ delay: null })
    const onClosed = vi.fn()
    render(<Harness closeOnBack onClosed={onClosed} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(drawerMarker()).toEqual(expect.any(String))

    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onClosed).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(drawerMarker()).toBeUndefined())
  })

  it('fechar e reabrir em seguida: o "voltar" atrasado do primeiro não fecha o segundo', async () => {
    const user = userEvent.setup({ delay: null })
    const onClosed = vi.fn()
    render(<Harness closeOnBack onClosed={onClosed} />)
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    // Reabre antes de o history.back() do fechamento terminar.
    await user.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(onClosed).toHaveBeenCalledTimes(1)

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByRole('dialog', { name: 'Editar tema' })).toBeInTheDocument()
    await waitFor(() => expect(drawerMarker()).toEqual(expect.any(String)))

    window.history.back()
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
