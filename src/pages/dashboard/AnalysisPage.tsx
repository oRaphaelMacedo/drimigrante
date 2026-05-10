import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Lock, FileText, Briefcase, Plane, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface VisaOption {
  code: string
  name: string
  match: string // 'high' | 'medium' | 'low'
  description?: string
  documents?: string[]
}

interface CachedResult {
  score: { percentage: number; category: string; label: string }
  visas: VisaOption[]
  leadInfo: { fullName: string; email: string } | null
  completedAt: string
  assessmentId?: string | null
}

const visaDetails: Record<string, { description: string, docs: string[], icon: React.ElementType, timeline: string }> = {
  'D7': {
    description: 'O Visto D7 é destinado a quem tem rendimentos próprios (reformas, rendas, dividendos) e deseja residir em Portugal.',
    timeline: '3 a 6 meses',
    icon: Briefcase,
    docs: [
      'Passaporte válido',
      'Comprovativo de rendimentos passivos regulares',
      'Comprovativo de alojamento em Portugal',
      'Registo criminal',
      'Seguro de saúde ou PB4',
      'NIF e conta bancária em Portugal com fundos suficientes'
    ]
  },
  'D2': {
    description: 'Para empreendedores ou profissionais independentes que pretendam abrir atividade ou empresa em Portugal.',
    timeline: '4 a 8 meses',
    icon: Briefcase,
    docs: [
      'Passaporte válido',
      'Plano de Negócios detalhado',
      'Comprovativo de capital para investimento',
      'Constituição da empresa (se aplicável)',
      'Registo criminal',
      'Seguro de saúde'
    ]
  },
  'CPLP': {
    description: 'Autorização de Residência com regras facilitadas para cidadãos da CPLP (Comunidade dos Países de Língua Portuguesa).',
    timeline: '1 a 3 meses',
    icon: Plane,
    docs: [
      'Passaporte válido (cidadão CPLP)',
      'Registo criminal',
      'Comprovativo de meios de subsistência',
      'Comprovativo de morada'
    ]
  },
  'Reagrupamento Familiar': {
    description: 'Para familiares de um cidadão residente legalmente em Portugal ou cidadão português.',
    timeline: '3 a 6 meses',
    icon: FileText,
    docs: [
      'Passaporte válido',
      'Comprovativo de laço familiar (certidão casamento/nascimento)',
      'Comprovativo de residência do familiar em Portugal',
      'Comprovativo de alojamento e meios de subsistência',
      'Registo criminal'
    ]
  },
  'D8': {
    description: 'Visto para Nómadas Digitais — permite viver em Portugal trabalhando remotamente para fora do país.',
    timeline: '3 a 6 meses',
    icon: Plane,
    docs: [
      'Passaporte válido',
      'Contrato de trabalho ou prestação de serviços remoto',
      'Comprovativos de rendimentos médios (últimos 3 meses)',
      'Alojamento em Portugal',
      'Registo criminal'
    ]
  }
}

export function AnalysisPage() {
  const { hasAccess } = useAuth()
  const [result, setResult] = useState<CachedResult | null>(null)
  
  const hasFullAccess = hasAccess('full_analysis')

  useEffect(() => {
    try {
      const raw = localStorage.getItem('dr_imigrante_quiz_result')
      if (raw) setResult(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

  if (!hasFullAccess) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
        <Lock className="h-16 w-16 text-gray-300" />
        <h2 className="text-xl font-bold text-gray-700">Acesso Restrito</h2>
        <p className="text-center text-gray-500">
          A análise completa é exclusiva para quem desbloqueou o diagnóstico.
        </p>
        <Link
          to="/checkout"
          state={{ plan: 'one_time', assessmentId: result?.assessmentId }}
          className="mt-4 flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
        >
          Desbloquear por €30
        </Link>
        <Link to="/dashboard" className="mt-2 text-sm text-gray-500 hover:text-brand-600">
          Voltar ao Dashboard
        </Link>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
        <AlertTriangle className="h-16 w-16 text-amber-300" />
        <h2 className="text-xl font-bold text-gray-700">Sem Diagnóstico</h2>
        <p className="text-center text-gray-500">
          Não encontrámos o seu diagnóstico de elegibilidade.
        </p>
        <Link
          to="/quiz"
          className="mt-4 flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-600"
        >
          Fazer o Quiz
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <Link to="/dashboard" className="mb-4 inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar ao Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Análise Jurídica Completa</h1>
        <p className="mt-2 text-gray-500">
          Abaixo estão detalhados os resultados baseados nas suas respostas, com todas as opções de vistos disponíveis e os documentos necessários.
        </p>
      </div>

      {/* Score Overview */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-lg font-bold text-gray-900">Probabilidade de Sucesso</h2>
        <div className="mt-6 flex flex-col items-center sm:flex-row sm:gap-12">
          {/* Circular Progress */}
          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-gray-50">
            <svg className="absolute h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
              <path
                className="text-gray-200"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className={cn(
                  result.score.category === 'alta' ? 'text-emerald-500' :
                  result.score.category === 'media' ? 'text-amber-500' : 'text-blue-500'
                )}
                strokeDasharray={`${result.score.percentage}, 100`}
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-2xl font-bold text-gray-900">{result.score.percentage}%</span>
            </div>
          </div>
          
          <div className="mt-6 text-center sm:mt-0 sm:text-left">
            <p className="text-xl font-bold text-gray-900">{result.score.label}</p>
            <p className="mt-2 text-sm text-gray-600">
              Com base no seu perfil financeiro, qualificações e nacionalidade, a nossa análise preliminar indica que o seu processo tem {result.score.category === 'alta' ? 'ótimas' : result.score.category === 'media' ? 'boas' : 'algumas'} chances de sucesso, dependendo da via escolhida.
            </p>
          </div>
        </div>
      </div>

      {/* Vistos Detalhados */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-gray-900">Opções de Vistos Adequados</h2>
        <div className="grid gap-6">
          {result.visas.map((visa, idx) => {
            const details = visaDetails[visa.name] || {
              description: 'Opção de visto com base no seu perfil.',
              timeline: 'Variável',
              icon: FileText,
              docs: ['Passaporte válido', 'Registo criminal', 'Alojamento'],
            }
            const Icon = details.icon

            return (
              <div key={idx} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 bg-gray-50/50 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{visa.name}</h3>
                        <div className="mt-1 flex items-center gap-2 text-sm">
                          <span className={cn(
                            'rounded-full px-2.5 py-0.5 font-medium',
                            visa.match === 'high' ? 'bg-emerald-100 text-emerald-700' :
                            visa.match === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          )}>
                            {visa.match === 'high' ? 'Alta Correspondência' :
                             visa.match === 'medium' ? 'Boa Correspondência' : 'Possibilidade'}
                          </span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-500">Tempo estimado: {details.timeline}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-gray-600">{details.description}</p>
                </div>
                
                <div className="p-6">
                  <h4 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Documentação Principal Exigida</h4>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {details.docs.map((doc, docIdx) => (
                      <li key={docIdx} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        <span>{doc}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Next Steps CTA */}
      <div className="rounded-2xl border border-brand-100 bg-brand-50 p-6 sm:p-8">
        <h2 className="text-lg font-bold text-brand-900">Próximos Passos</h2>
        <p className="mt-2 text-sm text-brand-700">
          Recomendamos que inicie a recolha da documentação e utilize o nosso Chat IA para esclarecer dúvidas específicas sobre cada tipo de documento ou exigência legal.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/dashboard/chat"
            className="inline-flex justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-500"
          >
            Falar com a IA
          </Link>
          <a
            href="mailto:suporte@doutorimigrante.com"
            className="inline-flex justify-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-brand-700 shadow-sm transition hover:bg-gray-50"
          >
            Contactar Equipa Jurídica
          </a>
        </div>
      </div>
    </div>
  )
}
