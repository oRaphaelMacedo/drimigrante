// AdminLeadsPage.tsx — Day 5
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search,
  Filter,
  Download,
  MoreHorizontal,
  Mail,
  Phone,
  ThermometerSun,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Assessment } from '@/lib/database.types'
import { cn } from '@/lib/utils'

export function AdminLeadsPage() {
  const [search, setSearch] = useState('')

  const { data: leads = [], isLoading: loading } = useQuery({
    queryKey: ['admin-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
      
      if (error) throw error
      return data as Assessment[]
    }
  })

  const getTemperature = (pct: number | null) => {
    if (!pct) return { label: 'Frio', color: 'bg-blue-100 text-blue-700' }
    if (pct >= 100) return { label: 'Quente', color: 'bg-red-100 text-red-700' }
    if (pct >= 50) return { label: 'Morno', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Frio', color: 'bg-blue-100 text-blue-700' }
  }

  const exportCSV = () => {
    const headers = ['Nome', 'Email', 'Telefone', 'Status', 'Temperatura', 'Data']
    const csvContent = [
      headers.join(','),
      ...leads.map((l) => {
        const temp = getTemperature(l.completion_percentage).label
        const date = new Date(l.created_at ?? '').toLocaleDateString('pt-PT')
        return `"${l.full_name || ''}","${l.email || ''}","${l.phone || ''}","${l.status}","${temp}","${date}"`
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

  const filteredLeads = leads.filter((l) =>
    (l.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
    (l.email?.toLowerCase() || '').includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Leads</h1>
          <p className="mt-1 text-sm text-gray-500">Gerir e exportar potenciais clientes.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Procurar por nome ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border-none bg-gray-50 pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <button className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Filter className="h-4 w-4" />
          Filtros
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Nome</th>
                  <th className="px-6 py-4 font-medium">Contacto</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Temperatura</th>
                  <th className="px-6 py-4 font-medium">Data</th>
                  <th className="px-6 py-4 font-medium text-right">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => {
                  const temp = getTemperature(lead.completion_percentage)
                  return (
                    <tr key={lead.id} className="transition hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">
                          {lead.full_name || 'Sem Nome'}
                        </div>
                        <div className="text-xs text-gray-500">
                          ID: {lead.id.split('-')[0]}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {lead.email && (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <Mail className="h-3.5 w-3.5" />
                              <span>{lead.email}</span>
                            </div>
                          )}
                          {lead.phone && (
                            <div className="flex items-center gap-1.5 text-gray-600">
                              <Phone className="h-3.5 w-3.5" />
                              <span>{lead.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            lead.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-700'
                          )}
                        >
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                            temp.color
                          )}
                        >
                          <ThermometerSun className="h-3.5 w-3.5" />
                          {temp.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(lead.created_at ?? '').toLocaleDateString('pt-PT')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-gray-400 hover:text-gray-600">
                          <MoreHorizontal className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
