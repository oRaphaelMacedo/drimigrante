// AdminPipelinePage.tsx — kanban das fases do CRM com arrastar e soltar (@dnd-kit).
//
// - Mouse: arrasta depois de 8px de movimento (um clique não vira arraste).
// - Toque (DI-073): segure o cartão por 250ms para arrastar; deslizar rola a
//   página e as colunas normalmente.
// - Teclado e leitor de tela: espaço/Enter pega o cartão, setas movem, Esc
//   cancela (anúncios em pt-BR). Cada cartão também tem o menu "Mover para".
// - No celular as colunas rolam na horizontal dentro do quadro (snap por coluna),
//   sem alargar a página.
import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { CheckCircle2, Clock, Loader2, Mail, MoreVertical, Phone, User } from 'lucide-react'
import { toast } from 'sonner'
import { CrmStageMenuItems } from '@/components/admin/CrmStageMenu'
import { adminMenuContentClass } from '@/components/admin/menu-styles'
import { Badge, Button } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { CRM_STAGES, isCrmStage, parseCrmStage, readAnswerText, type CrmStage } from '@/lib/crm-stage'
import { cn } from '@/lib/utils'

const PIPELINE_QUERY_KEY = ['admin-pipeline-leads'] as const
const PIPELINE_COLUMNS = 'id, full_name, email, phone, status, completion_percentage, crm_stage, created_at, answers'

const COLUMN_TITLES: Record<CrmStage, string> = {
  novo: 'Novos leads',
  contactado: 'Contatados',
  proposta: 'Proposta enviada',
  convertido: 'Convertidos',
}

const COLUMN_DOT: Record<CrmStage, string> = {
  novo: 'bg-primary',
  contactado: 'bg-warning',
  proposta: 'bg-muted-foreground',
  convertido: 'bg-success',
}

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

// ─── Dados ────────────────────────────────────────────────────────────────────

async function fetchPipelineLeads() {
  const { data, error } = await supabase
    .from('assessments')
    .select(PIPELINE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return data ?? []
}

type PipelineLead = Awaited<ReturnType<typeof fetchPipelineLeads>>[number]

function useLeads() {
  return useQuery({ queryKey: PIPELINE_QUERY_KEY, queryFn: fetchPipelineLeads, staleTime: 30_000 })
}

function useUpdateStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: CrmStage }) => {
      const { error } = await supabase.from('assessments').update({ crm_stage: stage }).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: PIPELINE_QUERY_KEY })
      const previous = qc.getQueryData<PipelineLead[]>(PIPELINE_QUERY_KEY)
      qc.setQueryData<PipelineLead[]>(PIPELINE_QUERY_KEY, (old) =>
        (old ?? []).map((lead) => (lead.id === id ? { ...lead, crm_stage: stage } : lead)),
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      console.error('[AdminPipeline] update stage:', err)
      if (ctx?.previous) qc.setQueryData(PIPELINE_QUERY_KEY, ctx.previous)
      toast.error('Não foi possível mover o lead. Tente de novo.')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY })
      void qc.invalidateQueries({ queryKey: ['admin-leads'] })
    },
  })
}

// ─── Acessibilidade do arrastar (pt-BR) ───────────────────────────────────────

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'Para mover um lead, pressione espaço ou Enter. Use as setas para levar o cartão até outra coluna e pressione espaço ou Enter de novo para soltar. Esc cancela.',
}

function columnName(id: UniqueIdentifier | undefined): string {
  return isCrmStage(id) ? COLUMN_TITLES[id] : 'fora das colunas'
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function AdminPipelinePage() {
  const { data: leads = [], isLoading, isError } = useLeads()
  const updateStage = useUpdateStage()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const leadName = useCallback(
    (id: UniqueIdentifier) => leads.find((lead) => lead.id === id)?.full_name || 'sem nome',
    [leads],
  )

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => `Lead ${leadName(active.id)} selecionado.`,
      onDragOver: ({ active, over }) => `Lead ${leadName(active.id)} sobre a coluna ${columnName(over?.id)}.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `Lead ${leadName(active.id)} solto na coluna ${columnName(over.id)}.`
          : `Lead ${leadName(active.id)} solto fora das colunas.`,
      onDragCancel: ({ active }) => `Movimento do lead ${leadName(active.id)} cancelado.`,
    }),
    [leadName],
  )

  const moveLead = useCallback(
    (lead: PipelineLead, stage: CrmStage) => {
      if (parseCrmStage(lead.crm_stage) === stage) return
      updateStage.mutate({ id: lead.id, stage })
    },
    [updateStage],
  )

  const handleDragStart = useCallback((e: DragStartEvent) => setActiveId(String(e.active.id)), [])

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null)
      const target = e.over?.id
      if (!isCrmStage(target)) return
      const lead = leads.find((l) => l.id === e.active.id)
      if (lead) moveLead(lead, target)
    },
    [leads, moveLead],
  )

  const columns = useMemo(
    () =>
      CRM_STAGES.map((stage) => ({
        stage,
        items: leads.filter((lead) => parseCrmStage(lead.crm_stage) === stage),
      })),
    [leads],
  )

  const activeLead = activeId ? (leads.find((lead) => lead.id === activeId) ?? null) : null

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-label="Carregando pipeline">
        <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Pipeline CRM</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Arraste os leads entre as colunas para mudar a fase. No celular, toque e segure o cartão para arrastar,
            ou use o menu do cartão.
          </p>
        </div>
        <Badge variant="neutral" className="self-start sm:self-auto">
          <User aria-hidden="true" />
          {leads.length} leads no total
        </Badge>
      </div>

      {isError && (
        <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/[.08] p-4 text-sm text-destructive">
          Não foi possível carregar os leads. Atualize a página para tentar de novo.
        </p>
      )}

      <DndContext
        sensors={sensors}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* `relative`: os textos sr-only (position: absolute) das colunas ficam presos ao
            quadro rolável; sem isso eles escapam do overflow e alargam a página no celular. */}
        <div
          role="list"
          aria-label="Fases do CRM"
          className="relative -mx-4 flex min-w-0 snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:h-[calc(100dvh-14rem)] md:min-h-[24rem] md:snap-none md:px-0"
        >
          {columns.map((column) => (
            <KanbanColumn key={column.stage} stage={column.stage} items={column.items} onMove={moveLead} />
          ))}
        </div>

        {/* Overlay fora do quadro rolável: o cartão acompanha o dedo/mouse sem ser cortado. */}
        <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(.25, 1, .5, 1)' }}>
          {activeLead ? <LeadCard lead={activeLead} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// ─── Coluna ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  stage,
  items,
  onMove,
}: {
  stage: CrmStage
  items: PipelineLead[]
  onMove: (lead: PipelineLead, stage: CrmStage) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const titleId = `kanban-${stage}-title`

  return (
    <section
      ref={setNodeRef}
      role="listitem"
      aria-labelledby={titleId}
      className={cn(
        'relative flex w-[85%] max-w-[20rem] shrink-0 snap-start flex-col rounded-lg border bg-muted p-3 transition-colors sm:w-72 md:h-full',
        // Telas largas: as 4 colunas dividem a largura (rola só se faltar espaço).
        'xl:w-auto xl:min-w-[14rem] xl:max-w-none xl:flex-1',
        isOver && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', COLUMN_DOT[stage])} />
          <h2 id={titleId} className="truncate font-sans text-sm font-bold text-foreground">
            {COLUMN_TITLES[stage]}
          </h2>
        </div>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-card px-1.5 text-xs font-semibold text-muted-foreground shadow-sm">
          <span className="sr-only">Leads nesta coluna: </span>
          {items.length}
        </span>
      </div>

      <ul className="flex min-h-[8rem] flex-1 flex-col gap-2 overflow-y-auto">
        {items.map((lead) => (
          <li key={lead.id}>
            <DraggableLeadCard lead={lead} onMove={onMove} />
          </li>
        ))}

        {items.length === 0 && (
          <li
            className={cn(
              'flex flex-1 items-center justify-center rounded-xl border-2 border-dashed py-8 text-sm text-muted-foreground',
              isOver ? 'border-primary bg-card/60 text-primary' : 'border-border',
            )}
          >
            {isOver ? 'Solte aqui' : 'Sem leads'}
          </li>
        )}
      </ul>
    </section>
  )
}

// ─── Cartão ───────────────────────────────────────────────────────────────────

function DraggableLeadCard({ lead, onMove }: { lead: PipelineLead; onMove: (lead: PipelineLead, stage: CrmStage) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
    attributes: { roleDescription: 'cartão arrastável' },
  })
  const name = lead.full_name || 'sem nome'

  return (
    <div className="relative">
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        aria-label={`Lead ${name}`}
        className={cn(
          'rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragging && 'opacity-30',
        )}
      >
        <LeadCard lead={lead} reserveMenuSpace />
      </div>
      {/* Fora da área arrastável: um controle não fica dentro do outro (role="button"). */}
      {!isDragging && (
        <div className="absolute right-0.5 top-0.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Mover o lead ${name}`} className="text-muted-foreground">
                <MoreVertical aria-hidden="true" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={4} collisionPadding={16} className={adminMenuContentClass}>
                <CrmStageMenuItems current={parseCrmStage(lead.crm_stage)} onSelect={(stage) => onMove(lead, stage)} />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}
    </div>
  )
}

const SCORE_TONE: Record<string, 'success' | 'warning' | 'primary'> = {
  alta: 'success',
  media: 'warning',
}

function LeadCard({
  lead,
  isDragging = false,
  reserveMenuSpace = false,
}: {
  lead: PipelineLead
  isDragging?: boolean
  /** Deixa espaço no canto para o botão do menu (posicionado por fora do cartão). */
  reserveMenuSpace?: boolean
}) {
  const scoreCategory = readAnswerText(lead.answers, 'score_category')
  const scoreLabel = readAnswerText(lead.answers, 'score_label')

  return (
    <div
      className={cn(
        'cursor-grab select-none rounded-xl border bg-card p-3.5 shadow-sm',
        'transition-[border-color,box-shadow] duration-fast hover:border-primary/30 hover:shadow-md',
        isDragging && 'cursor-grabbing rotate-1 shadow-lg',
      )}
    >
      <div className={cn('mb-2 flex items-start justify-between gap-2', reserveMenuSpace && 'pr-9')}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{lead.full_name || 'Lead anônimo'}</p>
          <p className="text-xs text-muted-foreground">
            {lead.created_at ? dateFormat.format(new Date(lead.created_at)) : '—'}
          </p>
        </div>
        {lead.status === 'completed' ? (
          <CheckCircle2 aria-label="Quiz concluído" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        ) : (
          <Clock aria-label="Quiz incompleto" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        )}
      </div>

      {(lead.email || lead.phone) && (
        <div className="mb-2 space-y-0.5">
          {lead.email && (
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/80">
              <Mail aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-xs text-foreground/80">
              <Phone aria-hidden="true" className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>
      )}

      {scoreCategory && (
        <Badge size="sm" variant={SCORE_TONE[scoreCategory] ?? 'primary'}>
          {scoreLabel ?? scoreCategory}
        </Badge>
      )}

      {lead.completion_percentage !== null && lead.status !== 'completed' && (
        <div className="mt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${lead.completion_percentage}%` }} />
          </div>
          <p className="mt-0.5 text-right text-xs text-muted-foreground">{lead.completion_percentage}% completo</p>
        </div>
      )}
    </div>
  )
}
