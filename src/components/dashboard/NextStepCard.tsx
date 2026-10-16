/**
 * "Próximo passo" na home do dashboard (DI-049).
 *
 * Mostra o primeiro item pendente do checklist do caminho (useChecklist) e a
 * barra "X de Y". A ação do card é secundária: a ação principal da tela
 * continua sendo a da home (ex.: "Ver minha análise").
 */
import { ArrowRight, CheckCircle2, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Card } from '@/components/ui'
import { checklistItemAnchor, type Checklist } from '@/hooks/useChecklist'
import { cn } from '@/lib/utils'

export interface NextStepCardProps {
  checklist: Checklist
  className?: string
}

export function NextStepCard({ checklist, className }: NextStepCardProps) {
  const { next, completed, total } = checklist
  if (total === 0) return null

  const percent = Math.round((completed / total) * 100)
  const allDone = next === null

  return (
    <Card
      role="region"
      aria-labelledby="next-step-title"
      data-testid="next-step-card"
      className={cn('space-y-4', className)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
            allDone ? 'bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]' : 'bg-primary/[.08] text-primary',
          )}
        >
          {allDone ? <CheckCircle2 className="h-5 w-5" /> : <ListChecks className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="next-step-title" className="text-lg font-semibold leading-snug text-foreground">
            {allDone ? 'Checklist em dia' : 'Próximo passo'}
          </h2>
          {allDone ? (
            <p className="mt-1 text-base text-muted-foreground [text-wrap:pretty]">
              Você marcou todos os itens da sua lista. Seus arquivos ficam em Documentos.
            </p>
          ) : (
            <>
              <p className="mt-1 text-base font-medium text-foreground [text-wrap:pretty]" data-testid="next-step-label">
                {next.kind === 'document' ? `Separe: ${lowerFirstWord(next.label)}` : next.label}
              </p>
              {next.hint && <p className="mt-0.5 text-sm text-muted-foreground [text-wrap:pretty]">{next.hint}</p>}
            </>
          )}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Seu checklist</span>
          <span className="font-medium text-foreground" data-testid="next-step-progress">
            {completed} de {total} {total === 1 ? 'item pronto' : 'itens prontos'}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Progresso do checklist"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
          aria-valuetext={`${completed} de ${total}`}
          className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-base ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <Button asChild variant="secondary" className="w-full sm:w-auto">
        <Link
          to={
            allDone
              ? '/dashboard/documents'
              : `/dashboard/documents#${checklistItemAnchor(next.kind, next.key)}`
          }
          data-testid="next-step-link"
        >
          {allDone ? 'Ver documentos' : next.kind === 'document' ? 'Abrir o checklist' : 'Ver a etapa'}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </Card>
  )
}

/** "Passaporte ou documento…" → "passaporte ou documento…" (mantém siglas e nomes próprios). */
function lowerFirstWord(text: string): string {
  const [first = '', ...rest] = text.split(' ')
  if (first.length > 1 && first === first.toUpperCase()) return text
  if (/^(Registo|Conservatória|AIMA)$/.test(first)) return text
  return [first.charAt(0).toLocaleLowerCase('pt-BR') + first.slice(1), ...rest].join(' ')
}
