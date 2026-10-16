# Release: ordem de publicação, checklist e rollback

Como levar o que está na `main` para produção sem deixar front, Edge Functions e
banco fora de sincronia. Cards: DI-015 (processo de release) e DI-081 (hardening
do banco). Última revisão: 16/10/2026.

Projeto de produção: `krjirhlmdnxqqrpzmowz`. Front: https://www.drimigrante.com
(Vercel, publica a cada merge na `main`).

Este guia é a fonte única da ordem de deploy. O [runbook de pagamentos](runbook-pagamentos.md)
cobre incidentes (webhook, concessão manual, backfill) e o [README](README.md),
os ambientes e o CI.

## 1. Regras

- **Nada é aplicado sozinho.** O front sai pela Vercel no merge da `main`. As
  Edge Functions saem pelo workflow manual [`deploy-functions.yml`](../../.github/workflows/deploy-functions.yml)
  (com aprovação) ou pelo CLI na máquina do dono. As migrations são aplicadas
  pelo dono com `supabase db push`. Nenhum workflow aplica migration.
- **Ordem de cada release:** functions que precisam vir antes → migrations →
  functions que dependem das migrations → front → conferência. Tudo na mesma
  sessão, de preferência em horário de pouco movimento: entre a migration
  `20261020000000` e o front novo, o painel do front antigo fica sem o
  resultado (seção 3, passo 2).
- **Functions de produção** (lista de [docs/testes.md](../testes.md)):
  `compute-eligibility`, `send-email`, `chat-completion`, `generate-explanation`,
  `create-checkout-session`, `claim-session` e `stripe-webhook`. A `e2e-login`
  nunca vai para produção. Function nova só entra depois de ir para aquela
  lista e para `PROD_FUNCTIONS` no workflow.
- **Nunca:** `supabase functions deploy` sem nome, `--prune`, `supabase db reset`
  apontando para produção, ou migration colada no SQL Editor (ela não entra no
  histórico de migrations, e o próximo `db push` tentaria aplicá-la de novo).
- **Toda migration que cria função em `public`** precisa de `REVOKE ALL ... FROM
  PUBLIC, anon, authenticated` e de `GRANT EXECUTE` só para quem usa. Desde a
  `20261025000000`, os helpers de RLS ficam em `private` (`private.is_hub_user`,
  `private.is_staff_user`, `private.can_access_tenant`…): migrations novas citam
  esses nomes, e `public.is_hub_user(...)` não existe mais.
- **Tag de release:** `vAAAA.MM.DD` (segundo release no mesmo dia:
  `vAAAA.MM.DD.2`), criada no commit que vai para produção ANTES do merge na
  `main`. Functions e migrations saem dessa tag; o merge (que publica o front) é
  o último passo. Use *merge commit* no PR (não *squash*), para a tag ficar no
  histórico da `main`.

## 2. Antes de começar

1. PR para a `main` aprovado e com CI verde: `ci`, `functions` e
   `e2e / playwright`. O E2E sobe um Supabase local e aplica **todas** as
   migrations e o seed, então uma migration quebrada aparece ali. Ainda não faça
   o merge.
2. Teste local rápido: `npm run supabase:reset`, `npm run dev` e um quiz completo
   em http://localhost:33401/quiz (detalhes em [docs/testes.md](../testes.md)).
3. Backup: confira que existe backup do dia em
   [Database → Backups](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/database/backups/scheduled).
4. Crie a tag no último commit do PR e entre nela (na máquina do dono):

   ```bash
   git fetch origin
   git tag -a v2026.10.25 origin/<branch-do-pr> -m "Release ondas 1–3"   # use a data do dia
   git push origin v2026.10.25
   git switch --detach v2026.10.25
   ```

5. Ainda na tag:

   ```bash
   supabase link --project-ref krjirhlmdnxqqrpzmowz   # pede a senha do banco
   supabase migration list                             # Local × Remote
   supabase db push --dry-run                          # o que será aplicado
   ```

   O `--dry-run` não aplica nada. A lista tem de bater com a tabela da seção 3.
6. Anote as versões atuais das functions (para o rollback):
   `supabase functions list --project-ref krjirhlmdnxqqrpzmowz`.

## 3. Ordem deste release (ondas 1 a 3)

Produção tem as migrations até `20260630000000`. Tudo abaixo está pendente.

**Passo 1 — functions que vêm ANTES das migrations**

| Function | Por quê |
|---|---|
| `compute-eligibility` | Não depende de migration (o motor corrige as condições incompletas). |
| `send-email` | Não depende de migration. |
| `chat-completion` | **Precisa estar no ar antes da `20261016000300`**: a versão nova grava as mensagens com a service role; a antiga grava com o JWT do cliente, e a 000300 tira esse INSERT. Até a `20261016000150` rodar (passo 2, minutos depois), quem pagou o €30 antes desta versão pode ficar sem chat. |

Workflow: `functions = compute-eligibility,send-email,chat-completion`.

**Passo 2 — migrations: `supabase db push`**

Aplica todas, nesta ordem (timestamp). Cada uma tem o detalhe no cabeçalho.

| Migration | Card | Depende de / libera |
|---|---|---|
| `20261016000000_fix_is_hub_user_rls` | DI-001 | Compatível com o hotfix de `is_hub_user` já aplicado em produção. |
| `20261016000100_profiles_hardening_email_resolver` | DI-002 | Libera `stripe-webhook`, `create-checkout-session` e `claim-session` (passo 3). O código antigo continua funcionando com ela. |
| `20261016000150_one_time_chat_access` | DI-012, DI-020, DI-021 | Antes do `stripe-webhook` novo (coluna `recurring_cancel_at`). |
| `20261016000200_fix_quiz_display_conditions` | DI-005 | Só dados; independe de function. |
| `20261016000300_messages_server_only_insert` | DI-017 | **Depois** da `chat-completion` nova (passo 1). |
| `20261016000340_fix_ai_config_audit_record_id` | DI-060 | Antes da 000350 (sem ela, a 000350 falha). |
| `20261016000350_ai_config_prompts` | DI-008, DI-017 | Junto com `generate-explanation` e `chat-completion` (funcionam com ou sem). |
| `20261016000400_checkout_claims` | DI-022 | Antes do `claim-session` novo. |
| `20261016000500_user_documents_storage` | DI-023 | Junto com o front novo (DocumentsPage). |
| `20261020000000_full_analysis_paywall` | DI-016 | **Junto com o front novo** (passo 4): o front antigo lê `assessment_results(*)` e passa a receber "permission denied" no painel. Libera o `generate-explanation` da W3-05 (usa `has_active_access`). |
| `20261025000000_db_hardening_advisors` | DI-081 | Depois de todas as anteriores. Helpers de RLS para `private`, `anon` só lê o quiz, EXECUTE com allowlist. O front antigo continua funcionando. |
| `20261025000100_anon_rpc_limits` | DI-081 | Depois da 000000. Limites nas RPCs do quiz anônimo; aceita os session_id antigos. |
| `20261025000200_resume_token` | W3-01 | Conferir o cabeçalho na integração. Se recriar `upsert_anon_assessment`, tem de manter as validações da 000100; policies e funções citam `private.*`. |
| Outras migrations da onda 3 | — | Conferir o cabeçalho de cada uma antes do `db push` e acrescentar aqui. |

```bash
supabase db push        # confirma com "y"; para no primeiro erro
supabase migration list # Local e Remote iguais
```

Se uma migration falhar, o `db push` para nela; confira com
`supabase migration list` quais já entraram. Não continue o release: leia o
erro, corrija com uma migration nova (num commit e numa tag novos) e repita a
partir do passo 2.

**Passo 3 — functions que dependem das migrations**

| Function | Depende de |
|---|---|
| `generate-explanation` | `20261020000000` (a versão da W3-05 chama `rpc('has_active_access')` na geração sob demanda). A `20261016000350` é recomendada junto, mas não obrigatória. |
| `create-checkout-session` | `20261016000100`. `verify_jwt = false`. |
| `claim-session` | `20261016000100` e `20261016000400`. `verify_jwt = false`. |
| `stripe-webhook` | `20261016000100` e `20261016000150`. `verify_jwt = false`. |

Workflow: `functions = generate-explanation,create-checkout-session,claim-session,stripe-webhook`.

**Passo 4 — front:** merge do PR na `main` (*merge commit*; a Vercel publica
sozinha). Acompanhe no [painel da Vercel](https://vercel.com/dashboard) → projeto
do Doutor Imigrante → *Deployments* até o status *Ready*.

**Passo 5 — conferência:** checklist da seção 5.

## 4. Publicar as functions

**Pelo workflow (recomendado).** GitHub → Actions →
[Deploy das Edge Functions](https://github.com/oRaphaelMacedo/drimigrante/actions/workflows/deploy-functions.yml)
→ *Run workflow*:

1. *Use workflow from*: a tag do release (ou a `main`, para um redeploy depois
   do merge; outra branch é recusada).
2. *functions*: a lista do passo (ex.: `compute-eligibility,send-email,chat-completion`).
   `todas` publica as 7 na ordem da lista.
3. Primeiro com *dry_run* marcado: o job `plan` valida a lista, roda os testes
   Deno e mostra o plano (ordem e `verify_jwt` de cada uma) no resumo da execução.
4. Rode de novo com *dry_run* desmarcado. O job `deploy` espera a aprovação no
   environment `production` (botão *Review deployments*). Só depois o token é
   liberado e as functions são publicadas, uma por uma, pelo nome.

**Pelo CLI (alternativa do dono).** No checkout da tag (seção 2), sempre pelo
nome; o `verify_jwt` vem do `supabase/config.toml`, e as três abaixo levam
`--no-verify-jwt` por segurança:

```bash
for fn in compute-eligibility send-email chat-completion generate-explanation; do
  supabase functions deploy "$fn" --project-ref krjirhlmdnxqqrpzmowz
done
for fn in create-checkout-session claim-session stripe-webhook; do
  supabase functions deploy "$fn" --project-ref krjirhlmdnxqqrpzmowz --no-verify-jwt
done
```

(No release das ondas 1–3, respeite a divisão entre os passos 1 e 3.)

## 5. Checklist pós-deploy

Rode logo depois do passo 4. Nenhum item gasta dinheiro.

- [ ] `supabase functions list --project-ref krjirhlmdnxqqrpzmowz`: as 7 com a
      versão nova e sem `e2e-login`.
- [ ] CORS: origem de terceiro recebe 403 e o site oficial recebe 204.

  ```bash
  curl -si -X OPTIONS https://krjirhlmdnxqqrpzmowz.supabase.co/functions/v1/compute-eligibility \
    -H 'Origin: https://exemplo-invalido.com' -H 'Access-Control-Request-Method: POST' | head -5
  curl -si -X OPTIONS https://krjirhlmdnxqqrpzmowz.supabase.co/functions/v1/compute-eligibility \
    -H 'Origin: https://www.drimigrante.com' -H 'Access-Control-Request-Method: POST' | head -8
  ```

- [ ] Helpers fora da API (DI-081). Com a chave pública (anon/publishable) de
      [Settings → API Keys](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/settings/api-keys):

  ```bash
  ANON='<chave anon/publishable>'
  # Esperado: 404 (PGRST202)
  curl -s -o /dev/null -w '%{http_code}\n' -X POST \
    https://krjirhlmdnxqqrpzmowz.supabase.co/rest/v1/rpc/is_hub_user \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' \
    -d '{"_user_id":"00000000-0000-0000-0000-000000000000"}'
  # Esperado: 401 (anon não lê tabelas internas)
  curl -s -o /dev/null -w '%{http_code}\n' \
    'https://krjirhlmdnxqqrpzmowz.supabase.co/rest/v1/subscriptions?select=user_id&limit=1' \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
  ```

- [ ] [Advisors → Security](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/advisors/security):
      sem `function_search_path_mutable` e sem `rls_enabled_no_policy`. Em
      0028/0029 sobram só as RPCs de propósito: `upsert_anon_assessment` e
      `get_anon_assessment` (anon e authenticated), `link_anon_assessment_to_user`,
      `snapshot_quiz_version` e `get_full_analysis` (authenticated), mais as que
      a W3-01 criar (ex.: `get_assessment_by_resume_token`). Sobra também o aviso
      do Auth sobre senha vazada até o dono ligar a proteção (seção 7).
- [ ] Quiz anônimo completo no celular em https://www.drimigrante.com/quiz: o
      resultado aparece e a página `/results` mostra só a oferta de €30 (nada de
      €4,90). No SQL Editor (só leitura), o último diagnóstico tem session_id
      UUID e a mesma categoria mostrada na tela:

  ```sql
  select a.session_id ~* '^[0-9a-f]{8}-' as uuid, a.status, r.score_category, a.created_at
  from public.assessments a
  left join public.assessment_results r on r.assessment_id = a.id
  order by a.created_at desc limit 3;
  ```

- [ ] Login com uma conta que pagou → `/dashboard` → a análise abre (RPC
      `get_full_analysis`) e o chat responde.
- [ ] `/admin` com a conta de admin: Leads e Pipeline carregam.
- [ ] Logs das functions sem `server_error` nem `exception` nos primeiros 30 min
      ([Functions](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/functions)).
      O quiz não deve mostrar erro 400 de `upsert_anon_assessment`
      ([Logs → API](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/logs/edge-logs), filtrar por `rpc/upsert_anon_assessment`).
- [ ] Sentry sem erro novo do front.
- [ ] Na próxima compra real: evento `processed` em `payment_events`
      ([runbook, seção 4](runbook-pagamentos.md#4-reenviar-um-evento-do-stripe)).

## 6. Rollback

**Front.** [Painel da Vercel](https://vercel.com/dashboard) → projeto do Doutor
Imigrante → *Deployments* → deploy anterior → menu "…" → *Instant Rollback* (ou
*Promote to Production*). Volta em segundos e não mexe no banco.

**Functions.** Rode o workflow com *Use workflow from* = a tag do release
anterior e as functions afetadas (ou, no CLI, `git switch --detach <tag>` e o
deploy pelo nome). Antes, confira no cabeçalho do `index.ts` de qual migration a
versão antiga depende: **não volte a `chat-completion` para antes da
`20261016000300`** (a versão antiga grava mensagens com o JWT do cliente, que a
migration bloqueou).

**Migrations.** Não há "desfazer". Corrija com uma migration nova (forward fix).
Atalhos de emergência para a DI-081, no SQL Editor, enquanto a correção não sai
(registre num card e transforme em migration depois):

```sql
-- Um fluxo de visitante quebrou por falta de leitura numa tabela (a RLS continua valendo):
grant select on public.<tabela> to anon;

-- Uma RPC de cliente quebrou por falta de EXECUTE:
grant execute on function public.<funcao>(<tipos dos argumentos>) to authenticated;

-- O quiz passou a recusar session_id legítimos (erro 400 "Invalid session_id"):
create or replace function private.is_valid_quiz_session_id(p_session_id text)
returns boolean language sql immutable set search_path = ''
as $$ select p_session_id ~ '^[\x21-\x7e]{8,64}$' $$;
```

Último recurso: restaurar o backup em
[Database → Backups](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/database/backups/scheduled).
Apaga tudo o que foi gravado depois dele (compras, diagnósticos): só com o
pagamento e os e-mails do período anotados.

## 7. Ações manuais do dono (uma vez)

1. **Token do Supabase para o workflow.** Crie em
   [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
   (nome: `github-deploy-functions`).
2. **Environment `production` no GitHub.** Em
   [Settings → Environments](https://github.com/oRaphaelMacedo/drimigrante/settings/environments)
   → *New environment* → `production`:
   - *Required reviewers*: você (marque também *Prevent self-review* se houver
     outra pessoa para aprovar);
   - *Deployment branches and tags* → *Selected branches and tags*: `main` e o
     padrão de tag `v*`;
   - *Environment secrets* → `SUPABASE_ACCESS_TOKEN` com o token do item 1.
3. **Proteger a `main`** em
   [Settings → Branches](https://github.com/oRaphaelMacedo/drimigrante/settings/branches):
   exigir PR e os checks `ci`, `functions` e `e2e / playwright`.
4. **Proteção contra senha vazada no Auth** (aviso `auth_leaked_password_protection`
   dos advisors): ligue a opção de bloquear senhas vazadas (HaveIBeenPwned) nas
   configurações de senha do Auth, em
   [Authentication](https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/auth/providers).
   Referência: <https://supabase.com/docs/guides/auth/password-security>.
5. **Depois do primeiro release com a DI-081:** regenerar os tipos
   (`supabase gen types typescript --project-id krjirhlmdnxqqrpzmowz > src/lib/database.types.ts`)
   para sumirem `is_hub_user` e os outros helpers apagados de `public`.
