-- =====================================================================
-- 20261030000100_retention_lgpd.sql
-- DI-083 (W4-03): LGPD/RGPD — exclusão da conta, retenção aplicada e
-- minimização.
--
-- Problema
--   · Não havia como apagar a conta. Apagar só no Auth deixava a PII órfã:
--     assessments.user_id e email_send_log.user_id são ON DELETE SET NULL
--     (nome, e-mail, telefone e respostas ficavam no banco sem dono).
--   · Apagar no Auth chegava a FALHAR: cases.primary_user_id é RESTRICT, e o
--     SET NULL em audit_log/crm_activity_log dispara os triggers append-only
--     ("audit_log is append-only"), o que aborta a exclusão inteira.
--   · Os 90 dias de assessments.expires_at nunca eram aplicados (diagnósticos
--     anônimos vencidos continuavam com nome, e-mail e telefone).
--
-- O que esta migration cria
--   1. public.account_deletion_log — registro das exclusões SEM PII (só data,
--      origem e contagens), para prestação de contas (LGPD art. 37).
--   2. Triggers append-only de audit_log e crm_activity_log: continuam
--      bloqueando UPDATE/DELETE, exceto a pseudonimização feita por
--      lgpd_erase_user (GUC app.lgpd_erasure = 'on', local à transação) que
--      só pode ZERAR actor_user_id (e ip_address/user_agent no audit_log);
--      qualquer outra coluna alterada continua sendo recusada. A exceção nunca
--      vale para os papéis de cliente (anon, authenticated, authenticator),
--      mesmo com a GUC ligada: dentro de lgpd_erase_user (SECURITY DEFINER) o
--      current_user é o dono da função. Além disso, nenhuma policy de
--      UPDATE/DELETE existe nessas tabelas (conferido no teste pgTAP).
--   3. public.lgpd_erase_user(p_user_id, p_source) — SECURITY DEFINER, só
--      service_role (chamada pela Edge Function delete-account). Numa única
--      transação:
--        · recusa conta da equipe (papel diferente de 'client') → 'staff_account'
--          e processo (case) em andamento → 'open_case';
--        · pseudonimiza audit_log e crm_activity_log (actor_user_id = NULL);
--        · anonimiza os leads do CRM ligados aos diagnósticos ou ao e-mail
--          (full_name NOT NULL → 'Titular removido'; e-mail, telefone e notas
--          NULL) — o histórico append-only do lead impede apagá-lo;
--        · apaga processos encerrados (concluded/cancelled) com anexos,
--          tarefas e mensagens (CASCADE) e devolve os caminhos de Storage dos
--          anexos para a function remover;
--        · anonimiza email_send_log: recipient_email NOT NULL →
--          'apagado+<token>@invalid', sem assunto, corpo, erro e variáveis;
--        · mantém pagamentos (payments, payment_events) por obrigação legal,
--          só sem o vínculo com a conta (user_id = NULL); checkout_claims idem;
--        · apaga mensagens do chat, documentos (linhas; os arquivos saem do
--          Storage pela function), diagnósticos da conta e os anônimos feitos
--          com o mesmo e-mail (+ resultados, por CASCADE), assinatura, papéis
--          e perfil;
--        · grava uma linha em account_deletion_log e devolve as contagens.
--      O usuário do Auth é apagado DEPOIS, pela function (auth.admin.deleteUser).
--      Idempotente: rodar de novo para o mesmo usuário não falha.
--   4. Retenção (schema private, sem acesso de clientes):
--        private.lgpd_apply_retention(p_now) — diária, via pg_cron:
--          R1. diagnóstico anônimo (sem conta, sem pagamento) vencido
--              (expires_at; padrão = criação + 90 dias) → anonimizado: sem nome,
--              e-mail, telefone, IP, navegador, referrer, primeira página e
--              session_id; resume_token trocado (o link antigo para de valer);
--              texto da IA apagado; lead do CRM anonimizado. As respostas
--              (sem opt-in), a pontuação e as UTMs ficam para estatística.
--              Lista de espera (answers.waitlist = true): 365 dias da criação.
--          R2. email_send_log com mais de 30 dias: sem corpo, sem erro e sem
--              variáveis pessoais (nome, e-mail, telefone, links e tokens);
--              assessment_id e afins ficam (idempotência dos envios).
--          R3. email_send_log sem conta (user_id NULL) com mais de 90 dias:
--              endereço trocado por 'apagado+<token>@invalid'.
--        private.lgpd_scrub_email_variables(jsonb) — tira as chaves pessoais.
--   5. pg_cron: tenta ativar a extensão e agenda 'lgpd-retention-daily'
--      (03:17 UTC). Sem pg_cron, a migration NÃO falha: só avisa (NOTICE) e a
--      retenção pode ser rodada à mão (SELECT private.lgpd_apply_retention();).
--
-- Prazos (constantes em private.lgpd_apply_retention): 90 dias para
-- diagnóstico sem conta, 365 dias para a lista de espera, 30 dias para o
-- conteúdo dos e-mails e 90 dias para o endereço de e-mail sem conta. O texto
-- final da Política de Privacidade (src/pages/legal/PrivacyPage.tsx) espelha
-- estes números — mudar aqui exige mudar lá (e vice-versa). AÇÃO DO DONO:
-- confirmar os prazos e o prazo legal de guarda dos registros de pagamento.
--
-- Fora do banco (feito pela Edge Function delete-account, nesta ordem):
--   cancelar a assinatura no Stripe → apagar os arquivos do bucket
--   user-documents ({user_id}/...) → lgpd_erase_user → remover os anexos de
--   processos devolvidos → auth.admin.deleteUser. O customer do Stripe e as
--   faturas ficam no Stripe (dados fiscais).
--
-- ORDEM DE RELEASE
--   · Depende de 20261025000000_db_hardening_advisors.sql (schema private,
--     search_path = '' nos triggers) e de 20261016000400_checkout_claims.sql.
--   · Aplicar ANTES do deploy da Edge Function delete-account (sem a RPC, a
--     function responde 500 e nada é apagado). export-my-data não depende dela.
--   · AÇÃO DO DONO: ativar pg_cron (Database → Extensions) antes de aplicar,
--     ou rodar de novo o bloco 5 depois de ativar.
--
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / unschedule + schedule).
-- NÃO APLICAR sem validar no Supabase local (consultas no fim do arquivo e
-- supabase/tests/lgpd_retention_test.sql).
-- =====================================================================

-- ─── 1. Registro das exclusões (sem PII) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.account_deletion_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source     TEXT NOT NULL DEFAULT 'self_service'
    CONSTRAINT account_deletion_log_source CHECK (source IN ('self_service', 'support')),
  -- Só contagens (assessments, documentos, pagamentos guardados...). Nunca
  -- user_id, e-mail ou nome: esta tabela prova a exclusão sem recriar o vínculo.
  counts     JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.account_deletion_log IS
  'DI-083: exclusões de conta (LGPD/RGPD). Sem PII: data, origem e contagens. Escrita só por lgpd_erase_user.';

CREATE INDEX IF NOT EXISTS idx_account_deletion_log_deleted_at
  ON public.account_deletion_log (deleted_at DESC);

ALTER TABLE public.account_deletion_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_deletion_log_no_client_access ON public.account_deletion_log;
CREATE POLICY account_deletion_log_no_client_access ON public.account_deletion_log
  FOR ALL TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

REVOKE ALL ON TABLE public.account_deletion_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.account_deletion_log TO service_role;

-- ─── 2. Append-only com exceção de pseudonimização ──────────────────────────
-- Mesmo comportamento de antes (UPDATE e DELETE recusados), exceto um UPDATE
-- que só zera o vínculo com a pessoa, dentro de lgpd_erase_user. Defesa extra:
-- papéis de cliente nunca usam a exceção (a GUC é de sessão e qualquer papel
-- consegue ligá-la; o current_user não).

CREATE OR REPLACE FUNCTION public.prevent_audit_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.lgpd_erasure', true) = 'on'
     AND current_user NOT IN ('anon', 'authenticated', 'authenticator')
     AND NEW.actor_user_id IS NULL
     AND NEW.ip_address IS NULL
     AND NEW.user_agent IS NULL
     AND (to_jsonb(NEW) - ARRAY['actor_user_id', 'ip_address', 'user_agent'])
         = (to_jsonb(OLD) - ARRAY['actor_user_id', 'ip_address', 'user_agent'])
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_activity_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.lgpd_erasure', true) = 'on'
     AND current_user NOT IN ('anon', 'authenticated', 'authenticator')
     AND NEW.actor_user_id IS NULL
     AND (to_jsonb(NEW) - 'actor_user_id') = (to_jsonb(OLD) - 'actor_user_id')
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'crm_activity_log is append-only';
END;
$$;

-- ─── 3. Variáveis de e-mail sem dados pessoais ──────────────────────────────

CREATE OR REPLACE FUNCTION private.lgpd_scrub_email_variables(p_vars JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_vars IS NULL OR jsonb_typeof(p_vars) <> 'object' THEN '{}'::jsonb
    ELSE coalesce(
      (
        SELECT jsonb_object_agg(e.key, e.value)
        FROM jsonb_each(p_vars) AS e
        WHERE NOT (
          lower(e.key) = ANY (ARRAY[
            'name', 'full_name', 'first_name', 'last_name', 'nome',
            'email', 'recipient', 'recipient_email', 'to',
            'phone', 'telefone', 'whatsapp'
          ])
          OR lower(e.key) ~ '(link|url|token|href)$'
        )
      ),
      '{}'::jsonb
    )
  END
$$;

COMMENT ON FUNCTION private.lgpd_scrub_email_variables(JSONB) IS
  'DI-083: tira de email_send_log.variables_used nome, e-mail, telefone, links e tokens (mantém ids como assessment_id).';

REVOKE ALL ON FUNCTION private.lgpd_scrub_email_variables(JSONB) FROM PUBLIC;

-- ─── 4. Exclusão da conta ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.lgpd_erase_user(
  p_user_id UUID,
  p_source  TEXT DEFAULT 'self_service'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_emails          TEXT[];
  v_assessment_ids  UUID[];
  v_case_paths      TEXT[];
  v_placeholder     TEXT := 'apagado+' || replace(gen_random_uuid()::text, '-', '') || '@invalid';
  v_counts          JSONB;
  n_audit           INT := 0;
  n_activity        INT := 0;
  n_leads           INT := 0;
  n_cases           INT := 0;
  n_email_logs      INT := 0;
  n_payments        INT := 0;
  n_payment_events  INT := 0;
  n_claims          INT := 0;
  n_messages        INT := 0;
  n_documents       INT := 0;
  n_assessments     INT := 0;
  n_profiles        INT := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id é obrigatório' USING ERRCODE = '22004';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('self_service', 'support') THEN
    RAISE EXCEPTION 'p_source inválido' USING ERRCODE = '22023';
  END IF;

  -- Conta da equipe não sai por aqui (evita trancar o admin para fora).
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role <> 'client'::public.app_role
  ) THEN
    RAISE EXCEPTION 'staff_account'
      USING ERRCODE = 'P0001', HINT = 'Contas da equipe são removidas pelo administrador.';
  END IF;

  -- Processo em andamento: cases.primary_user_id é RESTRICT e o processo pede
  -- tratamento humano (o pedido segue pelo e-mail de privacidade).
  IF EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.primary_user_id = p_user_id
      AND c.status NOT IN ('concluded'::public.case_status, 'cancelled'::public.case_status)
  ) THEN
    RAISE EXCEPTION 'open_case'
      USING ERRCODE = 'P0001', HINT = 'Há um processo em andamento nesta conta.';
  END IF;

  -- E-mails da pessoa (Auth e perfil), normalizados.
  SELECT coalesce(array_agg(DISTINCT x.e), '{}'::TEXT[])
    INTO v_emails
    FROM (
      SELECT lower(btrim(u.email::text)) AS e FROM auth.users u WHERE u.id = p_user_id
      UNION
      SELECT lower(btrim(p.email::text)) FROM public.profiles p WHERE p.id = p_user_id
    ) AS x
   WHERE x.e IS NOT NULL AND x.e <> '';

  -- Diagnósticos da conta + anônimos feitos com o mesmo e-mail (antes do login).
  SELECT coalesce(array_agg(a.id), '{}'::UUID[])
    INTO v_assessment_ids
    FROM public.assessments a
   WHERE a.user_id = p_user_id
      OR (a.user_id IS NULL AND a.email IS NOT NULL AND lower(btrim(a.email::text)) = ANY (v_emails));

  -- Libera, só nesta transação, a pseudonimização nos logs append-only.
  PERFORM set_config('app.lgpd_erasure', 'on', true);

  UPDATE public.audit_log
     SET actor_user_id = NULL, ip_address = NULL, user_agent = NULL
   WHERE actor_user_id = p_user_id;
  GET DIAGNOSTICS n_audit = ROW_COUNT;

  UPDATE public.crm_activity_log
     SET actor_user_id = NULL
   WHERE actor_user_id = p_user_id;
  GET DIAGNOSTICS n_activity = ROW_COUNT;

  PERFORM set_config('app.lgpd_erasure', 'off', true);

  -- CRM: o lead fica (histórico append-only), sem dados da pessoa.
  UPDATE public.crm_leads l
     SET full_name = 'Titular removido',
         email = NULL,
         phone = NULL,
         notes = NULL,
         lost_reason = NULL,
         next_followup_at = NULL,
         updated_at = now()
   WHERE l.assessment_id = ANY (v_assessment_ids)
      OR (l.email IS NOT NULL AND lower(btrim(l.email::text)) = ANY (v_emails));
  GET DIAGNOSTICS n_leads = ROW_COUNT;

  -- Processos encerrados: apagados com anexos, tarefas e mensagens (CASCADE).
  SELECT coalesce(array_agg(cd.storage_path), '{}'::TEXT[])
    INTO v_case_paths
    FROM public.case_documents cd
    JOIN public.cases c ON c.id = cd.case_id
   WHERE c.primary_user_id = p_user_id
     AND cd.storage_path IS NOT NULL
     AND cd.storage_path <> '';

  DELETE FROM public.cases c WHERE c.primary_user_id = p_user_id;
  GET DIAGNOSTICS n_cases = ROW_COUNT;

  -- E-mails enviados: a linha fica para estatística, sem a pessoa.
  UPDATE public.email_send_log s
     SET recipient_email = v_placeholder,
         user_id = NULL,
         subject = NULL,
         body_html = NULL,
         error_message = NULL,
         variables_used = '{}'::jsonb
   WHERE s.user_id = p_user_id
      OR lower(btrim(s.recipient_email::text)) = ANY (v_emails);
  GET DIAGNOSTICS n_email_logs = ROW_COUNT;

  -- Pagamentos: guardados por obrigação legal (fiscal/contábil), sem o vínculo
  -- com a conta. O vínculo com o assessment cai pelo FK (SET NULL) abaixo.
  UPDATE public.payments SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS n_payments = ROW_COUNT;

  UPDATE public.payment_events SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS n_payment_events = ROW_COUNT;

  UPDATE public.checkout_claims SET user_id = NULL WHERE user_id = p_user_id;
  GET DIAGNOSTICS n_claims = ROW_COUNT;

  -- Conteúdo da conta.
  DELETE FROM public.messages m
   WHERE m.user_id = p_user_id OR m.assessment_id = ANY (v_assessment_ids);
  GET DIAGNOSTICS n_messages = ROW_COUNT;

  DELETE FROM public.user_documents d WHERE d.user_id = p_user_id;
  GET DIAGNOSTICS n_documents = ROW_COUNT;

  DELETE FROM public.assessments a WHERE a.id = ANY (v_assessment_ids);
  GET DIAGNOSTICS n_assessments = ROW_COUNT;

  DELETE FROM public.subscriptions s WHERE s.user_id = p_user_id;
  DELETE FROM public.user_roles ur WHERE ur.user_id = p_user_id;
  DELETE FROM public.profiles p WHERE p.id = p_user_id;
  GET DIAGNOSTICS n_profiles = ROW_COUNT;

  v_counts := jsonb_build_object(
    'assessments_deleted',      n_assessments,
    'messages_deleted',         n_messages,
    'documents_deleted',        n_documents,
    'cases_deleted',            n_cases,
    'profile_deleted',          n_profiles > 0,
    'leads_anonymized',         n_leads,
    'email_logs_anonymized',    n_email_logs,
    'audit_rows_pseudonymized', n_audit + n_activity,
    'payments_retained',        n_payments,
    'payment_events_retained',  n_payment_events,
    'checkout_claims_unlinked', n_claims
  );

  INSERT INTO public.account_deletion_log (source, counts) VALUES (p_source, v_counts);

  RETURN v_counts || jsonb_build_object('case_document_paths', to_jsonb(v_case_paths));
END;
$$;

COMMENT ON FUNCTION public.lgpd_erase_user(UUID, TEXT) IS
  'DI-083: apaga/anonimiza os dados da conta no banco (exceto auth.users, apagado pela Edge Function delete-account). Só service_role.';

REVOKE ALL ON FUNCTION public.lgpd_erase_user(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lgpd_erase_user(UUID, TEXT) TO service_role;

-- ─── 5. Retenção ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.lgpd_apply_retention(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- Prazos: espelhados na Política de Privacidade (seção "Por quanto tempo").
  c_anon_days           CONSTANT INT := 90;   -- diagnóstico sem conta (padrão de expires_at)
  c_waitlist_days       CONSTANT INT := 365;  -- lista de espera
  c_email_content_days  CONSTANT INT := 30;   -- corpo/variáveis dos e-mails
  c_email_address_days  CONSTANT INT := 90;   -- endereço do e-mail sem conta
  v_ids                 UUID[];
  n_assessments         INT := 0;
  n_results             INT := 0;
  n_leads               INT := 0;
  n_email_content       INT := 0;
  n_email_address       INT := 0;
BEGIN
  -- R1. Diagnósticos anônimos vencidos e ainda com dados pessoais.
  SELECT coalesce(array_agg(a.id), '{}'::UUID[])
    INTO v_ids
    FROM public.assessments a
   WHERE a.user_id IS NULL
     AND (
       a.full_name IS NOT NULL OR a.email IS NOT NULL OR a.phone IS NOT NULL
       OR a.ip_address IS NOT NULL OR a.user_agent IS NOT NULL OR a.session_id IS NOT NULL
       OR a.referrer IS NOT NULL OR a.first_page IS NOT NULL
     )
     AND CASE
       WHEN coalesce(a.answers ->> 'waitlist', '') = 'true'
         THEN coalesce(a.created_at, a.started_at, p_now) < p_now - make_interval(days => c_waitlist_days)
       ELSE coalesce(a.expires_at, a.created_at + make_interval(days => c_anon_days), p_now) < p_now
     END
     -- Pagamento sem conta (raro: o webhook liga o assessment à conta) fica
     -- para o suporte resolver.
     AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.assessment_id = a.id);

  IF cardinality(v_ids) > 0 THEN
    UPDATE public.assessments a
       SET full_name = NULL,
           email = NULL,
           phone = NULL,
           ip_address = NULL,
           user_agent = NULL,
           referrer = NULL,
           first_page = NULL,
           session_id = NULL,
           resume_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
           answers = coalesce(a.answers, '{}'::jsonb)
             - ARRAY['marketing_opt_in', 'email', 'name', 'nome', 'full_name', 'phone', 'telefone'],
           updated_at = p_now
     WHERE a.id = ANY (v_ids);
    GET DIAGNOSTICS n_assessments = ROW_COUNT;

    UPDATE public.assessment_results r
       SET ia_explanation_short = NULL,
           ia_explanation_full = NULL
     WHERE r.assessment_id = ANY (v_ids)
       AND (r.ia_explanation_short IS NOT NULL OR r.ia_explanation_full IS NOT NULL);
    GET DIAGNOSTICS n_results = ROW_COUNT;

    UPDATE public.crm_leads l
       SET full_name = 'Titular removido',
           email = NULL,
           phone = NULL,
           notes = NULL,
           lost_reason = NULL,
           next_followup_at = NULL,
           updated_at = p_now
     WHERE l.assessment_id = ANY (v_ids)
       AND (l.email IS NOT NULL OR l.phone IS NOT NULL OR l.full_name <> 'Titular removido');
    GET DIAGNOSTICS n_leads = ROW_COUNT;
  END IF;

  -- R2. Conteúdo dos e-mails (corpo com links de acesso, nome nas variáveis).
  UPDATE public.email_send_log s
     SET body_html = NULL,
         error_message = NULL,
         variables_used = private.lgpd_scrub_email_variables(s.variables_used)
   WHERE coalesce(s.sent_at, s.created_at) < p_now - make_interval(days => c_email_content_days)
     AND (
       s.body_html IS NOT NULL
       OR s.error_message IS NOT NULL
       OR coalesce(s.variables_used, '{}'::jsonb) <> private.lgpd_scrub_email_variables(s.variables_used)
     );
  GET DIAGNOSTICS n_email_content = ROW_COUNT;

  -- R3. Endereço dos e-mails de quem não tem conta.
  UPDATE public.email_send_log s
     SET recipient_email = 'apagado+' || replace(gen_random_uuid()::text, '-', '') || '@invalid',
         subject = NULL
   WHERE s.user_id IS NULL
     AND coalesce(s.sent_at, s.created_at) < p_now - make_interval(days => c_email_address_days)
     AND s.recipient_email NOT LIKE 'apagado+%@invalid';
  GET DIAGNOSTICS n_email_address = ROW_COUNT;

  RETURN jsonb_build_object(
    'ran_at',                     p_now,
    'assessments_anonymized',     n_assessments,
    'results_text_cleared',       n_results,
    'leads_anonymized',           n_leads,
    'email_content_minimized',    n_email_content,
    'email_addresses_anonymized', n_email_address
  );
END;
$$;

COMMENT ON FUNCTION private.lgpd_apply_retention(TIMESTAMPTZ) IS
  'DI-083: retenção diária (pg_cron lgpd-retention-daily). Anonimiza diagnósticos anônimos vencidos e minimiza email_send_log.';

REVOKE ALL ON FUNCTION private.lgpd_apply_retention(TIMESTAMPTZ) FROM PUBLIC;

-- ─── 6. Agendamento (pg_cron) ───────────────────────────────────────────────

DO $$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron indisponível (%): ative em Database → Extensions e rode de novo este bloco.', SQLERRM;
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname = 'lgpd-retention-daily';
    PERFORM cron.schedule('lgpd-retention-daily', '17 3 * * *', 'SELECT private.lgpd_apply_retention()');
  ELSE
    RAISE NOTICE 'pg_cron não está ativo: lgpd-retention-daily não foi agendado.';
  END IF;
END
$$;

-- =====================================================================
-- VERIFICAÇÃO (só leitura; rodar à parte depois de aplicar, no LOCAL antes)
-- =====================================================================
-- 1) Job agendado (esperado: 1 linha, '17 3 * * *'):
--    SELECT jobname, schedule, command, active FROM cron.job
--     WHERE jobname = 'lgpd-retention-daily';
--
-- 2) Prévia da retenção sem gravar nada:
--    BEGIN; SELECT private.lgpd_apply_retention(); ROLLBACK;
--
-- 3) Diagnósticos anônimos vencidos ainda com PII (esperado: 0 depois do job):
--    SELECT count(*) FROM public.assessments
--     WHERE user_id IS NULL AND expires_at < now()
--       AND coalesce(answers ->> 'waitlist', '') <> 'true'
--       AND (email IS NOT NULL OR full_name IS NOT NULL OR phone IS NOT NULL);
--
-- 4) Privilégios (esperado: f, f, t):
--    SELECT has_function_privilege('anon', 'public.lgpd_erase_user(uuid,text)', 'EXECUTE'),
--           has_function_privilege('authenticated', 'public.lgpd_erase_user(uuid,text)', 'EXECUTE'),
--           has_function_privilege('service_role', 'public.lgpd_erase_user(uuid,text)', 'EXECUTE');
--
-- 5) Append-only continua valendo fora da exclusão (esperado: ERRO
--    'audit_log is append-only', se houver alguma linha):
--    BEGIN; UPDATE public.audit_log SET action = action; ROLLBACK;
--
-- 6) Exclusões registradas (sem PII):
--    SELECT deleted_at, source, counts FROM public.account_deletion_log
--     ORDER BY deleted_at DESC LIMIT 20;
