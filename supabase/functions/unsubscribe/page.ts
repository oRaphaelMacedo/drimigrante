// unsubscribe/page.ts — páginas HTML do descadastro (sem JavaScript, sem recursos externos).
//
// Visual "Azulejo" (DESIGN.md): fundo #f9fafd, cartão branco, cobalto #1f41c7 com texto
// branco (7,96:1), texto #141a29, secundário #5c6372 (6,03:1), botão de 48px, gutter de
// 16px no celular. Fontes do sistema (a página não carrega nada de fora): Literata e
// Figtree só se já estiverem instaladas.
//
// Segurança: CSP sem script e com o hash do único <style>; nada do usuário entra no
// HTML além do token, que já passou pela validação de formato e ainda é escapado.
// Referrer-Policy no-referrer: o token não vaza para o site ao clicar em "Voltar".

import type { UnsubscribeScope } from '../_shared/email-lifecycle.ts'
import { escapeHtml } from '../_shared/email-lifecycle.ts'

export type PageKind = 'confirm' | 'done' | 'invalid' | 'error' | 'unavailable'

const STYLE = `
:root{color-scheme:only light}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:#f9fafd;color:#141a29;font-family:Figtree,"Segoe UI",system-ui,-apple-system,Helvetica,Arial,sans-serif;font-size:1rem;line-height:1.6;display:flex;align-items:flex-start;justify-content:center;padding:2.5rem 1rem calc(2.5rem + env(safe-area-inset-bottom))}
main{width:100%;max-width:28rem}
.brand{margin:0 0 1.25rem;font-family:Literata,Georgia,"Times New Roman",serif;font-weight:700;font-size:1.125rem;color:#1f41c7}
.card{background:#fff;border:1px solid #dde1ea;border-radius:.875rem;padding:1.25rem;box-shadow:0 1px 2px rgb(20 26 41/.06)}
h1{margin:0 0 .75rem;font-family:Literata,Georgia,"Times New Roman",serif;font-weight:700;font-size:1.75rem;line-height:1.2;text-wrap:balance}
p{margin:0 0 1rem;text-wrap:pretty}
.muted{color:#5c6372;font-size:.875rem;line-height:1.5}
form{margin:1.5rem 0 0}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:3rem;padding:.75rem 1.5rem;border:0;border-radius:.75rem;background:#1f41c7;color:#fff;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
.btn:hover{background:#1836ac}
.btn:focus-visible,.link:focus-visible{outline:2px solid #1f41c7;outline-offset:2px}
.link{display:inline-flex;align-items:center;min-height:2.75rem;margin-top:.5rem;color:#1f41c7;font-weight:600;text-decoration:underline;text-underline-offset:4px}
@media (min-width:640px){body{align-items:center}.card{padding:1.5rem}.btn{width:auto}}
`.trim()

let styleHashPromise: Promise<string> | null = null

/** sha256 do <style> para a CSP (calculado uma vez por instância). */
export function styleHash(): Promise<string> {
  styleHashPromise ??= crypto.subtle.digest('SHA-256', new TextEncoder().encode(STYLE)).then((buf) => {
    let binary = ''
    for (const b of new Uint8Array(buf)) binary += String.fromCharCode(b)
    return `sha256-${btoa(binary)}`
  })
  return styleHashPromise
}

const SCOPE_EFFECT: Record<UnsubscribeScope, { confirm: string; keep: string; done: string }> = {
  marketing: {
    confirm: 'Você vai deixar de receber por e-mail as dicas e novidades do Doutor Imigrante, incluindo os avisos da lista de espera.',
    keep: 'Os e-mails sobre o seu resultado e o seu acesso ao painel continuam chegando, assim como as confirmações de pagamento.',
    done: 'Você não vai mais receber por e-mail as dicas e novidades do Doutor Imigrante.',
  },
  all: {
    confirm: 'Você vai deixar de receber os e-mails do Doutor Imigrante sobre o seu resultado, os avisos de prazo do painel e as dicas e novidades.',
    keep: 'Confirmações de pagamento e de assinatura continuam chegando, assim como os links de acesso que você pedir.',
    done: 'Você não vai mais receber os e-mails do Doutor Imigrante sobre o seu resultado, os avisos de prazo e as dicas e novidades.',
  },
}

interface PageOptions {
  kind: PageKind
  scope?: UnsubscribeScope
  /** Token já validado (só nas páginas com formulário). */
  token?: string
  appUrl: string
}

function form(token: string, label: string): string {
  const t = escapeHtml(token)
  return `<form method="post" action="?t=${t}"><input type="hidden" name="t" value="${t}"><button class="btn" type="submit">${label}</button></form>`
}

function content({ kind, scope = 'marketing', token }: PageOptions): { title: string; body: string } {
  const effect = SCOPE_EFFECT[scope]
  switch (kind) {
    case 'confirm':
      return {
        title: 'Cancelar o recebimento de e-mails',
        body: `<p>${effect.confirm}</p><p class="muted">${effect.keep}</p>${form(token ?? '', 'Confirmar descadastro')}`,
      }
    case 'done':
      return {
        title: 'Pronto, descadastro feito',
        body: `<p>${effect.done}</p><p class="muted">${effect.keep}</p>`,
      }
    case 'invalid':
      return {
        title: 'Link inválido',
        body:
          '<p>Este link de descadastro está incompleto ou não é válido.</p>' +
          '<p class="muted">Abra de novo o link do e-mail, sem cortar nenhuma parte do endereço.</p>',
      }
    case 'error':
      return {
        title: 'Não foi possível concluir agora',
        body: `<p>O descadastro não foi registrado. Tente de novo em alguns minutos.</p>${token ? form(token, 'Tentar de novo') : ''}`,
      }
    case 'unavailable':
      return {
        title: 'Descadastro indisponível no momento',
        body: '<p>Não conseguimos processar descadastros agora. Tente de novo mais tarde.</p>',
      }
  }
}

/** Documento HTML completo da página. */
export function renderPage(options: PageOptions): string {
  const { title, body } = content(options)
  const home = escapeHtml(options.appUrl.replace(/\/+$/, '') || '/')
  return [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<meta name="color-scheme" content="only light">',
    '<meta name="robots" content="noindex, nofollow">',
    `<title>${escapeHtml(title)} · Doutor Imigrante</title>`,
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    '<main>',
    '<p class="brand">Doutor Imigrante</p>',
    `<div class="card"><h1>${escapeHtml(title)}</h1>${body}</div>`,
    `<a class="link" href="${home}">Ir para o site do Doutor Imigrante</a>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('\n')
}

/** Cabeçalhos das páginas: sem cache, sem indexação, sem referrer, CSP estrita. */
export async function pageHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      `default-src 'none'; style-src '${await styleHash()}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  }
}
