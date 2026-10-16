-- =====================================================================
-- 20261016000300_messages_server_only_insert.sql
-- DI-017: mensagens do chat só são gravadas pelo servidor (Edge Function
-- chat-completion com service role). O cliente continua LENDO as próprias
-- mensagens (policy "Users can read own messages"), mas perde o INSERT direto —
-- antes qualquer conta inseria mensagens com role 'system'/'assistant' e
-- contornava os limites de uso do chat.
--
-- ORDEM DE RELEASE (obrigatória):
--   1. deploy da nova chat-completion (insere via service role);
--   2. SÓ DEPOIS aplicar esta migration.
--   Aplicar antes quebraria o chat da versão antiga (ela insere com o JWT do usuário).
--
-- Idempotente: pode rodar mais de uma vez.
-- =====================================================================

DROP POLICY IF EXISTS "Users can insert own messages" ON public.messages;

-- Defesa em profundidade: sem policy de escrita o RLS já nega, e o REVOKE tira o
-- privilégio de tabela dos papéis do cliente. service_role não é afetado.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.messages FROM anon, authenticated;

-- Índice para os limites de uso (30/hora e 200/dia por usuário).
CREATE INDEX IF NOT EXISTS idx_messages_user_role_created
  ON public.messages (user_id, created_at DESC)
  WHERE role = 'user';

-- ─── Verificação (rodar manualmente, só leitura) ─────────────────────────────
-- 1) Não deve existir policy de INSERT em messages:
--    SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname = 'public' AND tablename = 'messages';
--    → apenas "Users can read own messages" (SELECT).
-- 2) Privilégios do cliente:
--    SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND table_name = 'messages'
--       AND grantee IN ('anon', 'authenticated');
--    → sem INSERT, UPDATE, DELETE nem TRUNCATE (SELECT continua).
-- 3) Em Supabase local/staging, com o JWT de um cliente:
--    POST /rest/v1/messages {"assessment_id": "...", "user_id": "<o próprio id>", "role": "user", "content": "x"}
--    → 401/403 (permission denied / violates row-level security).
