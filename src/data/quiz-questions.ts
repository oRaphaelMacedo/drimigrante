// quiz-questions.ts — Diagnóstico da Imigração
// Fluxo mapeado a partir do export MindMeister — Doutor Imigração / Diagnóstico da Imigração

export type FieldType = 'radio' | 'multiselect' | 'select' | 'number' | 'text'

export interface QuizOption {
  key: string
  label: string
  score: number
  isEliminatory?: boolean
  aiNote?: string // instrução para a IA ao gerar o relatório
}

// Condição de exibição condicional
interface ShowIfCondition {
  questionKey: string
  answerKey?: string | string[]  // resposta igual a / dentro de
  answerContains?: string         // para multi-select: resposta CSV contém este valor
}

export type ShowIfRule =
  | ShowIfCondition
  | { any: ShowIfCondition[] }  // pelo menos uma condição verdadeira
  | { all: ShowIfCondition[] }  // todas as condições verdadeiras

export interface QuizQuestion {
  key: string
  themeCode: string
  themeName: string
  themeColor: string
  fieldType: FieldType
  text: string
  helpText?: string
  options?: QuizOption[]
  min?: number
  max?: number
  placeholder?: string
  isRequired: boolean
  showIf?: ShowIfRule
}

export const QUIZ_THEMES = [
  { code: 'processo',     name: 'Tipo de Processo',  color: '#3b62f6' },
  { code: 'selecao',      name: 'Seleção de Caso',   color: '#6366f1' },
  { code: 'descendencia', name: 'Descendência',       color: '#8b5cf6' },
  { code: 'matrimonio',   name: 'Matrimônio',         color: '#f59e0b' },
  { code: 'nascimento',   name: 'Nascimento',         color: '#10b981' },
  { code: 'residencia',   name: 'Residência',         color: '#ef4444' },
  { code: 'ex_colonias',  name: 'Ex-Colónias',        color: '#06b6d4' },
] as const

export const QUIZ_QUESTIONS: QuizQuestion[] = [

  // ─── P0 — ROTEAMENTO ─────────────────────────────────────────────────────
  {
    key: 'processo_tipo',
    themeCode: 'processo',
    themeName: 'Tipo de Processo',
    themeColor: '#3b62f6',
    fieldType: 'radio',
    text: 'Qual é o seu objetivo principal?',
    isRequired: true,
    options: [
      { key: 'nacionalidade',  label: 'Quero obter a Nacionalidade Portuguesa',                        score: 0 },
      { key: 'visto',          label: 'Quero obter um Visto para morar/trabalhar em Portugal',          score: 0 },
      { key: 'regularizacao',  label: 'Já estou em Portugal e quero regularizar a minha situação',      score: 0 },
      { key: 'nao_sei',        label: 'Não sei por onde começar',                                       score: 0 },
    ],
  },

  // ─── P1 — SELEÇÃO DE CASO (multi-select) ─────────────────────────────────
  {
    key: 'caso_tipo',
    themeCode: 'selecao',
    themeName: 'Seleção de Caso',
    themeColor: '#6366f1',
    fieldType: 'multiselect',
    text: 'Eu sou (marque todas as respostas que se aplicam a você):',
    helpText: 'Pode selecionar mais de uma opção.',
    isRequired: true,
    showIf: { questionKey: 'processo_tipo', answerKey: 'nacionalidade' },
    options: [
      { key: 'A', label: 'Filho(a), Neto(a), Bisneto(a) ou Trineto(a) de um(a) português(a) nato(a)',           score: 0 },
      { key: 'B', label: 'Casado(a) ou em união estável documentada com cidadão(ã) português(a)',               score: 0 },
      { key: 'C', label: 'Nasci em Portugal, mas não tenho nacionalidade portuguesa',                           score: 0 },
      { key: 'D', label: 'Moro em Portugal',                                                                   score: 0 },
      { key: 'E', label: 'Já fui português(a) e perdi a minha nacionalidade',                                  score: 0 },
      { key: 'F', label: 'A minha família é originária das ex-colónias portuguesas',                           score: 0 },
    ],
  },

  // ─── CASO A — DESCENDÊNCIA ───────────────────────────────────────────────
  {
    key: 'a1_antepassado',
    themeCode: 'descendencia',
    themeName: 'Descendência',
    themeColor: '#8b5cf6',
    fieldType: 'radio',
    text: 'Quem era o seu antepassado português(a)?',
    isRequired: true,
    showIf: { questionKey: 'caso_tipo', answerContains: 'A' },
    options: [
      { key: 'pai_mae', label: 'O meu pai ou a minha mãe',                            score: 40, aiNote: 'descendência de 1.º grau — elegibilidade alta' },
      { key: 'avo',     label: 'O meu avô ou a minha avó',                             score: 30, aiNote: 'descendência de 2.º grau — elegibilidade média-alta; laços com Portugal são importantes' },
      { key: 'bisavo',  label: 'O meu bisavô ou a minha bisavó',                       score: 20, aiNote: 'descendência de 3.º grau — elegibilidade média; laços com Portugal são determinantes' },
      { key: 'trisavo', label: 'Trisavô/Trisavó ou parentes ainda mais distantes',    score: 5,  aiNote: 'descendência muito distante — não elegível para nacionalidade; sugerir pesquisa genealógica para resgate histórico' },
      { key: 'nao_sei', label: 'Não sei ao certo',                                     score: 0,  aiNote: 'incerteza sobre antepassados — trazer estatísticas de antepassados portugueses no Brasil e oferecer serviço de genealogia' },
    ],
  },
  {
    key: 'a2_documento',
    themeCode: 'descendencia',
    themeName: 'Descendência',
    themeColor: '#8b5cf6',
    fieldType: 'radio',
    text: 'Você tem algum documento português do(a) seu(sua) antepassado(a)?',
    helpText: 'Por exemplo: certidão de nascimento, bilhete de identidade, passaporte ou certidão de casamento portugueses.',
    isRequired: true,
    showIf: { questionKey: 'a1_antepassado', answerKey: ['pai_mae', 'avo', 'bisavo', 'trisavo'] },
    options: [
      { key: 'sim', label: 'Sim, tenho documentos',  score: 20, aiNote: 'tem documentação — critério chave confirmado' },
      { key: 'nao', label: 'Não tenho documentos',   score: 0 },
    ],
  },
  {
    key: 'a3_interesse_docs',
    themeCode: 'descendencia',
    themeName: 'Descendência',
    themeColor: '#8b5cf6',
    fieldType: 'radio',
    text: 'Tem interesse em pesquisar e obter esses documentos em Portugal?',
    helpText: 'Podemos fazer esse levantamento documental por você em Portugal.',
    isRequired: true,
    showIf: { questionKey: 'a2_documento', answerKey: 'nao' },
    options: [
      { key: 'sim', label: 'Sim, tenho interesse',   score: 8, aiNote: 'interessado em levantar documentos — sugerir serviço de pesquisa documental e genealógica' },
      { key: 'nao', label: 'Não tenho interesse',    score: 0 },
    ],
  },
  {
    key: 'a4_lacos',
    themeCode: 'descendencia',
    themeName: 'Descendência',
    themeColor: '#8b5cf6',
    fieldType: 'radio',
    text: 'Você possui laços com Portugal?',
    helpText: 'Por exemplo: já viajou para Portugal, participa de grupos culturais portugueses, tem conta bancária, NIF, imóvel, ou já morou/estudou em Portugal.',
    isRequired: true,
    showIf: { questionKey: 'a1_antepassado', answerKey: ['pai_mae', 'avo', 'bisavo', 'trisavo'] },
    options: [
      { key: 'sim', label: 'Sim, tenho laços com Portugal', score: 15, aiNote: 'tem laços — reforça elegibilidade; importante para casos de 2.º e 3.º grau' },
      { key: 'nao', label: 'Ainda não tenho laços',          score: 0,  aiNote: 'sem laços — sugerir formas de criar laços com Portugal para aumentar elegibilidade' },
    ],
  },
  {
    key: 'a5_genealogia',
    themeCode: 'descendencia',
    themeName: 'Descendência',
    themeColor: '#8b5cf6',
    fieldType: 'radio',
    text: 'Gostaria de explorar a sua árvore genealógica para descobrir se tem antepassados portugueses?',
    helpText: 'Estatisticamente, uma grande parcela dos brasileiros tem algum antepassado português.',
    isRequired: true,
    showIf: { questionKey: 'a1_antepassado', answerKey: 'nao_sei' },
    options: [
      { key: 'sim', label: 'Sim, tenho interesse',   score: 5, aiNote: 'interessado em genealogia — apresentar estatísticas de antepassados portugueses no Brasil e oferecer o serviço de genealogia' },
      { key: 'nao', label: 'Não, por enquanto não',  score: 0 },
    ],
  },
  {
    key: 'a6_filiacao',
    themeCode: 'descendencia',
    themeName: 'Descendência',
    themeColor: '#8b5cf6',
    fieldType: 'radio',
    text: 'Você é filho(a) natural ou adotivo(a)?',
    isRequired: false,
    showIf: { questionKey: 'caso_tipo', answerContains: 'A' },
    options: [
      { key: 'natural',  label: 'Natural',    score: 0 },
      { key: 'adotivo',  label: 'Adotivo(a)', score: 0, aiNote: 'filho adotivo — pode pedir nacionalidade por filiação, mas poderá requerer um processo judicial em Portugal; sugerir consulta jurídica especializada' },
    ],
  },

  // ─── CASO B — MATRIMÔNIO ─────────────────────────────────────────────────
  {
    key: 'b1_tempo_casamento',
    themeCode: 'matrimonio',
    themeName: 'Matrimônio',
    themeColor: '#f59e0b',
    fieldType: 'radio',
    text: 'Há quanto tempo vocês estão casados(as) ou vivem em união estável?',
    isRequired: true,
    showIf: { questionKey: 'caso_tipo', answerContains: 'B' },
    options: [
      { key: 'mais_3_anos',  label: 'Há mais de 3 anos', score: 60, aiNote: 'altamente elegível para nacionalidade pelo casamento' },
      { key: 'menos_3_anos', label: 'Há menos de 3 anos', score: 15, aiNote: 'ainda não elegível pelo casamento — precisa de mais tempo; explicar que pode tentar novamente ao completar 3 anos, e explorar outras vias entretanto' },
    ],
  },

  // ─── CASO C — NASCIMENTO ─────────────────────────────────────────────────
  {
    key: 'c1_maior_idade',
    themeCode: 'nascimento',
    themeName: 'Nascimento',
    themeColor: '#10b981',
    fieldType: 'radio',
    text: 'Você é maior de idade (mais de 18 anos)?',
    isRequired: true,
    showIf: { questionKey: 'caso_tipo', answerContains: 'C' },
    options: [
      { key: 'sim', label: 'Sim', score: 0 },
      { key: 'nao', label: 'Não', score: 0 },
    ],
  },
  {
    key: 'c2_mora_portugal',
    themeCode: 'nascimento',
    themeName: 'Nascimento',
    themeColor: '#10b981',
    fieldType: 'radio',
    text: 'Atualmente você mora em Portugal?',
    isRequired: true,
    showIf: { questionKey: 'c1_maior_idade', answerKey: 'sim' },
    options: [
      { key: 'sim', label: 'Sim', score: 5 },
      { key: 'nao', label: 'Não', score: 0 },
    ],
  },
  {
    key: 'c3_tempo_portugal',
    themeCode: 'nascimento',
    themeName: 'Nascimento',
    themeColor: '#10b981',
    fieldType: 'radio',
    text: 'Há quanto tempo você mora em Portugal?',
    isRequired: true,
    showIf: { questionKey: 'c2_mora_portugal', answerKey: 'sim' },
    options: [
      { key: 'menos_2',   label: 'Menos de 2 anos',  score: 30, aiNote: 'chances medianas — precisa esperar pelo menos 5 anos de residência para pedir a nacionalidade por nascimento' },
      { key: '2_a_4',     label: 'Entre 2 e 4 anos', score: 50, aiNote: 'chances médias-altas — está no caminho certo, mas precisa completar 5 anos de residência' },
      { key: '5_ou_mais', label: '5 anos ou mais',   score: 75, aiNote: 'altas chances de pedir a nacionalidade por nascimento em Portugal com residência de 5+ anos' },
    ],
  },

  // ─── CASO D — RESIDÊNCIA ─────────────────────────────────────────────────
  {
    key: 'd1_situacao_legal',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'radio',
    text: 'A sua situação de residência em Portugal está regularizada? Já tem Autorização de Residência?',
    isRequired: true,
    showIf: { questionKey: 'caso_tipo', answerContains: 'D' },
    options: [
      { key: 'sim', label: 'Sim, tenho Autorização de Residência',  score: 15 },
      { key: 'nao', label: 'Não, estou sem situação regularizada',  score: 0  },
    ],
  },
  {
    key: 'd2_tempo_autorizacao',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'radio',
    text: 'Há quanto tempo está em Portugal com Autorização de Residência?',
    isRequired: true,
    showIf: { questionKey: 'd1_situacao_legal', answerKey: 'sim' },
    options: [
      { key: 'menos_5', label: 'Menos de 5 anos', score: 25, aiNote: 'em curso — precisa completar 5 anos de residência legal para pedir a naturalização' },
      { key: 'mais_5',  label: '5 anos ou mais',  score: 60, aiNote: 'elegível para entrar com pedido de naturalização por residência' },
    ],
  },
  {
    key: 'd3_disposto_advogado',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'radio',
    text: 'Para regularizar a sua situação, precisará contratar um advogado. Está disposto(a) e preparado(a) financeiramente para essa contratação?',
    isRequired: true,
    showIf: { questionKey: 'd1_situacao_legal', answerKey: 'nao' },
    options: [
      { key: 'sim', label: 'Sim, estou preparado(a)',             score: 10, aiNote: 'pronto para contratar advogado — dirigir para o banco de advogados da plataforma' },
      { key: 'nao', label: 'Não, ainda não estou preparado(a)',   score: 0,  aiNote: 'não preparado financeiramente — sugerir que organize finanças urgentemente; alertar que os prazos da AIMA são longos e a regularização é urgente' },
    ],
  },
  {
    key: 'd4_consultou_advogado',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'radio',
    text: 'Já se consultou com algum advogado sobre o seu caso?',
    isRequired: true,
    showIf: { questionKey: 'd3_disposto_advogado', answerKey: 'sim' },
    options: [
      { key: 'sim', label: 'Sim, já me consultei', score: 5 },
      { key: 'nao', label: 'Não, ainda não',        score: 0 },
    ],
  },
  {
    key: 'd5_motivo_nao_contratou',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'multiselect',
    text: 'Por que não contratou esse advogado? (selecione todas que se aplicam)',
    isRequired: true,
    showIf: { questionKey: 'd4_consultou_advogado', answerKey: 'sim' },
    options: [
      { key: 'era_caro',    label: 'Era muito caro',                                               score: 0, aiNote: 'custo como barreira — perguntar se agora está mais preparado financeiramente' },
      { key: 'sem_firmeza', label: 'Não senti firmeza / O advogado não pareceu competente',        score: 0, aiNote: 'insatisfeito com advogado anterior — promover banco de advogados experientes da plataforma' },
      { key: 'sozinho',     label: 'Quero resolver a minha situação sozinho(a)',                  score: 0, aiNote: 'perfil DIY — alertar sobre riscos e prazos longos da AIMA; sugerir pelo menos uma primeira consulta' },
      { key: 'outros',      label: 'Outros motivos',                                              score: 0, aiNote: 'outros motivos — sugerir banco de advogados da plataforma' },
    ],
  },
  {
    key: 'd6_preparado_financeiro',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'radio',
    text: 'Agora já está mais preparado(a) financeiramente para contratar um advogado?',
    isRequired: true,
    showIf: { questionKey: 'd5_motivo_nao_contratou', answerContains: 'era_caro' },
    options: [
      { key: 'sim', label: 'Sim, agora consigo',   score: 10, aiNote: 'agora preparado — recomendar fortemente que regularize o quanto antes; sugerir advogados da plataforma com desconto' },
      { key: 'nao', label: 'Ainda não consigo',    score: 0,  aiNote: 'ainda sem recursos — sugerir advogados com cobrança parcelada; reforçar urgência da regularização' },
    ],
  },
  {
    key: 'd7_consultar_agora',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'radio',
    text: 'Está preparado(a) para consultar um advogado agora para receber orientação jurídica sobre o seu caso?',
    isRequired: true,
    // Aparece para quem tem residência legal (d1=sim) OU para quem ainda não consultou nenhum (d4=nao)
    showIf: {
      any: [
        { questionKey: 'd1_situacao_legal', answerKey: 'sim' },
        { questionKey: 'd4_consultou_advogado', answerKey: 'nao' },
      ],
    },
    options: [
      { key: 'sim', label: 'Sim, quero consultar um advogado', score: 10, aiNote: 'interessado em consulta jurídica — apresentar banco de advogados da plataforma' },
      { key: 'nao', label: 'Não, por enquanto não',             score: 0  },
    ],
  },
  {
    key: 'd8_filhos_portugal',
    themeCode: 'residencia',
    themeName: 'Residência',
    themeColor: '#ef4444',
    fieldType: 'radio',
    text: 'Você teve filhos em Portugal que possuem a nacionalidade portuguesa?',
    isRequired: true,
    showIf: { questionKey: 'caso_tipo', answerContains: 'D' },
    options: [
      { key: 'sim', label: 'Sim', score: 20, aiNote: 'pai/mãe de cidadão português — reforça significativamente as chances de naturalização' },
      { key: 'nao', label: 'Não', score: 0  },
    ],
  },

  // ─── CASO F — EX-COLÓNIAS ────────────────────────────────────────────────
  {
    key: 'f1_mora_portugal',
    themeCode: 'ex_colonias',
    themeName: 'Ex-Colónias',
    themeColor: '#06b6d4',
    fieldType: 'radio',
    text: 'Você mora atualmente em Portugal?',
    isRequired: true,
    showIf: { questionKey: 'caso_tipo', answerContains: 'F' },
    options: [
      { key: 'sim', label: 'Sim', score: 5 },
      { key: 'nao', label: 'Não', score: 0 },
    ],
  },
  {
    key: 'f2_quando_mudou',
    themeCode: 'ex_colonias',
    themeName: 'Ex-Colónias',
    themeColor: '#06b6d4',
    fieldType: 'radio',
    text: 'Quando você se mudou para Portugal?',
    isRequired: true,
    showIf: { questionKey: 'f1_mora_portugal', answerKey: 'sim' },
    options: [
      { key: 'antes_1974',  label: 'Antes de 25 de Abril de 1974',  score: 65, aiNote: 'mudou-se antes do 25 de Abril — situação especial com boas chances de obter a nacionalidade; análise jurídica necessária' },
      { key: 'depois_1974', label: 'Depois de 25 de Abril de 1974', score: 20, aiNote: 'depois do 25 de Abril — elegibilidade depende da nova legislação sobre ex-colónias; aguarda análise jurídica atualizada' },
    ],
  },
]

// ─── SCORING ─────────────────────────────────────────────────────────────────

export type ScoreCategory = 'alta' | 'media' | 'baixa'

export interface ScoreResult {
  total: number
  max: number
  percentage: number
  category: ScoreCategory
  label: string
  sublabel: string
  color: string
  bgColor: string
  emoji: string
}

function matchesCondition(answers: Record<string, string>, cond: ShowIfCondition): boolean {
  const answer = answers[cond.questionKey]
  if (!answer) return false
  if (cond.answerContains) {
    return answer.split(',').includes(cond.answerContains)
  }
  if (cond.answerKey) {
    if (Array.isArray(cond.answerKey)) return cond.answerKey.includes(answer)
    return answer === cond.answerKey
  }
  return true
}

export function getVisibleQuestions(
  answers: Record<string, string>,
  questions: QuizQuestion[] = QUIZ_QUESTIONS,
): QuizQuestion[] {
  return questions.filter((q) => {
    if (!q.showIf) return true
    const rule = q.showIf
    if ('any' in rule) return (rule as { any: ShowIfCondition[] }).any.some((c) => matchesCondition(answers, c))
    if ('all' in rule) return (rule as { all: ShowIfCondition[] }).all.every((c) => matchesCondition(answers, c))
    return matchesCondition(answers, rule as ShowIfCondition)
  })
}

export function computeScore(
  answers: Record<string, string>,
  questions: QuizQuestion[] = QUIZ_QUESTIONS,
): ScoreResult {
  const visible = getVisibleQuestions(answers, questions)

  let total = 0
  let max = 0

  for (const q of visible) {
    if (!q.options || q.fieldType === 'multiselect') continue

    const maxOption = Math.max(...q.options.map((o) => o.score))
    max += maxOption

    const answer = answers[q.key]
    if (answer) {
      const opt = q.options.find((o) => o.key === answer)
      if (opt) total += opt.score
    }
  }

  // Caso E (perda de nacionalidade): bônus de base — ex-nacionais têm alta probabilidade de reaver
  const casos = (answers.caso_tipo || '').split(',').filter(Boolean)
  if (casos.includes('E')) {
    total += 55
    max += 70
  }

  const percentage = max > 0 ? Math.round((total / max) * 100) : 0

  let category: ScoreCategory
  let label: string
  let sublabel: string
  let color: string
  let bgColor: string
  let emoji: string

  if (percentage >= 60) {
    category = 'alta'
    label = 'Alta Elegibilidade para Nacionalidade'
    sublabel = 'O seu perfil indica fortes probabilidades de elegibilidade. A análise completa revelará os caminhos mais diretos e os documentos necessários.'
    color = 'text-emerald-700'
    bgColor = 'bg-emerald-50'
    emoji = '+'
  } else if (percentage >= 35) {
    category = 'media'
    label = 'Elegibilidade Média — Requer Análise'
    sublabel = 'Existem caminhos viáveis, mas há condições a cumprir ou documentos a levantar. A análise completa identificará o percurso mais adequado.'
    color = 'text-amber-700'
    bgColor = 'bg-amber-50'
    emoji = '~'
  } else {
    category = 'baixa'
    label = 'Elegibilidade Baixa — Precisa de Acompanhamento'
    sublabel = 'O seu perfil atual apresenta desafios, mas existem estratégias possíveis. A análise completa identificará as opções disponíveis e os passos a seguir.'
    color = 'text-blue-700'
    bgColor = 'bg-blue-50'
    emoji = '?'
  }

  return { total, max, percentage, category, label, sublabel, color, bgColor, emoji }
}

// ─── RECOMENDAÇÕES POR CASO ───────────────────────────────────────────────────

export interface VisaSuggestion {
  code: string
  name: string
  match: 'strong' | 'possible' | 'weak'
  reason: string
}

export function suggestVisas(answers: Record<string, string>): VisaSuggestion[] {
  const suggestions: VisaSuggestion[] = []
  const casos = (answers.caso_tipo || '').split(',').filter(Boolean)

  if (answers.processo_tipo !== 'nacionalidade') return suggestions

  // Caso A — Descendência
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
          ? 'Com documentação do antepassado português e descendência direta, o seu pedido tem alta probabilidade de aprovação.'
          : 'Descendência de 1.º grau qualifica, mas será necessário levantar a documentação do antepassado português.',
      })
    } else if (antepassado === 'avo' || antepassado === 'bisavo') {
      suggestions.push({
        code: 'nacionalidade_descendencia_2',
        name: `Nacionalidade por Descendência (${antepassado === 'avo' ? '2.º' : '3.º'} grau)`,
        match: hasDoc && hasLacos ? 'strong' : hasDoc || hasLacos ? 'possible' : 'weak',
        reason: hasDoc
          ? 'Com documentação e laços com Portugal, a elegibilidade é real, mas requer análise jurídica aprofundada.'
          : 'Precisará levantar documentos genealógicos em Portugal — um serviço que podemos providenciar.',
      })
    } else if (antepassado === 'nao_sei') {
      suggestions.push({
        code: 'pesquisa_genealogica',
        name: 'Pesquisa Genealógica',
        match: 'weak',
        reason: 'Antes de avançar, é necessário descobrir se tem antepassados portugueses. O nosso serviço de genealogia pode identificar essa ligação.',
      })
    }
  }

  // Caso B — Matrimônio
  if (casos.includes('B')) {
    const tempo = answers.b1_tempo_casamento
    suggestions.push({
      code: 'nacionalidade_casamento',
      name: 'Naturalização pelo Casamento',
      match: tempo === 'mais_3_anos' ? 'strong' : 'weak',
      reason: tempo === 'mais_3_anos'
        ? 'Com mais de 3 anos de casamento documentado com cidadão(ã) português(a), é elegível para pedir a naturalização.'
        : 'Ainda não atingiu os 3 anos necessários. Reavalie a elegibilidade quando completar esse prazo.',
    })
  }

  // Caso C — Nascimento
  if (casos.includes('C')) {
    const tempo = answers.c3_tempo_portugal
    suggestions.push({
      code: 'nacionalidade_nascimento',
      name: 'Naturalização por Nascimento em Portugal',
      match: tempo === '5_ou_mais' ? 'strong' : tempo === '2_a_4' ? 'possible' : 'weak',
      reason: tempo === '5_ou_mais'
        ? 'Nascido(a) em Portugal com 5 ou mais anos de residência — condições reunidas para o pedido.'
        : 'A construir o tempo de residência necessário (5 anos). Continue a residir legalmente em Portugal.',
    })
  }

  // Caso D — Residência
  if (casos.includes('D')) {
    const legal = answers.d1_situacao_legal
    const tempo = answers.d2_tempo_autorizacao
    suggestions.push({
      code: 'naturalizacao_residencia',
      name: 'Naturalização por Residência',
      match: legal === 'sim' && tempo === 'mais_5' ? 'strong' : legal === 'sim' ? 'possible' : 'weak',
      reason:
        legal === 'sim' && tempo === 'mais_5'
          ? 'Com Autorização de Residência há 5 ou mais anos, reúne as condições para pedir a naturalização.'
          : legal === 'sim'
          ? 'Em curso para a naturalização — complete 5 anos de residência legal.'
          : 'Primeiro passo: regularizar a situação junto da AIMA com apoio jurídico especializado.',
    })
  }

  // Caso E — Perda de nacionalidade
  if (casos.includes('E')) {
    suggestions.push({
      code: 'reaquisicao_nacionalidade',
      name: 'Reaquisição de Nacionalidade Portuguesa',
      match: 'strong',
      reason: 'Quem já foi português(a) tem grandes probabilidades de reaver a nacionalidade. Requer análise jurídica especializada — os nossos advogados podem orientá-lo(a).',
    })
  }

  // Caso F — Ex-Colónias
  if (casos.includes('F')) {
    const quando = answers.f2_quando_mudou
    suggestions.push({
      code: 'nacionalidade_ex_colonias',
      name: 'Nacionalidade — Ex-Colónias',
      match: quando === 'antes_1974' ? 'strong' : 'possible',
      reason:
        quando === 'antes_1974'
          ? 'A sua situação anterior ao 25 de Abril pode conferir direitos especiais à nacionalidade portuguesa.'
          : 'A nova legislação sobre ex-colónias pode abrir-lhe caminhos — requer análise jurídica atualizada.',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      code: 'analise_personalizada',
      name: 'Análise Personalizada Necessária',
      match: 'weak',
      reason: 'O seu caso requer uma análise jurídica individualizada. Os nossos advogados especializados podem identificar os caminhos disponíveis.',
    })
  }

  return suggestions
}
