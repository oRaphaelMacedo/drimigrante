// QuizIntro.tsx — tela inicial do quiz, com "Continue de onde parou" (DI-041).
import { ArrowRight, Clock, RotateCcw, Shield, Zap } from 'lucide-react'
import { Badge, Button, Card } from '@/components/ui'

export interface QuizIntroResume {
  /** Perguntas já respondidas nesta sessão (deste aparelho). */
  answeredCount: number
  onContinue: () => void
  onRestart: () => void
}

interface QuizIntroProps {
  onStart: () => void
  /** Presente quando há respostas salvas neste aparelho. */
  resume?: QuizIntroResume | null
}

const highlights = [
  { icon: Clock, text: 'Cerca de 5 minutos' },
  { icon: Shield, text: 'Análise privada e confidencial' },
  { icon: Zap, text: 'Resultado na hora' },
]

const cases = [
  { label: 'Descendência', description: 'Filho, neto ou bisneto de português(a)' },
  { label: 'Matrimônio', description: 'Casado(a) com cidadão(ã) português(a)' },
  { label: 'Nascimento', description: 'Nasceu em Portugal' },
  { label: 'Residência', description: 'Mora em Portugal' },
  { label: 'Ex-nacional', description: 'Já teve a nacionalidade portuguesa' },
  { label: 'Ex-colônias', description: 'Família originária das ex-colônias' },
]

export function QuizIntro({ onStart, resume }: QuizIntroProps) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-4 space-y-8 duration-500 motion-reduce:animate-none">
      {/* Cabeçalho */}
      <header className="text-center">
        <Badge variant="primary" className="mb-3">
          Diagnóstico gratuito de elegibilidade
        </Badge>
        <h1 className="mb-3 text-h1 text-foreground">
          Descubra se você tem direito à <span className="text-primary">nacionalidade portuguesa</span>
        </h1>
        <p className="mx-auto max-w-md text-base text-muted-foreground [text-wrap:pretty]">
          Responda a algumas perguntas sobre o seu perfil e veja na hora uma pré-análise da sua elegibilidade,
          sem custo.
        </p>
      </header>

      {resume ? (
        <Card variant="elevated" data-testid="quiz-resume-card" className="text-left">
          <h2 className="text-xl font-bold text-foreground">Continue de onde parou</h2>
          <p className="mt-1.5 text-base text-muted-foreground [text-wrap:pretty]">
            Você já respondeu {resume.answeredCount} {resume.answeredCount === 1 ? 'pergunta' : 'perguntas'}. Suas
            respostas ficaram salvas neste aparelho.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button
              id="quiz-resume-btn"
              data-testid="quiz-resume-continue"
              size="lg"
              className="w-full sm:w-auto sm:min-w-[12rem]"
              onClick={resume.onContinue}
            >
              Continuar
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              id="quiz-restart-btn"
              data-testid="quiz-resume-restart"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={resume.onRestart}
            >
              <RotateCcw aria-hidden="true" />
              Recomeçar do zero
            </Button>
          </div>
        </Card>
      ) : (
        <div className="text-center">
          <Button
            id="quiz-start-btn"
            data-testid="quiz-intro-start"
            size="lg"
            className="group w-full sm:w-auto sm:px-8"
            onClick={onStart}
          >
            Iniciar diagnóstico gratuito
            <ArrowRight
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            />
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">
            Não precisa criar conta. Se sair, você continua de onde parou neste aparelho.
          </p>
        </div>
      )}

      {/* Destaques */}
      <ul className="flex flex-wrap justify-center gap-2.5">
        {highlights.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-[var(--shadow-sm)]"
          >
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>

      {/* Casos cobertos */}
      <section aria-labelledby="quiz-intro-cases" className="rounded-[var(--radius)] bg-muted p-4 sm:p-5">
        <h2
          id="quiz-intro-cases"
          className="mb-4 font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Casos cobertos pelo diagnóstico
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {cases.map(({ label, description }) => (
            <li key={label} className="rounded-xl bg-card p-3 shadow-[var(--shadow-sm)]">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
