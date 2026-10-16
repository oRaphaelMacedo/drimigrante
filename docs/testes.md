# Testes e ambiente local

Guia único para rodar o Doutor Imigrante com Supabase local e para rodar os
testes sem tocar em produção. O `TESTING.md` da raiz só aponta para cá.

## Regras de segurança (leia primeiro)

- **Produção é o projeto Supabase `krjirhlmdnxqqrpzmowz`** (front em
  `www.drimigrante.com`). Nenhum teste automatizado roda contra ele.
- **A trava `scripts/lib/test-target-guard.mjs`** (no `playwright.config.ts`,
  nos fixtures e no `npm run test:e2e:guard`) recusa o projeto e os domínios de
  produção e qualquer host remoto que não esteja em `E2E_ALLOWED_REMOTE_HOSTS`
  (staging).
- **Os testes E2E autenticados só rodam contra Supabase local ou de staging.**
  O fixture `e2e/fixtures/auth.ts` pula esses testes quando `VITE_SUPABASE_URL`
  aponta para produção ou quando `E2E_LOGIN_SECRET` não está definido.
- **A Edge Function `e2e-login` nunca entra em deploy de produção.** Ela está com
  `enabled = false` no `supabase/config.toml` (um `supabase functions deploy`
  sem nome não a publica) e o próprio código recusa o projeto de produção.
- **Não há conta de teste em produção documentada neste repositório.** Usuários
  de desenvolvimento existem só no banco local, criados pelo `supabase/seed.sql`.
- **Nenhum teste chama serviço pago.** Stripe, OpenAI e Resend são simulados
  (fakes nos testes das functions, `page.route` nos specs E2E).

### Edge Functions que vão para produção

Lista explícita (16/10/2026). Uma function nova só entra em produção depois de
ser adicionada aqui e ao processo de deploy (`docs/operacao/release.md`).

| Function | `verify_jwt` no `config.toml` | Quem chama |
|---|---|---|
| `chat-completion` | `true` | Painel (usuário logado) |
| `claim-session` | `false` | Página de sucesso do checkout (comprador ainda sem sessão) |
| `compute-eligibility` | `true` | Quiz (chave anon) |
| `create-checkout-session` | `false` | Resultado do quiz (checkout anônimo), página de checkout e painel |
| `create-portal-session` | `true` | Painel, aba "Meu plano" (usuário logado) |
| `generate-explanation` | `true` | Quiz (chave anon) |
| `send-email` | `true` | Outras functions, com `x-internal-secret` |
| `stripe-webhook` | `false` | Stripe (valida `stripe-signature`) |

**Fora da lista:** `e2e-login` (só local/staging).

As três functions com `verify_jwt = false` estão declaradas no
`supabase/config.toml`; as demais usam o padrão `true`. Assim um deploy sem a
flag `--no-verify-jwt` não quebra o webhook do Stripe nem o checkout anônimo.

## Comandos

| Comando | O que roda | Precisa de |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` do app | — |
| `npm run lint` | ESLint (mantenha 0 erros) | — |
| `npm test` | Vitest (`src/**/*.test.ts(x)`) | — |
| `npm run test:scripts` | `node --test` dos scripts (`scripts/**/*.test.mjs`) | Node 22 |
| `npm run test:functions` | Deno: handlers das Edge Functions com Stripe e Supabase falsos | Deno 2 |
| `npm run check-env` | Variáveis lidas pelo código × arquivos `.env*.example` | — |
| `npm run test:e2e:mock` | Specs E2E com o Supabase inteiro simulado no navegador | Navegadores do Playwright |
| `npm run test:e2e` | Specs E2E contra o Supabase local | Docker + Supabase CLI |
| `npm run test:e2e:guard` | Só a trava de alvo (sai com erro se apontar para produção) | — |

O CI (`.github/workflows/ci.yml`, em todo PR e push na `main`) roda os seis
primeiros; o `.github/workflows/e2e.yml`, chamado por ele, roda os três últimos
(detalhes em [GitHub Actions](#github-actions)).

## Supabase local

Pré-requisitos: Docker em execução e [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
Use os scripts do projeto (`scripts/supabase-local.mjs`), que nunca falam com
produção:

```bash
npm run supabase:start   # supabase start (1ª vez: migrations + supabase/seed.sql)
npm run supabase:env     # grava URL e chaves LOCAIS em .env.development.local e .env.test.local
npm run supabase:reset   # recria o banco: migrations + supabase/seed.sql
npm run supabase:stop    # derruba o stack
```

| Serviço | Endereço |
|---|---|
| API (REST, Auth, Storage, Functions) | http://127.0.0.1:54321 |
| Banco | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | http://127.0.0.1:54323 |
| Caixa de e-mail local (Mailpit) | http://127.0.0.1:54324 |

> **Migration 20260509000002:** ela faz `ALTER TYPE field_type ADD VALUE
> 'multiselect'` e usa o valor no mesmo arquivo, o que o CLI recusa
> (`unsafe use of new value "multiselect"`). `npm run supabase:start` e
> `npm run supabase:reset` corrigem isso sozinhos: incluem `'multiselect'` no
> `CREATE TYPE` da migration inicial só durante o comando e restauram o
> arquivo (cópia em `supabase/.temp/local-patches/`). O `supabase start`/`db
> reset` direto ainda para nesse arquivo.

### Usuários do seed (só no banco local)

| E-mail | Perfil |
|---|---|
| `dev@drimigrante.test` | Cliente com o acesso de €30 ativo por 30 dias e um diagnóstico concluído |
| `cliente2@drimigrante.test` | Cliente sem pagamento (útil para testar isolamento entre contas) |
| `admin@drimigrante.test` | `super_admin` (área `/admin`) |

A senha local está em `supabase/seed.sql` (`v_password`). O domínio `.test` é
reservado e não recebe e-mail.

### Front apontando para o Supabase local

`npm run supabase:env` grava o `.env.development.local` (ignorado pelo git; tem
prioridade sobre o `.env.local` no `vite` de desenvolvimento) com:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY local>
```

Depois rode o dev server na porta fixa do projeto:

```bash
npx vite --port 33401 --strictPort
```

Em `http://localhost:33401/login`, o bloco **DEV — Login rápido** (só aparece com
`VITE_APP_ENV=development`) entra com `dev@drimigrante.test` e a senha do seed.

### Seed do quiz a partir do código

`scripts/generate-quiz-seed.mjs` gera o SQL do quiz a partir de
`src/data/quiz-questions.ts`, com o `tsx` local:

```bash
npx tsx scripts/generate-quiz-seed.mjs                    # só imprime o SQL
npx tsx scripts/generate-quiz-seed.mjs --migration [nome] # cria supabase/migrations/<timestamp>_<nome>.sql
npx tsx scripts/generate-quiz-seed.mjs --out seed.sql     # grava num arquivo NOVO fora de supabase/migrations
```

- Nunca sobrescreve arquivo e nunca grava em `supabase/migrations` pelo `--out`.
- `--migration` usa um timestamp depois da migration mais recente e não cria
  nada se o quiz do código for igual ao da última migration gerada pelo script:
  rodar duas vezes não altera as migrations. A migration criada **não é
  aplicada**; ela segue o processo de release.
- O SQL é não destrutivo: upsert por `code`/`question_key`/`option_key`,
  `is_active = FALSE` para o que saiu do código e snapshot em `form_versions`
  antes. Ele sobrescreve edições feitas pelo admin nas perguntas que existem no
  código (o snapshot permite voltar pelo Histórico do admin).
- Não há `TRUNCATE`: `assessments` referencia `form_questions`, e o `TRUNCATE
  ... CASCADE` do seed antigo apagaria os diagnósticos.

### Edge Functions locais

`supabase start` já serve as functions em `http://127.0.0.1:54321/functions/v1/<nome>`.
Para passar secrets, crie `supabase/functions/.env` (ignorado pelo git, modelo em
`supabase/functions/.env.example`) e rode:

```bash
supabase functions serve --env-file supabase/functions/.env
```

Use só chaves de **teste** (Stripe `sk_test_…`). Chamadas reais à OpenAI, ao
Stripe e ao Resend custam dinheiro ou enviam e-mail de verdade: sem a chave
correspondente, a function responde com erro de configuração, o que basta para
a maior parte dos testes locais.

#### e2e-login no ambiente local

O jeito simples é `npm run supabase:functions:e2e`: serve as functions com a
`e2e-login` ligada só enquanto o comando roda (restaura o `config.toml` ao sair)
e grava segredos aleatórios em `.env.test.local`. Ctrl+C encerra.

Regras da function (ver `supabase/functions/e2e-login/handler.ts`):

- `E2E_MODE=true`, senão 403;
- projeto de produção no `SUPABASE_URL` → 403;
- cabeçalho `x-e2e-login-secret` igual a `E2E_LOGIN_SECRET` (segredo próprio,
  diferente do `INTERNAL_SECRET`), senão 403;
- só aceita e-mails `e2e+<número>-<id>@drimigrante.test`, senão 400;
- erros internos voltam como `{"error":"Internal error"}`, sem detalhes.

Testes do handler (sem rede): `npm run test:functions` (todas) ou
`deno test --no-config supabase/functions/e2e-login/handler.test.ts`.

## Testes E2E (Playwright)

### Projetos (dispositivos)

A maioria dos usuários está no celular, então todo spec roda em três projetos:

| Projeto | Dispositivo | Motor |
|---|---|---|
| `chromium` | Desktop Chrome | Chromium |
| `mobile` | iPhone 14 | WebKit |
| `android` | Pixel 7 (412×839, toque) | Chromium |

```bash
npx playwright install chromium webkit   # 1ª vez
npx playwright test --project=android    # só um projeto
```

### Modos

| Modo | Comando | O que roda |
|---|---|---|
| `local` (padrão) | `npm run test:e2e` | Todos os specs, menos os do modo mock, contra o Supabase local (`npm run supabase:start` + `supabase:env`) |
| `mock` | `npm run test:e2e:mock` | Só os testes com a tag **`@mock-backend`** (specs 07 e 08) e os do spec 06 que mockam `*.supabase.co`. O app aponta para um host fictício; REST, Auth e Edge Functions são respondidos no navegador por `e2e/fixtures/mock-backend.ts`, e qualquer escrita sem mock reprova o teste. Sem service role nem segredos: o `.env.test.local` não é lido |

Para um spec novo que não precisa de banco, prefira o modo mock: marque o
`test.describe` com `{ tag: '@mock-backend' }` e use `e2e/fixtures/mock-backend.ts`.

| Spec | O que cobre | Modo |
|---|---|---|
| `01-landing` | Página inicial (desktop e celular) | local (só leitura) |
| `02-cookie-consent` | Banner de cookies | local (só leitura) |
| `03-quiz-full-flow` | Quiz até `/results` | local; escritas e functions mockadas |
| `04-checkout-test-mode` | Checkout anônimo (mock) e checkout autenticado | local; a parte autenticada precisa da `e2e-login` |
| `05-dashboard-and-chat` | Painel e chat de quem pagou | local; precisa da `e2e-login` e da service role local |
| `06-quiz-branching` | Motor do quiz, ramificação no navegador e editor do admin | local + mock |
| `07-upsell-and-expiry` | €30 com chat, €4,90/mês só para quem pagou, fim dos 30 dias | mock (`@mock-backend`) |
| `08-success-autologin` | Volta do Stripe com login automático | mock (`@mock-backend`) |
| `09-a11y` | Acessibilidade (axe), teclado, captura e lista de espera do quiz | local; todo backend mockado no spec |
| `10-results-resume` | `/results?r=<token>`, CTA fixo em 375×812 e 360×740 | local; todo backend mockado no spec |

Os specs 04 (parte autenticada) e 05 usam a `e2e-login` e gravam dados com a
service role (`e2e/fixtures/seeded.ts`). Sem Supabase local configurado eles
ficam em **skip** com o motivo. Para rodá-los na sua máquina:

```bash
npm run supabase:start && npm run supabase:env
npm run supabase:functions:e2e        # em outro terminal; deixe rodando
npm run test:e2e:guard && npx playwright test e2e/tests/05-dashboard-and-chat.spec.ts --project=chromium
```

Os specs 06, 09 e 10 também rodam contra um dev server já no ar, porque mockam
todo o backend: `E2E_BASE_URL=http://localhost:<porta> npx playwright test e2e/tests/10-results-resume.spec.ts`.
`E2E_LOGIN_URL` (opcional) troca o endereço da `e2e-login`. As demais variáveis
estão em `.env.test.example`.

### GitHub Actions

`.github/workflows/e2e.yml` é chamado pelo `ci.yml` e também roda manualmente
(`workflow_dispatch`). Não usa nenhum secret: sobe um Supabase local no próprio
runner (`npm run supabase:start`), grava as chaves locais (`supabase:env`),
serve as functions com a `e2e-login` e segredos aleatórios
(`supabase:functions:e2e`), confere o alvo (`test:e2e:guard`) e roda
`npm run test:e2e` e depois `npm run test:e2e:mock`.

## Stripe em modo de teste

Os testes automatizados nunca chamam o Stripe: os handlers usam o `FakeStripe`
(`supabase/functions/_shared/testing/fakes.ts`) e os specs E2E respondem ao
`create-checkout-session` com `page.route`.

Para testar o Checkout de verdade na sua máquina, use só chaves `sk_test_…` em
`supabase/functions/.env` e o cartão de teste público do Stripe
`4242 4242 4242 4242`, qualquer data futura e qualquer CVC. Opcionais da
`create-checkout-session` (DI-087):

- `STRIPE_LOCALE`: idioma do Checkout (padrão `pt-BR`; valor fora da lista do
  Stripe volta para `pt-BR` com o aviso `config_invalid` no log);
- `STRIPE_ALLOW_PROMOTION_CODES=true`: mostra o campo de código promocional
  (padrão: oculto; ligue só durante uma campanha).
