import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle, Star, Shield } from 'lucide-react'

const steps = [
  { step: '1', title: 'Quiz Gratuito', desc: 'Responda a 20 perguntas sobre o seu perfil. Leva apenas 5 minutos.' },
  { step: '2', title: 'Pré-resultado', desc: 'Veja a sua elegibilidade categórica (Alta/Média/Baixa) imediatamente.' },
  { step: '3', title: 'Análise Completa', desc: 'Por €30, receba análise jurídica completa com os vistos mais adequados ao seu perfil.' },
]

const features = [
  'Análise por advogados especializados em imigração portuguesa',
  'Cobertura de todos os tipos de visto (D7, D2, CPLP, Reagrupamento)',
  'Resultados em minutos, disponíveis 24/7',
  'Acompanhamento contínuo por €4,90/mês',
]

export function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 to-brand-900 py-20 text-white">
        <div className="container relative z-10 text-center">
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium">
              <Star className="h-3.5 w-3.5 text-gold-400" />
              Análise jurídica por IA + advogados especializados
            </div>
            <h1 className="mb-6 text-4xl font-extrabold leading-tight md:text-5xl">
              Descubra o seu visto para Portugal em minutos
            </h1>
            <p className="mb-8 text-lg text-blue-100">
              Quiz gratuito + análise de elegibilidade personalizada. Pare de perder tempo com informação genérica e saiba exatamente qual o seu caminho.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/quiz"
                data-testid="cta-start-quiz-hero"
                className="flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-semibold text-brand-700 shadow-lg hover:bg-blue-50 transition"
              >
                Fazer Quiz Gratuito
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#como-funciona"
                className="px-6 py-3.5 text-base font-medium text-white/80 hover:text-white transition"
              >
                Como funciona →
              </a>
            </div>
          </div>
        </div>
        {/* Decorative */}
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-white/5" />
      </section>

      {/* How it works */}
      <section id="como-funciona" className="py-20">
        <div className="container">
          <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">Como Funciona</h2>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map(({ step, title, desc }) => (
              <div key={step} className="relative rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700">
                  {step}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
                <p className="text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-brand-50 py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-gray-900">Por que escolher o Doutor Imigrante?</h2>
            <p className="mb-8 text-gray-600">
              Combinamos inteligência artificial com o conhecimento de advogados especializados para lhe dar a análise mais precisa possível.
            </p>
            <ul className="space-y-3 text-left">
              {features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                  <span className="text-gray-700">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="precos" className="py-20">
        <div className="container">
          <h2 className="mb-12 text-center text-3xl font-bold text-gray-900">Preços Simples e Transparentes</h2>
          <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">
            {/* One-time */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <span className="text-3xl font-extrabold text-gray-900">€30</span>
                <span className="ml-1 text-gray-500">pagamento único</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Diagnóstico Profissional</h3>
              <ul className="mb-6 space-y-2">
                {['Análise jurídica completa', 'Top 3 vistos recomendados', 'Lista de documentos necessários', 'Dashboard pessoal', 'Válido para sempre'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <CheckCircle className="h-4 w-4 text-green-500" /> {f}
                  </li>
                ))}
              </ul>
              <Link to="/quiz" data-testid="cta-pricing-onetime" className="block w-full rounded-lg bg-brand-700 py-2.5 text-center text-sm font-semibold text-white hover:bg-brand-800 transition">
                Começar Quiz →
              </Link>
            </div>

            {/* Subscription */}
            <div className="relative rounded-2xl border-2 border-brand-600 bg-brand-700 p-6 text-white shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold-500 px-3 py-1 text-xs font-semibold text-white">
                Mais Popular
              </div>
              <div className="mb-4">
                <span className="text-3xl font-extrabold">€4,90</span>
                <span className="ml-1 text-blue-200">/mês</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold">Acompanhamento Contínuo</h3>
              <ul className="mb-6 space-y-2">
                {['Tudo do Diagnóstico', 'Chat IA ilimitado', 'Alertas de mudanças legais', 'Acompanhamento do processo', 'Cancele a qualquer momento'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-blue-100">
                    <CheckCircle className="h-4 w-4 text-blue-300" /> {f}
                  </li>
                ))}
              </ul>
              <Link to="/quiz" data-testid="cta-pricing-subscription" className="block w-full rounded-lg bg-white py-2.5 text-center text-sm font-semibold text-brand-700 hover:bg-blue-50 transition">
                Começar Quiz →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-16 text-center text-white">
        <div className="container">
          <Shield className="mx-auto mb-4 h-8 w-8 text-brand-400" />
          <h2 className="mb-4 text-2xl font-bold">Pronto para descobrir o seu caminho para Portugal?</h2>
          <p className="mb-6 text-gray-400">Quiz gratuito. Resultado imediato. Sem compromisso.</p>
          <Link
            to="/quiz"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-brand-500 transition"
          >
            Fazer Quiz Gratuito
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
