// PathTeaser.tsx — caminhos para a nacionalidade identificados no quiz (DI-070).
//
// - Ordem: o caminho mais forte primeiro (strong > possible > weak).
// - Teaser com desfoque (decisão do dono): as primeiras palavras da justificativa
//   ficam nítidas e o resto desfocado. A parte desfocada é `aria-hidden` (o leitor
//   de tela ouve "Detalhes na análise completa") e todo item desfocado tem cadeado.
import { CircleDot, Lock, Route } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge, Card } from '@/components/ui'
import { pathwayTitle, sortPathways, splitTeaser, type PathMatch } from './results-copy'

export interface TeaserPathway {
  code: string
  name: string
  match: PathMatch | string
  reason?: string
}

const MATCH_LABEL: Record<PathMatch, string> = {
  strong: 'Alta compatibilidade',
  possible: 'Compatibilidade possível',
  weak: 'A explorar',
}

const MATCH_BADGE: Record<PathMatch, 'success' | 'warning' | 'neutral'> = {
  strong: 'success',
  possible: 'warning',
  weak: 'neutral',
}

function matchOf(value: string): PathMatch {
  return value === 'strong' || value === 'possible' ? value : 'weak'
}

export interface PathTeaserProps {
  pathways: readonly TeaserPathway[]
  /** Quantos caminhos mostrar (padrão: 3). */
  limit?: number
}

export function PathTeaser({ pathways, limit = 3 }: PathTeaserProps) {
  const top = sortPathways(pathways).slice(0, limit)
  if (top.length === 0) return null

  return (
    <Card role="region" aria-labelledby="results-paths-title" data-testid="results-paths">
      <div className="mb-4 flex items-start gap-2">
        <Route aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <h2 id="results-paths-title" className="font-sans text-h3 font-semibold text-foreground">
          Caminhos para a nacionalidade no seu perfil
        </h2>
      </div>

      <ul className="space-y-3">
        {top.map((pathway, index) => {
          const match = matchOf(pathway.match)
          const teaser = splitTeaser(pathway.reason ?? '')
          const locked = teaser.hidden.length > 0
          return (
            <li
              key={pathway.code}
              data-testid="results-path"
              data-match={match}
              className={cn(
                'rounded-xl border p-4',
                index === 0 ? 'border-primary/20 bg-primary/[.05]' : 'border-border bg-muted',
              )}
            >
              <div className="flex items-start gap-3">
                <CircleDot aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-snug text-foreground">{pathwayTitle(pathway)}</p>
                  <Badge size="sm" variant={MATCH_BADGE[match]} className="mt-1.5">
                    {MATCH_LABEL[match]}
                  </Badge>
                  {(teaser.visible || locked) && (
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {teaser.visible && <span>{teaser.visible} </span>}
                      {locked && (
                        <>
                          {/* Desfoque mantido (decisão do dono); fora da árvore de acessibilidade. */}
                          <span aria-hidden="true" className="select-none blur-[3px]">
                            {teaser.hidden}
                          </span>
                          <span className="sr-only">… Detalhes na análise completa.</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
                {locked && <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted p-3 text-sm text-muted-foreground">
        <Lock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        Na análise completa você vê os detalhes de cada caminho, os requisitos e os próximos passos.
      </p>
    </Card>
  )
}
