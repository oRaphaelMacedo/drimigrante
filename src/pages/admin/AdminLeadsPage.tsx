// AdminLeadsPage.tsx — leads com busca, filtro por fase do CRM, exportação CSV
// e menu de ações. No celular a lista vira cartões; no desktop, tabela (DI-073).
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Copy,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Search,
  ThermometerSun,
} from 'lucide-react'
import { toast } from 'sonner'
import { CrmStageMenuItems } from '@/components/admin/CrmStageMenu'
import { adminMenuContentClass, adminMenuItemClass } from '@/components/admin/menu-styles'
import { Badge, Button, Input } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import {
  CRM_STAGES,
  CRM_STAGE_META,
  LEAD_TEMPERATURE_META,
  countByCrmStage,
  csvField,
  leadTemperature,
  parseCrmStage,
  type CrmStage,
} from '@/lib/crm-stage'
import { cn } from '@/lib/utils'

/** Colunas lidas pelo admin (nada de `select('*')`: só o que a tela usa). */
const LEAD_COLUMNS = 'id, full_name, email, phone, status, completion_percentage, crm_stage, created_at'

type StageFilter = CrmStage | 'all'

/** Marca de ordem de bytes: o Excel abre o UTF-8 com os acentos certos. */
const CSV_BOM = '\uFEFF'

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

function formatLeadDate(iso: string | null): string {
  return iso ? dateFormat.format(new Date(iso)) : '—'
}

// ─── Dados ────────────────────────────────────────────────────────────────────

function useLeads() {
  return useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select(LEAD_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}

type Lead = NonNullable<ReturnType<typeof useLeads>['data']>[number]

function useUpdateCrmStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: CrmStage }) => {
      const { error } = await supabase.from('assessments').update({ crm_stage: stage }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, { stage }) => {
      toast.success(`Lead movido para "${CRM_STAGE_META[stage].label}"`)
      void qc.invalidateQueries({ queryKey: ['admin-leads'] })
      void qc.invalidateQueries({ queryKey: ['admin-pipeline-leads'] })
    },
    onError: (err) => {
      console.error('[AdminLeads] update stage:', err)
      toast.error('Não foi possível mudar a fase do lead. Tente de novo.')
    },
  })
}

function exportCsv(leads: readonly Lead[]) {
  const headers = ['Nome', 'E-mail', 'Telefone', 'Status', 'Fase CRM', 'Temperatura', 'Data']
  const rows = leads.map((lead) =>
    [
      lead.full_name,
      lead.email,
      lead.phone,
      lead.status,
      CRM_STAGE_META[parseCrmStage(lead.crm_stage)].label,
      LEAD_TEMPERATURE_META[leadTemperature(lead.completion_percentage)].label,
      formatLeadDate(lead.created_at),
    ]
      .map(csvField)
      .join(','),
  )
  const csv = `${CSV_BOM}${[headers.map(csvField).join(','), ...rows].join('\r\n')}`

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `leads_${new Date().toISOString().split('T')[0]}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─── Página ───────────────────────────────────────────────────────────────────

export function AdminLeadsPage() {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const { data: leads = [], isLoading, isError, isFetching, refetch } = useLeads()
  const updateStage = useUpdateCrmStage()

  const stageCounts = useMemo(() => countByCrmStage(leads), [leads])

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase()
    return leads.filter((lead) => {
      const matchSearch =
        !term ||
        (lead.full_name?.toLowerCase() ?? '').includes(term) ||
        (lead.email?.toLowerCase() ?? '').includes(term)
      const matchStage = stageFilter === 'all' || parseCrmStage(lead.crm_stage) === stageFilter
      return matchSearch && matchStage
    })
  }, [leads, search, stageFilter])

  const changeStage = (id: string, stage: CrmStage) => updateStage.mutate({ id, stage })

  const filters: Array<{ value: StageFilter; label: string; count?: number }> = [
    { value: 'all', label: 'Todos' },
    ...CRM_STAGES.map((stage) => ({ value: stage, label: CRM_STAGE_META[stage].pluralLabel, count: stageCounts[stage] })),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gerencie, filtre e exporte os potenciais clientes.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => exportCsv(leads)}
          disabled={leads.length === 0}
          className="self-start sm:self-auto"
        >
          <Download aria-hidden="true" />
          Exportar CSV
        </Button>
      </div>

      <div className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            aria-label="Buscar leads por nome ou e-mail"
            className="pl-10"
          />
        </div>

        <div role="group" aria-label="Filtrar por fase do CRM" className="flex flex-wrap gap-2">
          {filters.map(({ value, label, count }) => {
            const selected = stageFilter === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStageFilter(value)}
                aria-pressed={selected}
                className={cn(
                  'inline-flex min-h-11 items-center gap-1 rounded-xl border px-3 text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-foreground/80 hover:bg-muted',
                )}
              >
                {label}
                {count !== undefined && (
                  <>
                    {' '}
                    <span className={selected ? 'text-primary-foreground/80' : 'text-muted-foreground'}>({count})</span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        {isLoading ? (
          <div className="flex min-h-[300px] items-center justify-center" role="status" aria-label="Carregando leads">
            <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <p role="alert" className="text-sm text-destructive">
              Não foi possível carregar os leads.
            </p>
            <Button variant="secondary" size="sm" loading={isFetching} onClick={() => void refetch()}>
              {!isFetching && <RefreshCw aria-hidden="true" />}
              Tentar de novo
            </Button>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Filter aria-hidden="true" className="h-8 w-8" />
            <p className="text-sm">Nenhum lead corresponde aos filtros.</p>
          </div>
        ) : (
          <>
            {/* Celular: cartões */}
            <ul className="divide-y md:hidden">
              {filteredLeads.map((lead) => (
                <LeadCardItem key={lead.id} lead={lead} onStageChange={(stage) => changeStage(lead.id, stage)} />
              ))}
            </ul>

            {/* Desktop: tabela (rola dentro do cartão se faltar largura) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Nome</th>
                    <th scope="col" className="px-4 py-3 font-medium">Contato</th>
                    <th scope="col" className="px-4 py-3 font-medium">Quiz</th>
                    <th scope="col" className="px-4 py-3 font-medium">Fase CRM</th>
                    <th scope="col" className="px-4 py-3 font-medium">Temperatura</th>
                    <th scope="col" className="px-4 py-3 font-medium">Data</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLeads.map((lead) => (
                    <LeadRow key={lead.id} lead={lead} onStageChange={(stage) => changeStage(lead.id, stage)} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {!isLoading && !isError && (
        <p className="text-center text-sm text-muted-foreground">
          {filteredLeads.length} de {leads.length} leads
        </p>
      )}
    </div>
  )
}

// ─── Peças ────────────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: CrmStage }) {
  return (
    <Badge size="sm" variant={CRM_STAGE_META[stage].tone}>
      {CRM_STAGE_META[stage].label}
    </Badge>
  )
}

function TemperatureBadge({ completion }: { completion: number | null }) {
  const meta = LEAD_TEMPERATURE_META[leadTemperature(completion)]
  return (
    <Badge size="sm" variant={meta.tone}>
      <ThermometerSun aria-hidden="true" />
      {meta.label}
    </Badge>
  )
}

function QuizBadge({ lead }: { lead: Lead }) {
  return lead.status === 'completed' ? (
    <Badge size="sm" variant="success">
      Concluído
    </Badge>
  ) : (
    <Badge size="sm" variant="neutral">
      {lead.completion_percentage ?? 0}%
    </Badge>
  )
}

function LeadContact({ lead }: { lead: Lead }) {
  if (!lead.email && !lead.phone) return <span className="text-sm text-muted-foreground">Sem contato</span>
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {lead.email && (
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground/80">
          <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{lead.email}</span>
        </span>
      )}
      {lead.phone && (
        <span className="flex items-center gap-1.5 text-sm text-foreground/80">
          <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{lead.phone}</span>
        </span>
      )}
    </div>
  )
}

function LeadCardItem({ lead, onStageChange }: { lead: Lead; onStageChange: (stage: CrmStage) => void }) {
  const stage = parseCrmStage(lead.crm_stage)
  return (
    <li className="flex gap-3 p-4">
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="truncate font-semibold text-foreground">{lead.full_name || 'Sem nome'}</p>
          <p className="text-sm text-muted-foreground">{formatLeadDate(lead.created_at)}</p>
        </div>
        <LeadContact lead={lead} />
        <div className="flex flex-wrap gap-1.5">
          <StageBadge stage={stage} />
          <TemperatureBadge completion={lead.completion_percentage} />
          <QuizBadge lead={lead} />
        </div>
      </div>
      <LeadActionMenu lead={lead} stage={stage} onStageChange={onStageChange} />
    </li>
  )
}

function LeadRow({ lead, onStageChange }: { lead: Lead; onStageChange: (stage: CrmStage) => void }) {
  const stage = parseCrmStage(lead.crm_stage)
  return (
    <tr className="transition-colors hover:bg-muted/60">
      <td className="min-w-[11rem] px-4 py-3">
        <div className="font-semibold text-foreground">{lead.full_name || 'Sem nome'}</div>
        <div className="whitespace-nowrap text-xs text-muted-foreground">ID: {lead.id.split('-')[0]}</div>
      </td>
      <td className="max-w-[15rem] px-4 py-3">
        <LeadContact lead={lead} />
      </td>
      <td className="px-4 py-3">
        <QuizBadge lead={lead} />
      </td>
      <td className="px-4 py-3">
        <StageBadge stage={stage} />
      </td>
      <td className="px-4 py-3">
        <TemperatureBadge completion={lead.completion_percentage} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-muted-foreground">{formatLeadDate(lead.created_at)}</td>
      <td className="px-4 py-3 text-right">
        <LeadActionMenu lead={lead} stage={stage} onStageChange={onStageChange} />
      </td>
    </tr>
  )
}

function LeadActionMenu({
  lead,
  stage,
  onStageChange,
}: {
  lead: Lead
  stage: CrmStage
  onStageChange: (stage: CrmStage) => void
}) {
  const copyEmail = async () => {
    if (!lead.email) return
    try {
      await navigator.clipboard.writeText(lead.email)
      toast.success('E-mail copiado')
    } catch {
      toast.error('Não foi possível copiar o e-mail')
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Ações do lead ${lead.full_name || lead.email || lead.id.split('-')[0]}`}
          className="shrink-0 text-muted-foreground"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={16}
          className={adminMenuContentClass}
        >
          <DropdownMenu.Item className={adminMenuItemClass} disabled={!lead.email} onSelect={() => void copyEmail()}>
            <Copy aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
            Copiar e-mail
          </DropdownMenu.Item>
          {lead.email && (
            <DropdownMenu.Item asChild className={adminMenuItemClass}>
              <a href={`mailto:${lead.email}`}>
                <ExternalLink aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                Enviar e-mail
              </a>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <CrmStageMenuItems current={stage} onSelect={onStageChange} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
