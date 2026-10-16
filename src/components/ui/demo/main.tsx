// Entrada da página de demonstração (somente desenvolvimento; fora do build).
import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { UiDemo } from './UiDemo'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MemoryRouter>
      <UiDemo />
    </MemoryRouter>
  </React.StrictMode>,
)
