// AdminLeadsPage.tsx — Tabela de leads com dropdown de ações
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Mail,
  Phone,
  ThermometerSun,
  Loader2,
  Copy,
  UserCheck,
  ExternalLink,
  CheckCircle2,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Assessment } from '@/lib/database.types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type CrmStage = 'novo' | 'contactado' | 'proposta' | 'convertido'

// ─── Hook ─────────────────────────────────────────────────────────────────────

function useLeads() {
  return useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as (Assessment & { crm_stage: CrmStage })[]
    },
    staleTime: 30_000,
  })
}

function useUpdateCrmStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: CrmStage }) => {
      const { error } = await (supabase as any)
        .from('assessments')
        .update({ crm_stage: stage })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-leads'] })
      qc.invalidateQueries({ queryKey: ['admin-pipeline-leads'] })
    },
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AdminLeadsPage() {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<CrmStage | 'all'>('all')
  const { data: leads = [], isLoading: loading } = useLeads()
  const updateStage = useUpdateCrmStage()

  const getTemperature = (pct: number | null) => {
    if (!pct) return { label: 'Frio', color: 'bg-blue-100 text-blue-700' }
    if (pct >= 100) return { label: 'Quente', color: 'bg-red-100 text-red-700' }
    if (pct >= 50) return { label: 'Morno', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Frio', color: 'bg-blue-100 text-blue-700' }
  }

  const exportCSV = () => {
    const headers = ['Nome', 'Email', 'Telefone', 'Status', 'Fase CRM', 'Temperatura', 'Data']
    const csvContent = [
      headers.join(','),
      ...leads.map((l) => {
        const temp = getTemperature(l.completion_percentage).label
        const date = new Date(l.created_at ?? '').toLocaleDateString('pt-PT')
        return `"${l.full_name || ''}","${l.email || ''}","${l.phone || ''}","${l.status}","${(l as any).crm_stage ?? 'novo'}","${temp}","${date}"`
      }),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `leads_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const filteredLeads = leads.filter((l) => {
    const matchSearch =
      (l.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (l.email?.toLowerCase() || '').includes(search.toLowerCase())
    const matchStage = stageFilter === 'all' || ((l as any).crm_stage ?? 'novo') === stageFilter
    return matchSearch && matchStage
  })

  const STAGE_LABELS: Record<CrmStage | 'all', string> = {
    all: 'Todos',
    novo: 'Novos',
    contactado: 'Contactados',
    proposta: 'Proposta',
    convertido: 'Convertidos',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Leads</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerir, filtrar e exportar potenciais clientes.
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Procurar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border-none bg-gray-50 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
        </div>

        {/* Stage filter tabs */}
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STAGE_LABELS) as (CrmStage | 'all')[]).map((stage) => (
            <button
              key={stage}
              onClick={() => setStageFilter(stage)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                stageFilter === stage
                  ? 'bg-brand-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {STAGE_LABELS[stage]}
              {stage !== 'all' && (
                <span className="ml-1 opacity-70">
                  ({leads.filter((l) => ((l as any).crm_stage ?? 'novo') === stage).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-gray-400">
            <Filter className="h-8 w-8" />
            <p className="text-sm">Nenhum lead corresponde aos filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Nome</th>
                  <th className="px-6 py-4 font-medium">Contacto</th>
                  <th className="px-6 py-4 font-medium">Quiz</th>
                  <th className="px-6 py-4 font-medium">Fase CRM</th>
                  <th className="px-6 py-4 font-medium">Temperatura</th>
                  <th className="px-6 py-4 font-medium">Data</th>
                  <th className="px-6 py-4 font-medium text-right">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => {
                  const temp = getTemperature(lead.completion_percentage)
                  const stage: CrmStage = (lead as any).crm_stage ?? 'novo'
                  return (
                    <LeadRow
                      key={lead.id}
                      lead={lead as any}
                      stage={stage}
                      temp={temp}
                      onStageChange={(s) => updateStage.mutate({ id: lead.id, stage: s })}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-400">
        {filteredLeads.length} de {leads.length} leads
      </p>
    </div>
  )
}

// ─── LeadRow ──────────────────────────────────────────────────────────────────

function LeadRow({
  lead,
  stage,
  temp,
  onStageChange,
}: {
  lead: Assessment & { crm_stage: CrmStage }
  stage: CrmStage
  temp: { label: string; color: string }
  onStageChange: (stage: CrmStage) => void
}) {
  const STAGE_CONFIG: Record<CrmStage, { label: string; cls: string }> = {
    novo:       { label: 'Novo',        cls: 'bg-blue-100 text-blue-700' },
    contactado: { label: 'Contactado',  cls: 'bg-amber-100 text-amber-700' },
    proposta:   { label: 'Proposta',    cls: 'bg-purple-100 text-purple-700' },
    convertido: { label: 'Convertido',  cls: 'bg-emerald-100 text-emerald-700' },
  }

  return (
    <tr className="transition hover:bg-gray-50">
      {/* Nome */}
      <td className="px-6 py-4">
        <div className="font-semibold text-gray-900">{lead.full_name || 'Sem Nome'}</div>
        <div className="text-xs text-gray-400">ID: {lead.id.split('-')[0]}</div>
      </td>

      {/* Contacto */}
      <td className="px-6 py-4">
        <div className="flex flex-col gap-0.5">
          {lead.email && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Mail className="h-3 w-3" />
              <span>{lead.email}</span>
            </div>
          )}
          {lead.phone && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Phone className="h-3 w-3" />
              <span>{lead.phone}</span>
            </div>
          )}
          {!lead.email && !lead.phone && (
            <span className="text-xs text-gray-400">Sem contacto</span>
          )}
        </div>
      </td>

      {/* Quiz status */}
      <td className="px-6 py-4">
        <span className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          lead.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600',
        )}>
          {lead.status === 'completed' ? 'Concluído' : `${lead.completion_percentage ?? 0}%`}
        </span>
      </td>

      {/* Fase CRM */}
      <td className="px-6 py-4">
        <span className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          STAGE_CONFIG[stage].cls,
        )}>
          {STAGE_CONFIG[stage].label}
        </span>
      </td>

      {/* Temperatura */}
      <td className="px-6 py-4">
        <span className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
          temp.color,
        )}>
          <ThermometerSun className="h-3 w-3" />
          {temp.label}
        </span>
      </td>

      {/* Data */}
      <td className="px-6 py-4 text-xs text-gray-500">
        {new Date(lead.created_at ?? '').toLocaleDateString('pt-PT')}
      </td>

      {/* Ações */}
      <td className="px-6 py-4 text-right">
        <LeadActionMenu lead={lead} stage={stage} onStageChange={onStageChange} />
      </td>
    </tr>
  )
}

// ─── LeadActionMenu ───────────────────────────────────────────────────────────

function LeadActionMenu({
  lead,
  stage,
  onStageChange,
}: {
  lead: Assessment & { crm_stage: CrmStage }
  stage: CrmStage
  onStageChange: (stage: CrmStage) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const copyEmail = () => {
    if (!lead.email) return toast.error('Sem email para copiar')
    navigator.clipboard.writeText(lead.email)
    toast.success('Email copiado!')
    setOpen(false)
  }

  const setStage = (s: CrmStage) => {
    onStageChange(s)
    toast.success(`Lead movido para "${s}"`)
    setOpen(false)
  }

  const STAGE_NEXT: Array<{ stage: CrmStage; label: string; icon: typeof UserCheck }> = [
    { stage: 'contactado', label: 'Marcar como Contactado', icon: UserCheck },
    { stage: 'proposta',   label: 'Marcar Proposta Enviada', icon: CheckCircle2 },
    { stage: 'convertido', label: 'Marcar como Convertido', icon: CheckCircle2 },
  ]

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
          {/* Copy email */}
          <button
            onClick={copyEmail}
            className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Copy className="h-4 w-4 text-gray-400" />
            Copiar email
          </button>

          {/* Open mailto */}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4 text-gray-400" />
              Enviar email
            </a>
          )}

          <div className="my-1 border-t border-gray-100" />

          {/* Stage changes (only show stages different from current) */}
          {STAGE_NEXT.filter((s) => s.stage !== stage).map(({ stage: s, label, icon: Icon }) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Icon className="h-4 w-4 text-gray-400" />
              {label}
            </button>
          ))}

          <div className="my-1 border-t border-gray-100" />

          {/* Reset to novo */}
          {stage !== 'novo' && (
            <button
              onClick={() => setStage('novo')}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
            >
              <X className="h-4 w-4 text-gray-400" />
              Mover para Novos
            </button>
          )}
        </div>
      )}
    </div>
  )
}
