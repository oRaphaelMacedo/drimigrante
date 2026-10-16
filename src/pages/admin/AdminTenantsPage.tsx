import { Building2, Construction } from 'lucide-react'
import { Badge } from '@/components/ui'

export function AdminTenantsPage() {
  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-12">
      <div className="rounded-lg border bg-card p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/[.08]">
          <Building2 aria-hidden="true" className="h-7 w-7 text-primary" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Escritórios</h1>
        <p className="mb-6 text-sm text-muted-foreground">Gestão dos escritórios afiliados (multi-tenant) do hub.</p>
        <Badge variant="warning">
          <Construction aria-hidden="true" />
          Em desenvolvimento
        </Badge>
        <p className="mx-auto mt-6 max-w-md text-sm text-muted-foreground">
          Esta área está prevista para a fase 2 do roadmap. Vai permitir cadastrar e gerenciar escritórios parceiros,
          distribuir leads e acompanhar o desempenho de cada escritório.
        </p>
      </div>
    </div>
  )
}
