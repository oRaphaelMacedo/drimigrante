-- =====================================================
-- 20261016000200 — Corrige display_conditions do quiz (DI-005) e dois textos
-- que prometiam serviço/advogado (DI-065).
--
-- STATUS: NÃO APLICADA. Migration só de dados; aplicar manualmente em produção
-- (dono / Tech Lead). O app já corrige o problema sem ela: useQuizQuestions
-- troca condições incompletas pela regra do código (src/lib/quiz-conditions.ts).
-- Não depende de nenhuma edge function; pode ser aplicada a qualquer momento.
--
-- Problema: o seed 20260509000002 gravou só {"question_key": "caso_tipo"} em
-- a1, a6, b1, c1, d1, d8 e f1 (perdeu answer_contains), {"question_key":
-- "d5_motivo_nao_contratou"} em d6 e {} em d7 (perdeu o any). Resultado: quem
-- marcava só "Casado(a)" via perguntas de todos os casos e a d7 nunca aparecia.
--
-- O que faz:
--   1. Guarda um snapshot em form_versions (rollback pelo Histórico do admin),
--      só se houver algo a corrigir.
--   2. Para cada pergunta condicional do código, grava a regra do código SÓ se
--      a condição atual no banco estiver incompleta. Condições completas
--      (inclusive editadas pelo admin) e NULL (sem condição) não são tocadas.
--   3. Atualiza os textos de a3 (help_text) e d3 (pergunta) SÓ se ainda forem
--      os textos originais do seed.
-- Idempotente: rodar de novo não altera nada.
--
-- Valores gerados de src/data/quiz-questions.ts com toDisplayConditions
-- (mesmo formato de scripts/generate-quiz-seed.mjs).
-- =====================================================

BEGIN;

-- Condição completa: {question_key, answer_key|answer_contains} ou any/all
-- não vazios com todos os itens completos.
-- Usa CASE (e não AND) porque o Postgres não garante a ordem de avaliação de
-- AND: jsonb_array_length() num valor que não é array gera erro. Chave ausente
-- resulta em FALSE (nunca NULL, que faria o UPDATE ignorar a linha).
CREATE OR REPLACE FUNCTION pg_temp.quiz_condition_is_complete(c jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN c IS NULL OR jsonb_typeof(c) <> 'object' THEN FALSE
    WHEN COALESCE(c->>'question_key', '') = '' THEN FALSE
    WHEN jsonb_typeof(c->'answer_contains') = 'string' AND c->>'answer_contains' <> '' THEN TRUE
    ELSE CASE jsonb_typeof(c->'answer_key')
      WHEN 'string' THEN c->>'answer_key' <> ''
      WHEN 'array'  THEN jsonb_array_length(c->'answer_key') > 0
      ELSE FALSE
    END
  END
$$;

CREATE OR REPLACE FUNCTION pg_temp.quiz_display_conditions_is_complete(dc jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN dc IS NULL THEN TRUE  -- sem condição: pergunta sempre visível (intencional)
    WHEN jsonb_typeof(dc) <> 'object' THEN FALSE
    WHEN dc ? 'any' OR dc ? 'all' THEN
      CASE
        WHEN jsonb_typeof(COALESCE(dc->'any', dc->'all')) <> 'array' THEN FALSE
        WHEN jsonb_array_length(COALESCE(dc->'any', dc->'all')) = 0 THEN FALSE
        ELSE NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(dc->'any', dc->'all')) AS e(item)
          WHERE NOT pg_temp.quiz_condition_is_complete(e.item)
        )
      END
    ELSE pg_temp.quiz_condition_is_complete(dc)
  END
$$;

CREATE TEMP TABLE _quiz_dc_fix (
  question_key       text PRIMARY KEY,
  display_conditions jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _quiz_dc_fix (question_key, display_conditions) VALUES
    ('caso_tipo', '{"question_key":"processo_tipo","answer_key":"nacionalidade"}'::jsonb),
    ('a1_antepassado', '{"question_key":"caso_tipo","answer_contains":"A"}'::jsonb),
    ('a2_documento', '{"question_key":"a1_antepassado","answer_key":["pai_mae","avo","bisavo","trisavo"]}'::jsonb),
    ('a3_interesse_docs', '{"question_key":"a2_documento","answer_key":"nao"}'::jsonb),
    ('a4_lacos', '{"question_key":"a1_antepassado","answer_key":["pai_mae","avo","bisavo","trisavo"]}'::jsonb),
    ('a5_genealogia', '{"question_key":"a1_antepassado","answer_key":"nao_sei"}'::jsonb),
    ('a6_filiacao', '{"question_key":"caso_tipo","answer_contains":"A"}'::jsonb),
    ('b1_tempo_casamento', '{"question_key":"caso_tipo","answer_contains":"B"}'::jsonb),
    ('c1_maior_idade', '{"question_key":"caso_tipo","answer_contains":"C"}'::jsonb),
    ('c2_mora_portugal', '{"question_key":"c1_maior_idade","answer_key":"sim"}'::jsonb),
    ('c3_tempo_portugal', '{"question_key":"c2_mora_portugal","answer_key":"sim"}'::jsonb),
    ('d1_situacao_legal', '{"question_key":"caso_tipo","answer_contains":"D"}'::jsonb),
    ('d2_tempo_autorizacao', '{"question_key":"d1_situacao_legal","answer_key":"sim"}'::jsonb),
    ('d3_disposto_advogado', '{"question_key":"d1_situacao_legal","answer_key":"nao"}'::jsonb),
    ('d4_consultou_advogado', '{"question_key":"d3_disposto_advogado","answer_key":"sim"}'::jsonb),
    ('d5_motivo_nao_contratou', '{"question_key":"d4_consultou_advogado","answer_key":"sim"}'::jsonb),
    ('d6_preparado_financeiro', '{"question_key":"d5_motivo_nao_contratou","answer_contains":"era_caro"}'::jsonb),
    ('d7_consultar_agora', '{"any":[{"question_key":"d1_situacao_legal","answer_key":"sim"},{"question_key":"d4_consultou_advogado","answer_key":"nao"}]}'::jsonb),
    ('d8_filhos_portugal', '{"question_key":"caso_tipo","answer_contains":"D"}'::jsonb),
    ('f1_mora_portugal', '{"question_key":"caso_tipo","answer_contains":"F"}'::jsonb),
    ('f2_quando_mudou', '{"question_key":"f1_mora_portugal","answer_key":"sim"}'::jsonb);

CREATE TEMP TABLE _quiz_text_fix (
  question_key text NOT NULL,
  field        text NOT NULL CHECK (field IN ('help_text', 'question_text_pt')),
  old_value    text NOT NULL,
  new_value    text NOT NULL
) ON COMMIT DROP;

INSERT INTO _quiz_text_fix (question_key, field, old_value, new_value) VALUES
    ('a3_interesse_docs', 'help_text',
     'Podemos fazer esse levantamento documental por você em Portugal.',
     'Isso ajuda a indicar os próximos passos para conseguir os documentos.'),
    ('d3_disposto_advogado', 'question_text_pt',
     'Para regularizar a sua situação, precisará contratar um advogado. Está disposto(a) e preparado(a) financeiramente para essa contratação?',
     'Muitas pessoas contratam um advogado para regularizar a situação. Você está disposto(a) e preparado(a) financeiramente para isso, se for necessário?');

-- 1. Snapshot para rollback (mesmo formato de snapshot_quiz_version), só se houver correção.
INSERT INTO form_versions (version_number, name, description, schema_snapshot, is_active, published_at, published_by)
SELECT
  COALESCE((SELECT MAX(version_number) FROM form_versions), 0) + 1,
  'Antes da migration 20261016000200',
  'Snapshot automático antes de corrigir display_conditions e textos do quiz',
  jsonb_build_object(
    'themes',    COALESCE((SELECT jsonb_agg(t ORDER BY t.sort_order) FROM form_themes t), '[]'::jsonb),
    'questions', COALESCE((SELECT jsonb_agg(q ORDER BY q.sort_order) FROM form_questions q), '[]'::jsonb),
    'options',   COALESCE((SELECT jsonb_agg(o ORDER BY o.question_id, o.sort_order) FROM form_question_options o), '[]'::jsonb)
  ),
  FALSE,
  NOW(),
  NULL
WHERE EXISTS (
    SELECT 1
    FROM form_questions q
    JOIN _quiz_dc_fix f ON f.question_key = q.question_key
    WHERE NOT pg_temp.quiz_display_conditions_is_complete(q.display_conditions)
  )
  OR EXISTS (
    SELECT 1
    FROM form_questions q
    JOIN _quiz_text_fix t ON t.question_key = q.question_key
    WHERE (t.field = 'help_text' AND q.help_text = t.old_value)
       OR (t.field = 'question_text_pt' AND q.question_text_pt = t.old_value)
  );

-- 2. display_conditions incompletas → regra do código.
UPDATE form_questions q
SET display_conditions = f.display_conditions
FROM _quiz_dc_fix f
WHERE q.question_key = f.question_key
  AND NOT pg_temp.quiz_display_conditions_is_complete(q.display_conditions);

-- 3. Textos sem promessa de serviço/advogado (só se ainda forem os originais).
UPDATE form_questions q
SET help_text = t.new_value
FROM _quiz_text_fix t
WHERE t.field = 'help_text'
  AND q.question_key = t.question_key
  AND q.help_text = t.old_value;

UPDATE form_questions q
SET question_text_pt = t.new_value
FROM _quiz_text_fix t
WHERE t.field = 'question_text_pt'
  AND q.question_key = t.question_key
  AND q.question_text_pt = t.old_value;

COMMIT;

-- =====================================================
-- VERIFICAÇÃO (rodar no SQL Editor depois de aplicar; só leitura)
-- =====================================================
-- a) Nenhuma condição incompleta. Esperado: 0 linhas.
--
--   SELECT question_key, display_conditions
--   FROM form_questions
--   WHERE display_conditions IS NOT NULL
--     AND NOT (
--       (display_conditions ? 'any'
--         AND jsonb_typeof(display_conditions->'any') = 'array'
--         AND display_conditions->'any' <> '[]'::jsonb)
--       OR (display_conditions ? 'all'
--         AND jsonb_typeof(display_conditions->'all') = 'array'
--         AND display_conditions->'all' <> '[]'::jsonb)
--       OR (display_conditions ? 'question_key'
--         AND (display_conditions ? 'answer_key' OR display_conditions ? 'answer_contains'))
--     );
--
-- b) Valores esperados nas perguntas corrigidas. Esperado:
--    a1/a6 → answer_contains "A"; b1 → "B"; c1 → "C"; d1/d8 → "D"; f1 → "F";
--    d6 → d5_motivo_nao_contratou contém "era_caro"; d7 → any [d1 = sim, d4 = nao].
--
--   SELECT question_key, display_conditions
--   FROM form_questions
--   WHERE question_key IN ('a1_antepassado','a6_filiacao','b1_tempo_casamento',
--     'c1_maior_idade','d1_situacao_legal','d6_preparado_financeiro',
--     'd7_consultar_agora','d8_filhos_portugal','f1_mora_portugal')
--   ORDER BY sort_order;
--
-- c) Textos novos. Esperado: 0 linhas com os textos antigos.
--
--   SELECT question_key, help_text, question_text_pt
--   FROM form_questions
--   WHERE help_text = 'Podemos fazer esse levantamento documental por você em Portugal.'
--      OR question_text_pt LIKE 'Para regularizar a sua situação, precisará contratar um advogado.%';
--
-- d) Snapshot criado (rollback pelo admin → Quiz → Histórico):
--
--   SELECT version_number, name, created_at FROM form_versions
--   ORDER BY version_number DESC LIMIT 3;
-- =====================================================
