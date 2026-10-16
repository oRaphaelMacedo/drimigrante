# Doutor Imigrante

Diagnóstico de elegibilidade à nacionalidade portuguesa. A pessoa responde a um
quiz grátis, vê um pré-resultado e pode desbloquear a análise completa (€30,
com 30 dias de painel e chat IA). Produção: https://www.drimigrante.com

Stack: Vite + React 18 + TypeScript + Tailwind · Supabase (Postgres, Auth,
Storage, Edge Functions em Deno) · Stripe · OpenAI · Resend · Vercel.

## Rodar localmente

Pré-requisitos:

- Node 22 (`.nvmrc`) e npm 10 — o projeto usa só npm (`package-lock.json`);
- Docker em execução e o [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started);
- [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2, só para os testes das Edge Functions.

```bash
nvm use                  # Node 22
npm ci
npm run supabase:start   # Supabase local: migrations + supabase/seed.sql (a 1ª vez baixa as imagens)
npm run supabase:env     # grava URL e chaves LOCAIS em .env.development.local e .env.test.local
npm run dev              # http://localhost:33401
```

- A porta **33401** é fixa: é a mesma do `auth.site_url` do `supabase/config.toml`
  (links de login por e-mail).
- Usuários de desenvolvimento (só no banco local) e a caixa de e-mail local
  (Mailpit, http://127.0.0.1:54324): ver [docs/testes.md](docs/testes.md).
- As Edge Functions locais sobem sem chaves da OpenAI, do Stripe e do Resend e
  respondem com erro de configuração — nada de serviço pago no desenvolvimento.
  Para passar secrets, use `supabase/functions/.env` (modelo em
  `supabase/functions/.env.example`).
- Para apontar o front para outro projeto Supabase (sem Docker): copie
  `.env.example` para `.env.local` e preencha `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY`. Nunca use a service role no front: o app recusa.

Outros comandos do Supabase local: `npm run supabase:reset` (recria o banco),
`npm run supabase:stop`.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Vite em http://localhost:33401 |
| `npm run build` | `tsc` + build de produção em `dist/` |
| `npm run typecheck` / `typecheck:e2e` | Tipos do app / dos testes E2E e do `playwright.config.ts` |
| `npm run lint` | ESLint (falha só com erros; `lint:strict` falha também com avisos) |
| `npm run check-env` | Confere as variáveis lidas no código com os três arquivos de exemplo |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:scripts` | Testes dos scripts Node (`node --test`) |
| `npm run test:functions` | Testes das Edge Functions (Deno, sem rede) |
| `npm run test:e2e` | Playwright contra o Supabase local |
| `npm run test:e2e:mock` | Testes do spec 06 que mockam o Supabase inteiro |
| `npm run supabase:start` / `reset` / `stop` | Stack local do Supabase |
| `npm run supabase:env` | Grava URL e chaves locais nos arquivos `.env.*.local` |
| `npm run supabase:functions:e2e` | Serve as Edge Functions com a `e2e-login` ligada |

## Testes

**Regra:** nenhum teste automatizado fala com produção. A trava
`scripts/lib/test-target-guard.mjs` (no Playwright, no cliente admin dos
fixtures e no CI) recusa o projeto Supabase e os domínios de produção e qualquer
host remoto fora de `E2E_ALLOWED_REMOTE_HOSTS`.

```bash
npm test                 # unitários
npm run test:scripts     # scripts
npm run test:functions   # Edge Functions (Deno)
```

E2E com Playwright, contra o Supabase local:

```bash
npm run supabase:start
npm run supabase:env -- --target test
npm run supabase:functions:e2e        # em outro terminal; deixe rodando (Ctrl+C encerra)
npm run test:e2e
npm run test:e2e:mock
```

- O Playwright lê só o ambiente e o `.env.test.local` — nunca o `.env.local` —
  e sobe o próprio Vite na porta 33401 (`E2E_PORT` troca a porta se o seu
  `npm run dev` já estiver nela). Modelo de variáveis: `.env.test.example`.
- Sem a `e2e-login` servida, a parte autenticada do spec 04 e o spec 05 ficam em
  skip; o resto roda.
- Os specs respondem às chamadas de Stripe, OpenAI e Resend com mocks
  (`page.route`); nenhuma chave desses serviços é usada.
- Ao fim da suíte, o `e2e/global-teardown.ts` apaga as contas
  `e2e+…@drimigrante.test` criadas no banco local.
- `npm run supabase:functions:e2e` liga a `e2e-login` no `supabase/config.toml`
  só enquanto roda e restaura o arquivo ao sair. Se o processo morrer sem
  restaurar, o próximo `npm run supabase:*` restaura. Não commite o arquivo com
  `enabled = true`.

Mais detalhes (usuários do seed, `e2e-login`, Stripe em modo de teste):
[docs/testes.md](docs/testes.md).

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em todo PR e push
na `main`: `check-env`, tipos, lint, Vitest, testes dos scripts, build, testes
Deno das Edge Functions e o E2E completo contra um Supabase local no próprio
runner ([`e2e.yml`](.github/workflows/e2e.yml)). Nenhum job usa secrets nem
fala com produção.

## Variáveis de ambiente

| Camada | Modelo | Valores reais |
|---|---|---|
| Front (`VITE_*`, vão para o navegador) | [`.env.example`](.env.example) | `.env.local`, `.env.development.local`; Vercel |
| Edge Functions | [`supabase/functions/.env.example`](supabase/functions/.env.example) | `supabase/functions/.env`; secrets do Supabase |
| E2E | [`.env.test.example`](.env.test.example) | `.env.test.local` (gerado por `npm run supabase:env`) |

As variáveis do front são validadas em `src/lib/env.ts`. Nenhum arquivo `.env`
com valores reais vai para o git.

## Documentação

- [docs/arquitetura.md](docs/arquitetura.md) — visão geral, fluxo e Edge Functions
- [docs/modelo-comercial.md](docs/modelo-comercial.md) — planos, prazos e o que pode ser prometido
- [docs/testes.md](docs/testes.md) — ambiente local e testes
- [docs/analytics.md](docs/analytics.md) — eventos, consentimento e monitoramento
- [docs/operacao/README.md](docs/operacao/README.md) — ambientes, publicação e CI
- [docs/historico/](docs/historico/README.md) — documentos antigos, só como registro
