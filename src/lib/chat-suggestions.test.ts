import { describe, expect, it } from 'vitest'
import { CHAT_SUGGESTIONS_MAX, getChatSuggestions } from './chat-suggestions'
import { NATIONALITY_PATH_CODES } from '@/data/nationality-paths'

describe('getChatSuggestions (DI-051)', () => {
  it('começa pela pergunta da via e fica em no máximo 4', () => {
    const list = getChatSuggestions('nacionalidade_casamento')
    expect(list).toHaveLength(CHAT_SUGGESTIONS_MAX)
    expect(list[0]).toMatch(/casamento/)
    expect(new Set(list).size).toBe(list.length)
  })

  it('sem via (ou via desconhecida, ex.: visto antigo): só perguntas gerais', () => {
    for (const code of [null, undefined, 'D7']) {
      const list = getChatSuggestions(code)
      expect(list).toHaveLength(CHAT_SUGGESTIONS_MAX)
      expect(list.join(' ')).not.toMatch(/D7|visto/i)
    }
  })

  it('toda via tem pergunta própria, sempre em forma de pergunta (sem afirmar prazos ou valores)', () => {
    for (const code of NATIONALITY_PATH_CODES) {
      const [first] = getChatSuggestions(code)
      expect(first.trim().endsWith('?')).toBe(true)
      expect(first).not.toMatch(/€|\d/)
    }
  })
})
