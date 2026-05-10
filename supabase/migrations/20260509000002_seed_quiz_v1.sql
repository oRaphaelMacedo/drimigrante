-- =====================================================
-- 20260509000002 — Seed quiz v1.0 (real questions from src/data/quiz-questions.ts)
-- Replaces the placeholder seed from initial migration.
-- Idempotent: TRUNCATEs form_themes/questions/options before re-seeding.
-- =====================================================

BEGIN;

-- Wipe existing seed data (CASCADE drops dependent rows)
TRUNCATE form_question_options, form_questions, form_themes RESTART IDENTITY CASCADE;

-- THEMES
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('perfil_pessoal', 'Perfil Pessoal', '#3b62f6', '👤', 0, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('situacao_atual', 'Situação Atual', '#8b5cf6', '📍', 1, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('financas', 'Situação Financeira', '#10b981', '💰', 2, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('familia', 'Família e Relações', '#f59e0b', '👨‍👩‍👧', 3, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('qualificacoes', 'Qualificações', '#6366f1', '🎓', 4, TRUE);
INSERT INTO form_themes (code, name_pt, color, icon, sort_order, is_active) VALUES ('planos_portugal', 'Planos em Portugal', '#ef4444', '🇵🇹', 5, TRUE);

-- QUESTIONS
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'nationality', 'Qual é a sua nacionalidade?', 'Se tem dupla nacionalidade, selecione a principal.', 'select'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 0
  FROM form_themes WHERE code = 'perfil_pessoal';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'age', 'Qual é a sua idade?', NULL, 'number'::field_type, NULL, '{"min":18,"max":99}'::jsonb, 'Ex: 35', TRUE, 1
  FROM form_themes WHERE code = 'perfil_pessoal';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'marital_status', 'Qual é o seu estado civil?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 2
  FROM form_themes WHERE code = 'perfil_pessoal';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'has_children', 'Tem filhos?', 'Inclua filhos menores de 18 anos.', 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 3
  FROM form_themes WHERE code = 'perfil_pessoal';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'current_country', 'Em que país reside atualmente?', NULL, 'select'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 4
  FROM form_themes WHERE code = 'situacao_atual';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'current_visa_status', 'Qual é a sua situação migratória atual?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 5
  FROM form_themes WHERE code = 'situacao_atual';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'has_portugal_ties', 'Tem alguma ligação atual com Portugal?', 'Visto, NIF, empresa registada, conta bancária, imóvel, etc.', 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 6
  FROM form_themes WHERE code = 'situacao_atual';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'monthly_income', 'Qual é o seu rendimento mensal líquido (em EUR)?', 'Inclua todos os rendimentos: salário, pensão, arrendamento, dividendos, etc.', 'number'::field_type, NULL, '{"min":0,"max":999999}'::jsonb, 'Ex: 2500', TRUE, 7
  FROM form_themes WHERE code = 'financas';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'income_source', 'Qual é a principal fonte de rendimento?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 8
  FROM form_themes WHERE code = 'financas';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'has_savings', 'Tem poupanças ou investimentos?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 9
  FROM form_themes WHERE code = 'financas';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'savings_amount', 'Valor aproximado das poupanças ou investimentos (EUR)?', NULL, 'radio'::field_type, '{"question_key":"has_savings","answer_key":"yes"}'::jsonb, '{}'::jsonb, NULL, TRUE, 10
  FROM form_themes WHERE code = 'financas';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'has_portuguese_family', 'Tem familiares com nacionalidade ou residência portuguesa?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 11
  FROM form_themes WHERE code = 'familia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'family_relationship', 'Qual o grau de parentesco com esse familiar?', NULL, 'radio'::field_type, '{"question_key":"has_portuguese_family","answer_key":"yes"}'::jsonb, '{}'::jsonb, NULL, TRUE, 12
  FROM form_themes WHERE code = 'familia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'has_eu_citizenship_family', 'Algum familiar próximo é cidadão da União Europeia?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 13
  FROM form_themes WHERE code = 'familia';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'education_level', 'Qual é o seu nível de escolaridade?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 14
  FROM form_themes WHERE code = 'qualificacoes';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'portuguese_language', 'Qual é o seu nível de português?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 15
  FROM form_themes WHERE code = 'qualificacoes';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'years_of_experience', 'Quantos anos de experiência profissional tem?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 16
  FROM form_themes WHERE code = 'qualificacoes';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'main_goal', 'Qual é o seu principal objetivo em Portugal?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 17
  FROM form_themes WHERE code = 'planos_portugal';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'business_plan', 'Pretende criar empresa ou trabalhar por conta própria em Portugal?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 18
  FROM form_themes WHERE code = 'planos_portugal';
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, display_conditions, validation_rules, placeholder, is_required, sort_order)
  SELECT id, 'when_to_move', 'Quando pretende fazer a mudança para Portugal?', NULL, 'radio'::field_type, NULL, '{}'::jsonb, NULL, TRUE, 19
  FROM form_themes WHERE code = 'planos_portugal';

-- OPTIONS
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'BR', '🇧🇷 Brasileiro(a)', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'AO', '🇦🇴 Angolano(a)', 12, FALSE, 1
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'CV', '🇨🇻 Cabo-verdiano(a)', 12, FALSE, 2
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'MZ', '🇲🇿 Moçambicano(a)', 12, FALSE, 3
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'GW', '🇬🇼 Guineense (Guiné-Bissau)', 12, FALSE, 4
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'ST', '🇸🇹 São-tomense', 12, FALSE, 5
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'PT', '🇵🇹 Português(a)', 0, FALSE, 6
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'US', '🇺🇸 Americano(a)', 8, FALSE, 7
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'other_eu', '🇪🇺 Outro país da UE/EEE', 5, FALSE, 8
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'other', '🌍 Outro país', 5, FALSE, 9
  FROM form_questions WHERE question_key = 'nationality';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'married', 'Casado(a)', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'marital_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'partner', 'União de facto', 8, FALSE, 1
  FROM form_questions WHERE question_key = 'marital_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'single', 'Solteiro(a)', 0, FALSE, 2
  FROM form_questions WHERE question_key = 'marital_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'divorced', 'Divorciado(a)', 0, FALSE, 3
  FROM form_questions WHERE question_key = 'marital_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'widowed', 'Viúvo(a)', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'marital_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'yes_minor', 'Sim, menores de 18', 5, FALSE, 0
  FROM form_questions WHERE question_key = 'has_children';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'yes_adult', 'Sim, maiores de 18', 2, FALSE, 1
  FROM form_questions WHERE question_key = 'has_children';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'no', 'Não', 0, FALSE, 2
  FROM form_questions WHERE question_key = 'has_children';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'PT', '🇵🇹 Portugal', 5, FALSE, 0
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'BR', '🇧🇷 Brasil', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'AO', '🇦🇴 Angola', 0, FALSE, 2
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'CV', '🇨🇻 Cabo Verde', 0, FALSE, 3
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'MZ', '🇲🇿 Moçambique', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'US', '🇺🇸 Estados Unidos', 0, FALSE, 5
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'other_eu', '🇪🇺 Outro país da UE', 3, FALSE, 6
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'other', '🌍 Outro país', 0, FALSE, 7
  FROM form_questions WHERE question_key = 'current_country';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'citizen', 'Cidadão(ã) nacional do país de residência', 0, FALSE, 0
  FROM form_questions WHERE question_key = 'current_visa_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'resident', 'Residente legal (visto de residência)', 10, FALSE, 1
  FROM form_questions WHERE question_key = 'current_visa_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'work_visa', 'Visto de trabalho temporário', 8, FALSE, 2
  FROM form_questions WHERE question_key = 'current_visa_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'tourist', 'Turista / sem visto legal válido', 0, FALSE, 3
  FROM form_questions WHERE question_key = 'current_visa_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'undocumented', 'Sem documentação regularizada', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'current_visa_status';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'yes', 'Sim, tenho ligações com Portugal', 15, FALSE, 0
  FROM form_questions WHERE question_key = 'has_portugal_ties';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'no', 'Não, ainda nenhuma', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'has_portugal_ties';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'pension', 'Pensão / reforma', 15, FALSE, 0
  FROM form_questions WHERE question_key = 'income_source';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'investment', 'Rendimentos de investimento', 15, FALSE, 1
  FROM form_questions WHERE question_key = 'income_source';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'rental', 'Rendimento de arrendamento', 15, FALSE, 2
  FROM form_questions WHERE question_key = 'income_source';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'freelance', 'Trabalho independente / freelance', 12, FALSE, 3
  FROM form_questions WHERE question_key = 'income_source';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'employment', 'Salário por conta de outrem', 10, FALSE, 4
  FROM form_questions WHERE question_key = 'income_source';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'other', 'Outro', 5, FALSE, 5
  FROM form_questions WHERE question_key = 'income_source';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'yes', 'Sim', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'has_savings';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'no', 'Não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'has_savings';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'less_5k', 'Menos de €5.000', 0, FALSE, 0
  FROM form_questions WHERE question_key = 'savings_amount';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, '5k_20k', '€5.000 – €20.000', 5, FALSE, 1
  FROM form_questions WHERE question_key = 'savings_amount';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, '20k_50k', '€20.000 – €50.000', 10, FALSE, 2
  FROM form_questions WHERE question_key = 'savings_amount';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, '50k_100k', '€50.000 – €100.000', 15, FALSE, 3
  FROM form_questions WHERE question_key = 'savings_amount';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'more_100k', 'Mais de €100.000', 20, FALSE, 4
  FROM form_questions WHERE question_key = 'savings_amount';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'yes', 'Sim', 20, FALSE, 0
  FROM form_questions WHERE question_key = 'has_portuguese_family';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'no', 'Não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'has_portuguese_family';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'spouse', 'Cônjuge / companheiro(a)', 20, FALSE, 0
  FROM form_questions WHERE question_key = 'family_relationship';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'parent', 'Pai ou Mãe', 20, FALSE, 1
  FROM form_questions WHERE question_key = 'family_relationship';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'child', 'Filho(a)', 15, FALSE, 2
  FROM form_questions WHERE question_key = 'family_relationship';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'sibling', 'Irmão / Irmã', 10, FALSE, 3
  FROM form_questions WHERE question_key = 'family_relationship';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'other', 'Outro parente', 5, FALSE, 4
  FROM form_questions WHERE question_key = 'family_relationship';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'yes', 'Sim', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'has_eu_citizenship_family';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'no', 'Não', 0, FALSE, 1
  FROM form_questions WHERE question_key = 'has_eu_citizenship_family';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'phd', 'Doutoramento (PhD)', 20, FALSE, 0
  FROM form_questions WHERE question_key = 'education_level';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'masters', 'Mestrado', 15, FALSE, 1
  FROM form_questions WHERE question_key = 'education_level';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'bachelors', 'Licenciatura', 10, FALSE, 2
  FROM form_questions WHERE question_key = 'education_level';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'secondary', 'Ensino Secundário (12º ano)', 5, FALSE, 3
  FROM form_questions WHERE question_key = 'education_level';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'primary', 'Ensino Básico ou menos', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'education_level';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'native', 'Nativo ou fluente', 20, FALSE, 0
  FROM form_questions WHERE question_key = 'portuguese_language';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'advanced', 'Avançado (C1/C2)', 15, FALSE, 1
  FROM form_questions WHERE question_key = 'portuguese_language';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'intermediate', 'Intermédio (B1/B2)', 10, FALSE, 2
  FROM form_questions WHERE question_key = 'portuguese_language';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'basic', 'Básico (A1/A2)', 5, FALSE, 3
  FROM form_questions WHERE question_key = 'portuguese_language';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'none', 'Não falo português', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'portuguese_language';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'more_10', 'Mais de 10 anos', 15, FALSE, 0
  FROM form_questions WHERE question_key = 'years_of_experience';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, '5_10', '5 a 10 anos', 10, FALSE, 1
  FROM form_questions WHERE question_key = 'years_of_experience';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, '2_5', '2 a 5 anos', 5, FALSE, 2
  FROM form_questions WHERE question_key = 'years_of_experience';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'less_2', 'Menos de 2 anos', 2, FALSE, 3
  FROM form_questions WHERE question_key = 'years_of_experience';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'none', 'Ainda sem experiência profissional', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'years_of_experience';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'live_retire', 'Morar / Reformar-me', 15, FALSE, 0
  FROM form_questions WHERE question_key = 'main_goal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'family', 'Reunir-me com família', 15, FALSE, 1
  FROM form_questions WHERE question_key = 'main_goal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'entrepreneurship', 'Empreender / criar empresa', 12, FALSE, 2
  FROM form_questions WHERE question_key = 'main_goal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'work', 'Trabalhar por conta de outrem', 10, FALSE, 3
  FROM form_questions WHERE question_key = 'main_goal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'study', 'Estudar', 8, FALSE, 4
  FROM form_questions WHERE question_key = 'main_goal';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'yes', 'Sim, já tenho plano de negócio', 10, FALSE, 0
  FROM form_questions WHERE question_key = 'business_plan';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'maybe', 'Talvez, ainda a estudar a opção', 5, FALSE, 1
  FROM form_questions WHERE question_key = 'business_plan';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'no', 'Não, prefiro trabalhar por conta de outrem', 0, FALSE, 2
  FROM form_questions WHERE question_key = 'business_plan';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'asap', 'O mais rápido possível (0–3 meses)', 20, FALSE, 0
  FROM form_questions WHERE question_key = 'when_to_move';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'soon', 'Em breve (3–6 meses)', 15, FALSE, 1
  FROM form_questions WHERE question_key = 'when_to_move';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'medium', 'Médio prazo (6–12 meses)', 10, FALSE, 2
  FROM form_questions WHERE question_key = 'when_to_move';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'long', 'Longo prazo (+12 meses)', 5, FALSE, 3
  FROM form_questions WHERE question_key = 'when_to_move';
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, is_eliminatory, sort_order)
  SELECT id, 'exploring', 'Estou só a explorar possibilidades', 0, FALSE, 4
  FROM form_questions WHERE question_key = 'when_to_move';

COMMIT;
