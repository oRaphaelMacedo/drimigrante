import { Navigate, Outlet, ScrollRestoration } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Header } from './Header'
import { Footer } from './Footer'
import { useFocusMode } from './focus-mode'
import { PWA_DASHBOARD_PATH, usePwaLaunch } from './pwa-launch'
import { CookieBanner } from '@/components/CookieBanner'
import { ReturningVisitorBanner } from '@/components/ReturningVisitorBanner'

const MAIN_ID = 'conteudo'

/**
 * Layout das páginas públicas (DI-038).
 *
 *  - <ScrollRestoration/>: página nova abre no topo, voltar devolve a posição e
 *    links como /#precos rolam até a seção (as seções usam scroll-mt-16, a
 *    altura do header fixo, h-16).
 *  - Modo foco em /quiz, /results e /checkout: header reduzido e só os links
 *    legais no rodapé.
 *  - DI-053: banner para quem volta com um pré-diagnóstico guardado (some no
 *    funil, no login e para quem está logado).
 *  - App instalado (/?source=pwa) com sessão vai direto para o painel.
 */
export function Layout() {
  const focus = useFocusMode()
  const pwa = usePwaLaunch()

  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollRestoration />
      {/* Sem navegação por hash (não cria entrada no histórico nem mexe na rolagem salva). */}
      <a
        href={`#${MAIN_ID}`}
        onClick={(event) => {
          event.preventDefault()
          document.getElementById(MAIN_ID)?.focus()
        }}
        className="sr-only z-50 rounded-lg bg-card px-4 py-3 text-base font-semibold text-primary shadow-[var(--shadow-md)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <Header focus={focus} />
      <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
        {pwa === 'redirect' ? (
          <Navigate to={PWA_DASHBOARD_PATH} replace />
        ) : pwa === 'wait' ? (
          <PwaLaunchPending />
        ) : (
          <>
            <ReturningVisitorBanner />
            <Outlet />
          </>
        )}
      </main>
      <Footer variant={focus ? 'compact' : 'full'} />
      <CookieBanner />
    </div>
  )
}

/** App instalado abrindo com sessão guardada: espera curta em vez de piscar a landing. */
function PwaLaunchPending() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4" data-testid="pwa-launch-pending">
      <p role="status" className="flex items-center gap-2 text-base text-muted-foreground">
        <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-primary" />
        Abrindo o app…
      </p>
    </div>
  )
}
