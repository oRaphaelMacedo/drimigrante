-- =====================================================
-- 20260509000002 — Seed quiz v1.0 (real questions from src/data/quiz-questions.ts)
-- Replaces the placeholder seed from initial migration.
-- Idempotent: TRUNCATEs form_themes/questions/options before re-seeding.
-- =====================================================

-- ALTER TYPE não pode correr dentro de uma transação em PostgreSQL
ALTER TYPE field_type ADD VALUE IF NOT EXISTS 'multiselect';

BEGIN;

-- Wipe existing seed data (CASCADE drops dependent rows)
TRUNCATE form_question_options, form_questions, form_themes RESTART IDENTITY CASCADE;

-- THEMES
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('processo', 'Tipo de Processo', '#3b62f6', NULL, 0, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('selecao', 'Seleção de Caso', '#6366f1', NULL, 1, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('descendencia', 'Descendência', '#8b5cf6', NULL, 2, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('matrimonio', 'Matrimônio', '#f59e0b', NULL, 3, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('nascimento', 'Nascimento', '#10b981', NULL, 4, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('residencia', 'Residência', '#ef4444', NULL, 5, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('ex_colonias', 'Ex-Colónias', '#06b6d4', NULL, 6, TRUE);

-- QUESTIONS
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'processo_tipo', 'Qual é o seu objetivo principal?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 0
  FROM form_themes WHERE code = 'processo';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'caso_tipo', 'Eu sou (marque todas as respostas que se aplicam a você):', 'Pode selecionar mais de uma opção.', 'multiselect'::field_type, '{"question_key":"processo_tipo","answer_key":"nacionalidade"}'::jsonb, '{}'::jsonb, NULL, TRUE, 1
  FROM form_themes WHERE code = 'selecao';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'a1_antepassado', 'Quem era o seu antepassado português(a)?', NULL, 'radio'::field_type, '{"question_key":"caso_tipo"}'::jsonb, '{}'::jsonb, NULL, TRUE, 2
  FROM form_themes WHERE code = 'descendencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'a2_documento', 'Você tem algum documento português do(a) seu(sua) antepassado(a)?', 'Por exemplo: certidão de nascimento, bilhete de identidade, passaporte ou certidão de casamento portugueses.', 'radio'::field_type, '{"question_key":"a1_antepassado","answer_key":["pai_mae","avo","bisavo","trisavo"]}'::jsonb, '{}'::jsonb, NULL, TRUE, 3
  FROM form_themes WHERE code = 'descendencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'a3_interesse_docs', 'Tem interesse em pesquisar e obter esses documentos em Portugal?', 'Podemos fazer esse levantamento documental por você em Portugal.', 'radio'::field_type, '{"question_key":"a2_documento","answer_key":"nao"}'::jsonb, '{}'::jsonb, NULL, TRUE, 4
  FROM form_themes WHERE code = 'descendencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'a4_lacos', 'Você possui laços com Portugal?', 'Por exemplo: já viajou para Portugal, participa de grupos culturais portugueses, tem conta bancária, NIF, imóvel, ou já morou/estudou em Portugal.', 'radio'::field_type, '{"question_key":"a1_antepassado","answer_key":["pai_mae","avo","bisavo","trisavo"]}'::jsonb, '{}'::jsonb, NULL, TRUE, 5
  FROM form_themes WHERE code = 'descendencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'a5_genealogia', 'Gostaria de explorar a sua árvore genealógica para descobrir se tem antepassados portugueses?', 'Estatisticamente, uma grande parcela dos brasileiros tem algum antepassado português.', 'radio'::field_type, '{"question_key":"a1_antepassado","answer_key":"nao_sei"}'::jsonb, '{}'::jsonb, NULL, TRUE, 6
  FROM form_themes WHERE code = 'descendencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'a6_filiacao', 'Você é filho(a) natural ou adotivo(a)?', NULL, 'radio'::field_type, '{"question_key":"caso_tipo"}'::jsonb, '{}'::jsonb, NULL, FALSE, 7
  FROM form_themes WHERE code = 'descendencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'b1_tempo_casamento', 'Há quanto tempo vocês estão casados(as) ou vivem em união estável?', NULL, 'radio'::field_type, '{"question_key":"caso_tipo"}'::jsonb, '{}'::jsonb, NULL, TRUE, 8
  FROM form_themes WHERE code = 'matrimonio';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'c1_maior_idade', 'Você é maior de idade (mais de 18 anos)?', NULL, 'radio'::field_type, '{"question_key":"caso_tipo"}'::jsonb, '{}'::jsonb, NULL, TRUE, 9
  FROM form_themes WHERE code = 'nascimento';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'c2_mora_portugal', 'Atualmente você mora em Portugal?', NULL, 'radio'::field_type, '{"question_key":"c1_maior_idade","answer_key":"sim"}'::jsonb, '{}'::jsonb, NULL, TRUE, 10
  FROM form_themes WHERE code = 'nascimento';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'c3_tempo_portugal', 'Há quanto tempo você mora em Portugal?', NULL, 'radio'::field_type, '{"question_key":"c2_mora_portugal","answer_key":"sim"}'::jsonb, '{}'::jsonb, NULL, TRUE, 11
  FROM form_themes WHERE code = 'nascimento';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd1_situacao_legal', 'A sua situação de residência em Portugal está regularizada? Já tem Autorização de Residência?', NULL, 'radio'::field_type, '{"question_key":"caso_tipo"}'::jsonb, '{}'::jsonb, NULL, TRUE, 12
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd2_tempo_autorizacao', 'Há quanto tempo está em Portugal com Autorização de Residência?', NULL, 'radio'::field_type, '{"question_key":"d1_situacao_legal","answer_key":"sim"}'::jsonb, '{}'::jsonb, NULL, TRUE, 13
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd3_disposto_advogado', 'Para regularizar a sua situação, precisará contratar um advogado. Está disposto(a) e preparado(a) financeiramente para essa contratação?', NULL, 'radio'::field_type, '{"question_key":"d1_situacao_legal","answer_key":"nao"}'::jsonb, '{}'::jsonb, NULL, TRUE, 14
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd4_consultou_advogado', 'Já se consultou com algum advogado sobre o seu caso?', NULL, 'radio'::field_type, '{"question_key":"d3_disposto_advogado","answer_key":"sim"}'::jsonb, '{}'::jsonb, NULL, TRUE, 15
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd5_motivo_nao_contratou', 'Por que não contratou esse advogado? (selecione todas que se aplicam)', NULL, 'multiselect'::field_type, '{"question_key":"d4_consultou_advogado","answer_key":"sim"}'::jsonb, '{}'::jsonb, NULL, TRUE, 16
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd6_preparado_financeiro', 'Agora já está mais preparado(a) financeiramente para contratar um advogado?', NULL, 'radio'::field_type, '{"question_key":"d5_motivo_nao_contratou"}'::jsonb, '{}'::jsonb, NULL, TRUE, 17
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd7_consultar_agora', 'Está preparado(a) para consultar um advogado agora para receber orientação jurídica sobre o seu caso?', NULL, 'radio'::field_type, '{}'::jsonb, '{}'::jsonb, NULL, TRUE, 18
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'd8_filhos_portugal', 'Você teve filhos em Portugal que possuem a nacionalidade portuguesa?', NULL, 'radio'::field_type, '{"question_key":"caso_tipo"}'::jsonb, '{}'::jsonb, NULL, TRUE, 19
  FROM form_themes WHERE code = 'residencia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'f1_mora_portugal', 'Você mora atualmente em Portugal?', NULL, 'radio'::field_type, '{"question_key":"caso_tipo"}'::jsonb, '{}'::jsonb, NULL, TRUE, 20
  FROM form_themes WHERE code = 'ex_colonias';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'f2_quando_mudou', 'Quando você se mudou para Portugal?', NULL, 'radio'::field_type, '{"question_key":"f1_mora_portugal","answer_key":"sim"}'::jsonb, '{}'::jsonb, NULL, TRUE, 21
  FROM form_themes WHERE code = 'ex_colonias';

-- OPTIONS
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nacionalidade', 'Quero obter a Nacionalidade Portuguesa', 0, FALSE, 0
  FROM form_questions WHERE question_key = 'processo_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'visto', 'Quero obter um Visto para morar/trabalhar em Portugal', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'processo_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'regularizacao', 'Já estou em Portugal e quero regularizar a minha situação', 0, FALSE, 2
  FROM form_questions WHERE question_key = 'processo_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao_sei', 'Não sei por onde começar', 0, FALSE, 3
  FROM form_questions WHERE question_key = 'processo_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'A', 'Filho(a), Neto(a), Bisneto(a) ou Trineto(a) de um(a) português(a) nato(a)', 0, FALSE, 0
  FROM form_questions WHERE question_key = 'caso_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'B', 'Casado(a) ou em união estável documentada com cidadão(ã) português(a)', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'caso_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'C', 'Nasci em Portugal, mas não tenho nacionalidade portuguesa', 0, FALSE, 2
  FROM form_questions WHERE question_key = 'caso_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'D', 'Moro em Portugal', 0, FALSE, 3
  FROM form_questions WHERE question_key = 'caso_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'E', 'Já fui português(a) e perdi a minha nacionalidade', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'caso_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'F', 'A minha família é originária das ex-colónias portuguesas', 0, FALSE, 5
  FROM form_questions WHERE question_key = 'caso_tipo';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'pai_mae', 'O meu pai ou a minha mãe', 40, FALSE, 0
  FROM form_questions WHERE question_key = 'a1_antepassado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'avo', 'O meu avô ou a minha avó', 30, FALSE, 1
  FROM form_questions WHERE question_key = 'a1_antepassado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'bisavo', 'O meu bisavô ou a minha bisavó', 20, FALSE, 2
  FROM form_questions WHERE question_key = 'a1_antepassado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'trisavo', 'Trisavô/Trisavó ou parentes ainda mais distantes', 5, FALSE, 3
  FROM form_questions WHERE question_key = 'a1_antepassado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao_sei', 'Não sei ao certo', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'a1_antepassado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, tenho documentos', 20, FALSE, 0
  FROM form_questions WHERE question_key = 'a2_documento';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não tenho documentos', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'a2_documento';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, tenho interesse', 8, FALSE, 0
  FROM form_questions WHERE question_key = 'a3_interesse_docs';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não tenho interesse', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'a3_interesse_docs';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, tenho laços com Portugal', 15, FALSE, 0
  FROM form_questions WHERE question_key = 'a4_lacos';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Ainda não tenho laços', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'a4_lacos';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, tenho interesse', 5, FALSE, 0
  FROM form_questions WHERE question_key = 'a5_genealogia';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não, por enquanto não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'a5_genealogia';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'natural', 'Natural', 0, FALSE, 0
  FROM form_questions WHERE question_key = 'a6_filiacao';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'adotivo', 'Adotivo(a)', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'a6_filiacao';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'mais_3_anos', 'Há mais de 3 anos', 60, FALSE, 0
  FROM form_questions WHERE question_key = 'b1_tempo_casamento';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'menos_3_anos', 'Há menos de 3 anos', 15, FALSE, 1
  FROM form_questions WHERE question_key = 'b1_tempo_casamento';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim', 0, FALSE, 0
  FROM form_questions WHERE question_key = 'c1_maior_idade';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'c1_maior_idade';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim', 5, FALSE, 0
  FROM form_questions WHERE question_key = 'c2_mora_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'c2_mora_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'menos_2', 'Menos de 2 anos', 30, FALSE, 0
  FROM form_questions WHERE question_key = 'c3_tempo_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, '2_a_4', 'Entre 2 e 4 anos', 50, FALSE, 1
  FROM form_questions WHERE question_key = 'c3_tempo_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, '5_ou_mais', '5 anos ou mais', 75, FALSE, 2
  FROM form_questions WHERE question_key = 'c3_tempo_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, tenho Autorização de Residência', 15, FALSE, 0
  FROM form_questions WHERE question_key = 'd1_situacao_legal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não, estou sem situação regularizada', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'd1_situacao_legal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'menos_5', 'Menos de 5 anos', 25, FALSE, 0
  FROM form_questions WHERE question_key = 'd2_tempo_autorizacao';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'mais_5', '5 anos ou mais', 60, FALSE, 1
  FROM form_questions WHERE question_key = 'd2_tempo_autorizacao';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, estou preparado(a)', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'd3_disposto_advogado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não, ainda não estou preparado(a)', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'd3_disposto_advogado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, já me consultei', 5, FALSE, 0
  FROM form_questions WHERE question_key = 'd4_consultou_advogado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não, ainda não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'd4_consultou_advogado';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'era_caro', 'Era muito caro', 0, FALSE, 0
  FROM form_questions WHERE question_key = 'd5_motivo_nao_contratou';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sem_firmeza', 'Não senti firmeza / O advogado não pareceu competente', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'd5_motivo_nao_contratou';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sozinho', 'Quero resolver a minha situação sozinho(a)', 0, FALSE, 2
  FROM form_questions WHERE question_key = 'd5_motivo_nao_contratou';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'outros', 'Outros motivos', 0, FALSE, 3
  FROM form_questions WHERE question_key = 'd5_motivo_nao_contratou';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, agora consigo', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'd6_preparado_financeiro';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Ainda não consigo', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'd6_preparado_financeiro';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim, quero consultar um advogado', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'd7_consultar_agora';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não, por enquanto não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'd7_consultar_agora';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim', 20, FALSE, 0
  FROM form_questions WHERE question_key = 'd8_filhos_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'd8_filhos_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sim', 'Sim', 5, FALSE, 0
  FROM form_questions WHERE question_key = 'f1_mora_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'nao', 'Não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'f1_mora_portugal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'antes_1974', 'Antes de 25 de Abril de 1974', 65, FALSE, 0
  FROM form_questions WHERE question_key = 'f2_quando_mudou';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'depois_1974', 'Depois de 25 de Abril de 1974', 20, FALSE, 1
  FROM form_questions WHERE question_key = 'f2_quando_mudou';

COMMIT;
