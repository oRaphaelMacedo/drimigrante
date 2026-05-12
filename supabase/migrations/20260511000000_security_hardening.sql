-- =====================================================================
-- 20260511000000_security_hardening.sql
-- Hardening de segurança — corrige achados B02-A03/A05/A06/A08/A09/A11/A12
-- =====================================================================

-- ─── B02-A03: Drop legacy assessments policies ────────────────────────────────
-- Phase 3 criou novas policies com nomes diferentes mas as antigas (mais
-- permissivas) continuavam activas. PostgreSQL aplica OR entre policies do
-- mesmo comando, tornando as novas irrelevantes.
-- As policies correctas já existem via Phase 3 — apenas removemos as legadas.
DROP POLICY IF EXISTS assessments_anon_insert ON public.assessments;
DROP POLICY IF EXISTS assessments_read        ON public.assessments;
DROP POLICY IF EXISTS assessments_update      ON public.assessments;

-- ─── B02-A05: Explicit deny for client writes to payments ─────────────────────
-- Service role (stripe-webhook Edge Function) bypasses RLS automaticamente.
-- Esta policy bloqueia writes directos da anon_key ou de clientes autenticados.
DROP POLICY IF EXISTS payments_no_client_write ON public.payments;
CREATE POLICY payments_no_client_write ON public.payments
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ─── B02-A06: Enable RLS on PII / financial tables ───────────────────────────

-- payment_events: cada utilizador vê os próprios; hub vê todos
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_events_read ON public.payment_events;
CREATE POLICY payment_events_read ON public.payment_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

-- email_send_log: cada utilizador vê os próprios; hub vê todos
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_send_log_read ON public.email_send_log;
CREATE POLICY email_send_log_read ON public.email_send_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

-- audit_log: apenas hub (dados de auditoria sensíveis)
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_hub_read ON public.audit_log;
CREATE POLICY audit_log_hub_read ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_hub_user(auth.uid()));

-- tenants: utilizador vê o seu próprio tenant; hub vê todos; escrita apenas hub
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_read      ON public.tenants;
DROP POLICY IF EXISTS tenants_hub_write ON public.tenants;
CREATE POLICY tenants_read ON public.tenants
  FOR SELECT TO authenticated
  USING (id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));
CREATE POLICY tenants_hub_write ON public.tenants
  FOR ALL TO authenticated
  USING      (public.is_hub_user(auth.uid()))
  WITH CHECK (public.is_hub_user(auth.uid()));

-- ─── B02-A08: Add WITH CHECK to crm_leads_tenant_write ───────────────────────
-- Sem WITH CHECK, um UPDATE podia alterar assigned_tenant_id para outro tenant.
DROP POLICY IF EXISTS crm_leads_tenant_write ON public.crm_leads;
CREATE POLICY crm_leads_tenant_write ON public.crm_leads
  FOR ALL TO authenticated
  USING      (assigned_tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()))
  WITH CHECK (assigned_tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));

-- ─── B02-A09: Add WITH CHECK to cases_write ──────────────────────────────────
-- Mesma classe de bug: UPDATE sem WITH CHECK permitia reassign de tenant_id.
DROP POLICY IF EXISTS cases_write ON public.cases;
CREATE POLICY cases_write ON public.cases
  FOR ALL TO authenticated
  USING      (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));

-- ─── B02-A11: Fix search_path in log_ai_config_changes ───────────────────────
-- SECURITY DEFINER sem SET search_path é vulnerável a search_path hijack.
-- Usa IS DISTINCT FROM para lidar correctamente com NULLs (vs <>).
CREATE OR REPLACE FUNCTION public.log_ai_config_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.system_prompt IS DISTINCT FROM OLD.system_prompt
       OR NEW.model IS DISTINCT FROM OLD.model
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
    THEN
      INSERT INTO public.audit_log (
        id, table_name, record_id, action, actor_user_id,
        old_values, new_values, changed_fields, created_at
      ) VALUES (
        gen_random_uuid(),
        TG_TABLE_NAME,
        NEW.id::text,
        'UPDATE',
        auth.uid(),
        jsonb_build_object(
          'system_prompt', OLD.system_prompt,
          'model',         OLD.model,
          'is_active',     OLD.is_active
        ),
        jsonb_build_object(
          'system_prompt', NEW.system_prompt,
          'model',         NEW.model,
          'is_active',     NEW.is_active
        ),
        ARRAY['system_prompt', 'model', 'is_active'],
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── B02-A12: Restrict crm_activity_insert ───────────────────────────────────
-- Antes: WITH CHECK (TRUE) — anon podia poluir o log de qualquer lead.
-- Agora: apenas membros do tenant responsável pelo lead podem inserir.
DROP POLICY IF EXISTS crm_activity_insert ON public.crm_activity_log;
CREATE POLICY crm_activity_insert ON public.crm_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crm_leads l
      WHERE l.id = lead_id
        AND (
          l.assigned_tenant_id = public.get_user_tenant_id(auth.uid())
          OR public.is_hub_user(auth.uid())
        )
    )
  );
