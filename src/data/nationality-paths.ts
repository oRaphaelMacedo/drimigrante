/**
 * nationality-paths — conteúdo de cada caminho para a nacionalidade portuguesa (DI-007).
 *
 * Indexado pelos códigos que `suggestVisas()` (src/data/quiz-questions.ts) devolve.
 * O teste nationality-paths.test.ts garante que todo código possível tem entrada aqui.
 * Também é a base do checklist de próximos passos (DI-049).
 *
 * AÇÃO DO DONO (ou de um advogado): preencher `timeline`, `documents` e `nextSteps`
 * de cada caminho. Enquanto um campo estiver com `PENDING` ('A_PREENCHER_PELO_DONO'),
 * ele NÃO é mostrado para quem pagou: as telas usam os helpers abaixo
 * (`getPathTimeline`, `getPathDocuments`, `getPathSteps`), que devolvem `null`/[]
 * para campos pendentes, e mostram uma copy neutra no lugar.
 *
 * Regras para preencher:
 *  - Não inventar requisitos legais, prazos nem documentos: só o que foi confirmado
 *    nas fontes oficiais (IRN, AIMA) ou por um profissional habilitado.
 *  - pt-BR com "você"; termos oficiais portugueses mantidos (Registo Criminal,
 *    Conservatória, AIMA).
 *  - `key` de documentos e etapas é estável (o checklist guarda o estado por chave):
 *    não renomeie uma chave já publicada; crie outra.
 *
 * Exemplo de caminho preenchido:
 *   timeline: 'Em geral, de X a Y meses depois da entrada do pedido.',
 *   documents: [{ key: 'certidao_nascimento', label: 'Certidão de nascimento', hint: '...' }],
 *   nextSteps: [{ key: 'pedir_certidoes', label: 'Pedir as certidões do antepassado' }],
 */

/** Marcador de conteúdo que o dono ainda precisa preencher. Nunca é renderizado. */
export const PENDING = 'A_PREENCHER_PELO_DONO' as const
export type Pending = typeof PENDING

export interface PathDocument {
  /** Chave estável (snake_case), usada pelo checklist. */
  readonly key: string
  readonly label: string
  /** Onde conseguir ou observação curta. */
  readonly hint?: string
}

export interface PathStep {
  /** Chave estável (snake_case), usada pelo checklist. */
  readonly key: string
  readonly label: string
  readonly detail?: string
}

/** Códigos que suggestVisas() pode devolver. */
export const NATIONALITY_PATH_CODES = [
  'nacionalidade_descendencia_1',
  'nacionalidade_descendencia_2',
  'pesquisa_genealogica',
  'nacionalidade_casamento',
  'nacionalidade_nascimento',
  'naturalizacao_residencia',
  'reaquisicao_nacionalidade',
  'nacionalidade_ex_colonias',
  'analise_personalizada',
] as const

export type NationalityPathCode = (typeof NATIONALITY_PATH_CODES)[number]

export interface NationalityPath {
  readonly code: NationalityPathCode
  /** Título em sentence case. */
  readonly title: string
  /** Para quem é o caminho (descrição neutra, sem requisitos legais). */
  readonly summary: string
  /** Prazo típico, confirmado pelo dono. */
  readonly timeline: string | Pending
  /** Documentos principais, confirmados pelo dono. */
  readonly documents: readonly PathDocument[] | Pending
  /** Próximos passos, em ordem, confirmados pelo dono. */
  readonly nextSteps: readonly PathStep[] | Pending
}

export const NATIONALITY_PATHS: Readonly<Record<NationalityPathCode, NationalityPath>> = {
  nacionalidade_descendencia_1: {
    code: 'nacionalidade_descendencia_1',
    title: 'Nacionalidade por descendência (1.º grau)',
    summary: 'Para quem é filho ou filha de pai ou mãe português(a).',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  nacionalidade_descendencia_2: {
    code: 'nacionalidade_descendencia_2',
    title: 'Nacionalidade por descendência (netos e bisnetos)',
    summary: 'Para quem é neto(a) ou bisneto(a) de português(a).',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  pesquisa_genealogica: {
    code: 'pesquisa_genealogica',
    title: 'Pesquisa genealógica',
    summary:
      'Para quem ainda não sabe se tem antepassados portugueses. Confirmar essa ligação vem antes de qualquer pedido de nacionalidade por descendência.',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  nacionalidade_casamento: {
    code: 'nacionalidade_casamento',
    title: 'Nacionalidade pelo casamento ou união estável',
    summary: 'Para quem é casado(a) ou vive em união estável documentada com cidadão(ã) português(a).',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  nacionalidade_nascimento: {
    code: 'nacionalidade_nascimento',
    title: 'Nacionalidade por nascimento em Portugal',
    summary: 'Para quem nasceu em Portugal e ainda não tem a nacionalidade portuguesa.',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  naturalizacao_residencia: {
    code: 'naturalizacao_residencia',
    title: 'Naturalização por residência',
    summary: 'Para quem mora em Portugal e quer pedir a nacionalidade pelo tempo de residência legal.',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  reaquisicao_nacionalidade: {
    code: 'reaquisicao_nacionalidade',
    title: 'Reaquisição da nacionalidade portuguesa',
    summary: 'Para quem já teve a nacionalidade portuguesa e a perdeu.',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  nacionalidade_ex_colonias: {
    code: 'nacionalidade_ex_colonias',
    title: 'Nacionalidade com origem familiar nas ex-colônias',
    summary: 'Para quem tem família originária das antigas colônias portuguesas.',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
  analise_personalizada: {
    code: 'analise_personalizada',
    title: 'Caso que pede análise individual',
    summary:
      'Suas respostas não apontam para um único caminho. A análise detalhada abaixo mostra as possibilidades do seu caso.',
    timeline: PENDING,
    documents: PENDING,
    nextSteps: PENDING,
  },
}

// ── Helpers (use sempre estes para renderizar) ───────────────────────────────

/** `true` quando o texto existe e não é (nem contém) o marcador de pendência. */
export function isFilledText(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && !trimmed.includes(PENDING)
}

export function isNationalityPathCode(code: unknown): code is NationalityPathCode {
  return typeof code === 'string' && (NATIONALITY_PATH_CODES as readonly string[]).includes(code)
}

/** Caminho do código, ou `null` para códigos desconhecidos. */
export function getNationalityPath(code: string | null | undefined): NationalityPath | null {
  return isNationalityPathCode(code) ? NATIONALITY_PATHS[code] : null
}

/** Prazo pronto para exibir, ou `null` se ainda pendente. */
export function getPathTimeline(path: NationalityPath | null | undefined): string | null {
  if (!path || path.timeline === PENDING) return null
  return isFilledText(path.timeline) ? path.timeline.trim() : null
}

function filledItems<T extends PathDocument | PathStep>(
  items: readonly T[] | Pending | undefined,
  extra: 'hint' | 'detail',
): T[] {
  if (!items || items === PENDING || !Array.isArray(items)) return []
  return items
    .filter((item) => isFilledText(item.key) && isFilledText(item.label))
    .map((item) => {
      const note: unknown = (item as unknown as Record<string, unknown>)[extra]
      // Observação pendente (ou vazia) não aparece; o item continua.
      if (note === undefined || (typeof note === 'string' && isFilledText(note))) return item
      return { ...item, [extra]: undefined }
    })
}

/** Documentos prontos para exibir (sem itens pendentes). Vazio = mostrar a copy neutra. */
export function getPathDocuments(path: NationalityPath | null | undefined): PathDocument[] {
  return filledItems(path?.documents, 'hint')
}

/** Próximos passos prontos para exibir (sem itens pendentes). */
export function getPathSteps(path: NationalityPath | null | undefined): PathStep[] {
  return filledItems(path?.nextSteps, 'detail')
}
