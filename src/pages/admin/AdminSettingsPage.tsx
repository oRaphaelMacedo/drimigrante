import { Construction, Settings } from 'lucide-react'
import { Badge } from '@/components/ui'

export function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl py-6 sm:py-12">
      <div className="rounded-lg border bg-card p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/[.08]">
          <Settings aria-hidden="true" className="h-7 w-7 text-primary" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Configurações</h1>
        <p className="mb-6 text-sm text-muted-foreground">Configurações globais do hub: preços, integrações e equipe.</p>
        <Badge variant="warning">
          <Construction aria-hidden="true" />
          Em desenvolvimento
        </Badge>
        <p className="mx-auto mt-6 max-w-md text-sm text-muted-foreground">
          Esta área ainda não está disponível. Por enquanto, as alterações de configuração são feitas diretamente no
          painel do Supabase ou do Stripe.
        </p>
      </div>
    </div>
  )
}
