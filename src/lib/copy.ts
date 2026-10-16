/**
 * Idioma e textos compartilhados do funil público (DI-074).
 *
 * Decisão (até o dono vetar): **pt-BR com "você"** em todo o funil, porque o
 * público é majoritariamente brasileiro. `<html lang="pt-BR">`, `og:locale`
 * pt_BR e o manifest do PWA seguem a mesma regra.
 *
 * Termos oficiais portugueses ficam como são (OFFICIAL_PT_TERMS): são nomes de
 * órgãos, documentos e leis que a pessoa vai encontrar em Portugal.
 *
 * `findPtPtMarkers` aponta construções de pt-PT num texto; o teste
 * src/lib/copy.test.ts roda nos arquivos do funil público e falha se aparecer
 * alguma. Para um termo novo: acrescente a entrada em PT_BR_GLOSSARY.
 */

/** Rótulo único do CTA que leva ao quiz (header, landing e barra fixa). */
export const QUIZ_CTA_LABEL = 'Fazer o diagnóstico grátis'

/** Nomes oficiais portugueses mantidos na grafia de Portugal. */
export const OFFICIAL_PT_TERMS = [
  'AIMA',
  'IRN',
  'Conservatória dos Registos Centrais',
  'Conservatória',
  'Registo Criminal',
  'Certificado de Registo Criminal',
  'Autorização de Residência',
  'Bilhete de Identidade',
  'Lei da Nacionalidade',
  'NIF',
] as const

export interface GlossaryEntry {
  /** Como aparece em pt-PT (exemplo legível). */
  ptPT: string
  /** O que usar em pt-BR. */
  ptBR: string
  /** Padrão que identifica a forma pt-PT (sem falsos positivos em inglês do código). */
  pattern: RegExp
}

/**
 * Palavra inteira com acentos: `\b` do JavaScript só entende ASCII (falharia em
 * "óptimo" ou "ecrã"), então as bordas olham para letras e dígitos Unicode.
 */
const word = (source: string, flags = 'iu') =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`, flags)

/** Verbos de "em andamento" que o pt-PT usa com "a + infinitivo". */
const PROGRESS_VERBS =
  'processar|carregar|enviar|gerar|verificar|preparar|confirmar|abrir|analisar|calcular|guardar|redirecionar|criar|tentar'

/**
 * Glossário pt-PT → pt-BR do funil. Só formas que não existem em pt-BR (ou que,
 * no contexto de uma interface, são claramente de Portugal) e que não colidem
 * com o inglês dos identificadores do código.
 */
export const PT_BR_GLOSSARY: readonly GlossaryEntry[] = [
  { ptPT: 'Introduza', ptBR: 'Digite / Informe', pattern: word('introduza|introduzam') },
  { ptPT: 'partilhar / partilha', ptBR: 'compartilhar / compartilhamento', pattern: word('partilh\\p{L}*') },
  { ptPT: 'equipa', ptBR: 'equipe', pattern: word('equipas?') },
  { ptPT: 'Saltar (pular etapa)', ptBR: 'Pular', pattern: word('saltar') },
  {
    // "está a + infinitivo" (pt-PT) vira gerúndio; "voltar a enviar" é pt-BR e não entra.
    ptPT: 'está a carregar / estamos a processar',
    ptBR: 'está carregando / estamos processando',
    pattern: word(`(?:está|estão|estamos|estou|estava|estavam) a (?:${PROGRESS_VERBS})`),
  },
  {
    // "A processar…" no começo de um texto (rótulo de botão ou de estado).
    ptPT: 'A processar… / A carregar…',
    ptBR: 'Processando… / Carregando…',
    pattern: new RegExp(`(?<=^|[>'"“(\\n.!?:]\\s*)A (?:${PROGRESS_VERBS})(?![\\p{L}\\p{N}_])`, 'u'),
  },
  { ptPT: 'subscrição / subscrever', ptBR: 'assinatura / assinar', pattern: word('subscriç(?:ão|ões)|subscrev\\p{L}*') },
  { ptPT: 'aceder', ptBR: 'acessar', pattern: word('aced(?:er|e|a|am|em|ido|ida)') },
  { ptPT: 'activar / activo', ptBR: 'ativar / ativo', pattern: word('activ(?:ar|ado|ada|ados|adas|o|a|os|as|idade|ação)') },
  { ptPT: 'exacto', ptBR: 'exato', pattern: word('exact[oa]s?') },
  { ptPT: 'óptimo', ptBR: 'ótimo', pattern: word('óptim[oa]s?') },
  {
    ptPT: 'acção / direcção / selecção / projecto',
    ptBR: 'ação / direção / seleção / projeto',
    pattern: word('acç(?:ão|ões)|direcç(?:ão|ões)|selecç(?:ão|ões)|colecç(?:ão|ões)|protecç(?:ão|ões)|correcç(?:ão|ões)|recepç(?:ão|ões)|excepç(?:ão|ões)|projectos?|objectivos?|electrónic[oa]s?'),
  },
  { ptPT: 'telemóvel', ptBR: 'celular', pattern: word('telemóve(?:l|is)') },
  { ptPT: 'ecrã', ptBR: 'tela', pattern: word('ecrãs?') },
  { ptPT: 'utilizador', ptBR: 'usuário', pattern: word('utilizador(?:es|a|as)?') },
  { ptPT: 'ficheiro', ptBR: 'arquivo', pattern: word('ficheiros?') },
  { ptPT: 'contacto / contactar', ptBR: 'contato / contatar', pattern: word('contact(?:o|os|ar|e|em)') },
  { ptPT: 'connosco', ptBR: 'conosco', pattern: word('connosco') },
  { ptPT: 'colónias', ptBR: 'colônias', pattern: word('colónias?') },
  { ptPT: 'anónimo', ptBR: 'anônimo', pattern: word('anónim[oa]s?') },
  { ptPT: 'económico', ptBR: 'econômico', pattern: word('económic[oa]s?') },
  { ptPT: 'registado', ptBR: 'registrado / cadastrado', pattern: word('registad[oa]s?') },
  { ptPT: 'carregue em', ptBR: 'toque em / clique em', pattern: word('carregue (?:em|no|na)') },
  { ptPT: 'pt-PT / pt_PT (idioma da página)', ptBR: 'pt-BR / pt_BR', pattern: word('pt[-_]PT', 'u') },
]

export interface PtPtMarker {
  /** Trecho encontrado. */
  match: string
  /** Sugestão em pt-BR. */
  ptBR: string
  /** Posição no texto. */
  index: number
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Termos oficiais, do mais longo para o mais curto (o mais específico vence). */
const OFFICIAL_TERMS_PATTERN = new RegExp(
  [...OFFICIAL_PT_TERMS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|'),
  'g',
)

/**
 * Construções de pt-PT encontradas em `text`, na ordem em que aparecem.
 * Termos oficiais portugueses (OFFICIAL_PT_TERMS) são ignorados.
 */
export function findPtPtMarkers(text: string): PtPtMarker[] {
  // Troca os termos oficiais por espaços do mesmo tamanho (as posições continuam valendo).
  const masked = text.replace(OFFICIAL_TERMS_PATTERN, (term) => ' '.repeat(term.length))
  const found: PtPtMarker[] = []
  for (const { pattern, ptBR } of PT_BR_GLOSSARY) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
    for (const m of masked.matchAll(global)) {
      found.push({ match: m[0], ptBR, index: m.index ?? 0 })
    }
  }
  return found.sort((a, b) => a.index - b.index)
}
