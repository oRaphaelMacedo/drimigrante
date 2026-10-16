import { Outlet, ScrollRestoration } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { useFocusMode } from './focus-mode'
import { CookieBanner } from '@/components/CookieBanner'

const MAIN_ID = 'conteudo'

/**
 * Layout das páginas públicas (DI-038).
 *
 *  - <ScrollRestoration/>: página nova abre no topo, voltar devolve a posição e
 *    links como /#precos rolam até a seção (as seções usam scroll-mt-16, a
 *    altura do header fixo, h-16).
 *  - Modo foco em /quiz, /results e /checkout: header reduzido e só os links
 *    legais no rodapé.
 */
export function Layout() {
  const focus = useFocusMode()

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
        <Outlet />
      </main>
      <Footer variant={focus ? 'compact' : 'full'} />
      <CookieBanner />
    </div>
  )
}
