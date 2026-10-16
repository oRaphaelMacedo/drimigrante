-- =====================================================================
-- 20261016000400_checkout_claims.sql
-- DI-022 (W1-03): o session_id do Stripe vira login automático no máximo
-- UMA vez. O claim-session grava aqui ANTES de gerar o token de magic link;
-- a PK impede uma segunda emissão para a mesma Checkout Session (a repetição
-- cai no caminho de "link por e-mail").
--
-- ORDEM DE RELEASE: aplicar ANTES do deploy do novo claim-session (sem a
-- tabela o insert falha e o pós-pagamento cai no fallback, sem auto-login).
-- Também depende de 20261016000100 (get_auth_user_id_by_email). Idempotente.
--
-- Acesso: só service_role. RLS ligada e nenhuma policy → anon/authenticated
-- não leem nem escrevem.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.checkout_claims (
  stripe_session_id TEXT PRIMARY KEY
    CONSTRAINT checkout_claims_session_id_format
    CHECK (stripe_session_id ~ '^cs_(test|live)_[A-Za-z0-9]+$' AND length(stripe_session_id) <= 255),
  -- SET NULL: apagar a conta (ex.: pedido de exclusão) não libera um novo token.
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.checkout_claims IS
  'DI-022: Checkout Sessions do Stripe já trocadas por login automático (uso único). '
  'Escrita só pelo claim-session (service_role).';

CREATE INDEX IF NOT EXISTS idx_checkout_claims_user_id
  ON public.checkout_claims (user_id);

ALTER TABLE public.checkout_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.checkout_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.checkout_claims TO service_role;

-- =====================================================================
-- VERIFICAÇÃO (só leitura, depois de aplicar)
-- =====================================================================
-- Esperado: true, false, false
-- SELECT
--   relrowsecurity,
--   has_table_privilege('anon', 'public.checkout_claims', 'SELECT'),
--   has_table_privilege('authenticated', 'public.checkout_claims', 'INSERT')
-- FROM pg_class WHERE oid = 'public.checkout_claims'::regclass;
