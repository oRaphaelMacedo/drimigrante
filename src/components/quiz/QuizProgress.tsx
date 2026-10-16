// QuizProgress.tsx — progresso honesto do quiz (DI-040).
//
// - "Pergunta N de T" e a porcentagem só aparecem quando o total é conhecido
//   (depois do caso); antes disso, só "Pergunta N".
// - A barra é segmentada pelos temas das perguntas visíveis (não pela lista
//   fixa de temas), cada segmento proporcional ao número de perguntas.
// - O tema atual aparece uma vez só, aqui.
import type { ThemeProgress } from '@/lib/quiz-flow'

interface QuizProgressProps {
  /** Ex.: "Pergunta 3 de 9", "Pergunta 1", "Perguntas concluídas". */
  label: string
  /** Tema atual (mostrado uma vez). */
  themeName?: string | null
  /** 0–100, ou null enquanto o total não é conhecido. */
  percentage: number | null
  /** Segmentos da barra: temas das perguntas visíveis. */
  segments?: ThemeProgress[]
}

export function QuizProgress({ label, themeName, percentage, segments = [] }: QuizProgressProps) {
  const showBar = percentage !== null && segments.length > 0

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-semibold text-primary">{themeName}</span>
        <span data-testid="quiz-progress-label" className="shrink-0 tabular-nums text-muted-foreground">
          {label}
          {percentage !== null && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-foreground">{percentage}%</span>
            </>
          )}
        </span>
      </div>

      {showBar && (
        <div
          role="progressbar"
          aria-label="Progresso do diagnóstico"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          aria-valuetext={`${label}, ${percentage}%`}
          className="mt-3 flex gap-1"
        >
          {segments.map((segment) => (
            <div
              key={segment.code}
              title={segment.name}
              className="h-1.5 min-w-[0.5rem] overflow-hidden rounded-full bg-muted"
              style={{ flexGrow: Math.max(1, segment.total), flexBasis: 0 }}
            >
              <div
                className="h-full w-full origin-left rounded-full bg-primary transition-transform duration-slow ease-out"
                style={{ transform: `scaleX(${segment.total > 0 ? segment.answered / segment.total : 0})` }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
