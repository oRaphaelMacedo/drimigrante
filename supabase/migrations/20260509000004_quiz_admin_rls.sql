-- =====================================================
-- 20260509000004 — RLS for quiz admin editing
-- Helper: is_hub_admin() returns true for super_admin or hub_admin roles.
-- Allows hub admins to INSERT/UPDATE/DELETE on form_* tables.
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_hub_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin', 'hub_admin')
  );
$$;

-- ─── form_themes ─────────────────────────────────────────
DROP POLICY IF EXISTS form_themes_admin_write ON form_themes;
CREATE POLICY form_themes_admin_write ON form_themes
  FOR ALL
  TO authenticated
  USING (public.is_hub_admin())
  WITH CHECK (public.is_hub_admin());

-- ─── form_questions ──────────────────────────────────────
DROP POLICY IF EXISTS form_questions_admin_write ON form_questions;
CREATE POLICY form_questions_admin_write ON form_questions
  FOR ALL
  TO authenticated
  USING (public.is_hub_admin())
  WITH CHECK (public.is_hub_admin());

-- ─── form_question_options ───────────────────────────────
DROP POLICY IF EXISTS form_question_options_admin_write ON form_question_options;
CREATE POLICY form_question_options_admin_write ON form_question_options
  FOR ALL
  TO authenticated
  USING (public.is_hub_admin())
  WITH CHECK (public.is_hub_admin());

-- ─── form_versions ───────────────────────────────────────
ALTER TABLE form_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_versions_admin_read ON form_versions;
CREATE POLICY form_versions_admin_read ON form_versions
  FOR SELECT
  TO authenticated
  USING (public.is_hub_admin());

DROP POLICY IF EXISTS form_versions_admin_write ON form_versions;
CREATE POLICY form_versions_admin_write ON form_versions
  FOR ALL
  TO authenticated
  USING (public.is_hub_admin())
  WITH CHECK (public.is_hub_admin());

-- =====================================================
-- RPC: snapshot the current live quiz into form_versions
-- =====================================================

CREATE OR REPLACE FUNCTION public.snapshot_quiz_version(p_label TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_next_num INT;
  v_snapshot JSONB;
BEGIN
  IF NOT public.is_hub_admin() THEN
    RAISE EXCEPTION 'Permission denied: hub admin required';
  END IF;

  -- Build snapshot of live data
  SELECT jsonb_build_object(
    'themes', COALESCE((SELECT jsonb_agg(t ORDER BY t.sort_order) FROM form_themes t), '[]'::jsonb),
    'questions', COALESCE((SELECT jsonb_agg(q ORDER BY q.sort_order) FROM form_questions q), '[]'::jsonb),
    'options', COALESCE((SELECT jsonb_agg(o ORDER BY o.question_id, o.sort_order) FROM form_question_options o), '[]'::jsonb)
  ) INTO v_snapshot;

  -- Next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_num FROM form_versions;

  INSERT INTO form_versions (
    version_number, name, description, schema_snapshot,
    is_active, published_at, published_by
  ) VALUES (
    v_next_num,
    COALESCE(p_label, 'Snapshot v' || v_next_num),
    'Auto-snapshot before edit',
    v_snapshot,
    FALSE,
    NOW(),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_quiz_version(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hub_admin() TO authenticated, anon;
