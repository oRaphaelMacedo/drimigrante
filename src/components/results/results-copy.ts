/**
 * Textos e regras puras da tela de resultado (DI-030, DI-070).
 *
 * Sem JSX nem efeitos: testado em results-copy.test.ts. Tudo o que fala da
 * oferta vem de OFFER (src/lib/offer.ts) — nada de preço ou prazo fixo aqui.
 */
import { OFFER, type Offer } from '@/lib/offer'
import { isFilledValue } from '@/data/company'
import { getNationalityPath } from '@/data/nationality-paths'
import type { VisaSuggestion } from '@/data/quiz-questions'

export type PathMatch = VisaSuggestion['match']

/** Ordem do teaser: o caminho mais forte primeiro. */
const MATCH_RANK: Record<PathMatch, number> = { strong: 0, possible: 1, weak: 2 }

function rankOf(match: string): number {
  return MATCH_RANK[match as PathMatch] ?? MATCH_RANK.weak
}

/** Caminhos ordenados strong > possible > weak, mantendo a ordem original no empate. */
export function sortPathways<T extends { match: string }>(pathways: readonly T[]): T[] {
  return pathways
    .map((pathway, index) => ({ pathway, index }))
    .sort((a, b) => rankOf(a.pathway.match) - rankOf(b.pathway.match) || a.index - b.index)
    .map(({ pathway }) => pathway)
}

/** Nome exibido do caminho: o título em sentence case do catálogo, se houver. */
export function pathwayTitle(pathway: { code: string; name: string }): string {
  return getNationalityPath(pathway.code)?.title ?? pathway.name
}

/**
 * Trecho nítido + trecho desfocado da justificativa (o blur é decisão do dono).
 * Mostra até `visibleWords` palavras e deixa pelo menos 2 desfocadas.
 */
export function splitTeaser(reason: string, visibleWords = 5): { visible: string; hidden: string } {
  const words = reason.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return { visible: '', hidden: '' }
  const count = Math.max(0, Math.min(visibleWords, words.length - 2))
  return { visible: words.slice(0, count).join(' '), hidden: words.slice(count).join(' ') }
}

/** Como cada caminho entra no título da oferta: "veja o passo a passo para …". */
const OFFER_PATH_PHRASE: Partial<Record<string, string>> = {
  nacionalidade_descendencia_1: 'a nacionalidade por descendência',
  nacionalidade_descendencia_2: 'a nacionalidade por descendência',
  pesquisa_genealogica: 'descobrir seus antepassados portugueses',
  nacionalidade_casamento: 'a nacionalidade pelo casamento ou união estável',
  nacionalidade_nascimento: 'a nacionalidade por nascimento em Portugal',
  naturalizacao_residencia: 'a naturalização por residência',
  reaquisicao_nacionalidade: 'reaver a nacionalidade portuguesa',
  nacionalidade_ex_colonias: 'a nacionalidade pela origem familiar nas ex-colônias',
}

/** Primeiro nome para saudação (sem espaços extras); `null` se vazio. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first ? first : null
}

/**
 * Título da oferta com o caminho mais forte (DI-030). Sem caminho conhecido
 * (ex.: análise individual), um título neutro.
 */
export function offerTitle(firstName: string | null, strongest: { code: string } | null | undefined): string {
  const phrase = strongest ? OFFER_PATH_PHRASE[strongest.code] : undefined
  const lead = firstName ? `${firstName}, veja` : 'Veja'
  return phrase ? `${lead} o passo a passo para ${phrase}` : `${lead} a análise completa do seu caso`
}

/** Itens incluídos prontos para exibir (vazios ou placeholders não aparecem). */
export function offerIncludes(offer: Offer = OFFER): string[] {
  return offer.includes.filter((item) => isFilledValue(item)).map((item) => item.trim())
}

export interface FaqItem {
  readonly question: string
  readonly answer: string
}

/**
 * Mini-FAQ da oferta, montada a partir de OFFER (DI-030). Garantia e revisão
 * humana só aparecem se o dono preencher `guarantee`/`reviewedBy`.
 */
export function offerFaq(offer: Offer = OFFER): FaqItem[] {
  const chat = offer.includesChat ? ' e ao chat IA' : ''
  const reviewer = isFilledValue(offer.reviewedBy) ? ` e revisada por ${offer.reviewedBy.trim()}` : ''
  const items: FaqItem[] = [
    {
      question: 'Quando recebo a análise?',
      answer: `${offer.delivery}, no seu painel. Você entra com o e-mail informado acima.`,
    },
    {
      question: 'Por quanto tempo tenho acesso?',
      answer: `O acesso ao painel${chat} dura ${offer.accessDays} dias. É um pagamento único de ${offer.priceLabel}, sem renovação automática.`,
    },
    {
      question: 'A análise substitui uma consulta jurídica?',
      answer: `Não. Ela é informativa: é gerada a partir das suas respostas e das regras da Lei da Nacionalidade, com apoio de inteligência artificial${reviewer}, e indica quando vale procurar um profissional.`,
    },
  ]
  if (isFilledValue(offer.guarantee)) {
    items.push({ question: 'E se eu não ficar satisfeito?', answer: offer.guarantee.trim() })
  }
  return items
}
