import { Building2, Construction } from 'lucide-react'

export function AdminTenantsPage() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Building2 className="h-7 w-7 text-brand-600" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">Escritórios</h1>
        <p className="mb-6 text-sm text-gray-500">
          Gestão de escritórios afiliados (multi-tenant) do hub.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
          <Construction className="h-4 w-4" />
          Em desenvolvimento
        </div>
        <p className="mx-auto mt-6 max-w-md text-sm text-gray-500">
          Esta área está prevista para a Fase 2 do roadmap. Permitirá criar e gerir escritórios
          parceiros, distribuir leads e acompanhar performance por tenant.
        </p>
      </div>
    </div>
  )
}
