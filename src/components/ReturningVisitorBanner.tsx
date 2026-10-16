// ReturningVisitorBanner.tsx — "seu pré-diagnóstico está guardado" (DI-053).
//
// Para quem volta ao site sem login e tem um resultado do quiz neste aparelho:
// nome, data e o atalho para /results. Dispensável por 7 dias. As regras puras
// (quando aparece, dispensa, textos) estão em src/lib/returning-visit.ts.
//
// Primeira pintura: sem sessão guardada no navegador, o banner aparece já
// (sem empurrar a página depois); com sessão guardada, espera o AuthContext
// confirmar que não há login.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowRight, ClipboardCheck, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { track, trackOnce } from '@/lib/analytics'
import { hasStoredAuthSession } from '@/lib/stored-session'
import {
  dayStamp,
  dismissReturningBanner,
  isReturningBannerDismissed,
  isReturningBannerRoute,
  readReturningVisit,
  returningBannerText,
} from '@/lib/returning-visit'
import { Button, Container } from '@/components/ui'

export function ReturningVisitorBanner() {
  const { pathname } = useLocation()
  const { session, loading } = useAuth()
  const [mayHaveSession] = useState(() => hasStoredAuthSession())
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLElement>(null)

  // Relido a cada rota: o quiz pode ter gravado um resultado novo nesta visita.
  const visit = useMemo(() => {
    void pathname
    return readReturningVisit()
  }, [pathname])
  const dismissed = useMemo(
    () => !!visit && (dismissedKey === visit.key || isReturningBannerDismissed(visit)),
    [visit, dismissedKey],
  )

  const authPending = loading && mayHaveSession
  const visible = !!visit && isReturningBannerRoute(pathname) && !session && !authPending && !dismissed
  const visitKey = visit?.key ?? null

  useEffect(() => {
    if (!visible || !visitKey) return
    trackOnce('returning_banner_viewed', `${visitKey}:${dayStamp()}`)
  }, [visible, visitKey])

  if (!visible || !visit) return null

  const dismiss = () => {
    track('returning_banner_dismissed')
    dismissReturningBanner(visit)
    setDismissedKey(visit.key)
    // O botão some com o banner: o foco vai para o conteúdo, não para o topo da página.
    const main = rootRef.current?.closest('main')
    if (main instanceof HTMLElement) main.focus({ preventScroll: true })
  }

  return (
    <aside ref={rootRef} aria-label="Pré-diagnóstico guardado" data-testid="returning-banner">
      <Container className="py-3 sm:py-4">
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-brand-50 py-3 pl-4 pr-2 sm:items-center sm:p-4">
          {/* Ícone só a partir de sm: no celular a frase cabe em menos linhas. */}
          <span
            aria-hidden="true"
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-sm sm:flex"
          >
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <p className="pt-2 text-base text-foreground sm:pt-0" data-testid="returning-banner-text">
              {visit.firstName && (
                <>
                  <strong className="font-semibold">{visit.firstName}</strong>,{' '}
                </>
              )}
              {returningBannerText(visit)}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-2 shrink-0 sm:mt-0">
              <Link to="/results" onClick={() => track('returning_banner_clicked')}>
                Ver meu resultado
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            aria-label="Dispensar aviso"
            title="Dispensar por 7 dias"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </Container>
    </aside>
  )
}
