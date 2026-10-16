-- =====================================================================
-- 20261016000340_fix_ai_config_audit_record_id.sql
-- W2-07 (DI-060) — corrige o trigger de auditoria de ai_configurations.
--
-- Problema: public.log_ai_config_changes() (20260509000001) grava
-- `NEW.id::text` em audit_log.record_id, que é UUID. Toda UPDATE que muda
-- system_prompt, model ou is_active falha com
--   column "record_id" is of type uuid but expression is of type text
-- Isso derruba:
--   - a migration 20261016000350_ai_config_prompts.sql (faz UPDATE nos prompts),
--     o que hoje quebra `supabase start` / `supabase db reset` e o E2E do CI;
--   - o salvamento em /admin/ai-config.
-- Conferido em 16/10/2026 (consulta só de leitura): produção tem o mesmo
-- tipo (record_id UUID) e o mesmo cast no trigger.
--
-- ORDEM DE RELEASE: aplicar ANTES da 20261016000350_ai_config_prompts.sql
-- (por isso o timestamp 000340). Não depende de deploy de function.
-- Idempotente (CREATE OR REPLACE); não muda dados nem o trigger em si.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.log_ai_config_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Só registra mudanças nos campos críticos. IS DISTINCT FROM também pega
    -- a troca de/para NULL (o `<>` antigo ignorava esses casos).
    IF NEW.system_prompt IS DISTINCT FROM OLD.system_prompt
       OR NEW.model IS DISTINCT FROM OLD.model
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
    THEN
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
        NEW.id, -- UUID, mesmo tipo de audit_log.record_id
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
$$;

-- Verificação (rodar à parte, só leitura): deve devolver false.
--   SELECT position('NEW.id::text' in pg_get_functiondef('public.log_ai_config_changes'::regproc)) > 0;
