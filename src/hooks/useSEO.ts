import { useEffect } from 'react'

interface SEOOptions {
  title?: string
  description?: string
  ogImage?: string
  noindex?: boolean
}

const DEFAULT_TITLE = 'Doutor Imigrante — Descubra o seu visto para Portugal'
const DEFAULT_DESCRIPTION =
  'Análise jurídica personalizada para o seu processo de imigração para Portugal. Quiz gratuito, resultados em minutos.'
const DEFAULT_OG_IMAGE = '/og-image.png'

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

export function useSEO({ title, description, ogImage, noindex }: SEOOptions = {}) {
  useEffect(() => {
    const finalTitle = title ? `${title} — Doutor Imigrante` : DEFAULT_TITLE
    const finalDesc = description ?? DEFAULT_DESCRIPTION
    const finalImg = ogImage ?? DEFAULT_OG_IMAGE
    const url = typeof window !== 'undefined' ? window.location.href : ''

    document.title = finalTitle
    upsertMeta('name', 'description', finalDesc)
    upsertMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow')

    upsertMeta('property', 'og:title', finalTitle)
    upsertMeta('property', 'og:description', finalDesc)
    upsertMeta('property', 'og:image', finalImg)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:url', url)
    upsertMeta('property', 'og:locale', 'pt_PT')
    upsertMeta('property', 'og:site_name', 'Doutor Imigrante')

    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', finalTitle)
    upsertMeta('name', 'twitter:description', finalDesc)
    upsertMeta('name', 'twitter:image', finalImg)

    upsertLink('canonical', url)
  }, [title, description, ogImage, noindex])
}
