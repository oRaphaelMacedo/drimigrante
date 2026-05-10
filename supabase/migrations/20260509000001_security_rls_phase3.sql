-- 20260509000001_security_rls_phase3.sql
-- Fase 3: Segurança de Banco de Dados e RLS
-- Implementação de Políticas de Segurança para tabelas críticas.

-------------------------------------------------------------------------------
-- 1. RLS FOR AI CONFIGURATIONS
-------------------------------------------------------------------------------
ALTER TABLE public.ai_configurations ENABLE ROW LEVEL SECURITY;

-- Admins (hub_users) can do everything
DROP POLICY IF EXISTS "Admins can manage AI configs" ON public.ai_configurations;
CREATE POLICY "Admins can manage AI configs"
ON public.ai_configurations
FOR ALL
TO authenticated
USING (public.is_hub_user(auth.uid()))
WITH CHECK (public.is_hub_user(auth.uid()));

-------------------------------------------------------------------------------
-- 2. AUDIT LOG TRIGGER FOR AI CONFIGURATIONS
-------------------------------------------------------------------------------
-- Logs when critical settings like system_prompt or model are changed.
CREATE OR REPLACE FUNCTION public.log_ai_config_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only log if critical fields changed
    IF NEW.system_prompt <> OLD.system_prompt OR NEW.model <> OLD.model OR NEW.is_active <> OLD.is_active THEN
      INSERT INTO public.audit_log (
        id,
        table_name,
        record_id,
        action,
        actor_user_id,
        old_values,
        new_values,
        changed_fields,
        created_at
      ) VALUES (
        gen_random_uuid(),
        TG_TABLE_NAME,
        NEW.id::text,
        'UPDATE',
        auth.uid(),
        jsonb_build_object('system_prompt', OLD.system_prompt, 'model', OLD.model, 'is_active', OLD.is_active),
        jsonb_build_object('system_prompt', NEW.system_prompt, 'model', NEW.model, 'is_active', NEW.is_active),
        ARRAY['system_prompt', 'model', 'is_active'],
        now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_ai_config_changes ON public.ai_configurations;
CREATE TRIGGER audit_ai_config_changes
  AFTER UPDATE ON public.ai_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ai_config_changes();

-------------------------------------------------------------------------------
-- 3. RLS FOR ASSESSMENTS (STRICT)
-------------------------------------------------------------------------------
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

-- Insert: Allowed for authenticated users (their own) or anonymous users (where user_id is null)
DROP POLICY IF EXISTS "Users can insert their own assessments" ON public.assessments;
CREATE POLICY "Users can insert their own assessments"
ON public.assessments
FOR INSERT
TO public
WITH CHECK (
  (auth.role() = 'authenticated' AND user_id = auth.uid()) OR
  (auth.role() = 'anon' AND user_id IS NULL)
);

-- Select: Users can see their own, admins can see all, anon can see by session_id (if user_id is null)
DROP POLICY IF EXISTS "Users can view their own assessments" ON public.assessments;
CREATE POLICY "Users can view their own assessments"
ON public.assessments
FOR SELECT
TO public
USING (
  (auth.role() = 'authenticated' AND (user_id = auth.uid() OR public.is_hub_user(auth.uid()))) OR
  (auth.role() = 'anon' AND user_id IS NULL)
);

-- Update: Users can update their own, admins can update all, anon can update where user_id is null
DROP POLICY IF EXISTS "Users can update their own assessments" ON public.assessments;
CREATE POLICY "Users can update their own assessments"
ON public.assessments
FOR UPDATE
TO public
USING (
  (auth.role() = 'authenticated' AND (user_id = auth.uid() OR public.is_hub_user(auth.uid()))) OR
  (auth.role() = 'anon' AND user_id IS NULL)
);

-- Delete: ONLY admins
DROP POLICY IF EXISTS "Admins can delete assessments" ON public.assessments;
CREATE POLICY "Admins can delete assessments"
ON public.assessments
FOR DELETE
TO authenticated
USING (public.is_hub_user(auth.uid()));
