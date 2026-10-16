# Testes e ambiente local

Guia para rodar o Doutor Imigrante com Supabase local e para rodar os testes
sem tocar em produção. Substitui o conteúdo antigo do `TESTING.md`.

## Regras de segurança (leia primeiro)

- **Produção é o projeto Supabase `krjirhlmdnxqqrpzmowz`** (front em
  `www.drimigrante.com`). Nenhum teste automatizado roda contra ele.
- **Os testes E2E autenticados só rodam contra Supabase local ou de staging.**
  O fixture `e2e/fixtures/auth.ts` pula esses testes quando `VITE_SUPABASE_URL`
  aponta para produção ou quando `E2E_LOGIN_SECRET` não está definido.
- **A Edge Function `e2e-login` nunca entra em deploy de produção.** Ela está com
  `enabled = false` no `supabase/config.toml` (um `supabase functions deploy`
  sem nome não a publica) e o próprio código recusa o projeto de produção.
- **Não há conta de teste em produção documentada neste repositório.** Usuários
  de desenvolvimento existem só no banco local, criados pelo `supabase/seed.sql`.
- O workflow `.github/workflows/e2e.yml` só roda manualmente e aborta se os
  secrets apontarem para produção.

### Edge Functions que vão para produção

Lista explícita (16/10/2026). Uma function nova só entra em produção depois de
ser adicionada aqui e ao processo de deploy.

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

## Supabase local

Pré-requisitos: Docker em execução e [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

```bash
supabase start          # sobe o stack, aplica as migrations e o seed (1ª vez)
supabase status -o env  # URL da API e chaves LOCAIS (anon e service_role)
supabase db reset       # recria o banco: migrations + supabase/seed.sql
supabase stop           # derruba o stack
```

| Serviço | Endereço |
|---|---|
| API (REST, Auth, Storage, Functions) | http://127.0.0.1:54321 |
| Banco | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | http://127.0.0.1:54323 |
| Caixa de e-mail local (Mailpit) | http://127.0.0.1:54324 |

> **Problema conhecido:** a migration `20260509000002_seed_quiz_v1.sql` faz
> `ALTER TYPE field_type ADD VALUE 'multiselect'` e usa o valor no mesmo
> arquivo. O CLI aplica cada arquivo numa transação, então `supabase start` e
> `supabase db reset` param nesse arquivo com o erro
> `unsafe use of new value "multiselect"`. A correção (incluir `'multiselect'`
> no `CREATE TYPE field_type` da migration inicial, o que não muda nada em
> produção) está pendente. Até lá, faça essa alteração só na sua cópia local,
> sem commitar.

### Usuários do seed (só no banco local)

| E-mail | Perfil |
|---|---|
| `dev@drimigrante.test` | Cliente com o acesso de €30 ativo por 30 dias e um diagnóstico concluído |
| `cliente2@drimigrante.test` | Cliente sem pagamento (útil para testar isolamento entre contas) |
| `admin@drimigrante.test` | `super_admin` (área `/admin`) |

A senha local está em `supabase/seed.sql` (`v_password`). O domínio `.test` é
reservado e não recebe e-mail.

### Front apontando para o Supabase local

Crie `.env.development.local` na raiz (já ignorado pelo git; tem prioridade sobre
o `.env.local` no `vite` de desenvolvimento):

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY do `supabase status -o env`>
```

Depois rode o dev server na porta fixa do projeto:

```bash
npx vite --port 33401 --strictPort
```

Em `http://localhost:33401/login`, o bloco **DEV — Login rápido** (só aparece com
`VITE_APP_ENV=development`) entra com `dev@drimigrante.test` e a senha do seed.

### Edge Functions locais

`supabase start` já serve as functions em `http://127.0.0.1:54321/functions/v1/<nome>`.
Para passar secrets, crie `supabase/functions/.env` (ignorado pelo git) e rode:

```bash
supabase functions serve --env-file supabase/functions/.env
```

Use só chaves de **teste** (Stripe `sk_test_…`). Chamadas reais à OpenAI, ao
Stripe e ao Resend custam dinheiro ou enviam e-mail de verdade: sem a chave
correspondente, a function responde com erro de configuração, o que basta para
a maior parte dos testes locais.

#### e2e-login no ambiente local

1. No `supabase/config.toml`, troque temporariamente `enabled = false` por
   `enabled = true` em `[functions.e2e-login]` — **não commite essa mudança**.
2. Em `supabase/functions/.env`:
   ```bash
   E2E_MODE=true
   E2E_LOGIN_SECRET=<valor aleatório com 32+ caracteres>
   ```
3. `supabase functions serve --env-file supabase/functions/.env`

Regras da function (ver `supabase/functions/e2e-login/handler.ts`):

- `E2E_MODE=true`, senão 403;
- projeto de produção no `SUPABASE_URL` → 403;
- cabeçalho `x-e2e-login-secret` igual a `E2E_LOGIN_SECRET` (segredo próprio,
  diferente do `INTERNAL_SECRET`), senão 403;
- só aceita e-mails `e2e+<número>-<id>@drimigrante.test`, senão 400;
- erros internos voltam como `{"error":"Internal error"}`, sem detalhes.

Testes do handler (sem rede):

```bash
deno test supabase/functions/e2e-login/handler.test.ts
```

## Testes E2E (Playwright)

```bash
npx playwright test                  # todos os specs
npx playwright test --project=chromium
```

| Spec | O que cobre | Situação |
|---|---|---|
| `01-landing` | Página inicial | Roda (só leitura) |
| `02-cookie-consent` | Banner de cookies | Roda (só leitura) |
| `03-quiz-full-flow` | Quiz até `/results` | Roda; escritas e functions mockadas |
| `04-checkout-test-mode` | Checkout anônimo (mock) e checkout autenticado | Parte anônima roda; parte autenticada em skip |
| `05-dashboard-and-chat` | Painel e chat de quem pagou | Em skip |

A parte autenticada do spec 04 e o spec 05 ficam em **skip** até existir um
Supabase de teste para o E2E (DI-060). Eles usam o `e2e-login` e gravam dados
com a service role (`e2e/fixtures/seeded.ts`), então só podem rodar contra
Supabase local ou de staging. Para rodá-los localmente:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_ANON_KEY=<ANON_KEY local> \
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY local> \
E2E_LOGIN_SECRET=<o mesmo do supabase/functions/.env> \
npx playwright test e2e/tests/05-dashboard-and-chat.spec.ts --project=chromium
```

`E2E_LOGIN_URL` (opcional) troca o endereço da function, se ela estiver em outro
host.

### GitHub Actions

`.github/workflows/e2e.yml` roda só por `workflow_dispatch` (manual) e lê os
secrets `E2E_BASE_URL`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
`E2E_SUPABASE_SERVICE_ROLE_KEY` e `E2E_LOGIN_SECRET`, que devem apontar para um
ambiente de staging. O primeiro passo aborta se algum deles apontar para
produção.

## Stripe em modo de teste

Cartão de teste público do Stripe: `4242 4242 4242 4242`, qualquer data futura e
qualquer CVC. Use apenas com chaves `pk_test_…`/`sk_test_…`.
