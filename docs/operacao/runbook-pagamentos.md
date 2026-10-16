# Runbook: pagamentos e Edge Functions

Para quando alguém pagou e não recebeu acesso, quando o webhook do Stripe falha ou quando uma function começa a responder com erro. Cards: DI-082 (CORS, versões, observabilidade) e DI-006 (score).

Projeto de produção: `krjirhlmdnxqqrpzmowz`. Links usados abaixo:

- Logs das functions: <https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/functions>
- SQL Editor: <https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/sql/new>
- Secrets das functions: <https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/functions/secrets>
- Webhooks do Stripe: <https://dashboard.stripe.com/webhooks>
- Pagamentos no Stripe: <https://dashboard.stripe.com/payments>

## 1. Mapa das functions

| Function | Quem chama | CORS | Observação |
|---|---|---|---|
| `compute-eligibility` | navegador, no fim do quiz | allowlist | Grava o score (motor de `_shared/quiz-engine.ts`). |
| `generate-explanation` | navegador, logo depois | allowlist | Chama a OpenAI (custo). |
| `chat-completion` | painel (SSE) | allowlist | Chama a OpenAI (custo). |
| `create-checkout-session` | resultado, `/checkout` e painel | allowlist | `verify_jwt = false` (checkout anônimo). |
| `claim-session` | página de sucesso do checkout | allowlist | `verify_jwt = false`. |
| `stripe-webhook` | Stripe | nenhum | `verify_jwt = false`; autenticidade pela assinatura `stripe-signature`. |
| `send-email` | outras functions (`x-internal-secret`) | nenhum | Chama o Resend (custo). |
| `e2e-login` | Playwright | nenhum | **Nunca** entra em produção (ver `docs/testes.md`). |

**Allowlist de CORS** (`_shared/cors.ts`): `https://www.drimigrante.com`, `https://drimigrante.com`, a origem de `APP_URL`, os previews da Vercel deste projeto (`https://dr-imigrante-…-oraphaelmacedo-3991s-projects.vercel.app`) e `http://localhost`/`http://127.0.0.1` com porta. Outra origem só entra pelo secret `CORS_ALLOWED_ORIGINS` (lista separada por vírgula, origens exatas, ex.: `https://staging.drimigrante.com`). Origem fora da lista recebe `403 {"error":"origin_not_allowed"}` sem `Access-Control-Allow-Origin`, e a function registra `cors_rejected` no log.

## 2. Onde olhar

**Logs (sempre disponíveis).** Cada requisição gera uma linha JSON:

```json
{"fn":"stripe-webhook","event":"request","level":"error","outcome":"server_error","status":500,"method":"POST","duration_ms":812,"ts":"…"}
```

`outcome`: `ok` (2xx/3xx), `client_error` (4xx), `server_error` (5xx) ou `exception` (o código lançou erro). No painel de logs da function, filtre pelo texto `server_error`, `exception`, `webhook_signature_invalid` ou pelo nome do evento (`eligibility_failed`, `openai_failed`, `email_send`…). Os logs não têm e-mail, nome nem conteúdo de mensagens.

**Sentry (quando `SENTRY_DSN_BACKEND` estiver definido).** Vão para lá exceções, respostas 5xx, logs de nível `error` e o alerta `webhook_signature_invalid`. Cada evento tem a tag `fn` com o nome da function. Sem o secret, nada é enviado. Configuração na seção 8.

**Stripe.** Em Webhooks → endpoint de produção → entregas de eventos: cada tentativa com o status HTTP que a function respondeu. Em modo live, o Stripe tenta de novo sozinho por até 3 dias.

## 3. Sintoma → causa → ação

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Cliente pagou e não tem acesso | Webhook falhou (5xx) ou não foi entregue | Seção 4 (reenviar o evento). Se não resolver, seção 5 (concessão manual). |
| Muitos `webhook_signature_invalid` | `STRIPE_WEBHOOK_SECRET` diferente do *Signing secret* do endpoint (ex.: segredo rotacionado no Stripe) | Copiar o *Signing secret* do endpoint no Stripe, atualizar o secret no Supabase (seção 8, mesmo procedimento) e reenviar os eventos que falharam (seção 4). |
| Stripe mostra `409 Event is being processed` | Execução anterior ainda processando ou morreu no meio | Esperar: depois de 10 minutos o reenvio retoma o evento sozinho. |
| `config_missing` no log | Secret obrigatório ausente (ex.: `STRIPE_SECRET_KEY`) | Definir o secret (seção 8). A function responde 500 até lá. |
| Erro de CORS no navegador / `origin_not_allowed` | Site servido de uma origem fora da allowlist | Usar o domínio oficial ou incluir a origem em `CORS_ALLOWED_ORIGINS`. |
| Todo mundo com score 0 / "Baixa" | Bug do DI-006 (embed ambíguo, PGRST201) | Deploy do `compute-eligibility` novo e backfill (seção 7). |
| `quiz_conditions_repaired` (aviso) | Migration `20261016000200` ainda não aplicada | Não quebra nada: o servidor usa a regra do código, como o navegador. Aplicar a migration remove o aviso. |

## 4. Reenviar um evento do Stripe

O webhook é idempotente: reenviar nunca duplica pagamento nem e-mail.

- Evento já processado → responde 200 `duplicate` e não faz nada.
- Evento que falhou (500) → a reivindicação foi desfeita; o reenvio processa de novo.
- Evento preso em processamento há mais de 10 minutos → o reenvio retoma.

Passos:

1. Abra <https://dashboard.stripe.com/webhooks>, entre no endpoint de produção e localize o evento (ex.: `checkout.session.completed` do cliente). Anote o `evt_…`.
2. Confira o estado no banco (SQL Editor, só leitura):

   ```sql
   select stripe_event_id, stripe_event_type, status, created_at, processed_at
   from public.payment_events
   where stripe_event_id = 'evt_…';
   ```

   Sem linha: o evento nunca foi processado com sucesso. `processing`: em andamento ou preso. `processed`: já concedido (o problema está em outro lugar; veja a seção 5, passo 1).
3. No evento, clique em **Reenviar** (*Resend*). Pela Stripe CLI, o equivalente é `stripe events resend evt_… --webhook-endpoint we_…` (confira com `stripe events resend --help`).
4. Confira a resposta (200) na própria tela do Stripe e rode de novo a consulta do passo 2: `status` deve ficar `processed`.

Só para reprocessar de propósito um evento já `processed` (ex.: depois de corrigir um bug de concessão): apague a linha dele em `payment_events` e reenvie. As escritas do webhook são upserts, então o reprocessamento não duplica `payments`, mas o e-mail de confirmação é enviado de novo.

## 5. Concessão manual do acesso de €30

Use só quando o reenvio (seção 4) não resolver. Reproduz o que o webhook faz em `grantOneTime`: 30 dias de painel, análise completa e chat contados da data do pagamento.

1. **Confirme o pagamento** em <https://dashboard.stripe.com/payments>: status *Succeeded*. Anote o `pi_…` (PaymentIntent), o `cus_…` (cliente), a data do pagamento e o valor.
2. **Ache a conta** (SQL Editor):

   ```sql
   select public.get_auth_user_id_by_email('email-do-comprador@exemplo.com') as user_id;
   ```

   Sem conta (`null`): prefira reenviar o evento (seção 4), porque o webhook cria a conta e vincula o assessment anônimo. Se mesmo assim precisar criar à mão, use Authentication → Users → *Add user* → *Send invitation* com o mesmo e-mail da compra e rode a consulta de novo.
3. **Conceda o acesso** (troque os valores entre `<>`):

   ```sql
   insert into public.subscriptions (
     user_id, tier, one_time_paid, one_time_paid_at, one_time_payment_amount,
     one_time_access_expires_at, stripe_customer_id, stripe_payment_intent_id,
     has_dashboard_access, has_full_analysis, has_chat_access
   ) values (
     '<user_id>', 'one_time', true, '<data do pagamento, ex.: 2026-10-16T14:00:00Z>', 30.00,
     '<data do pagamento>'::timestamptz + interval '30 days', '<cus_…>', '<pi_…>',
     true, true, true
   )
   on conflict (user_id) do update set
     tier = case when public.subscriptions.recurring_active then 'recurring'::subscription_tier else 'one_time'::subscription_tier end,
     one_time_paid = true,
     one_time_paid_at = excluded.one_time_paid_at,
     one_time_payment_amount = excluded.one_time_payment_amount,
     one_time_access_expires_at = excluded.one_time_access_expires_at,
     stripe_customer_id = coalesce(excluded.stripe_customer_id, public.subscriptions.stripe_customer_id),
     stripe_payment_intent_id = excluded.stripe_payment_intent_id,
     has_dashboard_access = true,
     has_full_analysis = true,
     has_chat_access = true;
   ```

4. **Registre o pagamento** (relatórios e reembolso dependem desta linha):

   ```sql
   insert into public.payments (
     user_id, stripe_payment_intent_id, stripe_customer_id, product,
     amount_cents, currency, status, paid_at, metadata
   ) values (
     '<user_id>', '<pi_…>', '<cus_…>', 'one_time_analysis',
     3000, 'eur', 'succeeded', '<data do pagamento>', '{"manual_grant": "true"}'
   )
   on conflict (stripe_payment_intent_id) do nothing;
   ```

5. **Vincule o resultado do quiz**, se ainda estiver anônimo (o `assessment_id` aparece nos metadados da Checkout Session no Stripe):

   ```sql
   update public.assessments
   set user_id = '<user_id>', updated_at = now()
   where id = '<assessment_id>' and user_id is null;
   ```

6. **Confira** e avise o cliente para entrar em `/login` com o mesmo e-mail da compra:

   ```sql
   select tier, one_time_paid, one_time_access_expires_at, has_dashboard_access, has_chat_access
   from public.subscriptions where user_id = '<user_id>';
   ```

**Revogar** (ex.: reembolso feito fora do Stripe): reembolsos e disputas pelo Stripe já revogam sozinhos via `charge.refunded` / `charge.dispute.created`. À mão: `update public.subscriptions set one_time_paid = false, has_dashboard_access = false, has_full_analysis = false, has_chat_access = recurring_active where user_id = '<user_id>';`

## 6. Ordem de deploy (ação do dono)

Deploy único de todas as functions de produção, uma por uma e sempre pelo nome (nunca `supabase functions deploy` sem nome):

```bash
for fn in compute-eligibility generate-explanation chat-completion send-email; do
  supabase functions deploy "$fn"
done
for fn in stripe-webhook create-checkout-session claim-session; do
  supabase functions deploy "$fn" --no-verify-jwt
done
```

`e2e-login` fica de fora. Dependências de migration (detalhe no cabeçalho de cada `index.ts`): `20261016000100` e `20261016000150` antes do `stripe-webhook`; `20261016000100` antes do `create-checkout-session`; `20261016000100` e `20261016000400` antes do `claim-session`; o `chat-completion` novo **antes** da `20261016000300`. O `compute-eligibility` novo não depende de migration (funciona com as condições incompletas de hoje).

Todas as functions passam a importar `npm:@supabase/supabase-js@2.105.4` e `npm:stripe@14.14.0` (versões exatas) e a usar `Deno.serve`; não há mais imports de `esm.sh` nem de `deno.land/std` no código publicado.

Depois do deploy, confira o CORS (OPTIONS não executa o handler):

```bash
# Origem de terceiro: esperado 403 e nenhum Access-Control-Allow-Origin
curl -si -X OPTIONS https://krjirhlmdnxqqrpzmowz.supabase.co/functions/v1/compute-eligibility \
  -H 'Origin: https://exemplo-invalido.com' -H 'Access-Control-Request-Method: POST' | head -5

# Site oficial: esperado 204 com Access-Control-Allow-Origin: https://www.drimigrante.com
curl -si -X OPTIONS https://krjirhlmdnxqqrpzmowz.supabase.co/functions/v1/compute-eligibility \
  -H 'Origin: https://www.drimigrante.com' -H 'Access-Control-Request-Method: POST' | head -8
```

E faça um quiz completo em <https://www.drimigrante.com/quiz>: o resultado gravado deve ter a mesma categoria mostrada na tela.

## 7. Backfill dos scores (DI-006)

Até o deploy do `compute-eligibility` novo, todo resultado foi gravado como 0 / "baixa". O script `scripts/backfill-scores.mjs` recalcula **só** `score_numeric` e `score_category` com o mesmo motor do servidor. Ele não chama nenhuma function, não usa OpenAI e não regenera análises: as análises já geradas continuam com o texto que a IA escreveu com o score antigo (o script lista quais são).

1. Faça o deploy do `compute-eligibility` novo (seção 6), para não surgirem novos resultados errados.
2. Crie um arquivo **fora do git** (ex.: `~/drimigrante-backfill.env`) com:

   ```
   SUPABASE_URL=https://krjirhlmdnxqqrpzmowz.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role, em Project Settings → API Keys>
   ```

3. Simulação (não grava nada): `node --env-file=$HOME/drimigrante-backfill.env scripts/backfill-scores.mjs`. Confira a tabela "antes → depois".
4. Gravação: o mesmo comando com `--apply` e digite `APLICAR` quando pedir. Para não mexer nos que já têm análise de IA, acrescente `--skip-with-analysis`; para um caso só, `--only <assessment_id>`.
5. Rode a simulação de novo: esperado `Com score diferente do motor: 0`. Apague o arquivo com a chave.

## 8. Secrets e Sentry do backend

Secrets usados pela observabilidade e pelo CORS (todos opcionais):

| Secret | Para quê |
|---|---|
| `SENTRY_DSN_BACKEND` | Liga o envio de erros ao Sentry. Sem ele, só ficam os logs do Supabase. |
| `SENTRY_ENVIRONMENT` | Nome do ambiente no Sentry. Padrão: `production` no projeto de produção, `development` fora dele. |
| `SENTRY_RELEASE` | Versão (ex.: o SHA do commit) para agrupar os erros por deploy. |
| `CORS_ALLOWED_ORIGINS` | Origens extras para o CORS (seção 1). |

Para ligar o Sentry (ação do dono):

1. No Sentry, crie um projeto **separado** do front para as Edge Functions (plataforma JavaScript/Deno ou "Other") e copie o DSN em *Settings → Client Keys (DSN)*.
2. Em <https://supabase.com/dashboard/project/krjirhlmdnxqqrpzmowz/functions/secrets>, adicione `SENTRY_DSN_BACKEND` com o DSN (ou `supabase secrets set SENTRY_DSN_BACKEND=<dsn>`). O mesmo caminho serve para corrigir `STRIPE_WEBHOOK_SECRET` (seção 3).
3. Teste sem afetar clientes, localmente: com o DSN em `supabase/functions/.env`, rode `supabase functions serve stripe-webhook` e mande um POST com `stripe-signature: t=1,v1=teste`. A resposta é 400 e o Sentry recebe `stripe-webhook: webhook_signature_invalid`.

O envio usa a API de envelopes do Sentry via `fetch`, sem SDK: não atrasa a resposta, desiste em 2,5 s e nunca derruba a function. Antes de enviar, chaves sensíveis (e-mail, nome, telefone, token, mensagem, respostas) viram `[filtrado]` e e-mails no texto viram `[email]`.

## 9. Testes locais das functions

```bash
npm test                                                     # Vitest: inclui _shared/*.test.ts (paridade do score, CORS, observabilidade)
deno test --no-lock --node-modules-dir=none supabase/functions   # Deno: handlers com Stripe/Supabase falsos
deno check --no-lock --node-modules-dir=none supabase/functions/*/index.ts
```

`--node-modules-dir=none` evita que o Deno tente resolver os imports `npm:` pelo `node_modules` do front.
