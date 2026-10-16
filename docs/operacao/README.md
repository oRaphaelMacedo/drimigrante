# Operação

Como o Doutor Imigrante é publicado e configurado, e onde estão os guias de
operação. Última revisão: 16/10/2026.

## Guias

| Documento | Assunto |
|---|---|
| [release.md](release.md) | Ordem de publicação (functions ↔ migrations ↔ front), checklist pós-deploy e rollback |
| [runbook-pagamentos.md](runbook-pagamentos.md) | Incidentes de pagamento, webhook, concessão manual e backfill |
| [dependencias.md](dependencias.md) | Node, npm, lockfile e auditoria de dependências |
| [seguranca-headers.md](seguranca-headers.md) | Cabeçalhos de segurança e CSP (`vercel.json`) |
| [../analytics.md](../analytics.md) | Eventos, consentimento, PostHog, GA4, Meta Pixel e Sentry |
| [../testes.md](../testes.md) | Supabase local, usuários do seed, Edge Functions locais, E2E |
| [../modelo-comercial.md](../modelo-comercial.md) | Planos, prazos e o que pode ser prometido |
| [../arquitetura.md](../arquitetura.md) | Visão geral do sistema |

## Ambientes

| Ambiente | Front | Supabase | Onde ficam as variáveis |
|---|---|---|---|
| Local | `npm run dev` → http://localhost:33401 | Local (`npm run supabase:start`) ou um projeto de desenvolvimento | `.env.development.local` / `.env.local` (fora do git) |
| Preview | Vercel, `*.vercel.app` (branches e PRs) | O configurado nas variáveis de Preview da Vercel | Vercel → projeto → Settings → Environment Variables |
| Produção | Vercel, https://www.drimigrante.com | Projeto `krjirhlmdnxqqrpzmowz` | Vercel (front) e [secrets das Edge Functions](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/functions/secrets) |

Listas completas de variáveis: `.env.example` (front) e
`supabase/functions/.env.example` (Edge Functions). Depois de mudar qualquer
variável no código, rode `npm run check-env`.

## Publicação

- **Front:** merge na `main` → a Vercel roda `npm run build` e publica `dist/`.
  Cabeçalhos em `vercel.json`.
- **Edge Functions:** pelo workflow manual
  [`deploy-functions.yml`](../../.github/workflows/deploy-functions.yml)
  (aprovação no environment `production`) ou pelo dono com o Supabase CLI,
  sempre pelo nome. O `verify_jwt` de cada uma vem do `supabase/config.toml`.
  Functions de produção: `chat-completion`, `claim-session`,
  `compute-eligibility`, `create-checkout-session`, `create-portal-session`,
  `generate-explanation`, `send-email` e `stripe-webhook`. **A `e2e-login` nunca vai para produção.**
- **Migrations:** aplicadas pelo dono com `supabase db push`, depois de testadas
  no Supabase local (`npm run supabase:reset`). O cabeçalho de cada migration diz
  de qual function ela depende. Nenhum workflow aplica migration.
- **Ordem, checklist e rollback de cada release:** [release.md](release.md)
  (ex.: `chat-completion` nova antes da `20261016000300`; `20261016000340` antes
  da `20261016000350`).

## CI (GitHub Actions)

- [`ci.yml`](../../.github/workflows/ci.yml), em todo PR e push na `main`:
  - `ci` — `npm ci`, `check-env`, tipos (app e E2E), lint, Vitest, testes dos
    scripts e build;
  - `functions` — `deno test` das Edge Functions (sem rede, sem chaves);
  - `e2e / playwright` — [`e2e.yml`](../../.github/workflows/e2e.yml): Supabase
    local no runner, Edge Functions locais com a `e2e-login` e segredos
    aleatórios, Playwright no Chromium e no WebKit (iPhone 14).
- Nenhum job usa secrets do repositório nem fala com produção. A trava
  `scripts/lib/test-target-guard.mjs` recusa o projeto e os domínios de produção.

## Ações manuais do dono ligadas a este guia

1. **Apagar os secrets antigos do GitHub** (o E2E não usa mais nenhum):
   `E2E_BASE_URL`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
   `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_LOGIN_SECRET` e, se existirem,
   `SUPABASE_SERVICE_ROLE_KEY` e `INTERNAL_SECRET`.
   GitHub → repositório → Settings → Secrets and variables → Actions.
2. **Apagar as variáveis órfãs da Vercel:** `VITE_STRIPE_PUBLISHABLE_KEY`,
   `VITE_STRIPE_PRICE_ONE_TIME` e `VITE_STRIPE_PRICE_SUBSCRIPTION` (o código não
   usa nenhuma delas).
3. **Proteger a `main`:** exigir PR e os checks `ci`, `functions` e
   `e2e / playwright`.
   GitHub → repositório → Settings → Branches.
4. **Deploy das functions pelo GitHub:** criar o environment `production` com
   aprovação e o secret `SUPABASE_ACCESS_TOKEN` (passo a passo em
   [release.md, seção 7](release.md#7-ações-manuais-do-dono-uma-vez)).
