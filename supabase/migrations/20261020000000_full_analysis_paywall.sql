-- =====================================================================
-- 20261020000000_full_analysis_paywall.sql
-- DI-016 (P1, segurança): paywall da análise completa aplicado no servidor.
--
-- Problema
--   A policy assessment_results_read deixa o dono do assessment ler TODAS as
--   colunas via REST, inclusive ia_explanation_full (a análise paga), mesmo
--   sem ter pago ou depois de o acesso de 30 dias expirar. A expiração só
--   existia no React (src/lib/access.ts).
--
-- Correção
--   1. has_active_access(_user_id, _feature): espelho em SQL de
--      hasFeatureAccess() de src/lib/access.ts (staff, assinatura €4,90,
--      €30 no prazo, leitura de documentos depois de expirar).
--      SECURITY DEFINER e executável SÓ pela service_role (Edge Functions,
--      ex.: generate-explanation do DI-018) — um cliente não consulta o
--      acesso de outra pessoa.
--   2. assessment_results: SELECT por coluna para `authenticated`, SEM
--      ia_explanation_full. `anon` perde o SELECT (nunca teve linhas pela RLS).
--      Escritas de clientes ficam revogadas (só a service_role grava).
--   3. get_full_analysis(p_assessment_id): única forma de um cliente ler a
--      análise completa. Exige sessão, posse do assessment (ou staff) e
--      has_active_access(..., 'full_analysis').
--      Erros (SQLSTATE PTxxx → o PostgREST responde com o status HTTP xxx):
--        PT401 'Authentication required' · PT404 'Not found' (sem revelar se o
--        id existe) · PT402 'Payment required' (nunca pagou, reembolso ou
--        acesso expirado).
--      Sem linha em assessment_results → conjunto vazio. Linha sem a análise
--      completa → ia_explanation_full NULL (o front mostra "preparando").
--
-- Dependências e ORDEM DE RELEASE
--   · Depois de 20261016000000_fix_is_hub_user_rls.sql (is_staff_user) e de
--     20260630000000 / 20261016000150 (colunas de prazo e chat em subscriptions).
--   · Aplicar NO MESMO RELEASE do front da W2-06 (AnalysisPage via RPC e hooks
--     com colunas explícitas). O front antigo faz assessment_results(*), que
--     passa a falhar com "permission denied" para clientes.
--   · Edge Functions usam a service_role e não são afetadas (continuam lendo
--     e gravando todas as colunas).
--
-- Idempotente: CREATE OR REPLACE nas funções; REVOKE/GRANT podem repetir.
-- Todas as funções SECURITY DEFINER têm `SET search_path = public`.
-- NÃO APLICAR sem validar no Supabase local (consultas no fim do arquivo).
-- Conferido em Postgres 17 + PostgREST 14 locais (descartáveis), com todas as
-- migrations anteriores: embed com colunas explícitas → 200; assessment_results(*)
-- ou ia_explanation_full direto → 403 (42501); rpc sem pagamento ou expirada →
-- 402 (PT402); rpc de outra conta → 404 (PT404); anon → 401; cliente chamando
-- has_active_access → 403. Via psql (papel authenticated): assinante €4,90 e
-- staff leem a análise; cliente não grava em assessment_results.
-- =====================================================================

-- ─── 1. has_active_access ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.has_active_access(_user_id UUID, _feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.subscriptions%ROWTYPE;
  grants_access BOOLEAN;
BEGIN
  IF _user_id IS NULL
     OR _feature IS NULL
     OR _feature NOT IN ('dashboard', 'full_analysis', 'chat', 'documents_read', 'documents_upload') THEN
    RETURN FALSE;
  END IF;

  -- Staff (super_admin, hub_admin, lawyer, paralegal) nunca expira.
  IF public.is_staff_user(_user_id) THEN
    RETURN TRUE;
  END IF;

  SELECT * INTO s FROM public.subscriptions sub WHERE sub.user_id = _user_id;
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Assinatura €4,90 ativa: tudo liberado enquanto ativa.
  IF coalesce(s.recurring_active, FALSE) THEN
    RETURN TRUE;
  END IF;

  grants_access := coalesce(s.has_dashboard_access, FALSE) OR coalesce(s.has_full_analysis, FALSE);

  -- Nunca pagou (ou pagamento revogado sem nenhuma flag).
  IF NOT coalesce(s.one_time_paid, FALSE) AND NOT grants_access THEN
    RETURN FALSE;
  END IF;

  -- €30 expirado: só a leitura dos próprios documentos continua.
  IF s.one_time_access_expires_at IS NOT NULL AND now() > s.one_time_access_expires_at THEN
    RETURN _feature = 'documents_read';
  END IF;

  -- Pagou, mas as flags foram revogadas dentro do prazo (reembolso/disputa).
  IF NOT grants_access THEN
    RETURN FALSE;
  END IF;

  RETURN CASE _feature
    WHEN 'full_analysis' THEN coalesce(s.has_full_analysis, FALSE)
    WHEN 'chat'          THEN coalesce(s.has_chat_access, FALSE)
    ELSE                      coalesce(s.has_dashboard_access, FALSE)
  END;
END;
$$;

COMMENT ON FUNCTION public.has_active_access(UUID, TEXT) IS
  'Acesso vigente a uma funcionalidade (dashboard, full_analysis, chat, documents_read, '
  'documents_upload). Espelha hasFeatureAccess de src/lib/access.ts. Só service_role executa.';

REVOKE ALL ON FUNCTION public.has_active_access(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_access(UUID, TEXT) TO service_role;

-- ─── 2. assessment_results: SELECT por coluna, sem ia_explanation_full ───────

REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.assessment_results FROM anon, authenticated;

-- A RLS (assessment_results_read) continua decidindo QUAIS linhas; aqui só
-- limitamos QUAIS colunas. Coluna nova na tabela não é exposta até entrar aqui.
GRANT SELECT (
  id,
  assessment_id,
  score_numeric,
  score_category,
  suggested_visa_types,
  rule_version_id,
  ia_explanation_short,
  ia_model_used,
  ia_tokens_used,
  needs_reprocessing,
  reprocessing_reason,
  computed_at,
  created_at
) ON public.assessment_results TO authenticated;

-- ─── 3. get_full_analysis ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_full_analysis(p_assessment_id UUID)
RETURNS TABLE (
  assessment_id UUID,
  ia_explanation_full TEXT,
  computed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PT401';
  END IF;

  IF p_assessment_id IS NULL THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'PT404';
  END IF;

  SELECT a.user_id INTO v_owner FROM public.assessments a WHERE a.id = p_assessment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'PT404';
  END IF;

  -- Assessment de outra pessoa (ou ainda anônimo): mesma resposta de "não existe".
  IF v_owner IS DISTINCT FROM v_uid AND NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = 'PT404';
  END IF;

  IF NOT public.has_active_access(v_uid, 'full_analysis') THEN
    RAISE EXCEPTION 'Payment required' USING ERRCODE = 'PT402';
  END IF;

  RETURN QUERY
    SELECT r.assessment_id, r.ia_explanation_full, r.computed_at
    FROM public.assessment_results r
    WHERE r.assessment_id = p_assessment_id;
END;
$$;

COMMENT ON FUNCTION public.get_full_analysis(UUID) IS
  'Análise completa (ia_explanation_full) de um assessment do próprio usuário (ou staff), '
  'só com acesso vigente a full_analysis. Erros: PT401, PT404, PT402 (Payment required).';

REVOKE ALL ON FUNCTION public.get_full_analysis(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_full_analysis(UUID) TO authenticated, service_role;

-- =====================================================================
-- VERIFICAÇÃO (Supabase local; não rodar escrita em produção)
-- =====================================================================
-- Privilégios (esperado: ia_explanation_full ausente para authenticated):
-- SELECT grantee, column_name FROM information_schema.column_privileges
--  WHERE table_schema = 'public' AND table_name = 'assessment_results'
--    AND privilege_type = 'SELECT' AND grantee IN ('anon', 'authenticated')
--  ORDER BY grantee, column_name;
--
-- Como cliente sem pagamento (troque os UUIDs):
-- BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<user_id>","role":"authenticated"}', true);
--   SELECT ia_explanation_full FROM public.assessment_results;      -- permission denied
--   SELECT score_category FROM public.assessment_results;           -- ok (só as próprias linhas)
--   SELECT * FROM public.get_full_analysis('<assessment_id>');      -- ERROR PT402 Payment required
--   SELECT public.has_active_access('<user_id>', 'full_analysis');  -- permission denied
-- ROLLBACK;
--
-- Pagante no prazo (one_time_paid, has_full_analysis, expires_at no futuro):
--   get_full_analysis devolve 1 linha com a análise (ou NULL se ainda não gerada).
-- Pagante expirado: PT402. Assessment de outra conta: PT404.
-- =====================================================================
