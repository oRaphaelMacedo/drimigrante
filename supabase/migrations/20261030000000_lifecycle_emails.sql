-- =====================================================================
-- 20261030000000_lifecycle_emails.sql
-- DI-077 (P2, retenção): e-mails do ciclo de vida com consentimento,
-- descadastro e dry-run (W4-02).
--
-- O que faz (idempotente — pode rodar mais de uma vez):
--   1. public.email_suppressions: lista de descadastro por HASH do e-mail
--      (HMAC-SHA256 com EMAIL_UNSUBSCRIBE_SECRET, calculado nas Edge
--      Functions). Nunca guarda o e-mail. Escopos: 'marketing' (nutrição e
--      lista de espera) e 'all' (também os avisos de serviço: welcome_free e
--      avisos de prazo). Confirmações de pagamento e de fim de assinatura
--      sempre saem. Só a service_role lê e escreve. Como não tem o e-mail,
--      o descadastro continua valendo mesmo depois de a conta ser apagada
--      (W4-03), sem guardar dado pessoal legível.
--   2. email_send_log: índices por variables_used->>'dedupe_key' (consulta
--      e trava de envio) e por variables_used->>'assessment_id' (welcome_free).
--      O índice único parcial (status 'pending' ou 'sent') impede que duas
--      execuções do lifecycle-emails mandem o mesmo e-mail duas vezes; linhas
--      'failed' não bloqueiam uma nova tentativa (o código desiste depois de 2).
--   3. Modelos em pt-BR, honestos e sem urgência falsa (aprovação do dono):
--      novos — nurture_d1, nurture_d3, nurture_d7, access_expiring_d7,
--      access_expiring_d3, access_expired, waitlist_launch;
--      revisados — welcome_free (categoria certa + link /results?r=<token> +
--      descadastro), subscription_cancelled, payment_confirmed e
--      analysis_ready (sem "análise jurídica", sem pt-PT, sem emoji).
--      As variáveis de cada modelo são o contrato de
--      supabase/functions/_shared/email-lifecycle.ts (TEMPLATE_SPECS), conferido
--      pelo teste _shared/email-lifecycle.test.ts.
--
-- Nada aqui envia e-mail nem agenda nada. O envio continua desligado até o
-- dono definir LIFECYCLE_EMAILS_DRY_RUN=false (padrão: dry-run) — ver
-- supabase/functions/lifecycle-emails/index.ts.
--
-- ORDEM DE RELEASE
--   · Depende de 20261025000200_resume_token.sql (coluna assessments.resume_token,
--     usada no link do welcome_free e da nutrição) — aplicar aquela antes.
--   · Aplicar ESTA migration antes do deploy de lifecycle-emails e unsubscribe
--     (leem/escrevem email_suppressions) e do compute-eligibility novo
--     (welcome_free). O compute-eligibility tolera a tabela ausente (o
--     welcome_free só é pulado e logado), mas o resultado do quiz não depende dela.
--   · generate-explanation novo (sem welcome_free) e compute-eligibility novo
--     (com welcome_free) vão no MESMO deploy; o dry-run só sai depois dos dois.
--   · Ações do dono antes de desligar o dry-run: domínio verificado no Resend
--     (DI-014), secret EMAIL_UNSUBSCRIBE_SECRET (openssl rand -hex 32; nunca
--     trocar depois), aprovação dos textos e da frequência, extensões pg_cron e
--     pg_net e o agendamento (exemplo comentado no fim).
--
-- NÃO APLICAR sem validar no Supabase local (consultas no fim do arquivo).
-- =====================================================================

-- ─── 1. Lista de descadastro (só hashes) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  email_hash text        NOT NULL,
  scope      text        NOT NULL,
  source     text        NOT NULL DEFAULT 'unsubscribe_link',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_suppressions_pkey PRIMARY KEY (email_hash, scope),
  CONSTRAINT email_suppressions_hash_format CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT email_suppressions_scope_check CHECK (scope IN ('marketing', 'all')),
  CONSTRAINT email_suppressions_source_check CHECK (source IN ('unsubscribe_link', 'one_click', 'admin'))
);

COMMENT ON TABLE public.email_suppressions IS
  'DI-077: descadastro de e-mails. email_hash = HMAC-SHA256(EMAIL_UNSUBSCRIBE_SECRET, ''email:v1:'' || lower(trim(email))), calculado nas Edge Functions. Nunca guarda o e-mail. Só service_role.';
COMMENT ON COLUMN public.email_suppressions.scope IS
  'marketing = nutrição e lista de espera; all = também welcome_free e avisos de prazo. Pagamentos sempre saem.';

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- Só a service_role (Edge Functions). A policy deixa a intenção explícita
-- (e evita o aviso 0008 rls_enabled_no_policy dos advisors).
DROP POLICY IF EXISTS email_suppressions_no_client_access ON public.email_suppressions;
CREATE POLICY email_suppressions_no_client_access ON public.email_suppressions
  FOR ALL TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

REVOKE ALL ON public.email_suppressions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_suppressions TO service_role;

-- ─── 2. email_send_log: idempotência dos envios ─────────────────────────────

-- Trava: no máximo um envio 'pending' ou 'sent' por chave.
CREATE UNIQUE INDEX IF NOT EXISTS email_send_log_dedupe_key_active
  ON public.email_send_log ((variables_used->>'dedupe_key'))
  WHERE (variables_used->>'dedupe_key') IS NOT NULL
    AND status IN ('pending', 'sent');

-- Consulta de envios anteriores (inclui as falhas, para o limite de tentativas).
CREATE INDEX IF NOT EXISTS email_send_log_dedupe_key_idx
  ON public.email_send_log ((variables_used->>'dedupe_key'))
  WHERE (variables_used->>'dedupe_key') IS NOT NULL;

-- welcome_free: no máximo um por assessment (compute-eligibility).
CREATE INDEX IF NOT EXISTS email_send_log_assessment_idx
  ON public.email_send_log ((variables_used->>'assessment_id'))
  WHERE (variables_used->>'assessment_id') IS NOT NULL;

COMMENT ON COLUMN public.email_send_log.status IS
  'sent | failed | pending (envio do lifecycle-emails em andamento; trava pelo índice email_send_log_dedupe_key_active).';

-- ─── 3. Modelos de e-mail (pt-BR) ───────────────────────────────────────────
-- Gerados a partir de um único layout (HTML inline, 560px, cores da marca:
-- cobalto #1f41c7 com texto branco 7,96:1; texto #141a29; secundário #5c6372).
-- ON CONFLICT atualiza o texto e mantém is_active como estiver no banco.

-- template: welcome_free
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'welcome_free',
  'Pré-diagnóstico pronto (welcome_free)',
  'Enviado pelo compute-eligibility ao concluir o quiz, com o link de retomada do resultado. Serviço: respeita o descadastro geral. DI-077.',
  $subject$Seu pré-diagnóstico de nacionalidade ficou pronto$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Resultado: {{category_label}}. Abra quando quiser, em qualquer aparelho.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Seu pré-diagnóstico ficou pronto</h1>
<p style="margin:0 0 16px;">{{greeting}}</p>
<p style="margin:0 0 16px;">Seu resultado no diagnóstico de nacionalidade portuguesa: <strong>{{category_label}}</strong>.</p>
<p style="margin:0 0 16px;">Pelo botão abaixo, você abre o resultado em qualquer aparelho, quando quiser. Na mesma página está a análise completa (€30), com os requisitos, os documentos e os próximos passos de cada caminho.</p>
<p style="margin:24px 0;"><a href="{{result_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Ver meu resultado</a></p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#5c6372;">Se o botão não funcionar, copie este endereço no navegador:<br><a href="{{result_link}}" style="color:#1f41c7;word-break:break-all;">{{result_link}}</a></p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#5c6372;">O link mostra as suas respostas. Não encaminhe este e-mail para quem não deve vê-las.</p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#5c6372;">O pré-diagnóstico é uma indicação baseada nas suas respostas. Não é aconselhamento jurídico.</p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque fez o diagnóstico no Doutor Imigrante com este endereço. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber e-mails do Doutor Imigrante</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{greeting}}","{{category_label}}","{{result_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: nurture_d1
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'nurture_d1',
  'Nutrição — dia 1',
  'Série de nutrição (marketing): 1 dia depois do quiz, só com opt-in. DI-077.',
  $subject$O que o seu pré-diagnóstico quer dizer$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seu resultado foi {{category_label}}. Veja o que ele mostra e o que fica de fora.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">O que o seu resultado quer dizer</h1>
<p style="margin:0 0 16px;">{{greeting}}</p>
<p style="margin:0 0 16px;">Você fez o diagnóstico de nacionalidade portuguesa no Doutor Imigrante e o resultado foi <strong>{{category_label}}</strong>.</p>
<p style="margin:0 0 16px;">Esse resultado é uma indicação a partir das suas respostas. Ele mostra se existe um caminho provável, mas não detalha os requisitos, os documentos nem os próximos passos.</p>
<p style="margin:0 0 16px;">É isso que a análise completa traz: a análise do seu caminho, os requisitos e documentos de cada caminho e os próximos passos, com o painel e o chat IA por 30 dias. O pagamento é único, de €30.</p>
<p style="margin:24px 0;"><a href="{{result_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Ver meu resultado</a></p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#5c6372;">O pré-diagnóstico é uma indicação baseada nas suas respostas. Não é aconselhamento jurídico.</p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque pediu para receber novidades e dicas do Doutor Imigrante ao fazer o diagnóstico. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber estes e-mails</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{greeting}}","{{category_label}}","{{result_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: nurture_d3
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'nurture_d3',
  'Nutrição — dia 3',
  'Série de nutrição (marketing): 3 dias depois do quiz, só com opt-in. Dicas gerais, sem requisitos legais. DI-077.',
  $subject$Como se organizar para o pedido de nacionalidade$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Três coisas que você já pode adiantar, seja qual for o seu caminho.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Organize-se antes de começar</h1>
<p style="margin:0 0 16px;">{{greeting}}</p>
<p style="margin:0 0 16px;">Seja qual for o seu caminho, o pedido de nacionalidade portuguesa envolve documentos. Algumas coisas que você já pode adiantar:</p>
<ul style="margin:0 0 16px;padding-left:20px;"><li style="margin:0 0 8px;">Anote o que sabe sobre a sua família: nomes completos, datas e locais de nascimento e de casamento.</li><li style="margin:0 0 8px;">Veja quais documentos você já tem em mãos, como certidões e documentos de identificação.</li><li style="margin:0 0 8px;">Acompanhe as informações oficiais do IRN (Instituto dos Registos e do Notariado), responsável pelos pedidos de nacionalidade em Portugal.</li></ul>
<p style="margin:0 0 16px;">Na análise completa, você vê os requisitos e os documentos de cada caminho e os próximos passos para o seu caso.</p>
<p style="margin:24px 0;"><a href="{{result_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Ver meu resultado</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque pediu para receber novidades e dicas do Doutor Imigrante ao fazer o diagnóstico. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber estes e-mails</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{greeting}}","{{category_label}}","{{result_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: nurture_d7
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'nurture_d7',
  'Nutrição — dia 7 (último)',
  'Último e-mail da série de nutrição (marketing): 7 dias depois do quiz, só com opt-in. Sem urgência. DI-077.',
  $subject$Último e-mail desta série$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seu resultado continua disponível no link, quando você quiser.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Seu resultado continua disponível</h1>
<p style="margin:0 0 16px;">{{greeting}}</p>
<p style="margin:0 0 16px;">Este é o último e-mail da série de dicas que começou depois do seu diagnóstico.</p>
<p style="margin:0 0 16px;">Se quiser se aprofundar, a análise completa custa €30, em pagamento único, e inclui o painel e o chat IA por 30 dias.</p>
<p style="margin:0 0 16px;">Se agora não for o momento, tudo bem. O seu resultado continua no link abaixo.</p>
<p style="margin:24px 0;"><a href="{{result_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Ver meu resultado</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque pediu para receber novidades e dicas do Doutor Imigrante ao fazer o diagnóstico. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber estes e-mails</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{greeting}}","{{category_label}}","{{result_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: access_expiring_d7
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'access_expiring_d7',
  'Aviso de prazo — 7 dias',
  'Serviço: o acesso do €30 termina em até 7 dias. Respeita a preferência de avisos e o descadastro geral. DI-077.',
  $subject$Seu acesso ao painel termina em {{days_left_label}}$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seu acesso vai até {{expires_on}}. Veja o que continua disponível depois.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Seu acesso termina em {{days_left_label}}</h1>
<p style="margin:0 0 16px;">{{greeting}}</p>
<p style="margin:0 0 16px;">Seu acesso ao painel, à análise completa e ao chat IA do Doutor Imigrante vai até <strong>{{expires_on}}</strong>.</p>
<p style="margin:0 0 16px;">Aproveite para revisar a análise, conferir os próximos passos e tirar suas dúvidas no chat.</p>
<p style="margin:0 0 16px;">Depois dessa data, você continua podendo baixar e apagar os documentos que enviou. No painel, você encontra a opção de manter o acesso.</p>
<p style="margin:24px 0;"><a href="{{dashboard_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Abrir meu painel</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este aviso porque tem acesso ao painel do Doutor Imigrante. Também dá para desligar estes avisos em Configurações, no painel. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber avisos por e-mail</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{greeting}}","{{days_left_label}}","{{expires_on}}","{{dashboard_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: access_expiring_d3
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'access_expiring_d3',
  'Aviso de prazo — 3 dias',
  'Serviço: o acesso do €30 termina em até 3 dias. Respeita a preferência de avisos e o descadastro geral. DI-077.',
  $subject$Últimos dias do seu acesso ao painel$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seu acesso ao painel vai até {{expires_on}}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Seu acesso termina em {{days_left_label}}</h1>
<p style="margin:0 0 16px;">{{greeting}}</p>
<p style="margin:0 0 16px;">Seu acesso ao painel, à análise completa e ao chat IA vai até <strong>{{expires_on}}</strong>.</p>
<p style="margin:0 0 16px;">Se ainda tiver dúvidas sobre a análise, use o chat enquanto o acesso estiver ativo. Depois dessa data, os documentos que você enviou continuam disponíveis para baixar ou apagar.</p>
<p style="margin:0 0 16px;">No painel, você encontra a opção de manter o acesso.</p>
<p style="margin:24px 0;"><a href="{{dashboard_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Abrir meu painel</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este aviso porque tem acesso ao painel do Doutor Imigrante. Também dá para desligar estes avisos em Configurações, no painel. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber avisos por e-mail</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{greeting}}","{{days_left_label}}","{{expires_on}}","{{dashboard_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: access_expired
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'access_expired',
  'Aviso de prazo — acesso terminou',
  'Serviço: o acesso do €30 terminou há menos de 3 dias. Respeita a preferência de avisos e o descadastro geral. DI-077.',
  $subject$Seu acesso ao painel terminou$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Seus documentos continuam disponíveis para baixar ou apagar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Seu acesso ao painel terminou</h1>
<p style="margin:0 0 16px;">{{greeting}}</p>
<p style="margin:0 0 16px;">Seu acesso ao painel, à análise completa e ao chat IA do Doutor Imigrante terminou em {{expires_on}}.</p>
<p style="margin:0 0 16px;">Os documentos que você enviou continuam no painel, para você baixar ou apagar quando quiser.</p>
<p style="margin:0 0 16px;">Se quiser voltar a ver a análise e usar o chat, o painel mostra a opção de manter o acesso.</p>
<p style="margin:24px 0;"><a href="{{dashboard_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Abrir meu painel</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este aviso porque tem acesso ao painel do Doutor Imigrante. Também dá para desligar estes avisos em Configurações, no painel. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber avisos por e-mail</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{greeting}}","{{expires_on}}","{{dashboard_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: waitlist_launch
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'waitlist_launch',
  'Lista de espera — lançamento',
  'Aviso único para a lista de espera de um produto (visto, regularizacao, nao_sei). Disparo manual do dono, depois do lançamento. DI-077.',
  $subject$Já está disponível: {{product_label}}$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Você pediu um aviso quando estivesse no ar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">{{product_label}} já está disponível</h1>
<p style="margin:0 0 16px;">Olá.</p>
<p style="margin:0 0 16px;">Você pediu um aviso quando {{product_phrase}} do Doutor Imigrante estivesse disponível: já está no ar.</p>
<p style="margin:24px 0;"><a href="{{cta_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Começar agora</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque deixou seu endereço na lista de espera do Doutor Imigrante. <a href="{{unsubscribe_link}}" style="color:#5c6372;text-decoration:underline;">Não quero mais receber estes e-mails</a>.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{product_label}}","{{product_phrase}}","{{cta_link}}","{{unsubscribe_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: subscription_cancelled
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'subscription_cancelled',
  'Assinatura encerrada',
  'Transacional: enviado pelo stripe-webhook em customer.subscription.deleted (cancelamento, fim dos 12 ciclos ou disputa). DI-077.',
  $subject$Sua assinatura mensal foi encerrada$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Não haverá novas cobranças desta assinatura.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Sua assinatura mensal foi encerrada</h1>
<p style="margin:0 0 16px;">Olá, {{name}}.</p>
<p style="margin:0 0 16px;">Sua assinatura de acompanhamento do Doutor Imigrante foi encerrada. Não haverá novas cobranças dela.</p>
<p style="margin:0 0 16px;">Se o acesso de 30 dias do seu pagamento único ainda estiver valendo, o painel continua disponível até o fim desse prazo. Depois disso, você ainda pode baixar e apagar os documentos que enviou.</p>
<p style="margin:24px 0;"><a href="{{dashboard_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Abrir meu painel</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque tinha uma assinatura no Doutor Imigrante.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{name}}","{{dashboard_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: payment_confirmed
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'payment_confirmed',
  'Pagamento confirmado',
  'Transacional: enviado pelo stripe-webhook ao confirmar o pagamento de €30.',
  $subject$Pagamento confirmado: sua análise está no painel$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Você tem 30 dias de acesso ao painel, à análise completa e ao chat IA.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Pagamento confirmado</h1>
<p style="margin:0 0 16px;">Olá, {{name}}.</p>
<p style="margin:0 0 16px;">Recebemos o seu pagamento de {{amount}}. A análise completa fica disponível no seu painel.</p>
<p style="margin:0 0 16px;">Você tem 30 dias de acesso ao painel, à análise completa e ao chat IA.</p>
<p style="margin:24px 0;"><a href="{{dashboard_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Abrir meu painel</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque fez um pagamento no Doutor Imigrante.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{name}}","{{amount}}","{{dashboard_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- template: analysis_ready
INSERT INTO public.email_templates (trigger_key, name, description, subject_pt, body_html_pt, variables, is_active)
VALUES (
  'analysis_ready',
  'Análise completa disponível',
  'Transacional (sem uso no código hoje). Texto revisado: sem promessa de análise jurídica.',
  $subject$Sua análise completa está disponível$subject$,
  $body$<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Abra o painel para ver a análise do seu caminho.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafd;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #dde1ea;border-radius:14px;">
<tr><td style="padding:28px 24px;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#141a29;">
<p style="margin:0 0 20px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#1f41c7;">Doutor Imigrante</p>
<h1 style="margin:0 0 16px;font-family:Literata,Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:700;color:#141a29;">Sua análise completa está disponível</h1>
<p style="margin:0 0 16px;">Olá, {{name}}.</p>
<p style="margin:0 0 16px;">Sua análise completa do Doutor Imigrante está disponível no painel.</p>
<p style="margin:24px 0;"><a href="{{dashboard_link}}" style="display:inline-block;background-color:#1f41c7;color:#ffffff;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:1.25;text-decoration:none;padding:14px 24px;border-radius:12px;">Ver minha análise</a></p>
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td style="padding:16px 8px 0;font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#5c6372;text-align:center;">Você recebeu este e-mail porque tem acesso ao painel do Doutor Imigrante.</td></tr>
</table>
</td></tr>
</table>$body$,
  '["{{name}}","{{dashboard_link}}"]'::jsonb,
  TRUE
)
ON CONFLICT (trigger_key) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  subject_pt   = EXCLUDED.subject_pt,
  body_html_pt = EXCLUDED.body_html_pt,
  variables    = EXCLUDED.variables,
  updated_at   = now();

-- ─── Agendamento (AÇÃO DO DONO, depois da aprovação — NÃO faz parte da migration) ─
--
-- Pré-requisitos: extensões pg_cron e pg_net ligadas (Dashboard → Database →
-- Extensions), lifecycle-emails publicada com verify_jwt = false (ela confere o
-- x-internal-secret sozinha) e LIFECYCLE_EMAILS_DRY_RUN=false nos secrets.
-- Antes de agendar, rode uma vez em dry-run e confira a lista:
--   curl -s -X POST https://krjirhlmdnxqqrpzmowz.supabase.co/functions/v1/lifecycle-emails \
--     -H 'Content-Type: application/json' -H "x-internal-secret: $INTERNAL_SECRET" \
--     -d '{"sequence":"all","dry_run":true}'
--
-- select vault.create_secret('<valor do INTERNAL_SECRET>', 'lifecycle_internal_secret');
-- select cron.schedule(
--   'lifecycle-emails-diario',
--   '0 12 * * *',                       -- todo dia às 12:00 UTC
--   $cron$
--   select net.http_post(
--     url     := 'https://krjirhlmdnxqqrpzmowz.supabase.co/functions/v1/lifecycle-emails',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets
--                             where name = 'lifecycle_internal_secret')
--     ),
--     body    := '{"sequence":"all"}'::jsonb,
--     timeout_milliseconds := 60000
--   );
--   $cron$
-- );
-- Para parar: select cron.unschedule('lifecycle-emails-diario');

-- ─── Verificação (rodar no Supabase local, NÃO em produção) ─────────────────
--
-- 1) RLS ligada e cliente sem acesso:
--    SELECT relrowsecurity FROM pg_class WHERE oid = 'public.email_suppressions'::regclass;  -- t
--    SET ROLE anon;  SELECT count(*) FROM public.email_suppressions;   -- permission denied
--    RESET ROLE;
--
-- 2) Os 11 modelos ativos e com o assunto novo:
--    SELECT trigger_key, is_active, subject_pt FROM public.email_templates
--    WHERE trigger_key IN ('welcome_free','nurture_d1','nurture_d3','nurture_d7',
--      'access_expiring_d7','access_expiring_d3','access_expired','waitlist_launch',
--      'subscription_cancelled','payment_confirmed','analysis_ready')
--    ORDER BY 1;                                                       -- 11 linhas
--
-- 3) Nenhum resto de pt-PT, promessa jurídica ou emoji nesses modelos:
--    SELECT trigger_key FROM public.email_templates
--    WHERE trigger_key IN ('welcome_free','payment_confirmed','analysis_ready','subscription_cancelled')
--      AND (body_html_pt || subject_pt) ~* '(aceder|subscrição|subscrever|está a ser|análise jurídica|diagnóstico profissional|🎉|✅)';  -- 0 linhas
--
-- 4) Trava de envio: a segunda linha 'pending' com a mesma chave falha (23505):
--    BEGIN;
--    INSERT INTO public.email_send_log (recipient_email, status, variables_used)
--      VALUES ('teste@example.com', 'pending', '{"dedupe_key":"teste:1"}');
--    INSERT INTO public.email_send_log (recipient_email, status, variables_used)
--      VALUES ('teste@example.com', 'pending', '{"dedupe_key":"teste:1"}');   -- ERRO 23505
--    ROLLBACK;
--
-- 5) Uma falha não bloqueia nova tentativa:
--    BEGIN;
--    INSERT INTO public.email_send_log (recipient_email, status, variables_used)
--      VALUES ('teste@example.com', 'failed', '{"dedupe_key":"teste:2"}'),
--             ('teste@example.com', 'pending', '{"dedupe_key":"teste:2"}');    -- ok
--    ROLLBACK;
