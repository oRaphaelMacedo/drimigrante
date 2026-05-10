// QuizProgress.tsx — Visual progress bar with theme indicators
import { QUIZ_THEMES } from '@/data/quiz-questions'
import { cn } from '@/lib/utils'

interface QuizProgressProps {
  currentThemeCode: string
  progressPercentage: number
  currentIndex: number
  totalQuestions: number
}

const THEME_ORDER = QUIZ_THEMES.map((t) => t.code) as string[]

export function QuizProgress({
  currentThemeCode,
  progressPercentage,
  currentIndex,
  totalQuestions,
}: QuizProgressProps) {
  const currentThemeIdx = THEME_ORDER.indexOf(currentThemeCode)

  return (
    <div className="w-full space-y-3">
      {/* Top row: question count + percentage */}
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-500">
          Pergunta {currentIndex + 1} de {totalQuestions}
        </span>
        <span className="font-semibold text-brand-700">{progressPercentage}%</span>
      </div>

      {/* Main progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Theme segments */}
      <div className="flex items-center gap-1">
        {QUIZ_THEMES.map((theme, idx) => {
          const isDone = idx < currentThemeIdx
          const isCurrent = idx === currentThemeIdx
          return (
            <div
              key={theme.code}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-all duration-300',
                isDone && 'bg-brand-600',
                isCurrent && 'bg-brand-400',
                !isDone && !isCurrent && 'bg-gray-200',
              )}
              title={theme.name}
            />
          )
        })}
      </div>

      {/* Current theme label */}
      <p className="text-xs font-medium text-gray-400">
        {QUIZ_THEMES.find((t) => t.code === currentThemeCode)?.name ?? ''}
      </p>
    </div>
  )
}
