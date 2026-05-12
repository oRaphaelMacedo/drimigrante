-- ============================================================
-- Migration: 20260512000000_user_documents.sql
-- Documents uploaded by users during the assessment/dashboard phase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  assessment_id   UUID REFERENCES public.assessments(id) ON DELETE SET NULL,
  document_type   TEXT NOT NULL,           -- e.g. 'passaporte', 'registo_criminal'
  display_name    TEXT NOT NULL,           -- Human-readable label
  file_name       TEXT NOT NULL,
  storage_path    TEXT NOT NULL,           -- Supabase Storage path
  file_size       INTEGER,
  mime_type       TEXT,
  status          TEXT NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'reviewing', 'verified', 'rejected')),
  feedback        TEXT,                    -- Admin feedback on rejection
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_documents_user       ON public.user_documents(user_id);
CREATE INDEX idx_user_documents_assessment ON public.user_documents(assessment_id);
CREATE INDEX idx_user_documents_status     ON public.user_documents(status);

-- RLS
ALTER TABLE public.user_documents ENABLE ROW LEVEL SECURITY;

-- Users can read/insert/delete their own documents
CREATE POLICY user_documents_own ON public.user_documents
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Hub admins can read all
CREATE POLICY user_documents_hub_read ON public.user_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'hub_admin', 'lawyer', 'paralegal')
    )
  );

-- Hub admins can update status/feedback
CREATE POLICY user_documents_hub_update ON public.user_documents
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_admin', 'hub_admin', 'lawyer', 'paralegal')
    )
  );

-- updated_at trigger
CREATE TRIGGER set_updated_at_user_documents
  BEFORE UPDATE ON public.user_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Supabase Storage bucket ──────────────────────────────────────────────────
-- NOTE: The 'user-documents' storage bucket must be created manually in the
-- Supabase dashboard (Storage → New bucket → name: user-documents, private).
-- RLS policies on the bucket should match the table policies above.
-- Storage path convention: {user_id}/{assessment_id}/{document_type}/{filename}
