// AdminPipelinePage.tsx — Kanban com drag-and-drop real via @dnd-kit
import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { Loader2, Mail, Phone, CheckCircle2, Clock, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Assessment } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── Types ────────────────────────────────────────────────────────────────────

type CrmStage = 'novo' | 'contactado' | 'proposta' | 'convertido'

interface Column {
  id: CrmStage
  title: string
  color: string
  dotColor: string
  count?: number
}

const COLUMNS: Column[] = [
  { id: 'novo',        title: 'Novos Leads',      color: 'bg-blue-50 border-blue-100',     dotColor: 'bg-blue-500' },
  { id: 'contactado',  title: 'Contactados',       color: 'bg-amber-50 border-amber-100',   dotColor: 'bg-amber-500' },
  { id: 'proposta',    title: 'Proposta Enviada',  color: 'bg-purple-50 border-purple-100', dotColor: 'bg-purple-500' },
  { id: 'convertido',  title: 'Convertidos ✓',     color: 'bg-emerald-50 border-emerald-100', dotColor: 'bg-emerald-500' },
]

// ─── Hook ────────────────────────────────────────────────────────────────────

function useLeads() {
  return useQuery({
    queryKey: ['admin-pipeline-leads'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as (Assessment & { crm_stage: CrmStage })[]
    },
    staleTime: 30_000,
  })
}

function useUpdateStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: CrmStage }) => {
      const { error } = await (supabase as any)
        .from('assessments')
        .update({ crm_stage: stage })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ['admin-pipeline-leads'] })
      const previous = qc.getQueryData(['admin-pipeline-leads'])
      qc.setQueryData(['admin-pipeline-leads'], (old: any[] | undefined) =>
        (old ?? []).map((l) => (l.id === id ? { ...l, crm_stage: stage } : l))
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['admin-pipeline-leads'], ctx.previous)
      toast.error('Erro ao mover lead')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['admin-pipeline-leads'] })
    },
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AdminPipelinePage() {
  const { data: leads = [], isLoading } = useLeads()
  const updateStage = useUpdateStage()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string)
  }, [])

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = e
      if (!over) return
      const newStage = over.id as CrmStage
      const lead = leads.find((l) => l.id === active.id)
      if (!lead) return
      const currentStage: CrmStage = (lead as any).crm_stage ?? 'novo'
      if (currentStage === newStage) return
      updateStage.mutate({ id: lead.id, stage: newStage })
    },
    [leads, updateStage]
  )

  const handleDragOver = useCallback((_e: DragOverEvent) => {
    // Visual feedback handled by useDroppable's isOver
  }, [])

  const columnsWithLeads = COLUMNS.map((col) => ({
    ...col,
    items: leads.filter((l) => ((l as any).crm_stage ?? 'novo') === col.id),
  }))

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Pipeline CRM</h1>
          <p className="mt-1 text-sm text-gray-500">
            Arraste os leads entre colunas para actualizar o estado.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2 text-sm text-gray-500 shadow-sm">
          <User className="h-4 w-4" />
          {leads.length} leads total
        </div>
      </div>

      {/* Kanban */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {columnsWithLeads.map((col) => (
            <KanbanColumn key={col.id} column={col} activeId={activeId} />
          ))}
        </div>

        {/* Drag Overlay — rendered at root level, outside scrollable */}
        <DragOverlay dropAnimation={{ duration: 150, easing: 'ease' }}>
          {activeLead ? <LeadCard lead={activeLead as any} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// ─── KanbanColumn ─────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  activeId: _activeId,
}: {
  column: Column & { items: (Assessment & { crm_stage: CrmStage })[] }
  activeId: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full min-w-[280px] max-w-[320px] flex-col rounded-2xl border p-3 transition-colors',
        column.color,
        isOver && 'ring-2 ring-brand-400 ring-offset-1',
      )}
    >
      {/* Column header */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className={cn('h-2 w-2 rounded-full', column.dotColor)} />
          <h2 className="text-sm font-bold text-gray-800">{column.title}</h2>
        </div>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-[11px] font-semibold text-gray-500 shadow-sm">
          {column.items.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {column.items.map((lead) => (
          <DraggableLeadCard key={lead.id} lead={lead as any} />
        ))}

        {column.items.length === 0 && (
          <div className={cn(
            'flex flex-1 items-center justify-center rounded-xl border-2 border-dashed py-8 text-sm text-gray-400',
            isOver ? 'border-brand-400 bg-white/60 text-brand-500' : 'border-gray-200',
          )}>
            {isOver ? 'Largar aqui' : 'Sem leads'}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DraggableLeadCard ────────────────────────────────────────────────────────

function DraggableLeadCard({ lead }: { lead: Assessment & { crm_stage: CrmStage } }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && 'opacity-30')}
    >
      <LeadCard lead={lead} />
    </div>
  )
}

// ─── LeadCard ─────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  isDragging = false,
}: {
  lead: Assessment & { crm_stage: CrmStage }
  isDragging?: boolean
}) {
  const scoreCategory = (lead.answers as any)?.score_category
  const scoreLabel = (lead.answers as any)?.score_label

  return (
    <div
      className={cn(
        'cursor-grab rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm select-none',
        'transition hover:border-brand-200 hover:shadow-md',
        isDragging && 'rotate-1 shadow-lg cursor-grabbing',
      )}
    >
      {/* Name + date */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {lead.full_name || 'Lead Anónimo'}
          </p>
          <p className="text-[11px] text-gray-400">
            {new Date(lead.created_at ?? '').toLocaleDateString('pt-PT')}
          </p>
        </div>
        {lead.status === 'completed' ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Clock className="h-4 w-4 shrink-0 text-amber-400" />
        )}
      </div>

      {/* Contact */}
      {(lead.email || lead.phone) && (
        <div className="mb-2 space-y-0.5">
          {lead.email && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Mail className="h-3 w-3" />
              <span className="truncate">{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Phone className="h-3 w-3" />
              <span>{lead.phone}</span>
            </div>
          )}
        </div>
      )}

      {/* Score badge */}
      {scoreCategory && (
        <span className={cn(
          'inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
          scoreCategory === 'alta' ? 'bg-emerald-100 text-emerald-700' :
          scoreCategory === 'media' ? 'bg-amber-100 text-amber-700' :
          'bg-blue-100 text-blue-700',
        )}>
          {scoreLabel ?? scoreCategory}
        </span>
      )}

      {/* Completion bar */}
      {lead.completion_percentage !== null && lead.status !== 'completed' && (
        <div className="mt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-brand-400"
              style={{ width: `${lead.completion_percentage ?? 0}%` }}
            />
          </div>
          <p className="mt-0.5 text-right text-[10px] text-gray-400">
            {lead.completion_percentage}% completo
          </p>
        </div>
      )}
    </div>
  )
}
