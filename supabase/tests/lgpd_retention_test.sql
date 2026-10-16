-- =====================================================================
-- supabase/tests/lgpd_retention_test.sql — DI-083 (W4-03)
--
-- Testes (pgTAP) de 20261030000100_retention_lgpd.sql: exclusão da conta sem
-- PII restante, isolamento entre contas, pagamentos guardados sem vínculo,
-- append-only preservado e retenção (anonimização e minimização).
--
-- SÓ NO BANCO LOCAL. Tudo roda numa transação com ROLLBACK no fim.
--   supabase test db
-- ou, com psql apontando para o Postgres local:
--   psql "$LOCAL_DB_URL" -f supabase/tests/lgpd_retention_test.sql
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(41);

-- ─── Dados de teste ─────────────────────────────────────────────────────────
-- A = cliente que pede a exclusão; B = outro cliente (não pode ser afetado);
-- C = equipe (hub_admin); D = cliente com processo em andamento.

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated',
   'ana.lgpd@example.test', '{}', '{"full_name":"Ana Lgpd Teste"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated',
   'bruno.lgpd@example.test', '{}', '{"full_name":"Bruno Lgpd Teste"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-4000-8000-00000000000c', 'authenticated', 'authenticated',
   'carla.equipe@example.test', '{}', '{"full_name":"Carla Equipe"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-4000-8000-00000000000d', 'authenticated', 'authenticated',
   'dora.processo@example.test', '{}', '{"full_name":"Dora Processo"}', now(), now());

UPDATE public.profiles SET phone = '+55 11 98888-7777' WHERE id = 'a0000000-0000-4000-8000-00000000000a';
INSERT INTO public.user_roles (user_id, tenant_id, role)
VALUES ('c0000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000001', 'hub_admin');

UPDATE public.subscriptions
   SET tier = 'one_time', one_time_paid = TRUE, one_time_paid_at = now(),
       stripe_customer_id = 'cus_LGPDTESTA', has_dashboard_access = TRUE
 WHERE user_id = 'a0000000-0000-4000-8000-00000000000a';

-- Diagnósticos de A: um da conta e um anônimo antigo com o mesmo e-mail (outra caixa).
INSERT INTO public.assessments (id, session_id, user_id, full_name, email, phone, answers, status, ip_address, user_agent)
VALUES
  ('a1000000-0000-4000-8000-0000000000a1', 's_lgpd_a1', 'a0000000-0000-4000-8000-00000000000a',
   'Ana Lgpd Teste', 'ana.lgpd@example.test', '+55 11 98888-7777', '{"processo_tipo":"nacionalidade"}', 'completed',
   '203.0.113.7', 'Mozilla/5.0 (teste)'),
  ('a2000000-0000-4000-8000-0000000000a2', 's_lgpd_a2', NULL,
   'Ana Lgpd Teste', 'ANA.LGPD@EXAMPLE.TEST', NULL, '{"processo_tipo":"nacionalidade","marketing_opt_in":true}', 'completed',
   NULL, NULL),
  ('b1000000-0000-4000-8000-0000000000b1', 's_lgpd_b1', 'b0000000-0000-4000-8000-00000000000b',
   'Bruno Lgpd Teste', 'bruno.lgpd@example.test', NULL, '{"processo_tipo":"nacionalidade"}', 'completed',
   NULL, NULL);

INSERT INTO public.assessment_results (assessment_id, score_numeric, score_category, ia_explanation_short)
VALUES ('a1000000-0000-4000-8000-0000000000a1', 70, 'Média', 'Texto da análise de Ana Lgpd Teste'),
       ('b1000000-0000-4000-8000-0000000000b1', 80, 'Alta', 'Texto do Bruno');

INSERT INTO public.messages (assessment_id, user_id, role, content)
VALUES ('a1000000-0000-4000-8000-0000000000a1', 'a0000000-0000-4000-8000-00000000000a', 'user', 'Meu nome é Ana Lgpd Teste'),
       ('b1000000-0000-4000-8000-0000000000b1', 'b0000000-0000-4000-8000-00000000000b', 'user', 'Pergunta do Bruno');

INSERT INTO public.user_documents (user_id, assessment_id, document_type, display_name, file_name, storage_path)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a1', 'passaporte', 'Passaporte',
        'passaporte-ana.pdf', 'a0000000-0000-4000-8000-00000000000a/general/passaporte/1.pdf');

INSERT INTO public.payments (id, user_id, assessment_id, stripe_payment_intent_id, stripe_customer_id, product, amount_cents, status, paid_at, metadata)
VALUES ('a3000000-0000-4000-8000-0000000000a3', 'a0000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a1',
        'pi_LGPDTESTA', 'cus_LGPDTESTA', 'one_time_analysis', 3000, 'succeeded', now(), '{"checkout_session_id":"cs_test_lgpd"}');

INSERT INTO public.payment_events (user_id, stripe_event_id, stripe_event_type, amount, currency, status, payload)
VALUES ('a0000000-0000-4000-8000-00000000000a', 'evt_LGPDTESTA', 'checkout.session.completed', 30, 'EUR', 'processed', '{"id":"evt_LGPDTESTA"}');

INSERT INTO public.checkout_claims (stripe_session_id, user_id)
VALUES ('cs_test_lgpdA', 'a0000000-0000-4000-8000-00000000000a');

INSERT INTO public.email_send_log (user_id, recipient_email, subject, body_html, status, variables_used, sent_at)
VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'ana.lgpd@example.test', 'Olá Ana Lgpd Teste', '<p>Ana Lgpd Teste</p>', 'sent',
   '{"name":"Ana Lgpd Teste","assessment_id":"a1000000-0000-4000-8000-0000000000a1"}', now()),
  (NULL, 'Ana.Lgpd@Example.Test', 'Seu resultado', '<p>link</p>', 'sent', '{"cta_link":"https://x.test/r/abc"}', now()),
  ('b0000000-0000-4000-8000-00000000000b', 'bruno.lgpd@example.test', 'Seu resultado', '<p>Bruno</p>', 'sent', '{}', now());

-- Log append-only com A como ator (bloqueava a exclusão no Auth).
INSERT INTO public.audit_log (table_name, action, actor_user_id, actor_type, ip_address, user_agent, new_values)
VALUES ('profiles', 'UPDATE', 'a0000000-0000-4000-8000-00000000000a', 'user', '203.0.113.7', 'Mozilla/5.0 (teste)', '{"campo":"x"}');

INSERT INTO public.crm_leads (id, assessment_id, source_tenant_id, assigned_tenant_id, full_name, email, phone, notes)
VALUES ('a4000000-0000-4000-8000-0000000000a4', 'a1000000-0000-4000-8000-0000000000a1',
        '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
        'Ana Lgpd Teste', 'ana.lgpd@example.test', '+55 11 98888-7777', 'Prefere contato por WhatsApp');
INSERT INTO public.crm_activity_log (lead_id, action, actor_user_id, actor_type, details)
VALUES ('a4000000-0000-4000-8000-0000000000a4', 'status_changed', 'a0000000-0000-4000-8000-00000000000a', 'user', '{"to":"qualificado"}');

-- Processo encerrado de A (FK RESTRICT) e processo aberto de D.
INSERT INTO public.countries (id, code, name_pt, name_en) VALUES ('e0000000-0000-4000-8000-0000000000e0', 'ZZ', 'País Teste', 'Test Country');
INSERT INTO public.visa_categories (id, country_id, code, name_pt) VALUES ('e1000000-0000-4000-8000-0000000000e1', 'e0000000-0000-4000-8000-0000000000e0', 'zz_cat', 'Categoria Teste');
INSERT INTO public.visa_types (id, category_id, code, name_pt) VALUES ('e2000000-0000-4000-8000-0000000000e2', 'e1000000-0000-4000-8000-0000000000e1', 'zz_tipo', 'Tipo Teste');
INSERT INTO public.cases (id, tenant_id, primary_user_id, visa_type_id, status)
VALUES ('a5000000-0000-4000-8000-0000000000a5', '00000000-0000-0000-0000-000000000001', 'a0000000-0000-4000-8000-00000000000a', 'e2000000-0000-4000-8000-0000000000e2', 'concluded'),
       ('d5000000-0000-4000-8000-0000000000d5', '00000000-0000-0000-0000-000000000001', 'd0000000-0000-4000-8000-00000000000d', 'e2000000-0000-4000-8000-0000000000e2', 'documentation');
INSERT INTO public.case_documents (case_id, document_type_code, document_name, storage_path)
VALUES ('a5000000-0000-4000-8000-0000000000a5', 'passaporte', 'Passaporte de Ana Lgpd Teste', 'hub/a5000000/passaporte.pdf');
INSERT INTO public.case_applicants (case_id, full_name, passport_number)
VALUES ('a5000000-0000-4000-8000-0000000000a5', 'Ana Lgpd Teste', 'PT1234567');

-- Varredura de PII: quantas linhas de public.* ainda contêm um termo.
CREATE OR REPLACE FUNCTION pg_temp.pii_hits(p_term TEXT) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  t RECORD;
  n INT;
  total INT := 0;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
            WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I x WHERE x::text ILIKE %L', t.relname, '%' || p_term || '%') INTO n;
    total := total + n;
  END LOOP;
  RETURN total;
END;
$$;

SELECT ok(pg_temp.pii_hits('ana.lgpd@example.test') > 0, 'antes: há PII de A no banco');

-- ─── Privilégios ────────────────────────────────────────────────────────────

SELECT ok(NOT has_function_privilege('anon', 'public.lgpd_erase_user(uuid,text)', 'EXECUTE'), 'anon não executa lgpd_erase_user');
SELECT ok(NOT has_function_privilege('authenticated', 'public.lgpd_erase_user(uuid,text)', 'EXECUTE'), 'authenticated não executa lgpd_erase_user');
SELECT ok(has_function_privilege('service_role', 'public.lgpd_erase_user(uuid,text)', 'EXECUTE'), 'service_role executa lgpd_erase_user');
SELECT ok(NOT has_table_privilege('authenticated', 'public.account_deletion_log', 'SELECT'), 'authenticated não lê account_deletion_log');

-- ─── Recusas ────────────────────────────────────────────────────────────────

SELECT throws_ok($$ SELECT public.lgpd_erase_user('c0000000-0000-4000-8000-00000000000c') $$, 'P0001', 'staff_account', 'conta da equipe é recusada');
SELECT throws_ok($$ SELECT public.lgpd_erase_user('d0000000-0000-4000-8000-00000000000d') $$, 'P0001', 'open_case', 'processo em andamento é recusado');
SELECT throws_ok($$ SELECT public.lgpd_erase_user('a0000000-0000-4000-8000-00000000000a', 'qualquer') $$, '22023', NULL, 'origem inválida é recusada');

-- ─── Exclusão de A (como a Edge Function: service_role) ─────────────────────

SET LOCAL ROLE service_role;
SELECT set_config('lgpd_test.erase', public.lgpd_erase_user('a0000000-0000-4000-8000-00000000000a')::text, true);
RESET ROLE;

SELECT is((current_setting('lgpd_test.erase')::jsonb ->> 'assessments_deleted')::int, 2, 'apaga o diagnóstico da conta e o anônimo com o mesmo e-mail');
SELECT is((current_setting('lgpd_test.erase')::jsonb ->> 'payments_retained')::int, 1, 'informa o pagamento guardado');
SELECT is(current_setting('lgpd_test.erase')::jsonb -> 'case_document_paths', '["hub/a5000000/passaporte.pdf"]'::jsonb, 'devolve os anexos do processo para remover do Storage');

-- O Auth agora consegue apagar o usuário (antes: RESTRICT em cases e trigger append-only).
SELECT lives_ok($$ DELETE FROM auth.users WHERE id = 'a0000000-0000-4000-8000-00000000000a' $$, 'auth.users de A apagado sem erro de FK/trigger');

SELECT is(pg_temp.pii_hits('ana.lgpd@example.test'), 0, 'nenhuma linha com o e-mail de A');
SELECT is(pg_temp.pii_hits('Ana Lgpd Teste'), 0, 'nenhuma linha com o nome de A');
SELECT is(pg_temp.pii_hits('98888-7777'), 0, 'nenhuma linha com o telefone de A');
SELECT is(pg_temp.pii_hits('a0000000-0000-4000-8000-00000000000a'), 0, 'nenhuma linha com o user_id de A');
SELECT is(pg_temp.pii_hits('203.0.113.7'), 0, 'nenhuma linha com o IP de A');
SELECT is(pg_temp.pii_hits('PT1234567'), 0, 'nenhuma linha com o passaporte de A');

SELECT is((SELECT count(*)::int FROM public.payments WHERE id = 'a3000000-0000-4000-8000-0000000000a3' AND user_id IS NULL AND amount_cents = 3000),
          1, 'pagamento de A guardado, sem vínculo com a conta');
SELECT is((SELECT count(*)::int FROM public.payment_events WHERE stripe_event_id = 'evt_LGPDTESTA' AND user_id IS NULL),
          1, 'evento do Stripe guardado, sem vínculo');
SELECT is((SELECT count(*)::int FROM public.email_send_log WHERE recipient_email ~ '^apagado\+[0-9a-f]{32}@invalid$' AND body_html IS NULL AND variables_used = '{}'::jsonb),
          2, 'e-mails de A anonimizados (apagado+token@invalid, sem corpo e variáveis)');
SELECT is((SELECT full_name FROM public.crm_leads WHERE id = 'a4000000-0000-4000-8000-0000000000a4'), 'Titular removido', 'lead de A anonimizado');
SELECT is((SELECT count(*)::int FROM public.audit_log WHERE table_name = 'profiles' AND action = 'UPDATE' AND actor_user_id IS NULL AND new_values = '{"campo":"x"}'),
          1, 'audit_log mantido, sem o ator');
SELECT is((SELECT count(*)::int FROM public.account_deletion_log WHERE source = 'self_service'), 1, 'exclusão registrada em account_deletion_log');

-- B intacto.
SELECT is((SELECT email FROM public.assessments WHERE id = 'b1000000-0000-4000-8000-0000000000b1'), 'bruno.lgpd@example.test', 'diagnóstico de B intacto');
SELECT is((SELECT count(*)::int FROM public.messages WHERE user_id = 'b0000000-0000-4000-8000-00000000000b'), 1, 'chat de B intacto');
SELECT is((SELECT recipient_email FROM public.email_send_log WHERE user_id = 'b0000000-0000-4000-8000-00000000000b'), 'bruno.lgpd@example.test', 'e-mail de B intacto');

-- Idempotente e append-only preservado.
SELECT lives_ok($$ SELECT public.lgpd_erase_user('a0000000-0000-4000-8000-00000000000a') $$, 'rodar de novo não falha');
SELECT throws_ok($$ UPDATE public.audit_log SET action = 'x' $$, 'P0001', 'audit_log is append-only', 'audit_log continua append-only');
SELECT throws_ok($$ DELETE FROM public.crm_activity_log $$, 'P0001', 'crm_activity_log is append-only', 'crm_activity_log continua append-only');
SELECT set_config('app.lgpd_erasure', 'on', true);
SELECT throws_ok($$ UPDATE public.audit_log SET action = 'x', actor_user_id = NULL $$,
  'P0001', 'audit_log is append-only', 'com a GUC ligada, só zerar o ator é permitido');
SELECT set_config('app.lgpd_erasure', 'off', true);

-- Clientes não alcançam a exceção: nenhuma policy de UPDATE/DELETE nos logs e,
-- mesmo com uma policy e o privilégio dados de propósito (desfeitos no ROLLBACK)
-- e a GUC ligada, o papel authenticated é recusado pelo trigger.
SELECT is((SELECT count(*)::int FROM pg_policies
            WHERE schemaname = 'public' AND tablename IN ('audit_log', 'crm_activity_log')
              AND cmd IN ('UPDATE', 'DELETE', 'ALL')),
          0, 'audit_log/crm_activity_log sem policy de UPDATE/DELETE para clientes');
CREATE POLICY lgpd_test_tmp_update ON public.audit_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY lgpd_test_tmp_update ON public.crm_activity_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
GRANT UPDATE ON public.audit_log, public.crm_activity_log TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('app.lgpd_erasure', 'on', true);
DO $$
BEGIN
  UPDATE public.audit_log SET actor_user_id = NULL, ip_address = NULL, user_agent = NULL;
  PERFORM set_config('lgpd_test.client_audit', 'permitido', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('lgpd_test.client_audit', SQLERRM, true);
END $$;
DO $$
BEGIN
  UPDATE public.crm_activity_log SET actor_user_id = NULL;
  PERFORM set_config('lgpd_test.client_activity', 'permitido', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('lgpd_test.client_activity', SQLERRM, true);
END $$;
RESET ROLE;
SELECT set_config('app.lgpd_erasure', 'off', true);
SELECT is(current_setting('lgpd_test.client_audit', true), 'audit_log is append-only',
          'authenticated com a GUC ligada não pseudonimiza audit_log');
SELECT is(current_setting('lgpd_test.client_activity', true), 'crm_activity_log is append-only',
          'authenticated com a GUC ligada não pseudonimiza crm_activity_log');
DROP POLICY lgpd_test_tmp_update ON public.audit_log;
DROP POLICY lgpd_test_tmp_update ON public.crm_activity_log;

-- ─── Retenção ───────────────────────────────────────────────────────────────

INSERT INTO public.assessments (id, session_id, user_id, full_name, email, phone, answers, status, created_at, expires_at)
VALUES
  ('f1000000-0000-4000-8000-0000000000f1', 's_old', NULL, 'Velho Anonimo', 'velho@example.test', '+351 900000001',
   '{"processo_tipo":"nacionalidade","marketing_opt_in":true}', 'completed', now() - interval '100 days', now() - interval '10 days'),
  ('f2000000-0000-4000-8000-0000000000f2', 's_new', NULL, 'Novo Anonimo', 'novo@example.test', NULL,
   '{"processo_tipo":"nacionalidade"}', 'completed', now() - interval '10 days', now() + interval '80 days'),
  ('f3000000-0000-4000-8000-0000000000f3', 's_wl-wl', NULL, 'Espera Recente', 'espera@example.test', NULL,
   '{"processo_tipo":"visto","waitlist":true}', 'incomplete', now() - interval '100 days', now() - interval '10 days'),
  ('f4000000-0000-4000-8000-0000000000f4', 's_wl2-wl', NULL, 'Espera Antiga', 'espera2@example.test', NULL,
   '{"processo_tipo":"visto","waitlist":true}', 'incomplete', now() - interval '400 days', now() - interval '310 days'),
  ('f5000000-0000-4000-8000-0000000000f5', 's_paid', NULL, 'Pago Sem Conta', 'pago@example.test', NULL,
   '{"processo_tipo":"nacionalidade"}', 'completed', now() - interval '100 days', now() - interval '10 days');
INSERT INTO public.assessment_results (assessment_id, score_numeric, score_category, ia_explanation_short)
VALUES ('f1000000-0000-4000-8000-0000000000f1', 50, 'Média', 'Texto antigo');
INSERT INTO public.payments (assessment_id, stripe_payment_intent_id, product, amount_cents, status)
VALUES ('f5000000-0000-4000-8000-0000000000f5', 'pi_LGPDPAID', 'one_time_analysis', 3000, 'succeeded');

INSERT INTO public.email_send_log (user_id, recipient_email, subject, body_html, status, variables_used, sent_at, created_at)
VALUES
  (NULL, 'velho@example.test', 'Assunto', '<p>Velho Anonimo</p>', 'sent',
   '{"name":"Velho Anonimo","cta_link":"https://x.test/r/abc","assessment_id":"f1000000-0000-4000-8000-0000000000f1"}',
   now() - interval '100 days', now() - interval '100 days'),
  (NULL, 'novo@example.test', 'Assunto', '<p>Novo Anonimo</p>', 'sent', '{"name":"Novo Anonimo"}',
   now() - interval '10 days', now() - interval '10 days'),
  ('b0000000-0000-4000-8000-00000000000b', 'bruno.lgpd@example.test', 'Assunto', '<p>Bruno</p>', 'sent', '{"name":"Bruno"}',
   now() - interval '100 days', now() - interval '100 days');

SELECT private.lgpd_apply_retention();

SELECT is((SELECT count(*)::int FROM public.assessments
            WHERE id IN ('f1000000-0000-4000-8000-0000000000f1', 'f4000000-0000-4000-8000-0000000000f4')
              AND email IS NULL AND full_name IS NULL),
          2, 'anonimiza o vencido e a lista de espera com mais de 365 dias');
SELECT ok((SELECT full_name IS NULL AND email IS NULL AND phone IS NULL AND session_id IS NULL
                  AND NOT (answers ? 'marketing_opt_in') AND answers ->> 'processo_tipo' = 'nacionalidade'
             FROM public.assessments WHERE id = 'f1000000-0000-4000-8000-0000000000f1'),
          'diagnóstico vencido sem PII; respostas ficam para estatística');
SELECT is((SELECT ia_explanation_short FROM public.assessment_results WHERE assessment_id = 'f1000000-0000-4000-8000-0000000000f1'), NULL, 'texto da IA do vencido apagado');
SELECT is((SELECT count(*)::int FROM public.assessments WHERE email IN ('novo@example.test', 'espera@example.test', 'pago@example.test')),
          3, 'não vencido, lista de espera recente e pago sem conta ficam intactos');
SELECT ok((SELECT body_html IS NULL AND variables_used = '{"assessment_id":"f1000000-0000-4000-8000-0000000000f1"}'::jsonb
                  AND recipient_email ~ '^apagado\+[0-9a-f]{32}@invalid$'
             FROM public.email_send_log WHERE variables_used ->> 'assessment_id' = 'f1000000-0000-4000-8000-0000000000f1'),
          'e-mail antigo sem conta: sem corpo, sem nome/link e sem endereço (assessment_id fica)');
SELECT ok((SELECT body_html IS NULL AND recipient_email = 'bruno.lgpd@example.test'
             FROM public.email_send_log WHERE user_id = 'b0000000-0000-4000-8000-00000000000b' AND sent_at < now() - interval '50 days'),
          'e-mail antigo de conta ativa: sem corpo, endereço mantido');
SELECT is((SELECT r FROM (SELECT private.lgpd_apply_retention() - 'ran_at' AS r) x),
          '{"leads_anonymized":0,"results_text_cleared":0,"assessments_anonymized":0,"email_content_minimized":0,"email_addresses_anonymized":0}'::jsonb,
          'segunda execução não encontra mais nada (idempotente)');

SELECT * FROM finish();
ROLLBACK;
