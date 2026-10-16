import { useMatch } from 'react-router-dom'

/**
 * Rotas do funil em "modo foco" (DI-038): header reduzido (só a marca), sem o
 * rodapé completo e com os links legais numa linha. Só o caminho exato:
 * /checkout/success, por exemplo, volta à navegação normal.
 */
export const FOCUS_MODE_PATHS = ['/quiz', '/results', '/checkout'] as const

/** `true` quando a rota atual é uma das etapas do funil (quiz, resultado, checkout). */
export function useFocusMode(): boolean {
  // Uma chamada por rota (número fixo de hooks em toda renderização).
  const quiz = useMatch(FOCUS_MODE_PATHS[0])
  const results = useMatch(FOCUS_MODE_PATHS[1])
  const checkout = useMatch(FOCUS_MODE_PATHS[2])
  return Boolean(quiz || results || checkout)
}
