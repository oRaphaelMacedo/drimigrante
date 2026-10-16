import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button, Container } from '@/components/ui'
import { QUIZ_CTA_LABEL } from '@/lib/copy'

/** 404 com os tokens do sistema "Azulejo" (DI-079): uma ação principal e uma secundária. */
export function NotFoundPage() {
  return (
    <Container size="sm" className="flex min-h-[60dvh] flex-col items-center justify-center py-12 text-center">
      <p className="text-sm font-semibold text-primary">Erro 404</p>
      <h1 className="mt-2 text-h1 text-foreground">Página não encontrada</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground [text-wrap:pretty]">
        O endereço pode ter mudado ou estar incompleto. Volte ao início ou faça o diagnóstico gratuito.
      </p>
      <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button asChild size="md" className="w-full sm:w-auto">
          <Link to="/">Voltar ao início</Link>
        </Button>
        <Button asChild variant="secondary" size="md" className="w-full sm:w-auto">
          <Link to="/quiz">
            {QUIZ_CTA_LABEL}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </Container>
  )
}
