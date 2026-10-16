-- =====================================================================
-- 20261016000100_profiles_hardening_email_resolver.sql
-- DI-002 (W1-03): sequestro de compra via profiles.email / tenant_id editáveis.
--
-- ORDEM DE RELEASE (NÃO aplicar fora desta ordem):
--   1. 20261016000000_fix_is_hub_user_rls.sql (W1-02)
--   2. ESTA migration
--   3. deploy de stripe-webhook, claim-session e create-checkout-session
--      (as três chamam public.get_auth_user_id_by_email, criada aqui; o código
--      antigo continua funcionando com esta migration aplicada, porque só lia
--      profiles.email)
--   claim-session também depende de 20261016000400_checkout_claims.sql.
--
-- O que faz (idempotente — pode rodar mais de uma vez):
--   1. Cliente (anon/authenticated) deixa de poder INSERT/UPDATE/DELETE em
--      profiles; UPDATE volta só nas colunas que a SettingsPage edita
--      (full_name, phone, avatar_url, language, timezone,
--      notification_preferences, updated_at). email, tenant_id, is_active,
--      id e last_login_at ficam só para o service_role / funções do banco.
--   2. Ressincroniza profiles.email a partir de auth.users (desfaz trocas).
--   3. Índice único em lower(email).
--   4. RPC get_auth_user_id_by_email(text) → uuid, só para service_role:
--      o webhook e o claim-session resolvem o comprador por auth.users.
--   5. Trigger que mantém profiles.email igual a auth.users.email.
-- =====================================================================

-- ─── 1. Privilégios por coluna em profiles ───────────────────────────────────
-- REVOKE no nível da tabela também remove privilégios por coluna anteriores.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (
  full_name,
  phone,
  avatar_url,
  language,
  timezone,
  notification_preferences,
  updated_at
) ON public.profiles TO authenticated;

-- ─── 2. profiles.email = auth.users.email ────────────────────────────────────
UPDATE public.profiles AS p
SET email = lower(u.email)
FROM auth.users AS u
WHERE u.id = p.id
  AND u.email IS NOT NULL
  AND p.email IS DISTINCT FROM lower(u.email);

-- ─── 3. E-mail único (sem diferenciar maiúsculas) ────────────────────────────
DO $$
DECLARE
  v_duplicates integer;
BEGIN
  SELECT count(*) INTO v_duplicates
  FROM (
    SELECT 1
    FROM public.profiles
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) AS d;

  IF v_duplicates > 0 THEN
    RAISE EXCEPTION
      'profiles: % e-mail(s) duplicado(s) sem diferenciar maiúsculas. Resolva antes de aplicar (consulta de verificação no fim do arquivo).',
      v_duplicates;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_key
  ON public.profiles (lower(email));

-- ─── 4. Resolver de comprador por e-mail (service_role) ──────────────────────
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM auth.users AS u
  WHERE p_email IS NOT NULL
    AND lower(u.email) = lower(btrim(p_email))
    AND u.deleted_at IS NULL
    AND coalesce(u.is_sso_user, false) = false
  ORDER BY u.created_at
  LIMIT 1
$$;

COMMENT ON FUNCTION public.get_auth_user_id_by_email(text) IS
  'DI-002: id do usuário do Supabase Auth com este e-mail (sem diferenciar maiúsculas). '
  'Fonte de verdade para o stripe-webhook, claim-session e create-checkout-session. '
  'Executável só pelo service_role.';

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO service_role;

-- ─── 5. Sincronização auth.users.email → profiles.email ──────────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NOT NULL THEN
    UPDATE public.profiles
    SET email = lower(NEW.email)
    WHERE id = NEW.id
      AND email IS DISTINCT FROM lower(NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email_from_auth();

-- =====================================================================
-- VERIFICAÇÃO (rodar manualmente no SQL Editor depois de aplicar; só leitura)
-- =====================================================================
-- Esperado: false, false, false, true, true
-- SELECT
--   has_column_privilege('authenticated', 'public.profiles', 'email',     'UPDATE') AS email_editavel,
--   has_column_privilege('authenticated', 'public.profiles', 'tenant_id', 'UPDATE') AS tenant_editavel,
--   has_column_privilege('authenticated', 'public.profiles', 'is_active', 'UPDATE') AS ativo_editavel,
--   has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') AS nome_editavel,
--   has_function_privilege('service_role', 'public.get_auth_user_id_by_email(text)', 'EXECUTE') AS rpc_service_role;
--
-- Esperado: false (cliente não executa o resolver)
-- SELECT has_function_privilege('authenticated', 'public.get_auth_user_id_by_email(text)', 'EXECUTE');
--
-- Esperado: 0 linhas (e-mails duplicados)
-- SELECT lower(email), count(*) FROM public.profiles GROUP BY 1 HAVING count(*) > 1;
--
-- Teste com JWT de cliente (REST): PATCH /rest/v1/profiles?id=eq.<uid> {"email":"x@y.z"}
--   → 42501 permission denied; {"full_name":"Novo nome"} → 204.
