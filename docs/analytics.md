# Analytics, consentimento e monitoramento

Como o Doutor Imigrante mede o funil sem desrespeitar o consentimento nem vazar dados pessoais.

| Arquivo | Papel |
|---|---|
| `src/lib/analytics-events.ts` | Taxonomia **tipada** de eventos (fonte de verdade) |
| `src/lib/analytics.ts` | `track`, `trackOnce`, `identify`, `resetAnalytics`, pageview manual, PostHog/GA4/Meta |
| `src/lib/consent.ts` | Consentimento (`di_cookie_consent`) e evento `consent-changed` |
| `src/lib/attribution.ts` | UTMs first-touch por sessão (`getAttribution()`) |
| `src/lib/runtime-env.ts` | Onde o código está rodando (produção, preview, localhost, Playwright) |
| `src/lib/url-sanitize.ts` | Remove tokens, `session_id`, `?r=` e e-mails de URLs e textos |
| `src/lib/sentry.ts` | Fachada do Sentry (`Sentry.captureException` / `captureMessage`) |

## Regras de uso

1. **Só `track()` / `trackOnce()`**, importados de `@/lib/analytics`. Nome fora da union de `analytics-events.ts` não compila.
2. **Sem PII nas propriedades**: nada de e-mail, nome, telefone, token, `session_id` do Stripe ou respostas abertas. O `track` ainda remove chaves como `email`, `name`, `session_id`, `token`, `code` e mascara e-mails/JWT em valores, mas isso é rede de segurança, não licença.
3. **Eventos que não podem duplicar** (resultado visto, compra) usam `trackOnce(evento, chave, props)`. A chave é guardada em `localStorage['di_analytics_once_v1']` (180 dias, até 300 chaves) e só é marcada quando o evento foi de fato enviado (com consentimento).
4. **Novos eventos**: adicionar na interface `AnalyticsEventMap` e no array `ANALYTICS_EVENT_NAMES` (o `tsc` acusa se faltar) e documentar abaixo.

```ts
import { track, trackOnce } from '@/lib/analytics'

track('paywall_cta_clicked', { position: 'sticky' })
trackOnce('results_viewed', assessmentId, { category: 'alta' })
trackOnce('purchase', checkoutRef, { value: OFFER.price, currency: OFFER.currency })
```

## Quando nada é enviado

| Situação | PostHog / GA4 | Meta Pixel | Sentry (erros) | Sentry Replay |
|---|---|---|---|---|
| Consentimento pendente ou recusado | não carrega | não carrega | ativo | desligado |
| Aceitou "Só estatísticas" (`analytics`) | ativo | não carrega | ativo | buffer mascarado |
| Aceitou "Aceitar"/"Aceitar todos" (`granted`) | ativo | ativo se `VITE_META_PIXEL_ID` existir | ativo | buffer mascarado |
| `npm run dev`, localhost, `*.vercel.app` | **nunca** | **nunca** | dev/localhost: não; preview: sim | idem |
| Playwright / `navigator.webdriver` | **nunca** | **nunca** | não | não |
| `VITE_APP_ENV` ≠ `production` fora do domínio oficial | **nunca** | **nunca** | sim (`environment` = valor da variável) | idem |

- O domínio oficial (`www.drimigrante.com` / `drimigrante.com`) sempre conta como produção, mesmo que `VITE_APP_ENV` esteja ausente ou errada na Vercel — assim um erro de configuração não desliga a medição. Mesmo assim, defina `VITE_APP_ENV=production` no ambiente Production da Vercel.
- Em dev e no Playwright, os eventos que **seriam** enviados (com consentimento) ficam em `window.__DI_ANALYTICS_DEBUG__` (`{ name, props, at }`), para inspeção e testes E2E. Sem consentimento, nada é registrado ali.

## Consentimento

`localStorage['di_cookie_consent']`:

| Valor | Significado | Quem grava |
|---|---|---|
| `granted` | estatísticas + marketing | botão "Aceitar" do banner; "Aceitar todos" em `/cookies` |
| `analytics` | só estatísticas | "Só estatísticas" em `/cookies` (aparece só com o Pixel configurado) |
| `denied` | só essenciais | "Rejeitar" do banner; "Recusar não essenciais" em `/cookies` |

Ao retirar o consentimento: PostHog faz `opt_out_capturing`, o GA recebe `ga-disable-<ID>`, o Pixel recebe `consent revoke`, os cookies `_ga*`, `_gid`, `_fbp` e `_fbc` são apagados e o Replay do Sentry para.

## Privacidade da URL

O magic link do Supabase volta como `/auth/callback#access_token=…&refresh_token=…`; o Stripe volta com `?session_id=cs_…`; a retomada usa `?r=<token>`. Nada disso pode chegar a terceiros:

- **Pageview manual** (`capture_pageview: false` no PostHog, `send_page_view: false` no GA4). O `$pageview`/`page_view` é enviado ~300 ms após cada navegação do React Router, com a URL sanitizada.
- **PostHog `before_send`** sanitiza todas as propriedades (`$current_url`, `$referrer`, `$initial_*`, texto de elementos do autocapture).
- **GA4**: `page_location` e `page_referrer` sanitizados em todo evento.
- **Meta Pixel** lê a URL sozinho: só dispara quando a URL atual está limpa; senão o evento espera a próxima navegação limpa.
- **Sentry**: `beforeSend`, `beforeSendTransaction`, `beforeBreadcrumb`, um event processor para `replay_event` e `beforeAddRecordingEvent` no Replay. Breadcrumbs de `console` (exceto `error`) são descartados.

## Atribuição (UTM)

`captureAttribution()` roda no boot (`main.tsx`) e guarda em `sessionStorage['di_attribution_v1']`:
`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `referrer_host` (só o domínio externo), `landing_path` (sem query) e `captured_at`.

- First-touch por aba; exceção: se a primeira entrada foi direta e depois chega uma com UTM, a campanha vence.
- `getAttribution()` devolve o que foi guardado (ou as UTMs da URL atual, se o storage estiver bloqueado). É o que o `useQuiz` deve enviar ao RPC (`p_utm_source`, `p_utm_medium`, `p_utm_campaign`) — contrato combinado com o pacote W1-04.
- É dado funcional de primeira parte (vai para o nosso banco junto com o diagnóstico), não é enviado aos provedores de analytics e não depende do consentimento de cookies.

## Mapeamento para GA4 e Meta

| Evento interno | GA4 | Meta Pixel |
|---|---|---|
| `lead_submitted` | `generate_lead` | `Lead` |
| `checkout_started` | `begin_checkout` | `InitiateCheckout` |
| `purchase` | `purchase` (`value`, `currency`) | `Purchase` (`value`, `currency`) |
| pageview | `page_view` | `PageView` |
| demais | mesmo nome | — |

O GA4 é configurado com `allow_google_signals: false`, `allow_ad_personalization_signals: false` e consent mode `ad_storage`/`ad_user_data`/`ad_personalization` = `denied`.

## Taxonomia de eventos

Propriedades marcadas com `*` são obrigatórias (o `tsc` exige).

| Evento | Quando dispara | Propriedades | Card |
|---|---|---|---|
| `landing_cta_clicked` | Clique em CTA da landing | `position` | DI-054 |
| `quiz_started` | Início do quiz | `source` | atual |
| `quiz_step_viewed` | Pergunta exibida (uma vez por pergunta) | `question_key*`, `index*`, `total_visible`, `theme` | DI-068 |
| `quiz_step_answered` | Resposta registrada | `question_key*`, `index`, `total_visible`, `theme` | DI-068 |
| `quiz_back` | Voltar uma pergunta | `question_key`, `index` | DI-068 |
| `quiz_resume_clicked` | "Continuar de onde parou" | `index` | DI-068 / DI-041 |
| `quiz_restart_clicked` | "Recomeçar" | `index` | DI-068 / DI-041 |
| `quiz_capture_viewed` | Tela de captura de contato exibida | — | DI-068 |
| `quiz_completed` | Quiz enviado (uma vez por sessão do quiz) | `score`, `category`, `top_visa`, `duration_ms` | DI-042 |
| `lead_submitted` | Contato enviado no fim do quiz | `category` | DI-068 |
| `waitlist_joined` | Entrou na lista de espera "Em breve" | `processo_tipo` | DI-037 |
| `results_viewed` | `/results` exibido (`trackOnce` por assessment) | `category`, `has_access` | DI-033 |
| `paywall_viewed` | Oferta de €30 entrou na tela (IntersectionObserver) | `position` | DI-033 |
| `paywall_cta_clicked` | Clique no CTA de compra | `position` | DI-033 |
| `email_edited` | Pessoa corrigiu o e-mail antes do checkout | `position` | DI-033 |
| `checkout_started` | Ida para o Stripe | `plan`, `value`, `currency`, `assessment_id` | atual |
| `checkout_failed` | Erro ao criar a sessão de checkout | `reason`, `plan`, `status` | DI-033 |
| `checkout_cancelled` | Volta do Stripe com `?checkout=cancelled` | `plan` | DI-033 |
| `checkout_completed` | **Legado** (SuccessPage atual) — substituir por `purchase` | — | — |
| `purchase` | Compra confirmada (`trackOnce` por compra) | `value*`, `currency*`, `plan` | DI-026 |
| `dashboard_viewed` | Home do painel | `plan_status`, `days_left` | DI-072 |
| `access_expiring_viewed` | Aviso de acesso perto de expirar exibido | `days_left` | DI-072 |
| `access_expired_viewed` | Aviso de acesso expirado exibido | — | DI-072 |
| `settings_plan_viewed` | Bloco de plano em Definições exibido | `plan_status` | DI-072 |
| `portal_clicked` | Clique para gerenciar assinatura | `position` | DI-072 |
| `upsell_viewed` | Oferta de €4,90 exibida (só no painel, só para quem pagou) | `placement` | DI-047 |
| `upsell_clicked` | Clique na oferta de €4,90 | `placement` | DI-047 |
| `analysis_viewed` | Análise completa aberta | `pathway` | DI-050 |
| `analysis_pdf_clicked` | "Guardar PDF" | — | DI-050 |
| `chat_message_sent` | Mensagem enviada ao chat (sem o texto) | `from_suggestion`, `length_bucket` | DI-051 |
| `document_upload_started` | Upload iniciado | `doc_type` | DI-071 |
| `document_upload_succeeded` | Upload concluído | `doc_type`, `size_kb` | DI-071 |
| `document_upload_failed` | Upload recusado/falhou | `doc_type`, `reason` | DI-071 |
| `document_deleted` | Documento removido | `doc_type` | DI-071 |
| `checklist_item_checked` | Item do checklist marcado | `item_key`, `state`, `pathway` | DI-049 |
| `share_clicked` | Partilha (navigator.share, WhatsApp, copiar) | `method`, `placement` | DI-053 |
| `returning_banner_viewed` | Banner de visitante que voltou exibido | — | DI-053 |
| `returning_banner_clicked` | Clique no banner | — | DI-053 |
| `returning_banner_dismissed` | Banner dispensado | — | DI-053 |
| `pwa_install_card_viewed` | Card de instalar o app exibido | `platform` | DI-078 |
| `pwa_install_clicked` | Clique em instalar | `platform` | DI-078 |
| `pwa_install_accepted` | Prompt nativo aceito | `platform` | DI-078 |
| `pwa_install_dismissed` | Prompt/card dispensado | `platform` | DI-078 |
| `pwa_ios_instructions_viewed` | Instruções do iOS abertas | — | DI-078 |

## Sentry

- `import { Sentry } from '@/lib/sentry'` — nunca `@sentry/react` direto (isso devolve o núcleo do SDK, ~30 KB minificados, ao chunk de entrada).
- `Sentry.captureException(err, { tags: { ctx: 'modulo.acao' } })`, `Sentry.captureMessage(msg, { level: 'warning' })`, `Sentry.addBreadcrumb`, `Sentry.setUser({ id })` (só o UUID), `Sentry.setTag`.
- O SDK é baixado em `requestIdleCallback` (ou no primeiro erro). Chamadas anteriores ficam numa fila de até 30 itens; erros globais anteriores ao SDK também são capturados.
- `environment`: `production` no domínio oficial; senão `VITE_APP_ENV`; senão `preview` em `*.vercel.app`.
- Replay: `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 1.0`, `maskAllText`, `maskAllInputs`, `blockAllMedia`, sem corpo/cabeçalho de rede; baixado em chunk próprio e só com consentimento.

## Erros de rota e deploy

- `RouteErrorPage` é o `errorElement` dos três layouts (público, painel e admin): tela em pt-BR, botões "Recarregar página" e "Voltar ao início", erro enviado ao Sentry.
- Aba aberta durante um deploy pede um chunk que não existe mais → `vite:preloadError` (main.tsx) ou a própria `RouteErrorPage` recarregam a página **uma vez** (janela de 30 s em `sessionStorage['di_chunk_reload_at']`). Se falhar de novo, aparece "Há uma versão nova do site".
- Falha ao baixar chunks de segundo plano (Sentry, PostHog, toasts) nunca recarrega a página.
- `vercel.json`: o rewrite para `index.html` não vale mais para `/assets/*` nem para caminhos com ponto — arquivo inexistente devolve 404 de verdade (antes devolvia o HTML com 200 e quebrava o import).

## Ações do dono

- GA4: marcar `purchase` e `generate_lead` como conversões (Administrador → Eventos).
- GA4: em Fluxo de dados → Medição otimizada, desligar "Mudanças de página com base em eventos do histórico do navegador" (o app já envia `page_view` manual; ligado, conta em dobro e sem sanitizar a URL).
- Vercel: `VITE_APP_ENV=production` só no ambiente Production; Preview com outro valor (ex.: `preview`).
- Meta (opcional): criar o Pixel e definir `VITE_META_PIXEL_ID` na Vercel. Sem a variável, nada da Meta é carregado.
- Sentry: apagar os replays gravados antes desta mudança (eram sem máscara) e, em Settings → Security & Privacy, ligar "Prevent Storing of IP Addresses".
- PostHog: procurar eventos com `$current_url` contendo `access_token` ou `session_id=cs_` e apagá-los.
