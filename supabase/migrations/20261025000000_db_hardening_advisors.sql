-- =====================================================================
-- 20261025000000_db_hardening_advisors.sql
-- DI-081 (P2, segurança): zera os avisos de segurança do Supabase (advisors).
--
-- Problema (get_advisors(security) e role_table_grants em 16/10/2026)
--   · 0011 function_search_path_mutable: handle_updated_at,
--     prevent_activity_modification, prevent_audit_modification,
--     update_updated_at_column (e get_user_tenant_id antes da DI-001).
--   · 0028/0029 security definer executável por anon/authenticated via
--     /rest/v1/rpc: os helpers de autorização (is_hub_user, has_role,
--     get_user_tenant_id, is_hub_admin…) e as funções de trigger
--     (handle_new_user, log_ai_config_changes…). Ex.: qualquer visitante
--     chamava /rpc/is_hub_user e /rpc/get_user_tenant_id.
--   · 0008 rls_enabled_no_policy: countries, email_templates, rule_versions,
--     visa_categories e visa_types (e checkout_claims, da 20261016000400).
--   · anon com SELECT/INSERT/UPDATE/DELETE/TRUNCATE em todas as tabelas
--     (privilégios padrão do Supabase); só a RLS segurava.
--
-- Correção
--   1. Schema `private` (fora da Data API: o PostgREST só expõe public e
--      graphql_public). Ninguém além do dono tem USAGE nele. Os helpers
--      criados/corrigidos na DI-001 (20261016000000) e na DI-016
--      (20261020000000) são recriados lá, com `SET search_path = ''`:
--        private.is_hub_user, private.is_staff_user, private.can_access_tenant,
--        private.can_access_tenant_folder, private.is_hub_admin,
--        private.get_user_tenant_id, private.has_role e private.has_active_access.
--      As policies continuam funcionando sem USAGE no schema: guardam o OID
--      da função e só exigem EXECUTE, concedido a authenticated (e
--      service_role). Uma chamada direta (SQL/GraphQL) dá "permission denied
--      for schema private".
--   2. Todas as policies de public e storage que citavam os helpers de public
--      passam a citar os de private (ALTER POLICY: nome, comando e papéis
--      ficam iguais). São 35 hoje, entre elas: ai_configurations,
--      assessment_results, assessments, audit_log, case_*, cases, crm_*,
--      email_send_log, form_*, payment_events, profiles, subscriptions,
--      tenants, user_documents, user_roles e storage.objects (case-documents,
--      user-documents). Um bloco no fim confere que nenhuma sobrou.
--   3. Funções que chamavam os helpers de public por nome são recriadas
--      chamando os de private: get_full_analysis, snapshot_quiz_version,
--      guard_profile_protected_columns e guard_user_document_review_fields.
--   4. Os helpers de public são APAGADOS (sem CASCADE: se algo ainda depender
--      deles, a migration falha em vez de quebrar a RLS). /rpc/is_hub_user
--      passa a responder 404. Exceção: public.has_active_access continua
--      existindo como casca SECURITY INVOKER, executável SÓ pela service_role,
--      porque o generate-explanation (DI-018, W3-05) chama
--      rpc('has_active_access') com a service role.
--   5. search_path fixo ('') nas 4 funções de trigger que não tinham.
--   6. REVOKE EXECUTE de PUBLIC/anon/authenticated em toda função de public
--      fora da allowlist abaixo (inclui todas as funções de trigger; trigger
--      não exige EXECUTE de quem dispara).
--        upsert_anon_assessment, get_anon_assessment ... anon + authenticated
--        get_assessment_by_resume_token (W3-01, criada depois) ... não é tocada
--        link_anon_assessment_to_user, snapshot_quiz_version,
--        get_full_analysis ................................ authenticated
--        has_active_access, get_auth_user_id_by_email ...... service_role
--      Essas 5 RPCs de cliente continuam aparecendo nos lints 0028/0029: são
--      públicas de propósito e validam posse/papel por dentro.
--   7. Tabelas: RLS + policies de leitura nas 5 tabelas sem policy (equipe
--      lê as tabelas de referência; HUB lê email_templates), policy explícita
--      de negação em checkout_claims, REVOKE ALL de anon em todas as tabelas
--      de public, exceto SELECT nas 3 tabelas do quiz (form_themes,
--      form_questions, form_question_options), e REVOKE de TRUNCATE,
--      REFERENCES e TRIGGER de authenticated (TRUNCATE ignora a RLS).
--      Os privilégios padrão de tabelas/sequências novas criadas por postgres
--      em public deixam de incluir anon (e TRUNCATE/REFERENCES/TRIGGER para
--      authenticated). Funções novas continuam com o padrão do Supabase
--      (EXECUTE para anon/authenticated): toda migration que criar função em
--      public deve fazer REVOKE/GRANT explícitos (docs/operacao/release.md).
--
-- Dependências e ORDEM DE RELEASE
--   · Depois de TODAS as migrations até 20261020000000 (usa colunas e funções
--     criadas nelas) e antes de 20261025000100_anon_rpc_limits.sql.
--   · Front: nenhum código do app chama os helpers apagados (só RPCs da
--     allowlist). Edge Functions usam a service role; a única chamada a helper
--     é rpc('has_active_access'), que continua existindo.
--   · Migrations posteriores (W3-01 em diante) devem citar private.is_hub_user,
--     private.is_staff_user etc. Citar public.is_hub_user(...) passa a falhar.
--
-- Idempotente: CREATE OR REPLACE, DROP ... IF EXISTS, DROP/CREATE POLICY e
-- ALTER POLICY só nas que ainda citam public. Rodar como um bloco único
-- (SQL Editor ou `psql -1 -f`): se algo falhar, nada fica pela metade.
-- NÃO APLICAR sem validar no Supabase local (consultas no fim do arquivo).
-- Conferido em Postgres 17.6 + PostgREST 14.10 locais e descartáveis, com
-- todas as migrations anteriores aplicadas.
-- =====================================================================

-- ─── 1. Schema private ───────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS private;
COMMENT ON SCHEMA private IS
  'Helpers de autorização usados pela RLS. Fora da Data API (PostgREST/GraphQL). '
  'Sem USAGE para anon/authenticated: as policies só precisam de EXECUTE.';
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

-- ─── 2. Helpers em private ───────────────────────────────────────────────────
-- Mesmas regras da DI-001 e da DI-016, com nomes totalmente qualificados.

CREATE OR REPLACE FUNCTION private.is_hub_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin', 'hub_admin')
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  );
$$;

COMMENT ON FUNCTION private.is_hub_user(UUID) IS
  'Administrador do HUB: papel super_admin ou hub_admin em user_roles, não expirado.';

CREATE OR REPLACE FUNCTION private.is_staff_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin', 'hub_admin', 'lawyer', 'paralegal')
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  );
$$;

COMMENT ON FUNCTION private.is_staff_user(UUID) IS
  'Equipe da plataforma: super_admin, hub_admin, lawyer ou paralegal, não expirado. '
  'Espelha isStaffUser do AuthContext.';

CREATE OR REPLACE FUNCTION private.can_access_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND (
      private.is_hub_user(_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = _user_id
          AND ur.tenant_id = _tenant_id
          AND ur.role IN ('super_admin', 'hub_admin', 'office_admin', 'lawyer', 'paralegal')
          AND (ur.expires_at IS NULL OR ur.expires_at > now())
      )
    );
$$;

COMMENT ON FUNCTION private.can_access_tenant(UUID, UUID) IS
  'Acesso de equipe aos dados de um tenant: admin do HUB ou papel de equipe no próprio '
  'tenant. O papel client nunca dá acesso ao tenant.';

CREATE OR REPLACE FUNCTION private.can_access_tenant_folder(_user_id UUID, _folder TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN _folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN private.can_access_tenant(_user_id, _folder::UUID)
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION private.can_access_tenant_folder(UUID, TEXT) IS
  'can_access_tenant para a 1ª pasta de um objeto do Storage (texto com o tenant_id).';

CREATE OR REPLACE FUNCTION private.is_hub_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_hub_user(auth.uid());
$$;

COMMENT ON FUNCTION private.is_hub_admin() IS
  'is_hub_user do usuário da requisição (policies do editor do quiz).';

CREATE OR REPLACE FUNCTION private.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.tenant_id FROM public.profiles p WHERE p.id = _user_id;
$$;

CREATE OR REPLACE FUNCTION private.has_role(
  _user_id UUID,
  _role public.app_role,
  _tenant_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (_tenant_id IS NULL OR ur.tenant_id = _tenant_id)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION private.has_active_access(_user_id UUID, _feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  s public.subscriptions%ROWTYPE;
  grants_access BOOLEAN;
BEGIN
  IF _user_id IS NULL
     OR _feature IS NULL
     OR _feature NOT IN ('dashboard', 'full_analysis', 'chat', 'documents_read', 'documents_upload') THEN
    RETURN FALSE;
  END IF;

  -- Staff (super_admin, hub_admin, lawyer, paralegal) nunca expira.
  IF private.is_staff_user(_user_id) THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO s FROM public.subscriptions sub WHERE sub.user_id = _user_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Assinatura €4,90 ativa: tudo liberado enquanto ativa.
  IF coalesce(s.recurring_active, FALSE) THEN
    RETURN TRUE;
  END IF;

  grants_access := coalesce(s.has_dashboard_access, FALSE) OR coalesce(s.has_full_analysis, FALSE);

  -- Nunca pagou (ou pagamento revogado sem nenhuma flag).
  IF NOT coalesce(s.one_time_paid, FALSE) AND NOT grants_access THEN
    RETURN FALSE;
  END IF;

  -- €30 expirado: só a leitura dos próprios documentos continua.
  IF s.one_time_access_expires_at IS NOT NULL AND now() > s.one_time_access_expires_at THEN
    RETURN _feature = 'documents_read';
  END IF;

  -- Pagou, mas as flags foram revogadas dentro do prazo (reembolso/disputa).
  IF NOT grants_access THEN
    RETURN FALSE;
  END IF;

  RETURN CASE _feature
    WHEN 'full_analysis' THEN coalesce(s.has_full_analysis, FALSE)
    WHEN 'chat'          THEN coalesce(s.has_chat_access, FALSE)
    ELSE                      coalesce(s.has_dashboard_access, FALSE)
  END;
END;
$$;

COMMENT ON FUNCTION private.has_active_access(UUID, TEXT) IS
  'Acesso vigente a uma funcionalidade (dashboard, full_analysis, chat, documents_read, '
  'documents_upload). Espelha hasFeatureAccess de src/lib/access.ts.';

-- EXECUTE: authenticated precisa dos helpers usados nas policies (avaliadas
-- com o papel de quem consulta). anon não: depois da seção 7 ele não tem
-- privilégio nas tabelas cujas policies os usam. has_active_access não entra
-- em policy: só a service_role (via public.has_active_access).
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  private.is_hub_user(UUID),
  private.is_staff_user(UUID),
  private.can_access_tenant(UUID, UUID),
  private.can_access_tenant_folder(UUID, TEXT),
  private.is_hub_admin(),
  private.get_user_tenant_id(UUID),
  private.has_role(UUID, public.app_role, UUID)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_active_access(UUID, TEXT) TO service_role;

-- ─── 3. Policies: helpers de public → private ───────────────────────────────
-- Reescreve só a expressão (USING / WITH CHECK). O padrão não casa com nomes
-- já qualificados por outro schema (ex.: private.is_hub_user), então rodar de
-- novo não altera nada.

DO $$
DECLARE
  helper_re CONSTANT TEXT :=
    '(?<![[:alnum:]_.])(public\.)?(is_hub_user|is_staff_user|can_access_tenant_folder|can_access_tenant|is_hub_admin|get_user_tenant_id|has_role|has_active_access)\(';
  pol RECORD;
  stmt TEXT;
  remaining INT;
BEGIN
  -- Mesmo search_path no deparse (pg_policies) e no parse (ALTER POLICY).
  PERFORM set_config('search_path', 'public, extensions', true);

  FOR pol IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_catalog.pg_policies
    WHERE schemaname IN ('public', 'storage')
      AND (coalesce(qual, '') ~ helper_re OR coalesce(with_check, '') ~ helper_re)
    ORDER BY schemaname, tablename, policyname
  LOOP
    stmt := format('ALTER POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    IF pol.qual IS NOT NULL THEN
      stmt := stmt || ' USING (' || regexp_replace(pol.qual, helper_re, 'private.\2(', 'g') || ')';
    END IF;
    IF pol.with_check IS NOT NULL THEN
      stmt := stmt || ' WITH CHECK (' || regexp_replace(pol.with_check, helper_re, 'private.\2(', 'g') || ')';
    END IF;
    EXECUTE stmt;
  END LOOP;

  SELECT count(*) INTO remaining
  FROM pg_catalog.pg_policies
  WHERE (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ helper_re;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'DI-081: % policies ainda citam helpers de public', remaining;
  END IF;
END
$$;

-- ─── 4. Funções que chamavam os helpers de public ────────────────────────────

-- DI-016: única leitura da análise completa por um cliente (allowlist).
CREATE OR REPLACE FUNCTION public.get_full_analysis(p_assessment_id UUID)
RETURNS TABLE (
  assessment_id UUID,
  ia_explanation_full TEXT,
  computed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;

  IF p_assessment_id IS NULL THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'PT404';
  END IF;

  SELECT a.user_id INTO v_owner FROM public.assessments a WHERE a.id = p_assessment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'PT404';
  END IF;

  -- Assessment de outra pessoa (ou ainda anônimo): mesma resposta de "não existe".
  IF v_owner IS DISTINCT FROM v_uid AND NOT private.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'PT404';
  END IF;

  IF NOT private.has_active_access(v_uid, 'full_analysis') THEN
    RAISE EXCEPTION 'Payment required' USING ERRCODE = 'PT402';
  END IF;

  RETURN QUERY
    SELECT r.assessment_id, r.ia_explanation_full, r.computed_at
    FROM public.assessment_results r
    WHERE r.assessment_id = p_assessment_id;
END;
$$;

-- Editor do quiz: snapshot antes de editar (só admin do HUB; allowlist).
CREATE OR REPLACE FUNCTION public.snapshot_quiz_version(p_label TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_next_num INT;
  v_snapshot JSONB;
BEGIN
  IF NOT private.is_hub_admin() THEN
    RAISE EXCEPTION 'Permission denied: hub admin required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'themes', COALESCE((SELECT jsonb_agg(t ORDER BY t.sort_order) FROM public.form_themes t), '[]'::jsonb),
    'questions', COALESCE((SELECT jsonb_agg(q ORDER BY q.sort_order) FROM public.form_questions q), '[]'::jsonb),
    'options', COALESCE((SELECT jsonb_agg(o ORDER BY o.question_id, o.sort_order) FROM public.form_question_options o), '[]'::jsonb)
  ) INTO v_snapshot;

  SELECT COALESCE(MAX(fv.version_number), 0) + 1 INTO v_next_num FROM public.form_versions fv;

  INSERT INTO public.form_versions (
    version_number, name, description, schema_snapshot,
    is_active, published_at, published_by
  ) VALUES (
    v_next_num,
    COALESCE(p_label, 'Snapshot v' || v_next_num),
    'Auto-snapshot before edit',
    v_snapshot,
    FALSE,
    now(),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- DI-001: campos do perfil que o próprio cliente não altera.
CREATE OR REPLACE FUNCTION public.guard_profile_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR private.is_hub_user(v_uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'Campos protegidos do perfil não podem ser alterados pelo usuário'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- DI-023: status/feedback/dono/caminho do documento só pela equipe.
CREATE OR REPLACE FUNCTION public.guard_user_document_review_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR private.is_staff_user(v_uid) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'uploaded' OR NEW.feedback IS NOT NULL THEN
      RAISE EXCEPTION 'Status e feedback do documento são definidos pela equipe'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id IS DISTINCT FROM v_uid
       OR left(NEW.storage_path, 37) IS DISTINCT FROM (v_uid::TEXT || '/')
    THEN
      RAISE EXCEPTION 'O documento deve ficar na pasta do próprio usuário'
        USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status       IS DISTINCT FROM OLD.status
       OR NEW.feedback     IS DISTINCT FROM OLD.feedback
       OR NEW.user_id      IS DISTINCT FROM OLD.user_id
       OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
    THEN
      RAISE EXCEPTION 'Status, feedback, dono e caminho do documento não podem ser alterados pelo usuário'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- generate-explanation (DI-018) chama rpc('has_active_access') com a service
-- role. Casca SECURITY INVOKER (fora dos lints 0028/0029) com corpo
-- SQL-padrão: a referência a private fica gravada (pg_depend) e não precisa
-- de USAGE no schema em tempo de execução.
CREATE OR REPLACE FUNCTION public.has_active_access(_user_id UUID, _feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
BEGIN ATOMIC
  SELECT private.has_active_access(_user_id, _feature);
END;

COMMENT ON FUNCTION public.has_active_access(UUID, TEXT) IS
  'Casca de private.has_active_access para as Edge Functions (service_role). '
  'Clientes não executam.';

REVOKE ALL ON FUNCTION public.has_active_access(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_access(UUID, TEXT) TO service_role;

-- ─── 5. Helpers de public: apagados ──────────────────────────────────────────
-- Sem CASCADE de propósito: se ainda houver policy, view ou função com
-- dependência registrada, a migration para aqui.

DROP FUNCTION IF EXISTS public.can_access_tenant_folder(UUID, TEXT);
DROP FUNCTION IF EXISTS public.can_access_tenant(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_hub_admin();
DROP FUNCTION IF EXISTS public.is_staff_user(UUID);
DROP FUNCTION IF EXISTS public.is_hub_user(UUID);
DROP FUNCTION IF EXISTS public.get_user_tenant_id(UUID);
DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role, UUID);

-- ─── 6. search_path fixo e EXECUTE com allowlist ─────────────────────────────

-- Funções de trigger sem search_path (0011). Só usam NEW, now() e RAISE.
ALTER FUNCTION public.handle_updated_at() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.prevent_activity_modification() SET search_path = '';
ALTER FUNCTION public.prevent_audit_modification() SET search_path = '';

-- Toda função de public fora da allowlist perde o EXECUTE dos clientes
-- (funções de extensões instaladas em public, se houver, ficam de fora).
DO $$
DECLARE
  allowlist CONSTANT TEXT[] := ARRAY[
    'upsert_anon_assessment',
    'get_anon_assessment',
    'link_anon_assessment_to_user',
    'snapshot_quiz_version',
    'get_full_analysis',
    'get_assessment_by_resume_token'
  ];
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_catalog.pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind IN ('f', 'p')
      AND NOT (p.proname = ANY (allowlist))
      AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_depend d
        WHERE d.classid = 'pg_catalog.pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
  END LOOP;
END
$$;

-- RPCs da allowlist: EXECUTE só para quem usa.
REVOKE ALL ON FUNCTION public.upsert_anon_assessment(
  TEXT, JSONB, TEXT, TEXT, TEXT, INT, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_anon_assessment(
  TEXT, JSONB, TEXT, TEXT, TEXT, INT, INT, NUMERIC, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_anon_assessment(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_anon_assessment(UUID, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.link_anon_assessment_to_user(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_anon_assessment_to_user(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.snapshot_quiz_version(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_quiz_version(TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_full_analysis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_full_analysis(UUID) TO authenticated, service_role;

-- ─── 7. Tabelas ──────────────────────────────────────────────────────────────

-- 7.1 RLS nas tabelas de referência (em produção já ligada pelo painel; no
-- Supabase local, não). Leitura só da equipe; escrita só da service_role.
ALTER TABLE public.countries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visa_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS countries_staff_read ON public.countries;
CREATE POLICY countries_staff_read ON public.countries
  FOR SELECT TO authenticated
  USING (private.is_staff_user((SELECT auth.uid())));

DROP POLICY IF EXISTS visa_categories_staff_read ON public.visa_categories;
CREATE POLICY visa_categories_staff_read ON public.visa_categories
  FOR SELECT TO authenticated
  USING (private.is_staff_user((SELECT auth.uid())));

DROP POLICY IF EXISTS visa_types_staff_read ON public.visa_types;
CREATE POLICY visa_types_staff_read ON public.visa_types
  FOR SELECT TO authenticated
  USING (private.is_staff_user((SELECT auth.uid())));

DROP POLICY IF EXISTS rule_versions_staff_read ON public.rule_versions;
CREATE POLICY rule_versions_staff_read ON public.rule_versions
  FOR SELECT TO authenticated
  USING (private.is_staff_user((SELECT auth.uid())));

-- O painel do admin mostra o modelo do último e-mail com falha
-- (email_send_log → email_templates(trigger_key)).
DROP POLICY IF EXISTS email_templates_hub_read ON public.email_templates;
CREATE POLICY email_templates_hub_read ON public.email_templates
  FOR SELECT TO authenticated
  USING (private.is_hub_user((SELECT auth.uid())));

REVOKE INSERT, UPDATE, DELETE ON
  public.countries, public.visa_categories, public.visa_types,
  public.rule_versions, public.email_templates
FROM authenticated;

-- 7.2 checkout_claims (DI-022): só service_role. A policy deixa a intenção
-- explícita (e tira o aviso 0008); o REVOKE da 20261016000400 continua valendo.
DROP POLICY IF EXISTS checkout_claims_no_client_access ON public.checkout_claims;
CREATE POLICY checkout_claims_no_client_access ON public.checkout_claims
  FOR ALL TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

-- 7.3 anon: nada nas tabelas de public, exceto ler o quiz publicado. Todo o
-- resto do visitante passa pelas RPCs da allowlist (SECURITY DEFINER).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT SELECT ON public.form_themes, public.form_questions, public.form_question_options TO anon;

-- 7.4 authenticated: sem TRUNCATE (ignora a RLS), REFERENCES e TRIGGER.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;

-- 7.5 Objetos novos criados por postgres em public não voltam a dar tudo a anon.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- =====================================================================
-- VERIFICAÇÃO (só leitura; rodar à parte depois de aplicar)
-- =====================================================================
-- 1) Nada de helper em public; helpers em private (esperado: 0 e 8):
--    SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('is_hub_user','is_staff_user','can_access_tenant',
--                      'can_access_tenant_folder','is_hub_admin','get_user_tenant_id','has_role');
--    SELECT count(*) FROM pg_proc WHERE pronamespace = 'private'::regnamespace;
--
-- 2) SECURITY DEFINER de public executável por anon/authenticated (esperado:
--    só as RPCs da allowlist):
--    SELECT p.proname,
--           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
--    FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
--      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
--           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
--    ORDER BY 1;
--
-- 3) Funções de public sem search_path fixo (esperado: 0 linhas):
--    SELECT proname FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace AND prokind = 'f'
--      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(proconfig, '{}')) c WHERE c LIKE 'search_path=%');
--
-- 4) Tabelas com RLS sem policy ou sem RLS (esperado: 0 linhas):
--    SELECT c.relname, c.relrowsecurity FROM pg_class c
--    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
--      AND (NOT c.relrowsecurity
--           OR NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname));
--
-- 5) Privilégios de anon em tabelas (esperado: SELECT em form_themes,
--    form_questions e form_question_options, e nada mais):
--    SELECT table_name, privilege_type FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND grantee = 'anon' ORDER BY 1, 2;
--
-- 6) HTTP (Supabase local): POST /rest/v1/rpc/is_hub_user com a anon key
--    → 404 (PGRST202). POST /rest/v1/rpc/upsert_anon_assessment continua 200.
--    Depois, em produção: Advisors → Security (get_advisors) sem os itens acima;
--    sobram só os avisos 0028/0029 das RPCs da allowlist e o aviso do Auth
--    (proteção contra senha vazada: ação manual do dono).
-- =====================================================================
