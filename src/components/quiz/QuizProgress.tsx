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

      {/* Theme dots */}
      <div className="flex items-center gap-1.5">
        {QUIZ_THEMES.map((theme, idx) => {
          const isDone = idx < currentThemeIdx
          const isCurrent = idx === currentThemeIdx
          return (
            <div
              key={theme.code}
              className={cn(
                'relative flex h-6 flex-1 items-center justify-center rounded-full text-xs font-medium transition-all duration-300',
                isDone && 'bg-brand-600 text-white',
                isCurrent && 'bg-brand-100 text-brand-700 ring-2 ring-brand-400 ring-offset-1',
                !isDone && !isCurrent && 'bg-gray-100 text-gray-400',
              )}
              title={theme.name}
            >
              <span className="text-[10px] leading-none">
                {isDone ? '✓' : theme.icon}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
