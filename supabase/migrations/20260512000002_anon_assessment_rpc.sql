-- =====================================================================
-- 20260512000000_anon_assessment_rpc.sql
-- B02-A21/A22 fix: replace permissive anon RLS on `assessments` with
-- SECURITY DEFINER RPCs that validate session_id ownership server-side.
--
-- Before: anon could enumerate / update every assessment with user_id IS NULL
-- After:  anon has NO direct REST access to `assessments`; all anon ops go
--         through public.upsert_anon_assessment / public.get_anon_assessment.
-- =====================================================================

-- ─── Prerequisite: session_id must be UNIQUE for ON CONFLICT in the RPC ───
-- The Phase 3 / initial schema only created a non-unique index. The existing
-- frontend code already calls upsert with onConflict: 'session_id', so this
-- constraint was implicitly required and is now made explicit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assessments'::regclass
      AND conname  = 'assessments_session_id_key'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_session_id_key UNIQUE (session_id);
  END IF;
END $$;

-- ─── Drop the permissive Phase 3 policies (B02-A21/A22) ─────────────────────
DROP POLICY IF EXISTS "Users can view their own assessments"   ON public.assessments;
DROP POLICY IF EXISTS "Users can update their own assessments" ON public.assessments;
DROP POLICY IF EXISTS "Users can insert their own assessments" ON public.assessments;

-- ─── Recreate without the `auth.role() = 'anon'` branches ────────────────────
-- Anonymous access from this point on goes ONLY through the RPCs below.
CREATE POLICY assessments_authenticated_select ON public.assessments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

CREATE POLICY assessments_authenticated_update ON public.assessments
  FOR UPDATE TO authenticated
  USING      (user_id = auth.uid() OR public.is_hub_user(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

CREATE POLICY assessments_authenticated_insert ON public.assessments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

-- DELETE policy from Phase 3 (admin-only) stays in place — not touched here.

-- =====================================================================
-- RPC 1: upsert_anon_assessment
-- Anonymous client persists quiz answers. Matches on session_id.
-- Protected against hijacking: WHERE user_id IS NULL prevents overwriting
-- an assessment that has already been linked to an authenticated user.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.upsert_anon_assessment(
  p_session_id            text,
  p_answers               jsonb,
  p_full_name             text    DEFAULT NULL,
  p_email                 text    DEFAULT NULL,
  p_phone                 text    DEFAULT NULL,
  p_questions_answered    int     DEFAULT NULL,
  p_total_questions       int     DEFAULT NULL,
  p_completion_percentage numeric DEFAULT NULL,
  p_status                text    DEFAULT 'incomplete',
  p_utm_source            text    DEFAULT NULL,
  p_utm_medium            text    DEFAULT NULL,
  p_utm_campaign          text    DEFAULT NULL
)
RETURNS public.assessments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row    public.assessments;
  v_status assessment_status;
BEGIN
  -- Basic sanity check on session_id format
  IF p_session_id IS NULL OR length(p_session_id) < 8 OR length(p_session_id) > 64 THEN
    RAISE EXCEPTION 'Invalid session_id' USING ERRCODE = '22023';
  END IF;

  -- Status validation (cast text → enum, default to 'incomplete' on bad input)
  BEGIN
    v_status := p_status::assessment_status;
  EXCEPTION WHEN invalid_text_representation THEN
    v_status := 'incomplete';
  END;

  INSERT INTO public.assessments (
    session_id, answers, full_name, email, phone,
    questions_answered, total_questions, completion_percentage, status,
    utm_source, utm_medium, utm_campaign,
    completed_at, expires_at
  ) VALUES (
    p_session_id, COALESCE(p_answers, '{}'::jsonb), p_full_name, p_email, p_phone,
    p_questions_answered, p_total_questions, p_completion_percentage, v_status,
    p_utm_source, p_utm_medium, p_utm_campaign,
    CASE WHEN v_status = 'completed' THEN now() ELSE NULL END,
    now() + INTERVAL '90 days'
  )
  ON CONFLICT (session_id) DO UPDATE SET
    answers               = COALESCE(EXCLUDED.answers,              public.assessments.answers),
    full_name             = COALESCE(EXCLUDED.full_name,            public.assessments.full_name),
    email                 = COALESCE(EXCLUDED.email,                public.assessments.email),
    phone                 = COALESCE(EXCLUDED.phone,                public.assessments.phone),
    questions_answered    = COALESCE(EXCLUDED.questions_answered,   public.assessments.questions_answered),
    total_questions       = COALESCE(EXCLUDED.total_questions,      public.assessments.total_questions),
    completion_percentage = COALESCE(EXCLUDED.completion_percentage,public.assessments.completion_percentage),
    status                = COALESCE(EXCLUDED.status,               public.assessments.status),
    utm_source            = COALESCE(EXCLUDED.utm_source,           public.assessments.utm_source),
    utm_medium            = COALESCE(EXCLUDED.utm_medium,           public.assessments.utm_medium),
    utm_campaign          = COALESCE(EXCLUDED.utm_campaign,         public.assessments.utm_campaign),
    completed_at          = COALESCE(EXCLUDED.completed_at,         public.assessments.completed_at),
    updated_at            = now()
  WHERE public.assessments.user_id IS NULL  -- ← critical: cannot overwrite linked rows
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Assessment already linked to a user'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_anon_assessment(
  text, jsonb, text, text, text, int, int, numeric, text, text, text, text
) TO anon, authenticated;

-- =====================================================================
-- RPC 2: get_anon_assessment
-- Reads an assessment matching (id, session_id). Used by frontend in the
-- brief window between quiz completion and signup. Returns at most 1 row.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_anon_assessment(
  p_id         uuid,
  p_session_id text
)
RETURNS SETOF public.assessments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT *
  FROM public.assessments
  WHERE id         = p_id
    AND session_id = p_session_id
    AND user_id    IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_anon_assessment(uuid, text) TO anon, authenticated;

-- =====================================================================
-- RPC 3: link_anon_assessment_to_user
-- Called by authenticated client after signup to associate an anonymous
-- assessment (identified by id + session_id, proving ownership) with the
-- current user. Idempotent if already linked to the same user.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.link_anon_assessment_to_user(
  p_id         uuid,
  p_session_id text
)
RETURNS public.assessments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_row public.assessments;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  UPDATE public.assessments
  SET user_id    = v_uid,
      updated_at = now()
  WHERE id         = p_id
    AND session_id = p_session_id
    AND (user_id IS NULL OR user_id = v_uid)
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Assessment not found or already linked to another user'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_anon_assessment_to_user(uuid, text) TO authenticated;
