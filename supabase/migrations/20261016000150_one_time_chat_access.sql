-- =====================================================================
-- 20261016000150_one_time_chat_access.sql
-- W1-03 — subscriptions e payment_events para o novo stripe-webhook.
--   DI-012: o €30 inclui o chat IA durante os 30 dias de acesso (opção A,
--           padrão do modelo documentado; se o dono escolher a opção B — chat
--           só no €4,90 — descartar o passo 2 e corrigir os Termos).
--   DI-021: coluna recurring_cancel_at (fim agendado da assinatura: limite de
--           12 ciclos ou cancelamento pelo cliente).
--   DI-020: minimiza o payload legado de payment_events (sem PII).
--
-- ORDEM DE RELEASE: aplicar ANTES do deploy do novo stripe-webhook (ele grava
-- subscriptions.recurring_cancel_at; sem a coluna o upsert falha e o Stripe
-- fica reenviando). Depois de 20261016000100. Idempotente.
-- =====================================================================

-- ─── 1. Fim agendado da assinatura €4,90 (DI-021) ────────────────────────────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS recurring_cancel_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.recurring_cancel_at IS
  'Data em que a assinatura €4,90 termina sozinha (cancel_at do Stripe): '
  'início + 12 meses de calendário, aplicado pelo stripe-webhook, ou antes se o '
  'cliente cancelar. Diferente de recurring_cancelled_at (quando terminou de fato).';

-- ─── 2. Backfill: chat liberado para quem pagou o €30 e ainda está no prazo ──
-- O novo stripe-webhook grava has_chat_access = true em todo pagamento único;
-- aqui corrigimos as compras anteriores. O limite continua sendo
-- one_time_access_expires_at (o frontend e o chat-completion conferem o prazo).
-- Compras legadas sem prazo (expires_at NULL) não são tocadas — em 2026-10-16
-- não havia nenhuma em produção.
UPDATE public.subscriptions
SET has_chat_access = true
WHERE one_time_paid = true
  AND has_chat_access IS DISTINCT FROM true
  AND one_time_access_expires_at IS NOT NULL
  AND one_time_access_expires_at >= now();

-- ─── 3. payment_events: só identificadores e valores (DI-020) ────────────────
-- Até aqui o webhook guardava o evento inteiro do Stripe (nome, e-mail,
-- endereço). Reduz as linhas antigas ao mesmo formato mínimo do código novo.
UPDATE public.payment_events
SET
  stripe_object_id = coalesce(stripe_object_id, payload #>> '{data,object,id}'),
  payload = jsonb_build_object(
    'id',        payload ->> 'id',
    'type',      payload ->> 'type',
    'livemode',  payload -> 'livemode',
    'object_id', payload #>> '{data,object,id}',
    'amount',    coalesce(
                   payload #> '{data,object,amount_total}',
                   payload #> '{data,object,amount_paid}',
                   payload #> '{data,object,amount}'
                 ),
    'currency',  payload #>> '{data,object,currency}'
  )
WHERE payload ? 'data';

-- =====================================================================
-- VERIFICAÇÃO (só leitura, depois de aplicar)
-- =====================================================================
-- Esperado: 0 (pagantes no prazo sem chat)
-- SELECT count(*) FROM public.subscriptions
--  WHERE one_time_paid AND NOT coalesce(has_chat_access, false)
--    AND one_time_access_expires_at >= now();
--
-- Esperado: 0 (payloads completos restantes)
-- SELECT count(*) FROM public.payment_events WHERE payload ? 'data';
--
-- Compras legadas sem prazo (decisão do dono se houver alguma):
-- SELECT count(*) FROM public.subscriptions
--  WHERE one_time_paid AND one_time_access_expires_at IS NULL;
