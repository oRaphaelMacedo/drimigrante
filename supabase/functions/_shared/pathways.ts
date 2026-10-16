// _shared/pathways.ts — vias de nacionalidade a partir das respostas do quiz (servidor).
//
// ESPELHO de src/data/quiz-questions.ts (fonte de verdade das regras de elegibilidade):
//   · QUESTION_CATALOG espelha as chaves, as opções e o showIf de QUIZ_QUESTIONS;
//   · suggestPathways() é um port fiel de suggestVisas() (mesmos códigos, nomes e `match`).
// Os textos de `reason` foram reescritos em pt-BR SEM prometer advogados, serviços ou aprovação.
// Ao mudar a lógica de elegibilidade no front, atualize este arquivo no mesmo PR.
// O teste _shared/pathways_test.ts compara as duas implementações (códigos, nomes e match).
//
// Este módulo não tem imports: roda no Deno (Edge Functions) e nos testes locais.

export type Answers = Record<string, string>

export type PathwayMatch = 'strong' | 'possible' | 'weak'

export interface Pathway {
  code: string
  name: string
  match: PathwayMatch
  reason: string
}

interface Condition {
  questionKey: string
  answerKey?: string | string[]
  answerContains?: string
}

type ShowIfRule = Condition | { any: Condition[] } | { all: Condition[] }

export interface CatalogQuestion {
  key: string
  /** Rótulo curto usado no contexto enviado à IA (pt-BR). */
  label: string
  multi?: boolean
  options: Record<string, string>
  showIf?: ShowIfRule
}

const YES_NO = { sim: 'Sim', nao: 'Não' }
const ANCESTOR_KNOWN = ['pai_mae', 'avo', 'bisavo', 'trisavo']

export const QUESTION_CATALOG: CatalogQuestion[] = [
  {
    key: 'processo_tipo',
    label: 'Objetivo principal',
    options: {
      nacionalidade: 'Obter a nacionalidade portuguesa',
      visto: 'Obter um visto para morar ou trabalhar em Portugal',
      regularizacao: 'Regularizar a situação estando em Portugal',
      nao_sei: 'Ainda não sabe por onde começar',
    },
  },
  {
    key: 'caso_tipo',
    label: 'Situações declaradas',
    multi: true,
    showIf: { questionKey: 'processo_tipo', answerKey: 'nacionalidade' },
    options: {
      A: 'Descendente (filho, neto, bisneto ou trineto) de português(a) nato(a)',
      B: 'Casado(a) ou em união estável documentada com cidadão(ã) português(a)',
      C: 'Nasceu em Portugal, mas não tem a nacionalidade portuguesa',
      D: 'Mora em Portugal',
      E: 'Já teve a nacionalidade portuguesa e a perdeu',
      F: 'Família originária das ex-colônias portuguesas',
      nenhum: 'Nenhuma das situações listadas',
    },
  },
  // ─── Caso A — descendência ───────────────────────────────────────────────
  {
    key: 'a1_antepassado',
    label: 'Antepassado português',
    showIf: { questionKey: 'caso_tipo', answerContains: 'A' },
    options: {
      pai_mae: 'Pai ou mãe (1.º grau)',
      avo: 'Avô ou avó (2.º grau)',
      bisavo: 'Bisavô ou bisavó (3.º grau)',
      trisavo: 'Trisavô, trisavó ou parente mais distante',
      nao_sei: 'Não sabe ao certo',
    },
  },
  {
    key: 'a2_documento',
    label: 'Tem documento português do antepassado (certidão, bilhete de identidade ou passaporte)',
    showIf: { questionKey: 'a1_antepassado', answerKey: ANCESTOR_KNOWN },
    options: YES_NO,
  },
  {
    key: 'a3_interesse_docs',
    label: 'Tem interesse em levantar esses documentos em Portugal',
    showIf: { questionKey: 'a2_documento', answerKey: 'nao' },
    options: YES_NO,
  },
  {
    key: 'a4_lacos',
    label: 'Tem laços com Portugal (viagens, NIF, conta bancária, imóvel, estudo ou residência anterior, grupos culturais)',
    showIf: { questionKey: 'a1_antepassado', answerKey: ANCESTOR_KNOWN },
    options: YES_NO,
  },
  {
    key: 'a5_genealogia',
    label: 'Tem interesse em pesquisar a árvore genealógica',
    showIf: { questionKey: 'a1_antepassado', answerKey: 'nao_sei' },
    options: YES_NO,
  },
  {
    key: 'a6_filiacao',
    label: 'Filiação',
    showIf: { questionKey: 'caso_tipo', answerContains: 'A' },
    options: { natural: 'Filho(a) natural', adotivo: 'Filho(a) adotivo(a)' },
  },
  // ─── Caso B — casamento ou união estável ─────────────────────────────────
  {
    key: 'b1_tempo_casamento',
    label: 'Tempo de casamento ou união estável',
    showIf: { questionKey: 'caso_tipo', answerContains: 'B' },
    options: { mais_3_anos: 'Mais de 3 anos', menos_3_anos: 'Menos de 3 anos' },
  },
  // ─── Caso C — nascimento em Portugal ─────────────────────────────────────
  {
    key: 'c1_maior_idade',
    label: 'É maior de idade',
    showIf: { questionKey: 'caso_tipo', answerContains: 'C' },
    options: YES_NO,
  },
  {
    key: 'c2_mora_portugal',
    label: 'Mora atualmente em Portugal',
    showIf: { questionKey: 'c1_maior_idade', answerKey: 'sim' },
    options: YES_NO,
  },
  {
    key: 'c3_tempo_portugal',
    label: 'Tempo de residência em Portugal',
    showIf: { questionKey: 'c2_mora_portugal', answerKey: 'sim' },
    options: { menos_2: 'Menos de 2 anos', '2_a_4': 'Entre 2 e 4 anos', '5_ou_mais': '5 anos ou mais' },
  },
  // ─── Caso D — residência ─────────────────────────────────────────────────
  {
    key: 'd1_situacao_legal',
    label: 'Tem Autorização de Residência em Portugal',
    showIf: { questionKey: 'caso_tipo', answerContains: 'D' },
    options: { sim: 'Sim', nao: 'Não, a situação ainda não está regularizada' },
  },
  {
    key: 'd2_tempo_autorizacao',
    label: 'Tempo com Autorização de Residência',
    showIf: { questionKey: 'd1_situacao_legal', answerKey: 'sim' },
    options: { menos_5: 'Menos de 5 anos', mais_5: '5 anos ou mais' },
  },
  {
    key: 'd3_disposto_advogado',
    label: 'Está disposto(a) e preparado(a) financeiramente para contratar apoio jurídico',
    showIf: { questionKey: 'd1_situacao_legal', answerKey: 'nao' },
    options: YES_NO,
  },
  {
    key: 'd4_consultou_advogado',
    label: 'Já consultou um profissional jurídico sobre o caso',
    showIf: { questionKey: 'd3_disposto_advogado', answerKey: 'sim' },
    options: YES_NO,
  },
  {
    key: 'd5_motivo_nao_contratou',
    label: 'Motivos para não ter contratado o profissional',
    multi: true,
    showIf: { questionKey: 'd4_consultou_advogado', answerKey: 'sim' },
    options: {
      era_caro: 'Custo alto',
      sem_firmeza: 'Não sentiu confiança no profissional',
      sozinho: 'Prefere resolver sozinho(a)',
      outros: 'Outros motivos',
    },
  },
  {
    key: 'd6_preparado_financeiro',
    label: 'Agora tem condições financeiras de contratar apoio jurídico',
    showIf: { questionKey: 'd5_motivo_nao_contratou', answerContains: 'era_caro' },
    options: YES_NO,
  },
  {
    key: 'd7_consultar_agora',
    label: 'Quer receber orientação jurídica agora',
    showIf: {
      any: [
        { questionKey: 'd1_situacao_legal', answerKey: 'sim' },
        { questionKey: 'd4_consultou_advogado', answerKey: 'nao' },
      ],
    },
    options: YES_NO,
  },
  {
    key: 'd8_filhos_portugal',
    label: 'Tem filhos nascidos em Portugal com nacionalidade portuguesa',
    showIf: { questionKey: 'caso_tipo', answerContains: 'D' },
    options: YES_NO,
  },
  // ─── Caso F — ex-colônias ────────────────────────────────────────────────
  {
    key: 'f1_mora_portugal',
    label: 'Mora atualmente em Portugal',
    showIf: { questionKey: 'caso_tipo', answerContains: 'F' },
    options: YES_NO,
  },
  {
    key: 'f2_quando_mudou',
    label: 'Quando se mudou para Portugal',
    showIf: { questionKey: 'f1_mora_portugal', answerKey: 'sim' },
    options: { antes_1974: 'Antes de 25 de abril de 1974', depois_1974: 'Depois de 25 de abril de 1974' },
  },
]

const CATALOG_BY_KEY = new Map(QUESTION_CATALOG.map((q) => [q.key, q]))

export function getCatalogQuestion(key: string): CatalogQuestion | undefined {
  return CATALOG_BY_KEY.get(key)
}

/**
 * Converte o JSON de `assessments.answers` em Record<string, string>.
 * Multisseleção vira CSV ("A,B"), como no front. Valores não textuais são ignorados.
 */
export function normalizeAnswers(raw: unknown): Answers {
  const out: Answers = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      if (value.trim() !== '') out[key] = value.trim()
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = String(value)
    } else if (Array.isArray(value)) {
      const parts = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      if (parts.length > 0) out[key] = parts.map((v) => v.trim()).join(',')
    }
  }
  return out
}

export function splitMulti(value: string | undefined): string[] {
  return (value ?? '').split(',').map((v) => v.trim()).filter(Boolean)
}

function matchesCondition(answers: Answers, cond: Condition, visible: Set<string>): boolean {
  if (!visible.has(cond.questionKey)) return false
  const answer = answers[cond.questionKey]
  if (!answer) return false
  if (cond.answerContains) return splitMulti(answer).includes(cond.answerContains)
  if (cond.answerKey) {
    return Array.isArray(cond.answerKey) ? cond.answerKey.includes(answer) : answer === cond.answerKey
  }
  return true
}

/**
 * Perguntas visíveis para estas respostas. Uma pergunta só é visível se a condição
 * dela for satisfeita E a pergunta-pai também estiver visível (respostas de ramos
 * abandonados não contam).
 */
export function getVisibleKeys(answers: Answers): string[] {
  const visible = new Set<string>()
  for (const q of QUESTION_CATALOG) {
    const rule = q.showIf
    let show = true
    if (rule) {
      if ('any' in rule) show = rule.any.some((c) => matchesCondition(answers, c, visible))
      else if ('all' in rule) show = rule.all.every((c) => matchesCondition(answers, c, visible))
      else show = matchesCondition(answers, rule, visible)
    }
    if (show) visible.add(q.key)
  }
  return QUESTION_CATALOG.filter((q) => visible.has(q.key)).map((q) => q.key)
}

/** Mantém só as respostas de perguntas conhecidas e visíveis. */
export function pruneAnswers(answers: Answers): Answers {
  const out: Answers = {}
  for (const key of getVisibleKeys(answers)) {
    if (answers[key] !== undefined) out[key] = answers[key]
  }
  return out
}

/** Port fiel de suggestVisas() (src/data/quiz-questions.ts). */
export function suggestPathways(answers: Answers): Pathway[] {
  const suggestions: Pathway[] = []
  const casos = splitMulti(answers.caso_tipo)

  if (answers.processo_tipo !== 'nacionalidade') return suggestions

  // Caso A — descendência
  if (casos.includes('A')) {
    const antepassado = answers.a1_antepassado
    const hasDoc = answers.a2_documento === 'sim'
    const hasLacos = answers.a4_lacos === 'sim'

    if (antepassado === 'pai_mae') {
      suggestions.push({
        code: 'nacionalidade_descendencia_1',
        name: 'Nacionalidade por Descendência (1.º grau)',
        match: hasDoc ? 'strong' : 'possible',
        reason: hasDoc
          ? 'Descendência direta (1.º grau) com documento português do antepassado: é o cenário mais favorável desta via.'
          : 'A descendência de 1.º grau se enquadra nesta via, mas será preciso obter a documentação do antepassado português.',
      })
    } else if (antepassado === 'avo' || antepassado === 'bisavo') {
      suggestions.push({
        code: 'nacionalidade_descendencia_2',
        name: `Nacionalidade por Descendência (${antepassado === 'avo' ? '2.º' : '3.º'} grau)`,
        match: hasDoc && hasLacos ? 'strong' : hasDoc || hasLacos ? 'possible' : 'weak',
        reason: hasDoc
          ? 'Há documento do antepassado. Nesta via, os laços com Portugal são importantes e o caso merece uma análise detalhada.'
          : 'Será preciso levantar documentos genealógicos em Portugal que comprovem a ligação com o antepassado.',
      })
    } else if (antepassado === 'nao_sei') {
      suggestions.push({
        code: 'pesquisa_genealogica',
        name: 'Pesquisa Genealógica',
        match: 'weak',
        reason: 'Antes de avançar, é preciso descobrir se existe um antepassado português e reunir documentos que comprovem essa ligação.',
      })
    }
  }

  // Caso B — casamento ou união estável
  if (casos.includes('B')) {
    const tempo = answers.b1_tempo_casamento
    suggestions.push({
      code: 'nacionalidade_casamento',
      name: 'Naturalização pelo Casamento',
      match: tempo === 'mais_3_anos' ? 'strong' : 'weak',
      reason: tempo === 'mais_3_anos'
        ? 'Com mais de 3 anos de casamento ou união estável documentada com cidadão(ã) português(a), você cumpre o tempo mínimo para pedir a nacionalidade por esta via.'
        : 'Ainda não completou os 3 anos necessários. Vale reavaliar quando atingir esse prazo.',
    })
  }

  // Caso C — nascimento em Portugal
  if (casos.includes('C')) {
    const tempo = answers.c3_tempo_portugal
    suggestions.push({
      code: 'nacionalidade_nascimento',
      name: 'Naturalização por Nascimento em Portugal',
      match: tempo === '5_ou_mais' ? 'strong' : tempo === '2_a_4' ? 'possible' : 'weak',
      reason: tempo === '5_ou_mais'
        ? 'Nasceu em Portugal e tem 5 anos ou mais de residência: reúne as condições indicadas para o pedido.'
        : 'Ainda está construindo o tempo de residência necessário (5 anos). Continue residindo legalmente em Portugal.',
    })
  }

  // Caso D — residência
  if (casos.includes('D')) {
    const legal = answers.d1_situacao_legal
    const tempo = answers.d2_tempo_autorizacao
    suggestions.push({
      code: 'naturalizacao_residencia',
      name: 'Naturalização por Residência',
      match: legal === 'sim' && tempo === 'mais_5' ? 'strong' : legal === 'sim' ? 'possible' : 'weak',
      reason:
        legal === 'sim' && tempo === 'mais_5'
          ? 'Com Autorização de Residência há 5 anos ou mais, reúne as condições indicadas para pedir a naturalização.'
          : legal === 'sim'
          ? 'A caminho da naturalização: é preciso completar 5 anos de residência legal.'
          : 'Primeiro passo: regularizar a situação junto da AIMA, de preferência com orientação jurídica.',
    })
  }

  // Caso E — perda da nacionalidade
  if (casos.includes('E')) {
    suggestions.push({
      code: 'reaquisicao_nacionalidade',
      name: 'Reaquisição de Nacionalidade Portuguesa',
      match: 'strong',
      reason: 'Quem já teve a nacionalidade portuguesa costuma ter boas chances de recuperá-la, mas o caso precisa de uma análise individual.',
    })
  }

  // Caso F — ex-colônias
  if (casos.includes('F')) {
    const quando = answers.f2_quando_mudou
    suggestions.push({
      code: 'nacionalidade_ex_colonias',
      name: 'Nacionalidade — Ex-colônias',
      match: quando === 'antes_1974' ? 'strong' : 'possible',
      reason:
        quando === 'antes_1974'
          ? 'A mudança para Portugal antes de 25 de abril de 1974 pode conferir direitos especiais à nacionalidade portuguesa.'
          : 'A legislação sobre ex-colônias pode abrir caminhos, mas exige uma análise atualizada do caso.',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      code: 'analise_personalizada',
      name: 'Análise Personalizada Necessária',
      match: 'weak',
      reason: 'O caso precisa de uma análise individual para identificar os caminhos disponíveis.',
    })
  }

  return suggestions
}

const MATCH_RANK: Record<PathwayMatch, number> = { strong: 0, possible: 1, weak: 2 }

/** Vias ordenadas da mais para a menos compatível (ordenação estável). */
export function rankPathways(pathways: Pathway[]): Pathway[] {
  return pathways
    .map((p, i) => ({ p, i }))
    .sort((a, b) => MATCH_RANK[a.p.match] - MATCH_RANK[b.p.match] || a.i - b.i)
    .map(({ p }) => p)
}
