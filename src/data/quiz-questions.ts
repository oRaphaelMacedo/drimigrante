// quiz-questions.ts
// Perguntas hardcoded para Day 2 — mapeamento directo do schema form_questions + form_question_options
// Quando o Supabase estiver configurado, estas podem ser substituídas por uma query à DB

export type FieldType = 'radio' | 'select' | 'number' | 'text'

export interface QuizOption {
  key: string
  label: string
  labelEn?: string
  score: number
  isEliminatory?: boolean
}

export interface QuizQuestion {
  key: string
  themeCode: string
  themeName: string
  themeColor: string
  themeIcon: string
  text: string
  textEn?: string
  helpText?: string
  fieldType: FieldType
  options?: QuizOption[]
  min?: number
  max?: number
  placeholder?: string
  isRequired: boolean
  // Conditional display
  showIf?: { questionKey: string; answerKey: string | string[] }
}

export const QUIZ_THEMES = [
  { code: 'perfil_pessoal',  name: 'Perfil Pessoal',       color: '#3b62f6', icon: '👤' },
  { code: 'situacao_atual',  name: 'Situação Atual',        color: '#8b5cf6', icon: '📍' },
  { code: 'financas',        name: 'Situação Financeira',   color: '#10b981', icon: '💰' },
  { code: 'familia',         name: 'Família e Relações',    color: '#f59e0b', icon: '👨‍👩‍👧' },
  { code: 'qualificacoes',   name: 'Qualificações',         color: '#6366f1', icon: '🎓' },
  { code: 'planos_portugal', name: 'Planos em Portugal',    color: '#ef4444', icon: '🇵🇹' },
] as const

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ─── PERFIL PESSOAL ───────────────────────────────────────────────
  {
    key: 'nationality',
    themeCode: 'perfil_pessoal',
    themeName: 'Perfil Pessoal',
    themeColor: '#3b62f6',
    themeIcon: '👤',
    text: 'Qual é a sua nacionalidade?',
    helpText: 'Se tem dupla nacionalidade, selecione a principal.',
    fieldType: 'select',
    isRequired: true,
    options: [
      { key: 'BR', label: '🇧🇷 Brasileiro(a)', score: 10 },
      { key: 'AO', label: '🇦🇴 Angolano(a)', score: 12 },
      { key: 'CV', label: '🇨🇻 Cabo-verdiano(a)', score: 12 },
      { key: 'MZ', label: '🇲🇿 Moçambicano(a)', score: 12 },
      { key: 'GW', label: '🇬🇼 Guineense (Guiné-Bissau)', score: 12 },
      { key: 'ST', label: '🇸🇹 São-tomense', score: 12 },
      { key: 'PT', label: '🇵🇹 Português(a)', score: 0 },
      { key: 'US', label: '🇺🇸 Americano(a)', score: 8 },
      { key: 'other_eu', label: '🇪🇺 Outro país da UE/EEE', score: 5 },
      { key: 'other', label: '🌍 Outro país', score: 5 },
    ],
  },
  {
    key: 'age',
    themeCode: 'perfil_pessoal',
    themeName: 'Perfil Pessoal',
    themeColor: '#3b62f6',
    themeIcon: '👤',
    text: 'Qual é a sua idade?',
    fieldType: 'number',
    isRequired: true,
    min: 18,
    max: 99,
    placeholder: 'Ex: 35',
  },
  {
    key: 'marital_status',
    themeCode: 'perfil_pessoal',
    themeName: 'Perfil Pessoal',
    themeColor: '#3b62f6',
    themeIcon: '👤',
    text: 'Qual é o seu estado civil?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'married', label: 'Casado(a)', score: 10 },
      { key: 'partner', label: 'União de facto', score: 8 },
      { key: 'single', label: 'Solteiro(a)', score: 0 },
      { key: 'divorced', label: 'Divorciado(a)', score: 0 },
      { key: 'widowed', label: 'Viúvo(a)', score: 0 },
    ],
  },
  {
    key: 'has_children',
    themeCode: 'perfil_pessoal',
    themeName: 'Perfil Pessoal',
    themeColor: '#3b62f6',
    themeIcon: '👤',
    text: 'Tem filhos?',
    helpText: 'Inclua filhos menores de 18 anos.',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'yes_minor', label: 'Sim, menores de 18', score: 5 },
      { key: 'yes_adult', label: 'Sim, maiores de 18', score: 2 },
      { key: 'no', label: 'Não', score: 0 },
    ],
  },

  // ─── SITUAÇÃO ATUAL ───────────────────────────────────────────────
  {
    key: 'current_country',
    themeCode: 'situacao_atual',
    themeName: 'Situação Atual',
    themeColor: '#8b5cf6',
    themeIcon: '📍',
    text: 'Em que país reside atualmente?',
    fieldType: 'select',
    isRequired: true,
    options: [
      { key: 'PT', label: '🇵🇹 Portugal', score: 5 },
      { key: 'BR', label: '🇧🇷 Brasil', score: 0 },
      { key: 'AO', label: '🇦🇴 Angola', score: 0 },
      { key: 'CV', label: '🇨🇻 Cabo Verde', score: 0 },
      { key: 'MZ', label: '🇲🇿 Moçambique', score: 0 },
      { key: 'US', label: '🇺🇸 Estados Unidos', score: 0 },
      { key: 'other_eu', label: '🇪🇺 Outro país da UE', score: 3 },
      { key: 'other', label: '🌍 Outro país', score: 0 },
    ],
  },
  {
    key: 'current_visa_status',
    themeCode: 'situacao_atual',
    themeName: 'Situação Atual',
    themeColor: '#8b5cf6',
    themeIcon: '📍',
    text: 'Qual é a sua situação migratória atual?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'citizen', label: 'Cidadão(ã) nacional do país de residência', score: 0 },
      { key: 'resident', label: 'Residente legal (visto de residência)', score: 10 },
      { key: 'work_visa', label: 'Visto de trabalho temporário', score: 8 },
      { key: 'tourist', label: 'Turista / sem visto legal válido', score: 0 },
      { key: 'undocumented', label: 'Sem documentação regularizada', score: 0 },
    ],
  },
  {
    key: 'has_portugal_ties',
    themeCode: 'situacao_atual',
    themeName: 'Situação Atual',
    themeColor: '#8b5cf6',
    themeIcon: '📍',
    text: 'Tem alguma ligação atual com Portugal?',
    helpText: 'Visto, NIF, empresa registada, conta bancária, imóvel, etc.',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'yes', label: 'Sim, tenho ligações com Portugal', score: 15 },
      { key: 'no', label: 'Não, ainda nenhuma', score: 0 },
    ],
  },

  // ─── FINANÇAS ─────────────────────────────────────────────────────
  {
    key: 'monthly_income',
    themeCode: 'financas',
    themeName: 'Situação Financeira',
    themeColor: '#10b981',
    themeIcon: '💰',
    text: 'Qual é o seu rendimento mensal líquido (em EUR)?',
    helpText: 'Inclua todos os rendimentos: salário, pensão, arrendamento, dividendos, etc.',
    fieldType: 'number',
    isRequired: true,
    min: 0,
    max: 999999,
    placeholder: 'Ex: 2500',
  },
  {
    key: 'income_source',
    themeCode: 'financas',
    themeName: 'Situação Financeira',
    themeColor: '#10b981',
    themeIcon: '💰',
    text: 'Qual é a principal fonte de rendimento?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'pension', label: 'Pensão / reforma', score: 15 },
      { key: 'investment', label: 'Rendimentos de investimento', score: 15 },
      { key: 'rental', label: 'Rendimento de arrendamento', score: 15 },
      { key: 'freelance', label: 'Trabalho independente / freelance', score: 12 },
      { key: 'employment', label: 'Salário por conta de outrem', score: 10 },
      { key: 'other', label: 'Outro', score: 5 },
    ],
  },
  {
    key: 'has_savings',
    themeCode: 'financas',
    themeName: 'Situação Financeira',
    themeColor: '#10b981',
    themeIcon: '💰',
    text: 'Tem poupanças ou investimentos?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'yes', label: 'Sim', score: 10 },
      { key: 'no', label: 'Não', score: 0 },
    ],
  },
  {
    key: 'savings_amount',
    themeCode: 'financas',
    themeName: 'Situação Financeira',
    themeColor: '#10b981',
    themeIcon: '💰',
    text: 'Valor aproximado das poupanças ou investimentos (EUR)?',
    fieldType: 'radio',
    isRequired: true,
    showIf: { questionKey: 'has_savings', answerKey: 'yes' },
    options: [
      { key: 'less_5k', label: 'Menos de €5.000', score: 0 },
      { key: '5k_20k', label: '€5.000 – €20.000', score: 5 },
      { key: '20k_50k', label: '€20.000 – €50.000', score: 10 },
      { key: '50k_100k', label: '€50.000 – €100.000', score: 15 },
      { key: 'more_100k', label: 'Mais de €100.000', score: 20 },
    ],
  },

  // ─── FAMÍLIA ─────────────────────────────────────────────────────
  {
    key: 'has_portuguese_family',
    themeCode: 'familia',
    themeName: 'Família e Relações',
    themeColor: '#f59e0b',
    themeIcon: '👨‍👩‍👧',
    text: 'Tem familiares com nacionalidade ou residência portuguesa?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'yes', label: 'Sim', score: 20 },
      { key: 'no', label: 'Não', score: 0 },
    ],
  },
  {
    key: 'family_relationship',
    themeCode: 'familia',
    themeName: 'Família e Relações',
    themeColor: '#f59e0b',
    themeIcon: '👨‍👩‍👧',
    text: 'Qual o grau de parentesco com esse familiar?',
    fieldType: 'radio',
    isRequired: true,
    showIf: { questionKey: 'has_portuguese_family', answerKey: 'yes' },
    options: [
      { key: 'spouse', label: 'Cônjuge / companheiro(a)', score: 20 },
      { key: 'parent', label: 'Pai ou Mãe', score: 20 },
      { key: 'child', label: 'Filho(a)', score: 15 },
      { key: 'sibling', label: 'Irmão / Irmã', score: 10 },
      { key: 'other', label: 'Outro parente', score: 5 },
    ],
  },
  {
    key: 'has_eu_citizenship_family',
    themeCode: 'familia',
    themeName: 'Família e Relações',
    themeColor: '#f59e0b',
    themeIcon: '👨‍👩‍👧',
    text: 'Algum familiar próximo é cidadão da União Europeia?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'yes', label: 'Sim', score: 10 },
      { key: 'no', label: 'Não', score: 0 },
    ],
  },

  // ─── QUALIFICAÇÕES ────────────────────────────────────────────────
  {
    key: 'education_level',
    themeCode: 'qualificacoes',
    themeName: 'Qualificações',
    themeColor: '#6366f1',
    themeIcon: '🎓',
    text: 'Qual é o seu nível de escolaridade?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'phd', label: 'Doutoramento (PhD)', score: 20 },
      { key: 'masters', label: 'Mestrado', score: 15 },
      { key: 'bachelors', label: 'Licenciatura', score: 10 },
      { key: 'secondary', label: 'Ensino Secundário (12º ano)', score: 5 },
      { key: 'primary', label: 'Ensino Básico ou menos', score: 0 },
    ],
  },
  {
    key: 'portuguese_language',
    themeCode: 'qualificacoes',
    themeName: 'Qualificações',
    themeColor: '#6366f1',
    themeIcon: '🎓',
    text: 'Qual é o seu nível de português?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'native', label: 'Nativo ou fluente', score: 20 },
      { key: 'advanced', label: 'Avançado (C1/C2)', score: 15 },
      { key: 'intermediate', label: 'Intermédio (B1/B2)', score: 10 },
      { key: 'basic', label: 'Básico (A1/A2)', score: 5 },
      { key: 'none', label: 'Não falo português', score: 0 },
    ],
  },
  {
    key: 'years_of_experience',
    themeCode: 'qualificacoes',
    themeName: 'Qualificações',
    themeColor: '#6366f1',
    themeIcon: '🎓',
    text: 'Quantos anos de experiência profissional tem?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'more_10', label: 'Mais de 10 anos', score: 15 },
      { key: '5_10', label: '5 a 10 anos', score: 10 },
      { key: '2_5', label: '2 a 5 anos', score: 5 },
      { key: 'less_2', label: 'Menos de 2 anos', score: 2 },
      { key: 'none', label: 'Ainda sem experiência profissional', score: 0 },
    ],
  },

  // ─── PLANOS ───────────────────────────────────────────────────────
  {
    key: 'main_goal',
    themeCode: 'planos_portugal',
    themeName: 'Planos em Portugal',
    themeColor: '#ef4444',
    themeIcon: '🇵🇹',
    text: 'Qual é o seu principal objetivo em Portugal?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'live_retire', label: 'Morar / Reformar-me', score: 15 },
      { key: 'family', label: 'Reunir-me com família', score: 15 },
      { key: 'entrepreneurship', label: 'Empreender / criar empresa', score: 12 },
      { key: 'work', label: 'Trabalhar por conta de outrem', score: 10 },
      { key: 'study', label: 'Estudar', score: 8 },
    ],
  },
  {
    key: 'business_plan',
    themeCode: 'planos_portugal',
    themeName: 'Planos em Portugal',
    themeColor: '#ef4444',
    themeIcon: '🇵🇹',
    text: 'Pretende criar empresa ou trabalhar por conta própria em Portugal?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'yes', label: 'Sim, já tenho plano de negócio', score: 10 },
      { key: 'maybe', label: 'Talvez, ainda a estudar a opção', score: 5 },
      { key: 'no', label: 'Não, prefiro trabalhar por conta de outrem', score: 0 },
    ],
  },
  {
    key: 'when_to_move',
    themeCode: 'planos_portugal',
    themeName: 'Planos em Portugal',
    themeColor: '#ef4444',
    themeIcon: '🇵🇹',
    text: 'Quando pretende fazer a mudança para Portugal?',
    fieldType: 'radio',
    isRequired: true,
    options: [
      { key: 'asap', label: 'O mais rápido possível (0–3 meses)', score: 20 },
      { key: 'soon', label: 'Em breve (3–6 meses)', score: 15 },
      { key: 'medium', label: 'Médio prazo (6–12 meses)', score: 10 },
      { key: 'long', label: 'Longo prazo (+12 meses)', score: 5 },
      { key: 'exploring', label: 'Estou só a explorar possibilidades', score: 0 },
    ],
  },
]

// ─── SCORING ───────────────────────────────────────────────────────────────

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

// Compute score from answers object { questionKey: optionKey | string }
// Accepts questions array — defaults to hardcoded QUIZ_QUESTIONS as fallback.
export function computeScore(
  answers: Record<string, string>,
  questions: QuizQuestion[] = QUIZ_QUESTIONS,
): ScoreResult {
  let total = 0
  let max = 0

  for (const q of questions) {
    if (q.options) {
      // Find max possible for this question
      const maxOption = Math.max(...q.options.map((o) => o.score))
      max += maxOption

      const answer = answers[q.key]
      if (answer) {
        const option = q.options.find((o) => o.key === answer)
        if (option) total += option.score
      }
    }
    // number fields: score based on income thresholds
    if (q.key === 'monthly_income') {
      const income = Number(answers.monthly_income) || 0
      max += 20
      if (income >= 4000) total += 20
      else if (income >= 2000) total += 15
      else if (income >= 1000) total += 10
      else if (income >= 500) total += 5
    }
    if (q.key === 'age') {
      // No score for age — informative only
    }
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
    label = 'Perfil de Alta Elegibilidade'
    sublabel = 'O seu perfil indica fortes probabilidades de elegibilidade para Portugal. A análise completa revelará os vistos mais adequados.'
    color = 'text-emerald-700'
    bgColor = 'bg-emerald-50'
    emoji = '🌟'
  } else if (percentage >= 35) {
    category = 'media'
    label = 'Perfil de Média Elegibilidade'
    sublabel = 'O seu perfil tem boas chances, mas podem existir condições a cumprir. A análise completa identificará o caminho mais direto.'
    color = 'text-amber-700'
    bgColor = 'bg-amber-50'
    emoji = '⚡'
  } else {
    category = 'baixa'
    label = 'Perfil em Desenvolvimento'
    sublabel = 'Existem opções a explorar. A análise completa identificará estratégias para fortalecer o seu perfil e os caminhos disponíveis.'
    color = 'text-blue-700'
    bgColor = 'bg-blue-50'
    emoji = '🔍'
  }

  return { total, max, percentage, category, label, sublabel, color, bgColor, emoji }
}

// Suggest visa types based on answers + score
export interface VisaSuggestion {
  code: string
  name: string
  match: 'strong' | 'possible' | 'weak'
  reason: string
}

export function suggestVisas(answers: Record<string, string>): VisaSuggestion[] {
  const suggestions: VisaSuggestion[] = []
  const income = Number(answers.monthly_income) || 0
  const incomeSource = answers.income_source
  const nationality = answers.nationality
  const hasPortugueseFamily = answers.has_portuguese_family === 'yes'
  const relationship = answers.family_relationship
  const mainGoal = answers.main_goal

  // D7 — Passive income
  if (['pension', 'investment', 'rental'].includes(incomeSource) && income >= 820) {
    suggestions.push({
      code: 'd7',
      name: 'Visto D7 — Rendimento Passivo',
      match: income >= 2000 ? 'strong' : 'possible',
      reason: `O seu rendimento passivo de ~€${income}/mês ${income >= 820 ? 'cumpre' : 'está próximo de cumprir'} o requisito mínimo.`,
    })
  }

  // D2 — Entrepreneur
  if (answers.business_plan === 'yes' || mainGoal === 'entrepreneurship') {
    suggestions.push({
      code: 'd2',
      name: 'Visto D2 — Empreendedor',
      match: answers.business_plan === 'yes' ? 'strong' : 'possible',
      reason: 'O seu perfil empreendedor alinha-se com os requisitos do D2.',
    })
  }

  // CPLP — Lusophone mobility
  const cplpNations = ['BR', 'AO', 'CV', 'MZ', 'GW', 'ST']
  if (cplpNations.includes(nationality)) {
    suggestions.push({
      code: 'cplp',
      name: 'Autorização de Residência CPLP',
      match: 'strong',
      reason: 'Como cidadão(ã) de um país da CPLP, beneficia do Acordo de Mobilidade lusófono.',
    })
  }

  // Reagrupamento familiar
  if (hasPortugueseFamily && ['spouse', 'parent', 'child'].includes(relationship)) {
    suggestions.push({
      code: 'reagrupamento',
      name: 'Reagrupamento Familiar',
      match: relationship === 'spouse' || relationship === 'parent' ? 'strong' : 'possible',
      reason: `A sua ligação familiar (${relationship === 'spouse' ? 'cônjuge' : relationship === 'parent' ? 'pai/mãe' : 'filho/a'}) com Portugal abre esta via.`,
    })
  }

  // D8 — Digital nomad (freelance / remote)
  if (incomeSource === 'freelance' && income >= 3040) {
    suggestions.push({
      code: 'd8',
      name: 'Visto D8 — Nómada Digital',
      match: income >= 3040 ? 'strong' : 'possible',
      reason: 'O rendimento de trabalho remoto/freelance pode qualificar para o Visto D8.',
    })
  }

  // Fallback
  if (suggestions.length === 0) {
    suggestions.push({
      code: 'other',
      name: 'Outras Opções a Explorar',
      match: 'weak',
      reason: 'A análise completa identificará os caminhos mais adequados ao seu perfil específico.',
    })
  }

  return suggestions
}

// Filter questions based on current answers (conditional display)
// Accepts questions array — defaults to hardcoded QUIZ_QUESTIONS as fallback.
export function getVisibleQuestions(
  answers: Record<string, string>,
  questions: QuizQuestion[] = QUIZ_QUESTIONS,
): QuizQuestion[] {
  return questions.filter((q) => {
    if (!q.showIf) return true
    const { questionKey, answerKey } = q.showIf
    const answer = answers[questionKey]
    if (!answer) return false
    if (Array.isArray(answerKey)) return answerKey.includes(answer)
    return answer === answerKey
  })
}
