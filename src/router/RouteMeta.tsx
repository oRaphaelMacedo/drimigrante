/**
 * RouteMeta — aplica o `handle.seo` das rotas no `<head>` (DI-076).
 *
 * Rota raiz do router (sem caminho): renderiza o `<Outlet/>` e, a cada troca de
 * caminho, junta o `handle.seo` de todas as rotas que casaram (a mais interna
 * vence) e reescreve title, description, robots, canonical, og:* e twitter:*.
 * Assim nada vaza de uma rota para outra na navegação SPA.
 *
 * `useLayoutEffect`: roda antes dos efeitos das páginas, então uma página que
 * chama `useSEO()` continua podendo refinar a própria rota. Query e hash não
 * disparam nova aplicação (o canonical é só o caminho).
 */
import { useLayoutEffect } from 'react'
import { Outlet, useLocation, useMatches } from 'react-router-dom'
import { applyRouteSeo, mergeRouteSeo } from '@/hooks/useSEO'

export function RouteMeta() {
  const { pathname } = useLocation()
  const matches = useMatches()
  const { title, description, ogImage, noindex } = mergeRouteSeo(matches.map((match) => match.handle))

  useLayoutEffect(() => {
    applyRouteSeo({ title, description, ogImage, noindex }, pathname)
  }, [pathname, title, description, ogImage, noindex])

  return <Outlet />
}
