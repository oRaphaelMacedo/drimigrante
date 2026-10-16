/**
 * Sugestões de pergunta para começar o chat (DI-051).
 *
 * São só perguntas (a resposta vem da IA, com o contexto do diagnóstico):
 * nenhuma traz prazo, valor ou requisito afirmado aqui. Quatro no máximo —
 * uma da via mais compatível e três gerais.
 */
import { isNationalityPathCode, type NationalityPathCode } from '@/data/nationality-paths'

export const CHAT_SUGGESTIONS_MAX = 4

const PATH_QUESTION: Record<NationalityPathCode, string> = {
  nacionalidade_descendencia_1: 'Como funciona o pedido de nacionalidade para filhos de portugueses?',
  nacionalidade_descendencia_2: 'Como funciona o pedido de nacionalidade para netos de portugueses?',
  pesquisa_genealogica: 'Como encontro o registro de nascimento do meu antepassado português?',
  nacionalidade_casamento: 'O que preciso comprovar no pedido pelo casamento ou união estável?',
  nacionalidade_nascimento: 'Quem nasceu em Portugal pode pedir a nacionalidade? Como?',
  naturalizacao_residencia: 'Quanto tempo de residência legal conta para a naturalização?',
  reaquisicao_nacionalidade: 'Como pedir de volta a nacionalidade portuguesa que foi perdida?',
  nacionalidade_ex_colonias: 'Como comprovar a origem familiar nas antigas colônias portuguesas?',
  analise_personalizada: 'Quais informações ajudam a entender melhor o meu caso?',
}

const GENERAL_QUESTIONS = [
  'Quais documentos devo separar primeiro?',
  'Qual é o próximo passo no meu caso?',
  'Quanto tempo esse tipo de processo costuma levar?',
  'Onde dou entrada no pedido de nacionalidade?',
] as const

/** Perguntas sugeridas para a via mais compatível (ou só as gerais, sem via conhecida). */
export function getChatSuggestions(pathwayCode?: string | null): string[] {
  const specific = isNationalityPathCode(pathwayCode) ? PATH_QUESTION[pathwayCode] : null
  return [...(specific ? [specific] : []), ...GENERAL_QUESTIONS].slice(0, CHAT_SUGGESTIONS_MAX)
}
