// Setup global do Vitest (ver vitest.config.ts).
// Matchers do jest-dom (toBeInTheDocument, toHaveTextContent...) para testes de componentes.
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// Desmonta o que o @testing-library/react renderizou entre os testes.
// Só se aplica aos arquivos que rodam com `// @vitest-environment jsdom`.
afterEach(async () => {
  if (typeof document === 'undefined') return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
})
