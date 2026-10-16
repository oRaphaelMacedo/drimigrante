-- =====================================================================
-- 20261025000200_resume_token.sql
-- DI-024 (P1, retenção): link de retomada do resultado entre aparelhos.
--
-- Problema
--   O pré-resultado do quiz só existe no localStorage do aparelho em que o
--   quiz foi feito. Quem abre o e-mail (ou o link guardado) em outro aparelho
--   não encontra o resultado. Pôr o session_id na URL resolveria a leitura,
--   mas daria ESCRITA: upsert_anon_assessment grava por session_id.
--
-- Solução
--   1. assessments.resume_token: token opaco e aleatório (64 hex, 244 bits de
--      aleatoriedade: dois gen_random_uuid() sem hífens), único e só de LEITURA.
--      Preenchido para as linhas existentes pelo próprio ADD COLUMN (default
--      volátil → o Postgres reescreve a tabela e calcula um token por linha,
--      sem disparar triggers de UPDATE nem mexer em updated_at).
--   2. get_assessment_by_resume_token(p_token): SECURITY DEFINER, STABLE,
--      liberada para anon. Devolve só o necessário para mostrar o resultado e
--      permitir a compra no outro aparelho (respostas, nome, e-mail, data e o
--      score já calculado). NUNCA devolve id, session_id nem user_id: quem tem
--      o link vê o resultado, mas não consegue gravar no assessment.
--      Token com formato inválido, inexistente, de assessment não concluído ou
--      vencido (expires_at) → conjunto vazio (o front mostra "link inválido").
--
-- Como o dono do resultado obtém o token (front, src/lib/resume-token.ts)
--   · No aparelho do quiz: get_anon_assessment(id, session_id) (RETURNS SETOF
--     assessments, SELECT *) passa a incluir resume_token — quem prova a posse
--     pelo session_id pode ver o próprio token. upsert_anon_assessment (RETURNS
--     assessments) também o devolve.
--   · No outro aparelho: o próprio ?r=<token> do link.
--   · E-mails (DI-077, W4-02): as Edge Functions leem a coluna com a service_role.
--   O front funciona antes e depois desta migration: sem a coluna, o botão
--   "Guardar meu resultado" não aparece e ?r= mostra o estado de link inválido.
--
-- Segurança
--   · 244 bits aleatórios: enumerar tokens é inviável. Mesmo assim, a RPC entra
--     na allowlist de REVOKE EXECUTE do W3-06 (DI-081) e pode receber o limite
--     de chamadas anônimas de 20261025000100_anon_rpc_limits.sql.
--   · CHECK de formato + índice único: um dono que edite a própria linha (policy
--     assessments_authenticated_update) não consegue gravar um token fraco nem
--     copiar o de outra pessoa.
--   · O token é um segredo do portador: o front tira ?r= da URL antes de qualquer
--     pageview (history.replaceState) e src/lib/url-sanitize.ts remove `r` do que
--     vai para PostHog/GA/Sentry.
--   · Sem função auxiliar para gerar o token: o DEFAULT é uma expressão inline,
--     para que INSERTs de clientes não dependam de EXECUTE em outra função.
--
-- Dependências e ORDEM DE RELEASE
--   · Independe das outras migrations da onda 3. Pode ser aplicada antes ou
--     depois do front do W3-01 (o front degrada sem ela, ver acima). Recomendado:
--     aplicar ANTES de ligar o link nos e-mails (DI-077).
--   · Reescreve a tabela assessments (ACCESS EXCLUSIVE durante o ADD COLUMN):
--     aplicar fora do pico (a tabela é pequena; deve levar segundos).
--
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / REVOKE e GRANT repetíveis.
-- NÃO APLICAR sem validar no Supabase local (consultas no fim do arquivo).
-- =====================================================================

-- ─── 1. Coluna resume_token ─────────────────────────────────────────────────

ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS resume_token text
  DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

-- Se a coluna já existia sem default (aplicação parcial anterior), garante os dois.
ALTER TABLE public.assessments
  ALTER COLUMN resume_token SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

UPDATE public.assessments
SET resume_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE resume_token IS NULL;

ALTER TABLE public.assessments
  ALTER COLUMN resume_token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assessments'::regclass
      AND conname  = 'assessments_resume_token_format'
  ) THEN
    ALTER TABLE public.assessments
      ADD CONSTRAINT assessments_resume_token_format CHECK (resume_token ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS assessments_resume_token_key
  ON public.assessments (resume_token);

COMMENT ON COLUMN public.assessments.resume_token IS
  'DI-024: token opaco do link de retomada (/results?r=<token>). Só leitura, via get_assessment_by_resume_token. Nunca enviar a analytics.';

-- ─── 2. RPC de leitura pelo token ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_assessment_by_resume_token(p_token text)
RETURNS TABLE (
  answers        jsonb,
  full_name      text,
  email          text,
  completed_at   timestamptz,
  score_numeric  numeric,
  score_category text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.answers::jsonb,
    a.full_name::text,
    a.email::text,
    a.completed_at::timestamptz,
    r.score_numeric::numeric,
    r.score_category::text
  FROM public.assessments a
  LEFT JOIN public.assessment_results r ON r.assessment_id = a.id
  WHERE p_token ~ '^[0-9a-f]{64}$'
    AND a.resume_token = p_token
    AND a.status = 'completed'
    AND (a.expires_at IS NULL OR a.expires_at > now())
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_assessment_by_resume_token(text) IS
  'DI-024: resultado do quiz pelo token de retomada. Só leitura; não devolve id, session_id nem user_id.';

REVOKE ALL ON FUNCTION public.get_assessment_by_resume_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_by_resume_token(text) TO anon, authenticated;

-- ─── Verificação (rodar no Supabase local, NÃO em produção) ─────────────────
--
-- 1) Todas as linhas com token válido e sem repetição:
--    SELECT count(*) AS total,
--           count(*) FILTER (WHERE resume_token ~ '^[0-9a-f]{64}$') AS validos,
--           count(DISTINCT resume_token) AS distintos
--    FROM public.assessments;                       -- total = validos = distintos
--
-- 2) Leitura pelo token como anon (troque o token por um real da base local):
--    SET ROLE anon;
--    SELECT * FROM public.get_assessment_by_resume_token('<token>');   -- 1 linha
--    SELECT * FROM public.get_assessment_by_resume_token('abc');       -- 0 linhas
--    SELECT * FROM public.get_assessment_by_resume_token(repeat('0', 64)); -- 0 linhas
--    RESET ROLE;
--
-- 3) A RPC não expõe colunas de escrita:
--    SELECT proname, pg_get_function_result(oid)
--    FROM pg_proc WHERE proname = 'get_assessment_by_resume_token';
--    -- sem id, session_id nem user_id no resultado
--
-- 4) Novo assessment recebe token automaticamente:
--    SELECT resume_token FROM public.upsert_anon_assessment(
--      gen_random_uuid()::text, '{"processo_tipo":"nacionalidade"}'::jsonb,
--      'Teste', 'teste@example.com', NULL, 1, 1, 100, 'completed');
--
-- 5) Privilégios: anon e authenticated executam; PUBLIC não.
--    SELECT grantee, privilege_type FROM information_schema.routine_privileges
--    WHERE routine_name = 'get_assessment_by_resume_token';
