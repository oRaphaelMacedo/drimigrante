import { describe, expect, it } from 'vitest'
import { slugify, splitMarkdownSections, stripStrayEmphasis } from './markdown-sections'

const FIVE_SECTIONS = [
  '## Avaliação geral',
  'Seu perfil é **compatível** com a via de descendência.',
  '',
  '## Caminho mais indicado',
  'Nacionalidade por descendência (1.º grau).',
  '',
  '## Requisitos principais',
  '- Certidão de nascimento',
  '- Registo Criminal',
  '',
  '## Pontos de atenção',
  'Confirme as regras atuais.',
  '',
  '## Próximos passos',
  '1. Reúna os documentos.',
].join('\n')

describe('splitMarkdownSections', () => {
  it('divide as 5 seções do generate-explanation', () => {
    const { intro, sections } = splitMarkdownSections(FIVE_SECTIONS)
    expect(intro).toBe('')
    expect(sections.map((s) => s.title)).toEqual([
      'Avaliação geral',
      'Caminho mais indicado',
      'Requisitos principais',
      'Pontos de atenção',
      'Próximos passos',
    ])
    expect(sections[0].id).toBe('analise-avaliacao-geral')
    expect(sections[2].body).toBe('- Certidão de nascimento\n- Registo Criminal')
    expect(sections.every((s) => !s.body.includes('## '))).toBe(true)
  })

  it('guarda o texto antes do primeiro título como introdução', () => {
    const { intro, sections } = splitMarkdownSections(`Olá.\n\n${FIVE_SECTIONS}`)
    expect(intro).toBe('Olá.')
    expect(sections).toHaveLength(5)
  })

  it('ignora um # título solto no topo', () => {
    const { intro, sections } = splitMarkdownSections(`# Análise de elegibilidade\n\n${FIVE_SECTIONS}`)
    expect(intro).toBe('')
    expect(sections).toHaveLength(5)
  })

  it('sem ## usa linhas inteiras em negrito como títulos (análises antigas)', () => {
    const legacy = '**1. Avaliação geral:**\nTexto um.\n\n**Próximos passos**\nTexto dois com **ênfase**.'
    const { sections } = splitMarkdownSections(legacy)
    expect(sections.map((s) => s.title)).toEqual(['Avaliação geral', 'Próximos passos'])
    expect(sections[1].body).toBe('Texto dois com **ênfase**.')
  })

  it('sem nenhum título vira uma única seção', () => {
    const { sections } = splitMarkdownSections('Só um parágrafo com **negrito**.')
    expect(sections).toEqual([
      { id: 'analise-analise-completa', title: 'Análise completa', body: 'Só um parágrafo com **negrito**.' },
    ])
  })

  it('não trata ## dentro de bloco de código como título', () => {
    const { sections } = splitMarkdownSections('## A\n```\n## não é título\n```\n## B\nfim')
    expect(sections.map((s) => s.title)).toEqual(['A', 'B'])
  })

  it('títulos repetidos ganham ids únicos', () => {
    const { sections } = splitMarkdownSections('## Passos\na\n## Passos\nb')
    expect(sections.map((s) => s.id)).toEqual(['analise-passos', 'analise-passos-2'])
  })

  it('vazio ou nulo não gera seções', () => {
    expect(splitMarkdownSections('')).toEqual({ intro: '', sections: [] })
    expect(splitMarkdownSections(null)).toEqual({ intro: '', sections: [] })
    expect(splitMarkdownSections('   \n  ')).toEqual({ intro: '', sections: [] })
  })

  it('aceita CRLF', () => {
    const { sections } = splitMarkdownSections('## A\r\nx\r\n## B\r\ny')
    expect(sections.map((s) => [s.title, s.body])).toEqual([
      ['A', 'x'],
      ['B', 'y'],
    ])
  })
})

describe('slugify', () => {
  it('remove acentos e símbolos', () => {
    expect(slugify('Pontos de atenção!')).toBe('pontos-de-atencao')
    expect(slugify('***')).toBe('secao')
  })
})

describe('stripStrayEmphasis', () => {
  it('remove ** soltos', () => {
    expect(stripStrayEmphasis('texto ** solto')).toBe('texto  solto')
    expect(stripStrayEmphasis('***triplo')).toBe('triplo')
    expect(stripStrayEmphasis('sem marcadores *ok*')).toBe('sem marcadores *ok*')
  })
})
