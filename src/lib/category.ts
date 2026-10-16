/**
 * Apresentação única de cada categoria do pré-resultado (DI-029).
 *
 * Fonte de verdade do rótulo, do texto de apoio, do tom de cor e do ícone de
 * "alta", "média" e "baixa". Usada pelo computeScore (src/data/quiz-questions.ts),
 * pela ResultsPage e pelo useAssessmentResult (painel), para que o resultado
 * apareça igual vindo do quiz, ao recarregar e em outro aparelho.
 *
 * Módulo PURO, sem dependências nem aliases (`@/`): o Deno importa
 * src/data/quiz-questions.ts nos testes de paridade (supabase/functions/_shared),
 * e este arquivo vem junto. Por isso o ícone é o NOME do ícone do lucide-react
 * (o componente fica em src/components/results/CategoryIcon.tsx) e as cores são
 * classes do Tailwind com tokens semânticos.
 *
 * Copy: pt-BR com "você", sem prometer aprovação. "Baixa" é apresentada como
 * caminho ainda sem saída direta, com alternativas a avaliar — nunca como garantia.
 */

export type ScoreCategory = 'alta' | 'media' | 'baixa'

export const SCORE_CATEGORIES: readonly ScoreCategory[] = ['alta', 'media', 'baixa']

/** Limiares do percentual (iguais aos de _shared/quiz-engine.ts → scoreCategoryFor). */
export const CATEGORY_THRESHOLDS = { alta: 60, media: 35 } as const

/** Nome do ícone do lucide-react (mapeado em CategoryIcon.tsx). */
export type CategoryIconName = 'sparkles' | 'trending-up' | 'compass'

export interface CategoryTone {
  /** Cor de destaque (ícone, percentual). Contraste AA sobre branco e sobre o tom a 8%. */
  readonly text: string
  /** Fundo tingido do cartão do resultado. */
  readonly tint: string
  /** Preenchimento do medidor. */
  readonly bar: string
}

export interface CategoryPresentation {
  readonly category: ScoreCategory
  /** Título do resultado (h1 do /results e rótulo no painel). Sentence case. */
  readonly label: string
  /** Texto de apoio logo abaixo do título. */
  readonly sublabel: string
  /** Nome curto da faixa no medidor. */
  readonly rangeLabel: string
  /** Subtítulo honesto da oferta da análise completa para esta categoria (DI-030). */
  readonly offerSubtitle: string
  readonly icon: CategoryIconName
  readonly tone: CategoryTone
}

export const CATEGORY_PRESENTATION: Readonly<Record<ScoreCategory, CategoryPresentation>> = {
  alta: {
    category: 'alta',
    label: 'Alta elegibilidade',
    sublabel:
      'Suas respostas indicam boas chances de pedir a nacionalidade portuguesa. A análise completa mostra o caminho mais direto e os documentos de cada etapa.',
    rangeLabel: 'Alta',
    offerSubtitle:
      'Veja por que esse é o caminho mais indicado para você, os requisitos principais e os próximos passos para o pedido.',
    icon: 'sparkles',
    tone: {
      text: 'text-[hsl(var(--success))]',
      tint: 'bg-[hsl(var(--success)/0.06)]',
      bar: 'bg-[hsl(var(--success))]',
    },
  },
  media: {
    category: 'media',
    label: 'Média elegibilidade',
    sublabel: 'Existe um caminho possível, mas há condições a cumprir ou documentos a reunir antes de fazer o pedido.',
    rangeLabel: 'Média',
    offerSubtitle: 'Veja o que ainda falta cumprir, os pontos de atenção e os próximos passos antes de fazer o pedido.',
    icon: 'trending-up',
    tone: {
      text: 'text-[hsl(var(--warning))]',
      tint: 'bg-[hsl(var(--warning)/0.06)]',
      bar: 'bg-[hsl(var(--warning))]',
    },
  },
  baixa: {
    category: 'baixa',
    label: 'Elegibilidade baixa no momento',
    sublabel:
      'Suas respostas ainda não apontam um caminho direto para a nacionalidade. Pode haver alternativas, dependendo de documentos, do tempo de residência ou de laços familiares.',
    rangeLabel: 'Baixa',
    offerSubtitle:
      'Entenda o que hoje impede um caminho direto, os pontos de atenção e as alternativas que você pode avaliar.',
    icon: 'compass',
    tone: {
      text: 'text-primary',
      tint: 'bg-primary/[.06]',
      bar: 'bg-primary',
    },
  },
}

export function isScoreCategory(value: unknown): value is ScoreCategory {
  return typeof value === 'string' && (SCORE_CATEGORIES as readonly string[]).includes(value)
}

/** Categoria a partir do percentual já arredondado (60% ou mais = alta; 35% ou mais = média). */
export function categoryForPercentage(percentage: number): ScoreCategory {
  if (percentage >= CATEGORY_THRESHOLDS.alta) return 'alta'
  if (percentage >= CATEGORY_THRESHOLDS.media) return 'media'
  return 'baixa'
}

/**
 * Apresentação da categoria. Valor desconhecido (dado antigo ou corrompido) cai
 * em "baixa", que não promete nada — nunca exibe o código cru nem um símbolo.
 */
export function getCategoryPresentation(category: unknown): CategoryPresentation {
  return isScoreCategory(category) ? CATEGORY_PRESENTATION[category] : CATEGORY_PRESENTATION.baixa
}
