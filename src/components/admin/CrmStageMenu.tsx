import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CheckCircle2, Send, Undo2, UserCheck, type LucideIcon } from 'lucide-react'
import { CRM_STAGES, CRM_STAGE_META, type CrmStage } from '@/lib/crm-stage'
import { adminMenuItemClass } from './menu-styles'

const STAGE_ICONS: Record<CrmStage, LucideIcon> = {
  novo: Undo2,
  contactado: UserCheck,
  proposta: Send,
  convertido: CheckCircle2,
}

/**
 * Grupo "Mover para" de um menu Radix: as outras fases do CRM ("Novo" por
 * último, como voltar). Usado no menu de ações dos leads e nos cartões do kanban
 * (alternativa ao arrastar, também para teclado e leitor de tela).
 */
export function CrmStageMenuItems({ current, onSelect }: { current: CrmStage; onSelect: (stage: CrmStage) => void }) {
  const targets = [...CRM_STAGES.filter((s) => s !== 'novo'), 'novo' as const].filter((s) => s !== current)
  return (
    <DropdownMenu.Group>
      <DropdownMenu.Label className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Mover para</DropdownMenu.Label>
      {targets.map((target) => {
        const Icon = STAGE_ICONS[target]
        return (
          <DropdownMenu.Item key={target} className={adminMenuItemClass} onSelect={() => onSelect(target)}>
            <Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            {CRM_STAGE_META[target].label}
          </DropdownMenu.Item>
        )
      })}
    </DropdownMenu.Group>
  )
}
