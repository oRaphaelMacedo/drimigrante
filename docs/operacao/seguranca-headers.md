# Cabeçalhos de segurança (vercel.json)

Todos os caminhos (`/(.*)`) recebem os cabeçalhos abaixo. O HSTS já é enviado pela própria Vercel nos domínios próprios e não é repetido aqui.

| Cabeçalho | Valor | Por quê |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | O navegador não "adivinha" o tipo: um HTML servido como JS não executa. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sites externos recebem só a origem, nunca o caminho com `?session_id`, `?r=` ou o fragmento do magic link. |
| `X-Frame-Options` | `DENY` | Ninguém consegue embutir o site num iframe (clickjacking). |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` | APIs que o app não usa ficam desligadas. O upload por `<input type="file">` (inclusive pela câmera do celular) não é afetado; o pagamento acontece no Checkout hospedado da Stripe. |
| `Content-Security-Policy-Report-Only` | ver abaixo | Fase de observação: nada é bloqueado, as violações aparecem no console. |

## CSP (Report-Only)

```
default-src 'self';
script-src 'self' https://www.googletagmanager.com https://*.posthog.com https://connect.facebook.net;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://krjirhlmdnxqqrpzmowz.supabase.co https://*.google-analytics.com https://*.googletagmanager.com https://www.facebook.com;
font-src 'self' data:;
connect-src 'self' https://krjirhlmdnxqqrpzmowz.supabase.co wss://krjirhlmdnxqqrpzmowz.supabase.co https://*.posthog.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.sentry.io https://www.facebook.com https://connect.facebook.net;
worker-src 'self' blob:;
manifest-src 'self';
frame-src 'self';
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self'
```

| Diretiva | Origens | Motivo |
|---|---|---|
| `script-src` | GA (gtag.js), PostHog (extensões carregadas do `us-assets.i.posthog.com`), Meta Pixel | Os três só carregam depois do consentimento. Não há script inline no `index.html`. |
| `style-src 'unsafe-inline'` | — | Radix, sonner e atributos `style` do React injetam estilo inline. **Dívida**: trocar por hashes/nonce quando possível. |
| `img-src` | Supabase Storage, beacons do GA e do Pixel | — |
| `font-src 'self' data:` | — | Fontes self-hosted (sem CDN do Google). |
| `connect-src` | Supabase REST/Auth/Storage/Functions (inclui o SSE do chat) e Realtime (`wss`), PostHog, GA4, Sentry (`*.ingest.de.sentry.io`), Meta | — |
| `worker-src blob:` | — | O Replay do Sentry comprime em um Web Worker criado de `blob:`; o service worker do PWA é `'self'`. |
| `frame-ancestors 'none'` | — | Mesmo efeito do `X-Frame-Options: DENY` nos navegadores modernos. |

Efeitos colaterais conhecidos:

- Com `X-Frame-Options: DENY`, o modo de heatmap do PostHog que abre o site **dentro de um iframe** no painel do PostHog deixa de funcionar. Use a toolbar do PostHog direto no site.
- O Stripe Checkout é um redirecionamento (navegação de topo), então não precisa de `frame-src` nem de `script-src` da Stripe. Se um dia o pagamento for embutido (Stripe.js/Elements), incluir `https://js.stripe.com` em `script-src` e `frame-src`.

## Relatórios de violação (ação do dono)

Sem `report-uri`/`report-to`, a política Report-Only só aparece no console de quem abre o site — nada é coletado em produção. Para coletar:

1. No Sentry: **Settings → Projects → (projeto do front) → Security Headers** e copie a URL de **Report URI** (formato `https://<org>.ingest.de.sentry.io/api/<projeto>/security/?sentry_key=<chave>`).
2. Acrescente ao final do valor de `Content-Security-Policy-Report-Only` no `vercel.json`: `; report-uri <URL copiada>`.
3. Faça um deploy de preview, navegue pelo funil e confira os relatórios em **Issues** (tipo "CSP").

A URL não foi colocada aqui de propósito: depende da chave do projeto no Sentry.

## Como verificar

Num deploy de preview (`<url>` = URL do preview):

```bash
curl -sI https://<url>/ | grep -iE 'x-content-type-options|referrer-policy|x-frame-options|permissions-policy|content-security-policy'
curl -s -o /dev/null -w '%{http_code}\n' https://<url>/assets/inexistente.js   # 404
curl -s -o /dev/null -w '%{http_code}\n' https://<url>/quiz                    # 200 (SPA)
```

Depois, com o DevTools aberto (aba Console), percorrer: landing → quiz → resultado → checkout (até a página da Stripe) → login por magic link → painel → chat (SSE) → upload de documento. Qualquer linha `[Report Only] Refused to …` indica uma origem que falta na lista.

## Passar para modo bloqueante

1. Rodar Report-Only em produção por pelo menos 2 semanas com `report-uri` configurado.
2. Zerar as violações legítimas (incluir origens que faltam). Atenção ao GA4: `region1.google-analytics.com` já está coberto por `*.google-analytics.com`, mas, dependendo da configuração da propriedade, o GA4 pode chamar também `www.google.com` e `stats.g.doubleclick.net` (por exemplo, se os Google Signals forem ligados). Hoje o app envia `allow_google_signals: false`; se esses hosts aparecerem nos relatórios, inclua-os em `connect-src` e `img-src` antes de bloquear.
3. Renomear o cabeçalho para `Content-Security-Policy` (mantendo o `report-uri`).

## Rewrite da SPA

```json
{ "source": "/((?!assets/)[^.]*)", "destination": "/index.html" }
```

Só caminhos sem ponto e fora de `/assets/` caem no `index.html`. Antes, `/assets/arquivo-que-nao-existe.js` devolvia o HTML com status 200, o navegador tentava executá-lo como módulo e a aba aberta durante um deploy quebrava. Agora devolve 404, e o app recarrega uma vez para pegar o `index.html` novo (ver `src/lib/chunk-reload.ts`).
