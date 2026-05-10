// QuizIntro.tsx — Intro screen before the quiz starts
import { ArrowRight, Clock, Shield, Star } from 'lucide-react'

interface QuizIntroProps {
  onStart: () => void
}

const highlights = [
  { icon: Clock, text: '5 minutos para completar' },
  { icon: Shield, text: 'Análise privada e confidencial' },
  { icon: Star, text: 'Resultado imediato — sem espera' },
]

const themes = [
  { icon: '👤', label: 'Perfil Pessoal' },
  { icon: '📍', label: 'Situação Atual' },
  { icon: '💰', label: 'Finanças' },
  { icon: '👨‍👩‍👧', label: 'Família' },
  { icon: '🎓', label: 'Qualificações' },
  { icon: '🇵🇹', label: 'Planos' },
]

export function QuizIntro({ onStart }: QuizIntroProps) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 duration-500 space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-700">
          <Star className="h-3.5 w-3.5 text-gold-500" />
          Quiz de Elegibilidade — Gratuito
        </div>
        <h1 className="mb-3 text-3xl font-extrabold leading-tight text-gray-900 sm:text-4xl">
          Descubra o seu <span className="text-brand-700">caminho para Portugal</span>
        </h1>
        <p className="mx-auto max-w-md text-base text-gray-500">
          Responda a 20 perguntas sobre o seu perfil e receba uma análise de elegibilidade personalizada.
        </p>
      </div>

      {/* Highlights */}
      <div className="flex flex-wrap justify-center gap-3">
        {highlights.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm"
          >
            <Icon className="h-4 w-4 text-brand-600" />
            {text}
          </div>
        ))}
      </div>

      {/* Themes preview */}
      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          O que vamos avaliar
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {themes.map(({ icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm ring-1 ring-gray-100">
                {icon}
              </div>
              <span className="text-[11px] font-medium leading-tight text-gray-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="text-center">
        <button
          id="quiz-start-btn"
          onClick={onStart}
          className="group inline-flex items-center gap-2 rounded-xl bg-brand-700 px-8 py-4 text-base font-bold text-white shadow-lg shadow-brand-200 transition-all duration-200 hover:bg-brand-600 hover:shadow-xl hover:shadow-brand-200 hover:-translate-y-0.5 active:translate-y-0"
        >
          Iniciar Quiz Gratuito
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
        <p className="mt-3 text-xs text-gray-400">
          Sem necessidade de criar conta. Pode retomar depois se sair.
        </p>
      </div>
    </div>
  )
}
