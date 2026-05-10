-- =====================================================
-- 20260509000003 — Enable public read on form_themes
-- Themes were never configured with RLS / a public policy in the initial schema.
-- Without this, anon role gets [] from /rest/v1/form_themes (default-deny once RLS is forced).
-- =====================================================

ALTER TABLE form_themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS form_themes_public_read ON form_themes;
CREATE POLICY form_themes_public_read ON form_themes
  FOR SELECT
  USING (is_active = TRUE);
