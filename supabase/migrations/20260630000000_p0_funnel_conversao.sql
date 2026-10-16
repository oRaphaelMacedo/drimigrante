-- =====================================================================
-- 20260630000000_p0_funnel_conversao.sql
-- P0 (2026-06-30): funnel 1-clique + modelo comercial sequencial.
--
-- Decisões do stakeholder (Raphael):
--  · Acesso €30 (one-time) passa a ter PRAZO (não vitalício) — default 30 dias.
--  · Subscription €4,90 fica capped a 12 ciclos (tratado no create-checkout-session
--    via subscription_data.cancel_at; nada a alterar no schema).
--  · €4,90 só é vendável a quem já pagou €30 (guard no create-checkout-session).
--
-- Esta migration apenas adiciona a coluna de expiração do acesso one-time.
-- O auto-login pós-pagamento usa magic link admin (generateLink) — sem tabela própria.
-- =====================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS one_time_access_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.subscriptions.one_time_access_expires_at IS
  'Expiração do acesso one-time (€30). NULL = sem expiração / acesso recorrente. '
  'Definido pelo stripe-webhook como one_time_paid_at + 30 dias. '
  'O gate de acesso (hasAccess) considera expirado quando now() > este valor e '
  'recurring_active = false.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_one_time_expires
  ON public.subscriptions (one_time_access_expires_at);
