/**
 * SEO por rota (DI-076).
 *
 * Fonte única das metatags do `<head>`:
 *  - Os padrões abaixo espelham o `index.html` (title, description e og:image),
 *    para que a primeira pintura e a navegação SPA digam a mesma coisa.
 *  - Cada rota declara o seu `handle.seo` no router (src/router/index.tsx) e o
 *    `<RouteMeta/>` (src/router/RouteMeta.tsx) aplica o resultado a cada troca
 *    de caminho, inclusive resetando o que a rota anterior tinha mudado.
 *  - Uma página ainda pode refinar a sua rota com `useSEO()`; ela roda depois
 *    do RouteMeta e vence.
 *
 * Canonical e og:url usam o domínio de produção e só o caminho (sem query nem
 * hash): `/results?r=…` e `/?utm_source=…` não viram URLs canônicas.
 */
import { useEffect } from 'react'
import { PRODUCTION_HOSTS } from '@/lib/runtime-env'

export interface SeoMeta {
  /** Título da página, sem a marca (o sufixo " — Doutor Imigrante" é automático). */
  title?: string
  description?: string
  /** Caminho (ex.: `/og-image.jpg`) ou URL absoluta da imagem de partilha. */
  ogImage?: string
  /** `true` = `noindex,nofollow` (rotas privadas, do funil e 404). */
  noindex?: boolean
}

/** Origem canônica do site (produção). */
export const SITE_URL = `https://${PRODUCTION_HOSTS[0]}`

export const SITE_NAME = 'Doutor Imigrante'

/** Igual ao `<title>` do index.html. */
export const DEFAULT_TITLE = 'Doutor Imigrante — Diagnóstico gratuito de nacionalidade portuguesa'

/** Igual à `<meta name="description">` do index.html. */
export const DEFAULT_DESCRIPTION =
  'Responda a um diagnóstico gratuito e veja quais caminhos para a nacionalidade portuguesa combinam com o seu perfil: descendência, casamento, residência e outros.'

/** Imagem de partilha 1200×630 (public/og-image.jpg). */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.jpg`

const OG_LOCALE = 'pt_PT'

/** Converte um caminho em URL absoluta no domínio canônico. */
export function toAbsoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${SITE_URL}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

/**
 * URL canônica de um caminho: domínio de produção, sem query, sem hash e sem
 * barra final (exceto na raiz).
 */
export function buildCanonicalUrl(pathname: string): string {
  let path = (pathname || '/').split(/[?#]/)[0] || '/'
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1) path = path.replace(/\/+$/, '') || '/'
  return `${SITE_URL}${path}`
}

/** Título final, com a marca. Sem título = o padrão do site. */
export function buildTitle(title?: string): string {
  const clean = title?.trim()
  return clean ? `${clean} — ${SITE_NAME}` : DEFAULT_TITLE
}

export interface ResolvedSeo {
  title: string
  description: string
  ogImage: string
  robots: 'index,follow' | 'noindex,nofollow'
  canonical: string
}

/** Junta os padrões do site com o que a rota/página pediu. */
export function resolveSeo(meta: SeoMeta, pathname: string): ResolvedSeo {
  return {
    title: buildTitle(meta.title),
    description: meta.description?.trim() || DEFAULT_DESCRIPTION,
    ogImage: toAbsoluteUrl(meta.ogImage || DEFAULT_OG_IMAGE),
    robots: meta.noindex ? 'noindex,nofollow' : 'index,follow',
    canonical: buildCanonicalUrl(pathname),
  }
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Escreve as metatags no `<head>`. Sempre escreve TODOS os campos, para que
 * nada da rota anterior sobreviva à navegação.
 */
export function applySeo(meta: SeoMeta, pathname: string): ResolvedSeo {
  const seo = resolveSeo(meta, pathname)
  if (typeof document === 'undefined') return seo

  document.title = seo.title
  upsertMeta('name', 'description', seo.description)
  upsertMeta('name', 'robots', seo.robots)

  upsertMeta('property', 'og:title', seo.title)
  upsertMeta('property', 'og:description', seo.description)
  upsertMeta('property', 'og:image', seo.ogImage)
  upsertMeta('property', 'og:image:secure_url', seo.ogImage)
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:url', seo.canonical)
  upsertMeta('property', 'og:locale', OG_LOCALE)
  upsertMeta('property', 'og:site_name', SITE_NAME)

  upsertMeta('name', 'twitter:card', 'summary_large_image')
  upsertMeta('name', 'twitter:title', seo.title)
  upsertMeta('name', 'twitter:description', seo.description)
  upsertMeta('name', 'twitter:image', seo.ogImage)

  upsertLink('canonical', seo.canonical)
  return seo
}

/** SEO declarado pela rota atual (gravado pelo RouteMeta). */
let currentRoute: { pathname: string; meta: SeoMeta } | null = null

/** Remove as chaves `undefined` (para não apagar o que a rota definiu). */
function definedFields(meta: SeoMeta): SeoMeta {
  const out: SeoMeta = {}
  if (meta.title !== undefined) out.title = meta.title
  if (meta.description !== undefined) out.description = meta.description
  if (meta.ogImage !== undefined) out.ogImage = meta.ogImage
  if (meta.noindex !== undefined) out.noindex = meta.noindex
  return out
}

/** Aplica o `handle.seo` da rota (chamado pelo RouteMeta a cada troca de caminho). */
export function applyRouteSeo(meta: SeoMeta, pathname: string): ResolvedSeo {
  currentRoute = { pathname, meta }
  return applySeo(meta, pathname)
}

/**
 * Refina o SEO da rota atual a partir da página (ex.: páginas legais).
 * Só os campos informados mudam; o resto vem do `handle.seo` da rota (aplicado
 * antes pelo RouteMeta) ou do padrão do site.
 */
export function useSEO({ title, description, ogImage, noindex }: SeoMeta = {}) {
  useEffect(() => {
    // O RouteMeta já gravou a rota atual (layout effect, antes deste efeito).
    const pathname = currentRoute?.pathname ?? window.location.pathname
    const routeMeta = currentRoute?.meta ?? {}
    applySeo({ ...routeMeta, ...definedFields({ title, description, ogImage, noindex }) }, pathname)
  }, [title, description, ogImage, noindex])
}

/** Formato do `handle` das rotas que declaram SEO (src/router/index.tsx). */
export interface RouteSeoHandle {
  seo?: SeoMeta
}

function readHandleSeo(handle: unknown): SeoMeta | undefined {
  if (!handle || typeof handle !== 'object') return undefined
  const seo = (handle as RouteSeoHandle).seo
  return seo && typeof seo === 'object' ? seo : undefined
}

/**
 * Junta o `handle.seo` das rotas casadas (da mais externa para a mais interna);
 * a mais interna vence campo a campo.
 */
export function mergeRouteSeo(handles: readonly unknown[]): SeoMeta {
  let merged: SeoMeta = {}
  for (const handle of handles) {
    const seo = readHandleSeo(handle)
    if (seo) merged = { ...merged, ...definedFields(seo) }
  }
  return merged
}
