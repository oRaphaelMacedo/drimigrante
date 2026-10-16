-- =====================================================
-- 20261030000200 — Opção "Nenhuma destas situações" em caso_tipo (DI-075) e
-- textos do quiz em pt-BR e em sentence case (DI-074 / DI-079).
--
-- STATUS: NÃO APLICADA. Migration só de dados; aplicar manualmente em produção
-- (dono / Tech Lead), no SQL Editor ou com `supabase db push`.
--
-- Ordem de release:
--   - Não depende de nenhuma migration nova nem de deploy de function para
--     funcionar: o front trata a chave 'nenhum' como opção exclusiva e o
--     servidor só pontua/sugere a partir das chaves A–F ('nenhum' não soma
--     pontos e leva à "análise personalizada").
--   - Recomendado: publicar antes as functions que usam _shared/pathways.ts
--     (compute-eligibility, generate-explanation, chat-completion), que já
--     trazem o rótulo "Nenhuma das situações listadas" para o contexto da IA.
--     Sem esse deploy, o contexto da IA mostra a chave crua "nenhum".
--   - Independente da 20261016000200 (display_conditions): pode ser aplicada
--     antes ou depois dela. Os textos de a3 e d3 ficam com aquela migration.
--
-- Problema (DI-075): em caso_tipo (múltipla escolha) quem não se encaixa em
-- nenhuma das situações A–F ficava preso com o "Próximo" desabilitado.
--
-- O que faz:
--   1. Guarda um snapshot em form_versions (rollback pelo Histórico do admin),
--      só se houver algo a mudar.
--   2. Insere a opção 'nenhum' em caso_tipo (score 0, depois da última opção).
--      ON CONFLICT: se a opção já existir (criada pelo admin), não mexe nela.
--   3. Atualiza temas, pergunta e opções do quiz para pt-BR e sentence case,
--      SÓ onde o texto ainda é o original do seed (textos editados pelo admin
--      não são tocados). Valores iguais aos de src/data/quiz-questions.ts.
-- Idempotente: rodar de novo não altera nada.
-- =====================================================

BEGIN;

CREATE TEMP TABLE _quiz_theme_text_fix (
  code      text PRIMARY KEY,
  old_value text NOT NULL,
  new_value text NOT NULL
) ON COMMIT DROP;

INSERT INTO _quiz_theme_text_fix (code, old_value, new_value) VALUES
    ('processo',    'Tipo de Processo', 'Tipo de processo'),
    ('selecao',     'Seleção de Caso',  'Seleção de caso'),
    ('ex_colonias', 'Ex-Colónias',      'Ex-colônias');

CREATE TEMP TABLE _quiz_question_text_fix (
  question_key text NOT NULL,
  field        text NOT NULL CHECK (field IN ('help_text', 'question_text_pt')),
  old_value    text NOT NULL,
  new_value    text NOT NULL,
  PRIMARY KEY (question_key, field)
) ON COMMIT DROP;

INSERT INTO _quiz_question_text_fix (question_key, field, old_value, new_value) VALUES
    ('caso_tipo', 'question_text_pt',
     'Eu sou (marque todas as respostas que se aplicam a você):',
     'Quais destas situações se aplicam a você?'),
    ('caso_tipo', 'help_text',
     'Pode selecionar mais de uma opção.',
     'Marque todas as que se aplicam. Se nenhuma se aplicar, marque “Nenhuma destas situações”.');

CREATE TEMP TABLE _quiz_option_text_fix (
  question_key text NOT NULL,
  option_key   text NOT NULL,
  old_value    text NOT NULL,
  new_value    text NOT NULL,
  PRIMARY KEY (question_key, option_key)
) ON COMMIT DROP;

INSERT INTO _quiz_option_text_fix (question_key, option_key, old_value, new_value) VALUES
    ('processo_tipo', 'nacionalidade',
     'Quero obter a Nacionalidade Portuguesa',
     'Quero obter a nacionalidade portuguesa'),
    ('processo_tipo', 'visto',
     'Quero obter um Visto para morar/trabalhar em Portugal',
     'Quero obter um visto para morar ou trabalhar em Portugal'),
    ('processo_tipo', 'regularizacao',
     'Já estou em Portugal e quero regularizar a minha situação',
     'Já estou em Portugal e quero regularizar minha situação'),
    ('caso_tipo', 'A',
     'Filho(a), Neto(a), Bisneto(a) ou Trineto(a) de um(a) português(a) nato(a)',
     'Sou filho(a), neto(a), bisneto(a) ou trineto(a) de português(a) nato(a)'),
    ('caso_tipo', 'B',
     'Casado(a) ou em união estável documentada com cidadão(ã) português(a)',
     'Sou casado(a) ou vivo em união estável documentada com cidadão(ã) português(a)'),
    ('caso_tipo', 'E',
     'Já fui português(a) e perdi a minha nacionalidade',
     'Já fui português(a) e perdi minha nacionalidade'),
    ('caso_tipo', 'F',
     'A minha família é originária das ex-colónias portuguesas',
     'Minha família é originária das ex-colônias portuguesas'),
    ('a1_antepassado', 'pai_mae',
     'O meu pai ou a minha mãe',
     'Meu pai ou minha mãe'),
    ('a1_antepassado', 'avo',
     'O meu avô ou a minha avó',
     'Meu avô ou minha avó'),
    ('a1_antepassado', 'bisavo',
     'O meu bisavô ou a minha bisavó',
     'Meu bisavô ou minha bisavó'),
    ('a1_antepassado', 'trisavo',
     'Trisavô/Trisavó ou parentes ainda mais distantes',
     'Trisavô, trisavó ou parentes mais distantes'),
    ('d5_motivo_nao_contratou', 'sem_firmeza',
     'Não senti firmeza / O advogado não pareceu competente',
     'Não senti firmeza ou o advogado não pareceu competente'),
    ('d5_motivo_nao_contratou', 'sozinho',
     'Quero resolver a minha situação sozinho(a)',
     'Quero resolver minha situação sozinho(a)'),
    ('f2_quando_mudou', 'antes_1974',
     'Antes de 25 de Abril de 1974',
     'Antes de 25 de abril de 1974'),
    ('f2_quando_mudou', 'depois_1974',
     'Depois de 25 de Abril de 1974',
     'Depois de 25 de abril de 1974');

-- 1. Snapshot para rollback (mesmo formato de snapshot_quiz_version), só se houver mudança.
INSERT INTO form_versions (version_number, name, description, schema_snapshot, is_active, published_at, published_by)
SELECT
  COALESCE((SELECT MAX(version_number) FROM form_versions), 0) + 1,
  'Antes da migration 20261030000200',
  'Snapshot automático antes de incluir "Nenhuma destas situações" e dos textos em pt-BR',
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
    WHERE q.question_key = 'caso_tipo'
      AND NOT EXISTS (
        SELECT 1 FROM form_question_options o
        WHERE o.question_id = q.id AND o.option_key = 'nenhum'
      )
  )
  OR EXISTS (
    SELECT 1 FROM form_themes t
    JOIN _quiz_theme_text_fix f ON f.code = t.code AND t.name_pt = f.old_value
  )
  OR EXISTS (
    SELECT 1 FROM form_questions q
    JOIN _quiz_question_text_fix f ON f.question_key = q.question_key
    WHERE (f.field = 'help_text' AND q.help_text = f.old_value)
       OR (f.field = 'question_text_pt' AND q.question_text_pt = f.old_value)
  )
  OR EXISTS (
    SELECT 1 FROM form_question_options o
    JOIN form_questions q ON q.id = o.question_id
    JOIN _quiz_option_text_fix f ON f.question_key = q.question_key AND f.option_key = o.option_key
    WHERE o.option_text_pt = f.old_value
  );

-- 2. "Nenhuma destas situações" (exclusiva no front pela chave 'nenhum'), por último.
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order, is_active)
SELECT
  q.id,
  'nenhum',
  'Nenhuma destas situações',
  0,
  FALSE,
  COALESCE((SELECT MAX(o.sort_order) FROM form_question_options o WHERE o.question_id = q.id), -1) + 1,
  TRUE
FROM form_questions q
WHERE q.question_key = 'caso_tipo'
ON CONFLICT (question_id, option_key) DO NOTHING;

-- 3. Textos em pt-BR e sentence case (só se ainda forem os originais do seed).
UPDATE form_themes t
SET name_pt = f.new_value
FROM _quiz_theme_text_fix f
WHERE t.code = f.code
  AND t.name_pt = f.old_value;

UPDATE form_questions q
SET question_text_pt = f.new_value
FROM _quiz_question_text_fix f
WHERE f.field = 'question_text_pt'
  AND q.question_key = f.question_key
  AND q.question_text_pt = f.old_value;

UPDATE form_questions q
SET help_text = f.new_value
FROM _quiz_question_text_fix f
WHERE f.field = 'help_text'
  AND q.question_key = f.question_key
  AND q.help_text = f.old_value;

UPDATE form_question_options o
SET option_text_pt = f.new_value
FROM form_questions q, _quiz_option_text_fix f
WHERE q.id = o.question_id
  AND f.question_key = q.question_key
  AND f.option_key = o.option_key
  AND o.option_text_pt = f.old_value;

COMMIT;

-- =====================================================
-- VERIFICAÇÃO (rodar no SQL Editor depois de aplicar; só leitura)
-- =====================================================
-- a) A opção existe, ativa, com score 0 e por último. Esperado: 1 linha,
--    option_text_pt = 'Nenhuma destas situações', score = 0, is_active = true.
--
--   SELECT o.option_key, o.option_text_pt, o.score, o.sort_order, o.is_active
--   FROM form_question_options o
--   JOIN form_questions q ON q.id = o.question_id
--   WHERE q.question_key = 'caso_tipo'
--   ORDER BY o.sort_order;
--
-- b) Nenhum texto antigo sobrou. Esperado: 0 linhas.
--
--   SELECT 'tema' AS onde, code AS chave, name_pt AS texto FROM form_themes
--   WHERE name_pt IN ('Tipo de Processo', 'Seleção de Caso', 'Ex-Colónias')
--   UNION ALL
--   SELECT 'pergunta', question_key, question_text_pt FROM form_questions
--   WHERE question_text_pt LIKE 'Eu sou (marque%' OR help_text = 'Pode selecionar mais de uma opção.'
--   UNION ALL
--   SELECT 'opção', o.option_key, o.option_text_pt FROM form_question_options o
--   WHERE o.option_text_pt ~ '(^O meu |^A minha | a minha |colónias|Nacionalidade Portuguesa|25 de Abril|Trisavô/)';
--
-- c) Snapshot criado (rollback pelo admin → Quiz → Histórico):
--
--   SELECT version_number, name, created_at FROM form_versions
--   ORDER BY version_number DESC LIMIT 3;
-- =====================================================
