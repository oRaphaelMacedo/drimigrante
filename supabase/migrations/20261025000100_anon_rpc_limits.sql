-- =====================================================================
-- 20261025000100_anon_rpc_limits.sql
-- DI-081 (P2, segurança): limites nas RPCs anônimas do quiz.
--
-- Problema
--   upsert_anon_assessment (20260512000002) é executável por qualquer
--   visitante e só conferia o tamanho do session_id (8–64). Dava para gravar
--   answers de vários MB, e-mail e nome arbitrários (inclusive caracteres de
--   controle) e UTMs sem limite. get_anon_assessment e
--   link_anon_assessment_to_user aceitavam qualquer texto como session_id.
--
-- Correção
--   1. private.is_valid_quiz_session_id(text): formatos aceitos (espelho de
--      SESSION_ID_PATTERN em src/lib/session-id.ts, conferido por teste):
--        · UUID (crypto.randomUUID, gerado pelo front atual);
--        · legado s_<timestamp>_<aleatório> (Math.random; sessões antigas
--          continuam funcionando);
--        · e2e-<…> (IDs dos testes E2E);
--        · qualquer um dos três com o sufixo -wl (lista de espera).
--      Sempre 8–64 caracteres ASCII.
--   2. upsert_anon_assessment (mesma assinatura e mesmos nomes de parâmetro):
--        · session_id no formato acima → senão 22023 'Invalid session_id';
--        · answers: objeto JSON de até 32 KB → senão 22023;
--        · e-mail: até 254 caracteres, formato nome@dominio.tld → senão 22023;
--        · nome: até 200 caracteres, sem caracteres de controle → senão 22023;
--        · telefone: até 40 caracteres, sem caracteres de controle → senão 22023;
--        · texto vazio vira NULL (não apaga o valor já gravado);
--        · UTMs: sem caracteres de controle e cortadas em 100 caracteres, o
--          tamanho das colunas varchar(100) (antes uma UTM longa derrubava o
--          salvamento do quiz com "value too long");
--        · contadores entre 0 e 1000 e percentual entre 0 e 100.
--      O PostgREST responde 400 para o SQLSTATE 22023.
--   3. get_anon_assessment: session_id fora do formato → nenhuma linha.
--   4. link_anon_assessment_to_user: session_id fora do formato → 22023.
--   5. Restrição na tabela assessments: answers ≤ 64 KB (folga sobre os 32 KB
--      da RPC), para valer também se uma migration futura recriar a RPC.
--      session_id, e-mail, nome, telefone e UTMs já têm limite nas colunas
--      (varchar 64/255/255/50/100). NOT VALID + VALIDATE quando os dados
--      antigos permitem.
--
-- Dependências e ORDEM DE RELEASE
--   · Depois de 20261025000000_db_hardening_advisors.sql (schema private e
--     EXECUTE das RPCs). CREATE OR REPLACE preserva os GRANTs de lá.
--   · Front: o quiz já gera session_id com crypto.randomUUID e descarta
--     sessões guardadas fora do formato (src/hooks/useQuizPersistence.ts). O
--     front antigo também gera formatos aceitos (UUID ou legado).
--   · ATENÇÃO para migrations futuras: quem recriar upsert_anon_assessment
--     precisa manter as validações abaixo (ex.: 20261025000200_resume_token).
--
-- Idempotente. NÃO APLICAR sem validar no Supabase local (consultas no fim).
-- Conferido em Postgres 17.6 + PostgREST 14.10 locais e descartáveis.
-- =====================================================================

-- ─── 1. Formato do session_id ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.is_valid_quiz_session_id(p_session_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT p_session_id IS NOT NULL
    AND length(p_session_id) BETWEEN 8 AND 64
    -- SESSION_ID_PATTERN (src/lib/session-id.ts), sem distinguir maiúsculas:
    AND p_session_id ~* '^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|s_[0-9]{10,16}_[0-9a-z]{0,16}|e2e-[0-9a-z-]{4,56})(?:-wl)?$';
$$;

COMMENT ON FUNCTION private.is_valid_quiz_session_id(TEXT) IS
  'session_id do quiz anônimo: UUID, legado s_<ts>_<rand> ou e2e-…, com sufixo -wl opcional; 8–64 caracteres.';

REVOKE ALL ON FUNCTION private.is_valid_quiz_session_id(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_valid_quiz_session_id(TEXT) TO service_role;

-- ─── 2. upsert_anon_assessment ───────────────────────────────────────────────

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
SET search_path = ''
AS $$
DECLARE
  c_max_answers_bytes CONSTANT INT := 32768;
  v_row       public.assessments;
  v_status    public.assessment_status;
  v_answers   jsonb := COALESCE(p_answers, '{}'::jsonb);
  v_full_name text  := NULLIF(btrim(p_full_name), '');
  v_email     text  := NULLIF(btrim(p_email), '');
  v_phone     text  := NULLIF(btrim(p_phone), '');
  v_utm_source   text := left(NULLIF(btrim(regexp_replace(p_utm_source,   '[[:cntrl:]]', '', 'g')), ''), 100);
  v_utm_medium   text := left(NULLIF(btrim(regexp_replace(p_utm_medium,   '[[:cntrl:]]', '', 'g')), ''), 100);
  v_utm_campaign text := left(NULLIF(btrim(regexp_replace(p_utm_campaign, '[[:cntrl:]]', '', 'g')), ''), 100);
BEGIN
  IF NOT private.is_valid_quiz_session_id(p_session_id) THEN
    RAISE EXCEPTION 'Invalid session_id' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_answers) <> 'object' THEN
    RAISE EXCEPTION 'Invalid answers: expected a JSON object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(v_answers::text) > c_max_answers_bytes THEN
    RAISE EXCEPTION 'Invalid answers: larger than 32 KB' USING ERRCODE = '22023';
  END IF;

  IF v_email IS NOT NULL AND (
       length(v_email) > 254
       OR v_email !~ '^[^[:space:][:cntrl:]@]+@[^[:space:][:cntrl:]@]+\.[^[:space:][:cntrl:]@]+$'
     ) THEN
    RAISE EXCEPTION 'Invalid email' USING ERRCODE = '22023';
  END IF;

  IF v_full_name IS NOT NULL AND (length(v_full_name) > 200 OR v_full_name ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'Invalid full_name' USING ERRCODE = '22023';
  END IF;

  IF v_phone IS NOT NULL AND (length(v_phone) > 40 OR v_phone ~ '[[:cntrl:]]') THEN
    RAISE EXCEPTION 'Invalid phone' USING ERRCODE = '22023';
  END IF;

  -- Status validation (cast text → enum, default to 'incomplete' on bad input)
  BEGIN
    v_status := p_status::public.assessment_status;
  EXCEPTION WHEN invalid_text_representation THEN
    v_status := 'incomplete';
  END;

  INSERT INTO public.assessments (
    session_id, answers, full_name, email, phone,
    questions_answered, total_questions, completion_percentage, status,
    utm_source, utm_medium, utm_campaign,
    completed_at, expires_at
  ) VALUES (
    p_session_id, v_answers, v_full_name, v_email, v_phone,
    -- LEAST/GREATEST ignoram NULL: o CASE mantém NULL como "não informado".
    CASE WHEN p_questions_answered    IS NULL THEN NULL ELSE GREATEST(0, LEAST(p_questions_answered, 1000)) END,
    CASE WHEN p_total_questions       IS NULL THEN NULL ELSE GREATEST(0, LEAST(p_total_questions, 1000)) END,
    CASE WHEN p_completion_percentage IS NULL THEN NULL ELSE GREATEST(0, LEAST(p_completion_percentage, 100)) END,
    v_status,
    v_utm_source, v_utm_medium, v_utm_campaign,
    CASE WHEN v_status = 'completed' THEN now() ELSE NULL END,
    now() + INTERVAL '90 days'
  )
  ON CONFLICT (session_id) DO UPDATE SET
    answers               = COALESCE(EXCLUDED.answers,               public.assessments.answers),
    full_name             = COALESCE(EXCLUDED.full_name,             public.assessments.full_name),
    email                 = COALESCE(EXCLUDED.email,                 public.assessments.email),
    phone                 = COALESCE(EXCLUDED.phone,                 public.assessments.phone),
    questions_answered    = COALESCE(EXCLUDED.questions_answered,    public.assessments.questions_answered),
    total_questions       = COALESCE(EXCLUDED.total_questions,       public.assessments.total_questions),
    completion_percentage = COALESCE(EXCLUDED.completion_percentage, public.assessments.completion_percentage),
    status                = COALESCE(EXCLUDED.status,                public.assessments.status),
    utm_source            = COALESCE(EXCLUDED.utm_source,            public.assessments.utm_source),
    utm_medium            = COALESCE(EXCLUDED.utm_medium,            public.assessments.utm_medium),
    utm_campaign          = COALESCE(EXCLUDED.utm_campaign,          public.assessments.utm_campaign),
    completed_at          = COALESCE(EXCLUDED.completed_at,          public.assessments.completed_at),
    updated_at            = now()
  WHERE public.assessments.user_id IS NULL  -- não sobrescreve assessment já vinculado
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Assessment already linked to a user'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_anon_assessment(
  text, jsonb, text, text, text, int, int, numeric, text, text, text, text
) IS
  'Quiz anônimo: grava as respostas por session_id (só enquanto user_id é nulo). '
  'Valida formato do session_id, answers ≤ 32 KB, e-mail, nome e telefone (22023).';

-- ─── 3. get_anon_assessment ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_anon_assessment(
  p_id         uuid,
  p_session_id text
)
RETURNS SETOF public.assessments
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.*
  FROM public.assessments a
  WHERE private.is_valid_quiz_session_id(p_session_id)
    AND a.id         = p_id
    AND a.session_id = p_session_id
    AND a.user_id    IS NULL;
$$;

-- ─── 4. link_anon_assessment_to_user ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_anon_assessment_to_user(
  p_id         uuid,
  p_session_id text
)
RETURNS public.assessments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.assessments;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_valid_quiz_session_id(p_session_id) THEN
    RAISE EXCEPTION 'Invalid session_id' USING ERRCODE = '22023';
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

-- Reafirma o EXECUTE da 20261025000000 (idempotente).
REVOKE ALL ON FUNCTION public.upsert_anon_assessment(
  text, jsonb, text, text, text, int, int, numeric, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_anon_assessment(
  text, jsonb, text, text, text, int, int, numeric, text, text, text, text
) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_anon_assessment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_anon_assessment(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_anon_assessment_to_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_anon_assessment_to_user(uuid, text) TO authenticated, service_role;

-- ─── 5. Restrição na tabela (rede de segurança) ──────────────────────────────
-- NOT VALID não confere as linhas antigas; o VALIDATE logo depois confere e,
-- se alguma linha antiga violar, a restrição fica NOT VALID (continua valendo
-- para linhas novas e alteradas) e a migration segue com um aviso.

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('assessments_answers_size_check', 'answers IS NULL OR octet_length(answers::text) <= 65536')
    ) AS t(name, expr)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.assessments'::regclass AND conname = c.name
    ) THEN
      EXECUTE format('ALTER TABLE public.assessments ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.name, c.expr);
    END IF;

    BEGIN
      EXECUTE format('ALTER TABLE public.assessments VALIDATE CONSTRAINT %I', c.name);
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING 'DI-081: % ficou NOT VALID (há linhas antigas fora do limite)', c.name;
    END;
  END LOOP;
END
$$;

-- =====================================================================
-- VERIFICAÇÃO (Supabase local; não rodar escrita em produção)
-- =====================================================================
-- Formatos (esperado: t, t, t, t, f, f, f):
-- SELECT private.is_valid_quiz_session_id('0f4a1d4e-5b8a-4c64-9f1e-1d2f3a4b5c6d'),
--        private.is_valid_quiz_session_id('s_1760000000000_abc1234'),
--        private.is_valid_quiz_session_id('8f14e45f-ceea-467e-a5b6-1b2c3d4e5f60-wl'),
--        private.is_valid_quiz_session_id('e2e-session-0001-anon'),
--        private.is_valid_quiz_session_id('curto'),
--        private.is_valid_quiz_session_id('tem espaço no meio'),
--        private.is_valid_quiz_session_id(repeat('a', 65));
--
-- HTTP com a anon key (POST /rest/v1/rpc/upsert_anon_assessment):
--   session_id UUID e answers pequenos ................ 200
--   p_session_id "x' OR 1=1 --" ......................... 400 (22023)
--   p_answers com mais de 32 KB ......................... 400 (22023)
--   p_email "nao-e-email" ............................... 400 (22023)
--   p_full_name com 201 caracteres ...................... 400 (22023)
--
-- Restrição (esperado: convalidated = true):
-- SELECT conname, convalidated FROM pg_constraint
--  WHERE conrelid = 'public.assessments'::regclass AND conname = 'assessments_answers_size_check';
-- =====================================================================
