import { Settings, Construction } from 'lucide-react'

export function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Settings className="h-7 w-7 text-brand-600" />
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-gray-900">Definições</h1>
        <p className="mb-6 text-sm text-gray-500">
          Configurações globais do hub: preços, integrações, equipa.
        </p>
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-1.5 text-sm font-medium text-amber-700">
          <Construction className="h-4 w-4" />
          Em desenvolvimento
        </div>
        <p className="mx-auto mt-6 max-w-md text-sm text-gray-500">
          Esta área será disponibilizada brevemente. Por agora, alterações de configuração devem
          ser feitas diretamente no painel Supabase ou Stripe.
        </p>
      </div>
    </div>
  )
}
