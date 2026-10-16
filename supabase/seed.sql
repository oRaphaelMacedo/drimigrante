-- =====================================================================
-- supabase/seed.sql — dados de desenvolvimento LOCAL (DI-059)
--
-- Rodado automaticamente por `supabase start` (1ª vez) e `supabase db reset`
-- depois das migrations. NUNCA rode este arquivo num projeto hospedado
-- (produção ou staging): ele cria usuários com senha conhecida.
--
-- Usuários (domínio reservado .test, que não recebe e-mail real):
--   dev@drimigrante.test       cliente com o €30 ativo (30 dias) + 1 diagnóstico
--   cliente2@drimigrante.test  cliente sem pagamento (testes de isolamento/RLS)
--   admin@drimigrante.test     super_admin (área /admin)
-- Senha local de todos: a definida em v_password abaixo.
-- =====================================================================

DO $$
DECLARE
  v_password CONSTANT TEXT := 'dev-local-somente';
  v_hub      CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  v_dev      CONSTANT UUID := '11111111-1111-4111-8111-111111111111';
  v_cliente2 CONSTANT UUID := '22222222-2222-4222-8222-222222222222';
  v_admin    CONSTANT UUID := '33333333-3333-4333-8333-333333333333';
  v_user     RECORD;
BEGIN
  FOR v_user IN
    SELECT * FROM (VALUES
      (v_dev,      'dev@drimigrante.test',      'Dev Local'),
      (v_cliente2, 'cliente2@drimigrante.test', 'Cliente Dois'),
      (v_admin,    'admin@drimigrante.test',    'Admin Local')
    ) AS u(id, email, full_name)
  LOOP
    -- O trigger on_auth_user_created (handle_new_user) cria profile,
    -- user_roles (client) e subscriptions (free) no tenant hub.
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
      v_user.email, extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_user.full_name),
      now(), now(),
      '', '', '', ''
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    SELECT
      gen_random_uuid(), v_user.id::TEXT, v_user.id,
      jsonb_build_object('sub', v_user.id::TEXT, 'email', v_user.email, 'email_verified', TRUE),
      'email', now(), now(), now()
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities i
      WHERE i.user_id = v_user.id AND i.provider = 'email'
    );
  END LOOP;

  -- Admin do HUB.
  INSERT INTO public.user_roles (user_id, tenant_id, role)
  VALUES (v_admin, v_hub, 'super_admin')
  ON CONFLICT (user_id, tenant_id, role) DO NOTHING;

  -- dev@: acesso do €30 ativo por 30 dias (sem recorrência).
  UPDATE public.subscriptions
  SET tier                       = 'one_time',
      one_time_paid              = TRUE,
      one_time_paid_at           = now(),
      one_time_payment_amount    = 30.00,
      one_time_access_expires_at = now() + INTERVAL '30 days',
      recurring_active           = FALSE,
      has_dashboard_access       = TRUE,
      has_chat_access            = TRUE,
      has_full_analysis          = TRUE
  WHERE user_id = v_dev;

  -- dev@: um diagnóstico concluído e ligado à conta.
  INSERT INTO public.assessments (
    id, session_id, user_id, full_name, email, answers, status,
    questions_answered, total_questions, completion_percentage, completed_at
  ) VALUES (
    '44444444-4444-4444-8444-444444444444', 'seed-local-dev-0001', v_dev,
    'Dev Local', 'dev@drimigrante.test',
    '{"processo_tipo": "nacionalidade", "caso_tipo": "A", "a1_antepassado": "pai_mae"}'::jsonb,
    'completed', 3, 3, 100, now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.assessment_results (
    assessment_id, score_numeric, score_category, suggested_visa_types
  ) VALUES (
    '44444444-4444-4444-8444-444444444444', 85, 'alta', '[]'::jsonb
  )
  ON CONFLICT (assessment_id) DO NOTHING;
END $$;
