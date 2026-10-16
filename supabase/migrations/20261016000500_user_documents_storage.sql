-- =====================================================================
-- 20261016000500_user_documents_storage.sql
-- DI-023 (P1): upload de documentos quebrado e sem limites.
--
-- Problema
--   · O bucket 'user-documents' existia só no painel, sem policies em
--     storage.objects: todo upload de cliente era negado pela RLS.
--   · O bucket não limitava tamanho nem tipo de arquivo.
--   · A policy user_documents_own (FOR ALL) deixava o cliente gravar o próprio
--     documento como 'verified' e editar feedback/storage_path.
--
-- Correção
--   · Bucket privado com limite de 10 MB e MIME pdf/jpeg/png (cria se não
--     existir; atualiza limites se já existir).
--   · storage.objects: o dono lê, envia e apaga só na própria pasta
--     ({auth.uid()}/...); a equipe (is_staff_user) lê tudo. Sem UPDATE: o
--     front envia com upsert:false (cada envio é um caminho novo).
--   · public.user_documents: dono lê, insere e apaga; equipe lê e atualiza.
--   · Trigger: quem não é equipe não grava status diferente de 'uploaded',
--     não grava feedback e não altera user_id nem storage_path.
--
-- Depende de: 20261016000000_fix_is_hub_user_rls.sql (is_staff_user).
-- Idempotente. NÃO APLICAR sem validar antes no Supabase local.
-- =====================================================================

-- ─── 1. Bucket ───────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-documents',
  'user-documents',
  FALSE,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
SET public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 2. Policies em storage.objects ──────────────────────────────────────────
-- Convenção de caminho: {user_id}/{assessment_id|general}/{document_type}/{arquivo}

DROP POLICY IF EXISTS user_documents_owner_insert ON storage.objects;
CREATE POLICY user_documents_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS user_documents_owner_select ON storage.objects;
CREATE POLICY user_documents_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS user_documents_owner_delete ON storage.objects;
CREATE POLICY user_documents_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
  );

DROP POLICY IF EXISTS user_documents_staff_select ON storage.objects;
CREATE POLICY user_documents_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-documents'
    AND public.is_staff_user((SELECT auth.uid()))
  );

-- ─── 3. Policies em public.user_documents ────────────────────────────────────

DROP POLICY IF EXISTS user_documents_own        ON public.user_documents;
DROP POLICY IF EXISTS user_documents_hub_read   ON public.user_documents;
DROP POLICY IF EXISTS user_documents_hub_update ON public.user_documents;

DROP POLICY IF EXISTS user_documents_owner_select ON public.user_documents;
CREATE POLICY user_documents_owner_select ON public.user_documents
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_documents_owner_insert ON public.user_documents;
CREATE POLICY user_documents_owner_insert ON public.user_documents
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_documents_owner_delete ON public.user_documents;
CREATE POLICY user_documents_owner_delete ON public.user_documents
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_documents_staff_read ON public.user_documents;
CREATE POLICY user_documents_staff_read ON public.user_documents
  FOR SELECT TO authenticated
  USING (public.is_staff_user((SELECT auth.uid())));

DROP POLICY IF EXISTS user_documents_staff_update ON public.user_documents;
CREATE POLICY user_documents_staff_update ON public.user_documents
  FOR UPDATE TO authenticated
  USING      (public.is_staff_user((SELECT auth.uid())))
  WITH CHECK (public.is_staff_user((SELECT auth.uid())));

-- ─── 4. Trigger: campos de revisão só pela equipe ────────────────────────────
-- service_role/postgres (auth.uid() nulo) e equipe passam.

CREATE OR REPLACE FUNCTION public.guard_user_document_review_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR public.is_staff_user(v_uid) THEN
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

DROP TRIGGER IF EXISTS guard_user_document_review_fields ON public.user_documents;
CREATE TRIGGER guard_user_document_review_fields
  BEFORE INSERT OR UPDATE ON public.user_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_document_review_fields();

-- =====================================================================
-- Verificação (só leitura, rodar à parte)
-- =====================================================================
-- SELECT id, public, file_size_limit, allowed_mime_types
--   FROM storage.buckets WHERE id = 'user-documents';
-- SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'storage' AND tablename = 'objects'
--     AND policyname LIKE 'user_documents_%';
-- SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'user_documents';
