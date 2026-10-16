-- =====================================================================
-- 20261016000000_fix_is_hub_user_rls.sql
-- DI-001 (P0, segurança): is_hub_user tratava todo cliente como admin do HUB.
--
-- Problema
--   is_hub_user(uid) decidia pelo TIPO do tenant do perfil (t.type = 'hub') e
--   handle_new_user coloca todo usuário novo no único tenant 'hub'. Resultado:
--   qualquer conta passava em is_hub_user e lia PII/análises de todos, fazia
--   UPDATE na própria subscription e alterava ai_configurations, tenants, CRM
--   e cases. Além disso, as policies com `tenant_id = get_user_tenant_id(uid)`
--   davam a todo cliente acesso a tudo o que pertence ao tenant 'hub'.
--
-- Correção (padrão "staff")
--   · is_hub_user(uid)        → papel super_admin/hub_admin em user_roles, não
--                               expirado (independe do tenant do perfil).
--   · is_staff_user(uid)      → is_hub_user + lawyer/paralegal (mesma definição
--                               de isStaffUser no AuthContext do front).
--   · can_access_tenant(uid,t)→ HUB, ou papel de equipe (office_admin, lawyer,
--                               paralegal, hub_admin, super_admin) NAQUELE tenant.
--                               O papel 'client' nunca dá acesso ao tenant.
--   · Policies que usavam get_user_tenant_id passam a usar can_access_tenant.
--   · subscriptions: UPDATE só do HUB (USING + WITH CHECK).
--   · profiles: cliente não altera id, tenant_id, email nem is_active do
--     próprio perfil (o stripe-webhook e o claim-session resolvem o usuário
--     por profiles.email; trocar o e-mail permitiria desviar uma compra).
--
-- Compatibilidade
--   · Idempotente: CREATE OR REPLACE nas funções (mesma assinatura e mesmo
--     nome de parâmetro `_user_id`), DROP POLICY IF EXISTS + CREATE POLICY e
--     DROP TRIGGER IF EXISTS + CREATE TRIGGER. Pode rodar depois do hotfix
--     mínimo de is_hub_user aplicado direto em produção.
--   · Todas as funções SECURITY DEFINER têm `SET search_path = public`.
--
-- NÃO APLICAR sem validar antes no Supabase local (ver docs/testes.md).
-- Consultas de verificação no fim do arquivo (comentadas).
-- =====================================================================

-- ─── 1. Funções de autorização ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_hub_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin', 'hub_admin')
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  );
$$;

COMMENT ON FUNCTION public.is_hub_user(UUID) IS
  'Administrador do HUB: papel super_admin ou hub_admin em user_roles, não expirado. '
  'Não depende do tenant do perfil (todo cliente fica no tenant hub).';

CREATE OR REPLACE FUNCTION public.is_staff_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('super_admin', 'hub_admin', 'lawyer', 'paralegal')
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  );
$$;

COMMENT ON FUNCTION public.is_staff_user(UUID) IS
  'Equipe da plataforma: super_admin, hub_admin, lawyer ou paralegal, não expirado. '
  'Espelha isStaffUser do AuthContext.';

CREATE OR REPLACE FUNCTION public.can_access_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
    AND _tenant_id IS NOT NULL
    AND (
      public.is_hub_user(_user_id)
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

COMMENT ON FUNCTION public.can_access_tenant(UUID, UUID) IS
  'Acesso de equipe aos dados de um tenant: admin do HUB ou papel de equipe '
  '(office_admin, lawyer, paralegal, hub_admin, super_admin) no próprio tenant. '
  'O papel client nunca dá acesso ao tenant.';

-- Variante para caminhos do Storage: a 1ª pasta do objeto é o tenant_id.
-- Converte o texto para UUID com segurança (pasta inválida → false, sem erro).
CREATE OR REPLACE FUNCTION public.can_access_tenant_folder(_user_id UUID, _folder TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _folder ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.can_access_tenant(_user_id, _folder::UUID)
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION public.can_access_tenant_folder(UUID, TEXT) IS
  'can_access_tenant para a 1ª pasta de um objeto do Storage (texto com o tenant_id).';

-- is_hub_admin() (usada pelas policies do editor do quiz) passa a ter a mesma
-- regra de is_hub_user, incluindo a validade do papel.
CREATE OR REPLACE FUNCTION public.is_hub_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_hub_user(auth.uid());
$$;

-- get_user_tenant_id não tinha search_path fixo (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.tenant_id FROM public.profiles p WHERE p.id = _user_id;
$$;

-- ─── 2. profiles ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR public.can_access_tenant((SELECT auth.uid()), tenant_id)
  );

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE TO authenticated
  USING      (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Campos que o próprio cliente não pode alterar. service_role/postgres
-- (auth.uid() nulo) e admins do HUB passam.
CREATE OR REPLACE FUNCTION public.guard_profile_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.is_hub_user(v_uid) THEN
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

DROP TRIGGER IF EXISTS guard_profile_protected_columns ON public.profiles;
CREATE TRIGGER guard_profile_protected_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_columns();

-- ─── 3. tenants ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenants_read ON public.tenants;
CREATE POLICY tenants_read ON public.tenants
  FOR SELECT TO authenticated
  USING (public.can_access_tenant((SELECT auth.uid()), id));

DROP POLICY IF EXISTS tenants_hub_write ON public.tenants;
CREATE POLICY tenants_hub_write ON public.tenants
  FOR ALL TO authenticated
  USING      (public.is_hub_user((SELECT auth.uid())))
  WITH CHECK (public.is_hub_user((SELECT auth.uid())));

-- ─── 4. CRM ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS crm_leads_tenant_read ON public.crm_leads;
CREATE POLICY crm_leads_tenant_read ON public.crm_leads
  FOR SELECT TO authenticated
  USING (public.can_access_tenant((SELECT auth.uid()), assigned_tenant_id));

DROP POLICY IF EXISTS crm_leads_tenant_write ON public.crm_leads;
CREATE POLICY crm_leads_tenant_write ON public.crm_leads
  FOR ALL TO authenticated
  USING      (public.can_access_tenant((SELECT auth.uid()), assigned_tenant_id))
  WITH CHECK (public.can_access_tenant((SELECT auth.uid()), assigned_tenant_id));

DROP POLICY IF EXISTS crm_activity_read ON public.crm_activity_log;
CREATE POLICY crm_activity_read ON public.crm_activity_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = crm_activity_log.lead_id
        AND public.can_access_tenant((SELECT auth.uid()), l.assigned_tenant_id)
    )
  );

DROP POLICY IF EXISTS crm_activity_insert ON public.crm_activity_log;
CREATE POLICY crm_activity_insert ON public.crm_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = crm_activity_log.lead_id
        AND public.can_access_tenant((SELECT auth.uid()), l.assigned_tenant_id)
    )
  );

-- ─── 5. cases e subtabelas ───────────────────────────────────────────────────

DROP POLICY IF EXISTS cases_read ON public.cases;
CREATE POLICY cases_read ON public.cases
  FOR SELECT TO authenticated
  USING (
    primary_user_id = (SELECT auth.uid())
    OR public.can_access_tenant((SELECT auth.uid()), tenant_id)
  );

DROP POLICY IF EXISTS cases_write ON public.cases;
CREATE POLICY cases_write ON public.cases
  FOR ALL TO authenticated
  USING      (public.can_access_tenant((SELECT auth.uid()), tenant_id))
  WITH CHECK (public.can_access_tenant((SELECT auth.uid()), tenant_id));

DROP POLICY IF EXISTS case_applicants_read ON public.case_applicants;
CREATE POLICY case_applicants_read ON public.case_applicants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_applicants.case_id
        AND (
          c.primary_user_id = (SELECT auth.uid())
          OR public.can_access_tenant((SELECT auth.uid()), c.tenant_id)
        )
    )
  );

DROP POLICY IF EXISTS case_documents_read ON public.case_documents;
CREATE POLICY case_documents_read ON public.case_documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_documents.case_id
        AND (
          c.primary_user_id = (SELECT auth.uid())
          OR public.can_access_tenant((SELECT auth.uid()), c.tenant_id)
        )
    )
  );

DROP POLICY IF EXISTS case_tasks_read ON public.case_tasks;
CREATE POLICY case_tasks_read ON public.case_tasks
  FOR SELECT TO authenticated
  USING (
    assigned_to = (SELECT auth.uid())
    OR public.is_hub_user((SELECT auth.uid()))
    OR (
      case_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.cases c
        WHERE c.id = case_tasks.case_id
          AND public.can_access_tenant((SELECT auth.uid()), c.tenant_id)
      )
    )
    OR (
      lead_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.crm_leads l
        WHERE l.id = case_tasks.lead_id
          AND public.can_access_tenant((SELECT auth.uid()), l.assigned_tenant_id)
      )
    )
  );

DROP POLICY IF EXISTS case_messages_read ON public.case_messages;
CREATE POLICY case_messages_read ON public.case_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_messages.case_id
        AND (
          c.primary_user_id = (SELECT auth.uid())
          OR public.can_access_tenant((SELECT auth.uid()), c.tenant_id)
        )
    )
  );

-- ─── 6. subscriptions: UPDATE só do HUB ──────────────────────────────────────
-- Pagamentos e acesso são gravados pelo stripe-webhook (service_role, ignora RLS).

DROP POLICY IF EXISTS subscriptions_self_update ON public.subscriptions;
CREATE POLICY subscriptions_self_update ON public.subscriptions
  FOR UPDATE TO authenticated
  USING      (public.is_hub_user((SELECT auth.uid())))
  WITH CHECK (public.is_hub_user((SELECT auth.uid())));

-- ─── 7. Storage: bucket case-documents (1ª pasta = tenant_id) ────────────────

DROP POLICY IF EXISTS case_documents_upload ON storage.objects;
CREATE POLICY case_documents_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'case-documents'
    AND public.can_access_tenant_folder((SELECT auth.uid()), (storage.foldername(name))[1])
  );

DROP POLICY IF EXISTS case_documents_read ON storage.objects;
CREATE POLICY case_documents_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'case-documents'
    AND public.can_access_tenant_folder((SELECT auth.uid()), (storage.foldername(name))[1])
  );

-- =====================================================================
-- Verificação (rodar à parte, só leitura — não faz parte da migration)
-- =====================================================================
-- 1) Só o super_admin passa em is_hub_user (esperado: 1 em produção hoje):
--    SELECT count(*) FROM public.profiles p WHERE public.is_hub_user(p.id);
--
-- 2) Nenhuma policy de public/storage usa mais get_user_tenant_id
--    (esperado: 0 linhas):
--    SELECT schemaname, tablename, policyname FROM pg_policies
--    WHERE schemaname IN ('public', 'storage')
--      AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%get_user_tenant_id%';
--
-- 3) Funções SECURITY DEFINER de autorização com search_path fixo
--    (esperado: proconfig com search_path=public nas 6 funções):
--    SELECT proname, proconfig FROM pg_proc
--    WHERE pronamespace = 'public'::regnamespace
--      AND proname IN ('is_hub_user', 'is_staff_user', 'can_access_tenant',
--                      'can_access_tenant_folder', 'is_hub_admin', 'get_user_tenant_id');
