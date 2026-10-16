/**
 * DI-074 — idioma único pt-BR no funil público.
 *
 * - findPtPtMarkers acha as construções de pt-PT do glossário, com acentos, e
 *   ignora os termos oficiais portugueses e o inglês dos identificadores;
 * - nenhum arquivo do funil público (landing, quiz, checkout, login, páginas
 *   legais do pacote, layout público, index.html) tem marcador de pt-PT;
 * - o glossário (lookbehind e `\p{L}`) fica fora do bundle do cliente: só
 *   testes importam copy-glossary.ts, e copy.ts não monta regex.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { QUIZ_CTA_LABEL } from './copy'
import { OFFICIAL_PT_TERMS, PT_BR_GLOSSARY, findPtPtMarkers } from './copy-glossary'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** Arquivos do funil público cobertos pela varredura (caminhos relativos a src/lib). */
const FUNNEL_FILES = [
  '../../index.html',
  '../hooks/useSEO.ts',
  '../pages/LandingPage.tsx',
  '../components/landing/MobileStickyCta.tsx',
  '../components/landing/Faq.tsx',
  '../pages/quiz/QuizPage.tsx',
  '../components/quiz/QuizQuestion.tsx',
  '../components/quiz/QuizIntro.tsx',
  '../components/quiz/QuizProgress.tsx',
  '../components/quiz/QuizCaptureForm.tsx',
  '../data/quiz-questions.ts',
  '../pages/checkout/CheckoutPage.tsx',
  '../pages/checkout/SuccessPage.tsx',
  '../pages/auth/LoginPage.tsx',
  '../pages/auth/AuthCallbackPage.tsx',
  '../pages/NotFoundPage.tsx',
  '../components/CookieBanner.tsx',
  '../components/layout/Header.tsx',
  '../components/layout/Footer.tsx',
  '../components/ui/StickyCTA.tsx',
  '../pages/legal/TermsPage.tsx',
  '../pages/legal/CookiesPage.tsx',
  '../pages/legal/LegalLayout.tsx',
  './copy.ts',
]

/** Arquivos .ts/.tsx de src que vão para o bundle (sem testes nem src/test), relativos a src/. */
const clientSourceFiles = (): string[] =>
  readdirSync(new URL('../', import.meta.url), { recursive: true, encoding: 'utf8' })
    .map((path) => path.split('\\').join('/'))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('test/'))

describe('findPtPtMarkers', () => {
  it.each([
    ['Introduza o seu e-mail', 'Introduza'],
    ['Partilhe o resultado', 'Partilhe'],
    ['A nossa equipa responde', 'equipa'],
    ['Saltar esta pergunta', 'Saltar'],
    ['A processar…', 'A processar'],
    ['<span>A carregar</span>', 'A carregar'],
    ['O pagamento está a ser… está a processar', 'está a processar'],
    ['Gerir a subscrição', 'subscrição'],
    ['Para aceder ao painel', 'aceder'],
    ['Activar a conta', 'Activar'],
    ['Os dados exactos', 'exactos'],
    ['Um óptimo caminho', 'óptimo'],
    ['A direcção do processo', 'direcção'],
    ['O seu telemóvel', 'telemóvel'],
    ['No ecrã inicial', 'ecrã'],
    ['O utilizador', 'utilizador'],
    ['Envie o ficheiro', 'ficheiro'],
    ['O nosso contacto', 'contacto'],
    ['Fale connosco', 'connosco'],
    ['As ex-colónias portuguesas', 'colónias'],
    ['<html lang="pt-PT">', 'pt-PT'],
  ])('acha "%s"', (text, expected) => {
    expect(findPtPtMarkers(text).map((m) => m.match)).toEqual([expected])
  })

  it('não acusa pt-BR, inglês do código nem termos oficiais portugueses', () => {
    const text = [
      'Digite o seu e-mail e compartilhe o resultado com a equipe.',
      'Pular esta pergunta. Processando… Assinatura ativa. Acessar o painel. Dados exatos.',
      'Volte a enviar documentos. Ver como voltar a enviar. Ele está a par do caso. Vamos a Portugal.',
      'Ótimo. Direção, seleção e ficção. Celular, tela, usuário, arquivo, contato, conosco, ex-colônias.',
      'document.activeElement; isActive; exactMatch; contactEmail; subscription; introduce(); actual',
      ...OFFICIAL_PT_TERMS,
      'Certificado de Registo Criminal e Conservatória dos Registos Centrais',
    ].join('\n')
    expect(findPtPtMarkers(text)).toEqual([])
  })

  it('devolve a sugestão em pt-BR e a posição, na ordem do texto', () => {
    const markers = findPtPtMarkers('Fale connosco pelo telemóvel')
    expect(markers).toEqual([
      { match: 'connosco', ptBR: 'conosco', index: 5 },
      { match: 'telemóvel', ptBR: 'celular', index: 19 },
    ])
  })

  it('todo item do glossário tem as duas grafias e um padrão sem estado (sem /g)', () => {
    for (const entry of PT_BR_GLOSSARY) {
      expect(entry.ptPT.trim()).not.toBe('')
      expect(entry.ptBR.trim()).not.toBe('')
      expect(entry.pattern.global).toBe(false)
    }
  })
})

describe('funil público em pt-BR (DI-074)', () => {
  it.each(FUNNEL_FILES)('%s sem marcadores de pt-PT', (path) => {
    const markers = findPtPtMarkers(read(path)).map(({ match, ptBR }) => `${match} → ${ptBR}`)
    expect(markers).toEqual([])
  })

  it('index.html declara pt-BR (lang e og:locale)', () => {
    const html = read('../../index.html')
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('<meta property="og:locale" content="pt_BR" />')
  })

  it('o CTA do quiz tem um rótulo só', () => {
    expect(QUIZ_CTA_LABEL).toBe('Fazer o diagnóstico grátis')
  })
})

describe('glossário fora do bundle do cliente', () => {
  it('copy.ts (importado por Header, Landing e 404) não monta regex', () => {
    const source = read('./copy.ts')
      // Ignora comentários: só o código conta.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(source).not.toMatch(/new RegExp|\(\?<[=!]|\\p\{/)
  })

  it('nenhum arquivo do cliente importa copy-glossary.ts', () => {
    const files = clientSourceFiles()
    expect(files).toContain('lib/copy.ts')
    // Qualquer especificador de módulo que aponte para ele (import, export ou import()).
    const importers = files.filter((path) => /['"][^'"\n]*\/copy-glossary(?:\.ts)?['"]/.test(read(`../${path}`)))
    expect(importers).toEqual([])
  })
})
