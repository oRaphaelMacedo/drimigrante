-- =====================================================
-- DOUTOR IMIGRANTE — Schema v1.0
-- 27 tabelas | RLS | Triggers | Seeds
-- =====================================================

-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE tenant_type AS ENUM ('hub', 'office');
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE app_role AS ENUM ('super_admin', 'hub_admin', 'office_admin', 'lawyer', 'paralegal', 'client');
CREATE TYPE field_type AS ENUM ('text', 'textarea', 'radio', 'checkbox', 'select', 'autocomplete', 'date', 'number', 'email', 'phone');
CREATE TYPE assessment_status AS ENUM ('incomplete', 'completed', 'expired');
CREATE TYPE lead_status AS ENUM ('novo', 'qualificado', 'em_contacto', 'consulta_agendada', 'consulta_feita', 'proposta_enviada', 'fechado_ganho', 'fechado_perdido', 'nutricao');
CREATE TYPE lead_temperature AS ENUM ('frio', 'morno', 'quente');
CREATE TYPE case_status AS ENUM ('intake', 'eligibility', 'documentation', 'analysis', 'preparation', 'submission', 'follow_up', 'concluded', 'cancelled');
CREATE TYPE document_status AS ENUM ('pending', 'uploaded', 'verified', 'rejected', 'expired');
CREATE TYPE task_type AS ENUM ('whatsapp', 'email', 'call', 'document_review', 'internal', 'consultation');
CREATE TYPE task_status AS ENUM ('open', 'in_progress', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE subscription_tier AS ENUM ('free', 'one_time', 'recurring');
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE ai_use_case AS ENUM ('scoring', 'analysis', 'chat', 'document_extraction');
CREATE TYPE ai_provider AS ENUM ('openai', 'gemini', 'anthropic');

-- =====================================================
-- 1. TENANTS
-- =====================================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  type tenant_type NOT NULL DEFAULT 'office',
  status tenant_status NOT NULL DEFAULT 'pending',
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country_code CHAR(2) DEFAULT 'PT',
  billing_info JSONB DEFAULT '{}'::jsonb,
  stripe_customer_id VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_type ON tenants(type);
CREATE INDEX idx_tenants_status ON tenants(status);

INSERT INTO tenants (id, name, slug, type, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Doutor Imigrante Hub', 'hub', 'hub', 'active');

-- =====================================================
-- 2. PROFILES
-- =====================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  language VARCHAR(10) DEFAULT 'pt-PT',
  timezone VARCHAR(50) DEFAULT 'Europe/Lisbon',
  notification_preferences JSONB DEFAULT '{"email": true, "sms": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_profiles_tenant ON profiles(tenant_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- =====================================================
-- 3. USER_ROLES
-- =====================================================

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(user_id, tenant_id, role)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role, _tenant_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
      AND (expires_at IS NULL OR expires_at > NOW())
  );
$$;

-- =====================================================
-- 4. COUNTRIES
-- =====================================================

CREATE TABLE countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code CHAR(2) UNIQUE NOT NULL,
  name_pt VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  flag_emoji VARCHAR(10),
  is_supported BOOLEAN DEFAULT FALSE,
  is_target BOOLEAN DEFAULT FALSE,
  is_origin BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_countries_code ON countries(code);
CREATE INDEX idx_countries_supported ON countries(is_supported) WHERE is_supported = TRUE;

INSERT INTO countries (code, name_pt, name_en, flag_emoji, is_supported, is_target, is_origin, sort_order) VALUES
  ('PT', 'Portugal', 'Portugal', '🇵🇹', TRUE, TRUE, FALSE, 1),
  ('BR', 'Brasil', 'Brazil', '🇧🇷', FALSE, FALSE, TRUE, 2),
  ('AO', 'Angola', 'Angola', '🇦🇴', FALSE, FALSE, TRUE, 3),
  ('CV', 'Cabo Verde', 'Cape Verde', '🇨🇻', FALSE, FALSE, TRUE, 4),
  ('MZ', 'Moçambique', 'Mozambique', '🇲🇿', FALSE, FALSE, TRUE, 5),
  ('GW', 'Guiné-Bissau', 'Guinea-Bissau', '🇬🇼', FALSE, FALSE, TRUE, 6),
  ('ST', 'São Tomé e Príncipe', 'São Tomé and Príncipe', '🇸🇹', FALSE, FALSE, TRUE, 7),
  ('US', 'Estados Unidos', 'United States', '🇺🇸', FALSE, FALSE, TRUE, 100),
  ('ES', 'Espanha', 'Spain', '🇪🇸', FALSE, FALSE, TRUE, 101),
  ('FR', 'França', 'France', '🇫🇷', FALSE, FALSE, TRUE, 102),
  ('DE', 'Alemanha', 'Germany', '🇩🇪', FALSE, FALSE, TRUE, 103),
  ('GB', 'Reino Unido', 'United Kingdom', '🇬🇧', FALSE, FALSE, TRUE, 104);

-- =====================================================
-- 5. VISA_CATEGORIES
-- =====================================================

CREATE TABLE visa_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name_pt VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT,
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_id, code)
);

CREATE INDEX idx_visa_categories_country ON visa_categories(country_id);

INSERT INTO visa_categories (country_id, code, name_pt, name_en, description, icon, sort_order)
SELECT
  c.id,
  v.code,
  v.name_pt,
  v.name_en,
  v.description,
  v.icon,
  v.sort_order
FROM countries c, (VALUES
  ('residencia_permanente', 'Residência Permanente', 'Permanent Residence', 'Vistos para morar em Portugal a longo prazo', 'home', 1),
  ('cplp', 'CPLP / Lusofone', 'CPLP / Portuguese-speaking', 'Acordo de Mobilidade entre países lusófonos', 'globe', 2),
  ('reagrupamento', 'Reagrupamento Familiar', 'Family Reunification', 'Trazer família para Portugal', 'users', 3),
  ('estudante', 'Estudante', 'Student', 'Vistos para estudar em Portugal', 'graduation-cap', 4),
  ('cidadania', 'Cidadania', 'Citizenship', 'Cidadania portuguesa por diversos critérios', 'award', 5),
  ('outros', 'Outros', 'Others', 'Outros tipos de visto', 'more-horizontal', 6)
) AS v(code, name_pt, name_en, description, icon, sort_order)
WHERE c.code = 'PT';

-- =====================================================
-- 6. VISA_TYPES
-- =====================================================

CREATE TABLE visa_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES visa_categories(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name_pt VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  description TEXT,
  required_documents JSONB DEFAULT '[]'::jsonb,
  eligibility_overview TEXT,
  typical_duration_days INT,
  typical_cost_min DECIMAL(10,2),
  typical_cost_max DECIMAL(10,2),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, code)
);

CREATE INDEX idx_visa_types_category ON visa_types(category_id);
CREATE INDEX idx_visa_types_active ON visa_types(is_active) WHERE is_active = TRUE;

-- Seed: 4 visa types iniciais (placeholders — advogadas preenchem conteúdo)
INSERT INTO visa_types (category_id, code, name_pt, name_en, description, typical_duration_days, typical_cost_min, typical_cost_max, sort_order)
SELECT
  vc.id,
  v.code,
  v.name_pt,
  v.name_en,
  v.description,
  v.duration,
  v.cost_min,
  v.cost_max,
  v.sort_order
FROM visa_categories vc, (VALUES
  ('residencia_permanente', 'd7', 'Visto D7 — Rendimento Passivo', 'D7 Visa — Passive Income', 'Para quem tem rendimento passivo estável (pensão, arrendamento, dividendos)', 180, 83.0, 250.0, 1),
  ('residencia_permanente', 'd2', 'Visto D2 — Empreendedor', 'D2 Visa — Entrepreneur', 'Para empreendedores, profissionais liberais e nómadas digitais', 180, 83.0, 250.0, 2),
  ('cplp', 'cplp_mobilidade', 'Autorização de Residência CPLP', 'CPLP Residence Permit', 'Para cidadãos de países da CPLP ao abrigo do Acordo de Mobilidade', 120, 83.0, 200.0, 1),
  ('reagrupamento', 'reagrupamento_familiar', 'Reagrupamento Familiar', 'Family Reunification', 'Para familiares de cidadãos portugueses ou residentes legais', 180, 83.0, 200.0, 1)
) AS v(category_code, code, name_pt, name_en, description, duration, cost_min, cost_max, sort_order)
WHERE vc.code = v.category_code;

-- =====================================================
-- 7. FORM_VERSIONS
-- =====================================================

CREATE TABLE form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number INT NOT NULL,
  name VARCHAR(255),
  description TEXT,
  schema_snapshot JSONB,
  is_active BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version_number)
);

CREATE INDEX idx_form_versions_active ON form_versions(is_active) WHERE is_active = TRUE;

INSERT INTO form_versions (version_number, name, is_active)
VALUES (1, 'MVP v1.0', TRUE);

-- =====================================================
-- 8. FORM_THEMES
-- =====================================================

CREATE TABLE form_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL,
  name_pt VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(20),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code)
);

CREATE INDEX idx_form_themes_active ON form_themes(is_active);

INSERT INTO form_themes (code, name_pt, name_en, description, icon, color, sort_order) VALUES
  ('perfil_pessoal',   'Perfil Pessoal',          'Personal Profile',     'Quem você é e de onde vem',                    'user',        '#3b62f6', 1),
  ('situacao_atual',   'Situação Atual',           'Current Situation',    'Sua situação no país de origem',               'map-pin',     '#8b5cf6', 2),
  ('financas',         'Situação Financeira',      'Financial Situation',  'Rendimentos, poupanças e investimentos',       'trending-up', '#10b981', 3),
  ('familia',          'Família e Relações',       'Family & Relations',   'Estado civil, filhos, laços com Portugal',     'heart',       '#f59e0b', 4),
  ('qualificacoes',    'Qualificações',            'Qualifications',       'Educação, experiência e língua portuguesa',    'award',       '#6366f1', 5),
  ('planos_portugal',  'Planos em Portugal',       'Plans in Portugal',    'O que pretende fazer em Portugal',             'flag',        '#ef4444', 6);

-- =====================================================
-- 9. FORM_QUESTIONS
-- =====================================================

CREATE TABLE form_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id UUID NOT NULL REFERENCES form_themes(id) ON DELETE CASCADE,
  question_key VARCHAR(100) UNIQUE NOT NULL,
  question_text_pt TEXT NOT NULL,
  question_text_en TEXT,
  help_text TEXT,
  field_type field_type NOT NULL,
  display_conditions JSONB,
  validation_rules JSONB DEFAULT '{}'::jsonb,
  placeholder TEXT,
  max_length INT,
  min_value DECIMAL,
  max_value DECIMAL,
  is_required BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_form_questions_theme ON form_questions(theme_id);
CREATE INDEX idx_form_questions_key ON form_questions(question_key);
CREATE INDEX idx_form_questions_active ON form_questions(is_active);

-- Seed: 20 perguntas placeholder para MVP (advogadas refinam depois)
INSERT INTO form_questions (theme_id, question_key, question_text_pt, help_text, field_type, sort_order)
SELECT t.id, q.key, q.text_pt, q.help, q.ftype::field_type, q.sort
FROM form_themes t, (VALUES
  -- Perfil Pessoal
  ('perfil_pessoal', 'nationality', 'Qual é a sua nacionalidade?', 'Se tem dupla nacionalidade, selecione a principal', 'select', 1),
  ('perfil_pessoal', 'age', 'Qual é a sua idade?', NULL, 'number', 2),
  ('perfil_pessoal', 'marital_status', 'Qual é o seu estado civil?', NULL, 'radio', 3),
  ('perfil_pessoal', 'has_children', 'Tem filhos?', 'Inclua filhos menores de 18 anos', 'radio', 4),
  -- Situação Atual
  ('situacao_atual', 'current_country', 'Em que país reside atualmente?', NULL, 'select', 1),
  ('situacao_atual', 'current_visa_status', 'Qual é a sua situação migratória atual?', NULL, 'radio', 2),
  ('situacao_atual', 'has_portugal_ties', 'Tem alguma ligação atual com Portugal?', 'Visto, residência, empresa, etc.', 'radio', 3),
  -- Finanças
  ('financas', 'monthly_income', 'Qual é o seu rendimento mensal líquido (em EUR)?', 'Inclua todos os rendimentos: salário, pensão, arrendamento, etc.', 'number', 1),
  ('financas', 'income_source', 'Qual é a principal fonte de rendimento?', NULL, 'radio', 2),
  ('financas', 'has_savings', 'Tem poupanças ou investimentos?', NULL, 'radio', 3),
  ('financas', 'savings_amount', 'Valor aproximado das poupanças (EUR)?', NULL, 'select', 4),
  -- Família
  ('familia', 'has_portuguese_family', 'Tem familiares com nacionalidade ou residência portuguesa?', NULL, 'radio', 1),
  ('familia', 'family_relationship', 'Qual o grau de parentesco?', NULL, 'radio', 2),
  ('familia', 'has_eu_citizenship_family', 'Algum familiar é cidadão da UE?', NULL, 'radio', 3),
  -- Qualificações
  ('qualificacoes', 'education_level', 'Qual é o seu nível de escolaridade?', NULL, 'radio', 1),
  ('qualificacoes', 'portuguese_language', 'Qual é o seu nível de português?', NULL, 'radio', 2),
  ('qualificacoes', 'years_of_experience', 'Quantos anos de experiência profissional tem?', NULL, 'select', 3),
  -- Planos
  ('planos_portugal', 'main_goal', 'Qual é o seu principal objetivo em Portugal?', NULL, 'radio', 1),
  ('planos_portugal', 'business_plan', 'Pretende criar empresa ou trabalhar por conta própria?', NULL, 'radio', 2),
  ('planos_portugal', 'when_to_move', 'Quando pretende fazer a mudança?', NULL, 'radio', 3)
) AS q(theme_code, key, text_pt, help, ftype, sort)
WHERE t.code = q.theme_code;

-- =====================================================
-- 10. FORM_QUESTION_OPTIONS
-- =====================================================

CREATE TABLE form_question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES form_questions(id) ON DELETE CASCADE,
  option_key VARCHAR(100) NOT NULL,
  option_text_pt VARCHAR(500) NOT NULL,
  option_text_en VARCHAR(500),
  score INT DEFAULT 0,
  next_question_id UUID REFERENCES form_questions(id) ON DELETE SET NULL,
  skip_to_question_id UUID REFERENCES form_questions(id) ON DELETE SET NULL,
  pendency_text TEXT,
  is_eliminatory BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, option_key)
);

CREATE INDEX idx_form_question_options_question ON form_question_options(question_id);

-- Seed: opções para as perguntas radio/select mais importantes
INSERT INTO form_question_options (question_id, option_key, option_text_pt, score, sort_order)
SELECT q.id, o.key, o.text_pt, o.score, o.sort
FROM form_questions q, (VALUES
  -- marital_status
  ('marital_status', 'single',   'Solteiro(a)',         0, 1),
  ('marital_status', 'married',  'Casado(a)',           10, 2),
  ('marital_status', 'partner',  'União de facto',      8, 3),
  ('marital_status', 'divorced', 'Divorciado(a)',       0, 4),
  ('marital_status', 'widowed',  'Viúvo(a)',            0, 5),
  -- has_children
  ('has_children', 'no',        'Não',                  0, 1),
  ('has_children', 'yes_minor', 'Sim, menores de 18',   5, 2),
  ('has_children', 'yes_adult', 'Sim, maiores de 18',   2, 3),
  -- current_visa_status
  ('current_visa_status', 'citizen',      'Cidadão nacional', 0, 1),
  ('current_visa_status', 'resident',     'Residente legal',  10, 2),
  ('current_visa_status', 'work_visa',    'Visto de trabalho', 8, 3),
  ('current_visa_status', 'tourist',      'Turista / sem visto legal', 0, 4),
  ('current_visa_status', 'undocumented', 'Sem documentação', 0, 5),
  -- has_portugal_ties
  ('has_portugal_ties', 'yes', 'Sim', 15, 1),
  ('has_portugal_ties', 'no',  'Não', 0, 2),
  -- income_source
  ('income_source', 'employment',  'Salário por conta de outrem', 10, 1),
  ('income_source', 'freelance',   'Trabalho independente / freelance', 12, 2),
  ('income_source', 'pension',     'Pensão / reforma', 15, 3),
  ('income_source', 'investment',  'Rendimentos de investimento', 15, 4),
  ('income_source', 'rental',      'Rendimento de arrendamento', 15, 5),
  ('income_source', 'other',       'Outro', 5, 6),
  -- has_savings
  ('has_savings', 'yes', 'Sim', 10, 1),
  ('has_savings', 'no',  'Não', 0, 2),
  -- savings_amount
  ('savings_amount', 'less_5k',     'Menos de €5.000', 0, 1),
  ('savings_amount', '5k_20k',      '€5.000 – €20.000', 5, 2),
  ('savings_amount', '20k_50k',     '€20.000 – €50.000', 10, 3),
  ('savings_amount', '50k_100k',    '€50.000 – €100.000', 15, 4),
  ('savings_amount', 'more_100k',   'Mais de €100.000', 20, 5),
  -- has_portuguese_family
  ('has_portuguese_family', 'yes', 'Sim', 20, 1),
  ('has_portuguese_family', 'no',  'Não', 0, 2),
  -- family_relationship
  ('family_relationship', 'spouse',  'Cônjuge / companheiro(a)', 20, 1),
  ('family_relationship', 'parent',  'Pai ou Mãe', 20, 2),
  ('family_relationship', 'child',   'Filho(a)', 15, 3),
  ('family_relationship', 'sibling', 'Irmão / Irmã', 10, 4),
  ('family_relationship', 'other',   'Outro parente', 5, 5),
  -- education_level
  ('education_level', 'phd',       'Doutoramento', 20, 1),
  ('education_level', 'masters',   'Mestrado', 15, 2),
  ('education_level', 'bachelors', 'Licenciatura', 10, 3),
  ('education_level', 'secondary', 'Ensino Secundário', 5, 4),
  ('education_level', 'primary',   'Ensino Básico ou menos', 0, 5),
  -- portuguese_language
  ('portuguese_language', 'native',       'Nativo ou fluente', 20, 1),
  ('portuguese_language', 'advanced',     'Avançado (C1/C2)', 15, 2),
  ('portuguese_language', 'intermediate', 'Intermédio (B1/B2)', 10, 3),
  ('portuguese_language', 'basic',        'Básico (A1/A2)', 5, 4),
  ('portuguese_language', 'none',         'Não falo português', 0, 5),
  -- main_goal
  ('main_goal', 'live_retire',    'Morar / Reformar-me', 15, 1),
  ('main_goal', 'work',           'Trabalhar por conta de outrem', 10, 2),
  ('main_goal', 'entrepreneurship', 'Empreender / criar empresa', 12, 3),
  ('main_goal', 'study',          'Estudar', 8, 4),
  ('main_goal', 'family',         'Reunir-me com família', 15, 5),
  -- when_to_move
  ('when_to_move', 'asap',      'O mais rápido possível (0-3 meses)', 20, 1),
  ('when_to_move', 'soon',      'Em breve (3-6 meses)', 15, 2),
  ('when_to_move', 'medium',    'Médio prazo (6-12 meses)', 10, 3),
  ('when_to_move', 'long',      'Longo prazo (+12 meses)', 5, 4),
  ('when_to_move', 'exploring', 'Estou só a explorar', 0, 5)
) AS o(q_key, key, text_pt, score, sort)
WHERE q.question_key = o.q_key;

-- =====================================================
-- 11. RULE_VERSIONS
-- =====================================================

CREATE TABLE rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number INT NOT NULL,
  visa_type_id UUID REFERENCES visa_types(id) ON DELETE CASCADE,
  rules JSONB NOT NULL,
  legal_references JSONB DEFAULT '[]'::jsonb,
  effective_date DATE,
  is_active BOOLEAN DEFAULT FALSE,
  notes TEXT,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(visa_type_id, version_number)
);

CREATE INDEX idx_rule_versions_visa ON rule_versions(visa_type_id);
CREATE INDEX idx_rule_versions_active ON rule_versions(is_active) WHERE is_active = TRUE;

-- Seed: regra placeholder para D7
INSERT INTO rule_versions (version_number, visa_type_id, rules, notes, is_active)
SELECT
  1,
  vt.id,
  '{"and": [{">=": [{"var": "monthly_income"}, 820]}, {"in": [{"var": "income_source"}, ["pension", "investment", "rental", "employment", "freelance"]]}]}'::jsonb,
  'Regra placeholder — advogadas validam antes de produção',
  TRUE
FROM visa_types vt WHERE vt.code = 'd7';

-- =====================================================
-- 12. ASSESSMENTS
-- =====================================================

CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(64),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  country_origin_id UUID REFERENCES countries(id) ON DELETE SET NULL,
  form_version_id UUID REFERENCES form_versions(id) ON DELETE SET NULL,
  answers JSONB DEFAULT '{}'::jsonb,
  status assessment_status DEFAULT 'incomplete',
  current_question_id UUID REFERENCES form_questions(id) ON DELETE SET NULL,
  questions_answered INT DEFAULT 0,
  total_questions INT,
  completion_percentage DECIMAL(5,2),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  utm_content VARCHAR(100),
  utm_term VARCHAR(100),
  referrer TEXT,
  first_page TEXT,
  user_agent TEXT,
  ip_address INET,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assessments_session ON assessments(session_id);
CREATE INDEX idx_assessments_user ON assessments(user_id);
CREATE INDEX idx_assessments_email ON assessments(email);
CREATE INDEX idx_assessments_status ON assessments(status);
CREATE INDEX idx_assessments_created ON assessments(created_at DESC);

-- =====================================================
-- 13. ASSESSMENT_RESULTS
-- =====================================================

CREATE TABLE assessment_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  score_numeric DECIMAL(5,2),
  score_category VARCHAR(20),
  suggested_visa_types JSONB DEFAULT '[]'::jsonb,
  rule_version_id UUID REFERENCES rule_versions(id) ON DELETE SET NULL,
  ia_explanation_short TEXT,
  ia_explanation_full TEXT,
  ia_model_used VARCHAR(100),
  ia_tokens_used INT,
  needs_reprocessing BOOLEAN DEFAULT FALSE,
  reprocessing_reason TEXT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assessment_id)
);

CREATE INDEX idx_assessment_results_assessment ON assessment_results(assessment_id);
CREATE INDEX idx_assessment_results_score ON assessment_results(score_numeric DESC);

-- =====================================================
-- 14. CRM_LEADS
-- =====================================================

CREATE TABLE crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
  source_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  assigned_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  country_origin_id UUID REFERENCES countries(id) ON DELETE SET NULL,
  suggested_visa_type_id UUID REFERENCES visa_types(id) ON DELETE SET NULL,
  status lead_status DEFAULT 'novo',
  temperature lead_temperature DEFAULT 'morno',
  score DECIMAL(5,2),
  source VARCHAR(100),
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  first_contacted_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  next_followup_at TIMESTAMPTZ,
  deal_value_estimated DECIMAL(10,2),
  lost_reason VARCHAR(500),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crm_leads_assigned_tenant ON crm_leads(assigned_tenant_id);
CREATE INDEX idx_crm_leads_status ON crm_leads(status);
CREATE INDEX idx_crm_leads_temperature ON crm_leads(temperature);
CREATE INDEX idx_crm_leads_assigned_user ON crm_leads(assigned_user_id);
CREATE INDEX idx_crm_leads_score ON crm_leads(score DESC);
CREATE INDEX idx_crm_leads_followup ON crm_leads(next_followup_at) WHERE next_followup_at IS NOT NULL;
CREATE INDEX idx_crm_leads_email ON crm_leads(email);
CREATE INDEX idx_crm_leads_created ON crm_leads(created_at DESC);

-- =====================================================
-- 15. CRM_ACTIVITY_LOG
-- =====================================================

CREATE TABLE crm_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crm_activity_lead ON crm_activity_log(lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_activity_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'crm_activity_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_activity_update BEFORE UPDATE ON crm_activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_modification();
CREATE TRIGGER prevent_activity_delete BEFORE DELETE ON crm_activity_log
  FOR EACH ROW EXECUTE FUNCTION prevent_activity_modification();

-- =====================================================
-- 16. CASES
-- =====================================================

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  primary_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  visa_type_id UUID NOT NULL REFERENCES visa_types(id) ON DELETE RESTRICT,
  status case_status DEFAULT 'intake',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  expected_completion_date DATE,
  closed_at TIMESTAMPTZ,
  contract_value DECIMAL(10,2),
  amount_paid DECIMAL(10,2) DEFAULT 0,
  responsible_lawyer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cases_tenant ON cases(tenant_id);
CREATE INDEX idx_cases_primary_user ON cases(primary_user_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_lawyer ON cases(responsible_lawyer_id);
CREATE INDEX idx_cases_visa_type ON cases(visa_type_id);

-- =====================================================
-- 17. CASE_APPLICANTS
-- =====================================================

CREATE TABLE case_applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  nationality_id UUID REFERENCES countries(id) ON DELETE SET NULL,
  passport_number VARCHAR(50),
  passport_expiry DATE,
  relationship VARCHAR(100),
  is_primary BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_applicants_case ON case_applicants(case_id);

-- =====================================================
-- 18. CASE_DOCUMENTS
-- =====================================================

CREATE TABLE case_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  applicant_id UUID REFERENCES case_applicants(id) ON DELETE CASCADE,
  document_type_code VARCHAR(100) NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  storage_path TEXT,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  status document_status DEFAULT 'pending',
  validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  validation_notes TEXT,
  extracted_data JSONB DEFAULT '{}'::jsonb,
  expiration_date DATE,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_documents_case ON case_documents(case_id);
CREATE INDEX idx_case_documents_status ON case_documents(status);

-- =====================================================
-- 19. CASE_TASKS
-- =====================================================

CREATE TABLE case_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type task_type NOT NULL,
  priority task_priority DEFAULT 'medium',
  status task_status DEFAULT 'open',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT case_or_lead CHECK (case_id IS NOT NULL OR lead_id IS NOT NULL)
);

CREATE INDEX idx_case_tasks_case ON case_tasks(case_id);
CREATE INDEX idx_case_tasks_lead ON case_tasks(lead_id);
CREATE INDEX idx_case_tasks_assigned ON case_tasks(assigned_to);
CREATE INDEX idx_case_tasks_due ON case_tasks(due_date) WHERE status = 'open';
CREATE INDEX idx_case_tasks_status ON case_tasks(status);

-- =====================================================
-- 20. CASE_MESSAGES
-- =====================================================

CREATE TABLE case_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content TEXT NOT NULL,
  ai_model_used VARCHAR(100),
  ai_tokens_used INT,
  ai_cost_usd DECIMAL(10,6),
  sender_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_messages_case ON case_messages(case_id, created_at);

-- =====================================================
-- 21. SUBSCRIPTIONS
-- =====================================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier subscription_tier DEFAULT 'free',
  one_time_paid BOOLEAN DEFAULT FALSE,
  one_time_paid_at TIMESTAMPTZ,
  one_time_payment_amount DECIMAL(10,2),
  recurring_active BOOLEAN DEFAULT FALSE,
  recurring_started_at TIMESTAMPTZ,
  recurring_cancelled_at TIMESTAMPTZ,
  recurring_amount DECIMAL(10,2),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  has_dashboard_access BOOLEAN DEFAULT FALSE,
  has_chat_access BOOLEAN DEFAULT FALSE,
  has_full_analysis BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- =====================================================
-- 22. PAYMENT_EVENTS
-- =====================================================

CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  stripe_event_id VARCHAR(255) UNIQUE,
  stripe_event_type VARCHAR(100),
  stripe_object_id VARCHAR(255),
  amount DECIMAL(10,2),
  currency CHAR(3),
  status VARCHAR(50),
  payload JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_events_user ON payment_events(user_id);
CREATE INDEX idx_payment_events_stripe ON payment_events(stripe_event_id);

-- =====================================================
-- 23. EMAIL_TEMPLATES
-- =====================================================

CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  subject_pt VARCHAR(255) NOT NULL,
  subject_en VARCHAR(255),
  body_html_pt TEXT NOT NULL,
  body_html_en TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_templates_trigger ON email_templates(trigger_key) WHERE is_active = TRUE;

INSERT INTO email_templates (trigger_key, name, subject_pt, body_html_pt, variables) VALUES
(
  'magic_link',
  'Magic Link — Login',
  'O seu link de acesso ao Doutor Imigrante',
  '<p>Olá {{name}},</p><p>Clique no link abaixo para aceder à sua conta:</p><p><a href="{{magic_link}}">Entrar na minha conta</a></p><p>Este link expira em 1 hora.</p>',
  '["{{name}}", "{{magic_link}}"]'::jsonb
),
(
  'welcome_free',
  'Boas-vindas — Quiz Concluído',
  'O seu pré-diagnóstico está pronto! 🎉',
  '<p>Olá {{name}},</p><p>O seu quiz foi concluído. A sua elegibilidade é: <strong>{{score_category}}</strong>.</p><p><a href="{{cta_link}}">Ver Diagnóstico Completo por €30</a></p>',
  '["{{name}}", "{{score_category}}", "{{cta_link}}"]'::jsonb
),
(
  'payment_confirmed',
  'Pagamento Confirmado — Diagnóstico Profissional',
  'Pagamento confirmado — O seu diagnóstico está a ser preparado',
  '<p>Olá {{name}},</p><p>O seu pagamento de {{amount}} foi confirmado.</p><p><a href="{{dashboard_link}}">Aceder ao Dashboard</a></p>',
  '["{{name}}", "{{amount}}", "{{dashboard_link}}"]'::jsonb
),
(
  'analysis_ready',
  'Análise IA Pronta',
  'A sua análise jurídica completa está pronta! ✅',
  '<p>Olá {{name}},</p><p>A sua análise jurídica personalizada está pronta.</p><p>Visto sugerido: <strong>{{visa_type}}</strong></p><p><a href="{{dashboard_link}}">Ver Análise Completa</a></p>',
  '["{{name}}", "{{visa_type}}", "{{dashboard_link}}"]'::jsonb
),
(
  'subscription_cancelled',
  'Subscrição Cancelada',
  'A sua subscrição foi cancelada',
  '<p>Olá {{name}},</p><p>A sua subscrição mensal foi cancelada. Pode voltar a subscrever a qualquer momento.</p>',
  '["{{name}}"]'::jsonb
);

-- =====================================================
-- 24. EMAIL_SEND_LOG
-- =====================================================

CREATE TABLE email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  body_html TEXT,
  provider VARCHAR(50) DEFAULT 'resend',
  provider_message_id VARCHAR(255),
  status VARCHAR(50),
  error_message TEXT,
  variables_used JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_send_log_user ON email_send_log(user_id);
CREATE INDEX idx_email_send_log_recipient ON email_send_log(recipient_email);
CREATE INDEX idx_email_send_log_created ON email_send_log(created_at DESC);

-- =====================================================
-- 25. AI_CONFIGURATIONS
-- =====================================================

CREATE TABLE ai_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case ai_use_case NOT NULL,
  provider ai_provider NOT NULL,
  model VARCHAR(100) NOT NULL,
  temperature DECIMAL(3,2) DEFAULT 0.30,
  max_tokens INT DEFAULT 2000,
  system_prompt TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_ai_configs_use_case ON ai_configurations(use_case) WHERE is_active = TRUE;
CREATE UNIQUE INDEX idx_ai_configs_one_active_per_use_case ON ai_configurations(use_case) WHERE is_active = TRUE;

INSERT INTO ai_configurations (use_case, provider, model, temperature, max_tokens, is_active, system_prompt) VALUES
  ('scoring', 'openai', 'gpt-4o-mini', 0.10, 1000, TRUE,
    'You are a Portuguese immigration law expert. Analyze user responses objectively and calculate eligibility scores. Return structured JSON only.'),
  ('analysis', 'openai', 'gpt-4o-mini', 0.30, 2000, TRUE,
    'You are Dra. Sofia, a senior Portuguese immigration lawyer. Provide warm, detailed, and accurate legal analysis in European Portuguese (pt-PT). Be encouraging but honest about challenges.'),
  ('chat', 'openai', 'gpt-4o-mini', 0.50, 1500, TRUE,
    'You are Doutor Imigrante, a helpful AI assistant specialized in Portuguese immigration law. Answer questions clearly in pt-PT. Always recommend consulting a lawyer for final decisions.'),
  ('document_extraction', 'openai', 'gpt-4o-mini', 0.10, 1000, TRUE,
    'You extract structured data from immigration documents. Return valid JSON only.');

-- =====================================================
-- 26. AUDIT_LOG
-- =====================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID,
  action VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
CREATE TRIGGER prevent_audit_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- =====================================================
-- 27. ELIGIBILITY_RULES (regras granulares por critério)
-- =====================================================

CREATE TABLE eligibility_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES rule_versions(id) ON DELETE CASCADE,
  visa_type_id UUID NOT NULL REFERENCES visa_types(id) ON DELETE CASCADE,
  criterion_key VARCHAR(100) NOT NULL,
  criterion_name_pt VARCHAR(255) NOT NULL,
  description TEXT,
  rule_logic JSONB NOT NULL,
  weight INT DEFAULT 1,
  is_mandatory BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eligibility_rules_version ON eligibility_rules(rule_version_id);
CREATE INDEX idx_eligibility_rules_visa ON eligibility_rules(visa_type_id);

-- =====================================================
-- TRIGGERS — updated_at
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_tenants        BEFORE UPDATE ON tenants        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_profiles       BEFORE UPDATE ON profiles       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_assessments    BEFORE UPDATE ON assessments    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_crm_leads      BEFORE UPDATE ON crm_leads      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_cases          BEFORE UPDATE ON cases          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_case_applicants BEFORE UPDATE ON case_applicants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_case_documents  BEFORE UPDATE ON case_documents  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_case_tasks      BEFORE UPDATE ON case_tasks      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_subscriptions   BEFORE UPDATE ON subscriptions   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_email_templates BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_ai_configs      BEFORE UPDATE ON ai_configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_form_themes     BEFORE UPDATE ON form_themes     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_form_questions  BEFORE UPDATE ON form_questions  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- TRIGGER — Auto-create profile on user signup
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    '00000000-0000-0000-0000-000000000001'
  );

  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (NEW.id, '00000000-0000-0000-0000-000000000001', 'client');

  INSERT INTO public.subscriptions (user_id, tier)
  VALUES (NEW.id, 'free');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- RLS — Habilitar em todas as tabelas operacionais
-- =====================================================

ALTER TABLE tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_questions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activity_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases               ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_applicants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE eligibility_rules   ENABLE ROW LEVEL SECURITY;

-- Helper: get user tenant
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT tenant_id FROM profiles WHERE id = _user_id;
$$;

-- Helper: is hub user?
CREATE OR REPLACE FUNCTION public.is_hub_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    JOIN tenants t ON t.id = p.tenant_id
    WHERE p.id = _user_id AND t.type = 'hub'
  );
$$;

-- ── POLICIES: profiles ────────────────────────────────────
CREATE POLICY profiles_self_read ON profiles FOR SELECT
  USING (id = auth.uid() OR public.is_hub_user(auth.uid()) OR tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY profiles_self_update ON profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ── POLICIES: form_questions (public read when active) ────
CREATE POLICY form_questions_public_read ON form_questions FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY form_question_options_public_read ON form_question_options FOR SELECT
  USING (is_active = TRUE);

-- ── POLICIES: assessments (anon allowed) ─────────────────
CREATE POLICY assessments_anon_insert ON assessments FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY assessments_read ON assessments FOR SELECT
  USING (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

CREATE POLICY assessments_update ON assessments FOR UPDATE
  USING (user_id = auth.uid() OR session_id IS NOT NULL);

-- ── POLICIES: assessment_results ─────────────────────────
CREATE POLICY assessment_results_read ON assessment_results FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM assessments a WHERE a.id = assessment_id AND a.user_id = auth.uid())
    OR public.is_hub_user(auth.uid())
  );

-- ── POLICIES: crm_leads (multi-tenant) ───────────────────
CREATE POLICY crm_leads_tenant_read ON crm_leads FOR SELECT
  USING (assigned_tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));

CREATE POLICY crm_leads_tenant_write ON crm_leads FOR ALL
  USING (assigned_tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));

-- ── POLICIES: crm_activity_log ───────────────────────────
CREATE POLICY crm_activity_read ON crm_activity_log FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = lead_id AND (l.assigned_tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid())))
  );

CREATE POLICY crm_activity_insert ON crm_activity_log FOR INSERT
  WITH CHECK (TRUE);

-- ── POLICIES: cases ───────────────────────────────────────
CREATE POLICY cases_read ON cases FOR SELECT
  USING (primary_user_id = auth.uid() OR tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));

CREATE POLICY cases_write ON cases FOR ALL
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));

-- ── POLICIES: case sub-tables ─────────────────────────────
CREATE POLICY case_applicants_read ON case_applicants FOR SELECT
  USING (EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND (c.primary_user_id = auth.uid() OR c.tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()))));

CREATE POLICY case_documents_read ON case_documents FOR SELECT
  USING (EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND (c.primary_user_id = auth.uid() OR c.tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()))));

CREATE POLICY case_tasks_read ON case_tasks FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR public.is_hub_user(auth.uid())
    OR (case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND c.tenant_id = public.get_user_tenant_id(auth.uid())))
  );

CREATE POLICY case_messages_read ON case_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM cases c WHERE c.id = case_id AND (c.primary_user_id = auth.uid() OR c.tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()))));

-- ── POLICIES: subscriptions (own only) ───────────────────
CREATE POLICY subscriptions_self_read ON subscriptions FOR SELECT
  USING (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

CREATE POLICY subscriptions_self_update ON subscriptions FOR UPDATE
  USING (public.is_hub_user(auth.uid()));

-- ── POLICIES: eligibility_rules (public read) ────────────
CREATE POLICY eligibility_rules_public_read ON eligibility_rules FOR SELECT
  USING (TRUE);

-- ── POLICIES: user_roles ──────────────────────────────────
CREATE POLICY user_roles_self_read ON user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_hub_user(auth.uid()));

-- =====================================================
-- STORAGE BUCKET
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-documents',
  'case-documents',
  FALSE,
  52428800, -- 50MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

CREATE POLICY case_documents_upload ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'case-documents' AND auth.uid() IS NOT NULL);

CREATE POLICY case_documents_read ON storage.objects FOR SELECT
  USING (
    bucket_id = 'case-documents'
    AND (
      (storage.foldername(name))[1] = (SELECT tenant_id::text FROM profiles WHERE id = auth.uid())
      OR public.is_hub_user(auth.uid())
    )
  );
