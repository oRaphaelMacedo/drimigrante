// AdminPipelinePage.tsx — Day 5
import { useQuery } from '@tanstack/react-query'
import { Loader2, Plus, GripVertical, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Assessment } from '@/lib/database.types'
import { cn } from '@/lib/utils'

interface Column {
  id: string
  title: string
  color: string
}

const COLUMNS: Column[] = [
  { id: 'novo', title: 'Novo (Início Quiz)', color: 'bg-blue-500' },
  { id: 'em_andamento', title: 'Em Andamento', color: 'bg-amber-500' },
  { id: 'concluido', title: 'Quiz Concluído', color: 'bg-emerald-500' },
]

export function AdminPipelinePage() {
  const { data: leads = [], isLoading: loading } = useQuery({
    queryKey: ['admin-pipeline-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      
      if (error) throw error
      return data as Assessment[]
    }
  })

  const getColumnId = (lead: Assessment) => {
    if (lead.status === 'completed') return 'concluido'
    if (lead.completion_percentage && lead.completion_percentage > 30) return 'em_andamento'
    return 'novo'
  }

  const columnsWithLeads = COLUMNS.map((col) => ({
    ...col,
    items: leads.filter((l) => getColumnId(l) === col.id),
  }))

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900">Pipeline</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kanban board de acompanhamento do funil de conversão.
        </p>
      </div>

      {/* Kanban Board */}
      <div className="flex flex-1 gap-6 overflow-x-auto pb-4">
        {columnsWithLeads.map((col) => (
          <div key={col.id} className="flex h-full min-w-[320px] flex-col rounded-2xl bg-gray-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('h-2 w-2 rounded-full', col.color)} />
                <h2 className="font-bold text-gray-900">{col.title}</h2>
              </div>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                {col.items.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
              {col.items.map((lead) => (
                <div
                  key={lead.id}
                  className="group relative cursor-grab rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:border-brand-300 hover:shadow-md active:cursor-grabbing"
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {lead.full_name || 'Anónimo'}
                      </h3>
                      <p className="text-xs text-gray-500">{lead.email || lead.phone || 'Sem contacto'}</p>
                    </div>
                    <GripVertical className="h-4 w-4 text-gray-300 opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-gray-400">
                      {new Date(lead.created_at ?? '').toLocaleDateString('pt-PT')}
                    </span>
                    {lead.status === 'completed' && (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />
                        100%
                      </span>
                    )}
                    {lead.status !== 'completed' && lead.completion_percentage !== null && (
                      <span className="text-amber-600">
                        {lead.completion_percentage}%
                      </span>
                    )}
                  </div>
                </div>
              ))}

              <button className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 py-3 text-sm font-medium text-gray-400 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-600">
                <Plus className="h-4 w-4" />
                Adicionar Nota
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
