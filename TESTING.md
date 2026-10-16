# Doutor Imigrante — Testes

O guia completo está em [`docs/testes.md`](docs/testes.md): Supabase local,
usuários de desenvolvimento do seed, Edge Functions locais e testes E2E.

Regras que valem sempre:

- Nenhum teste automatizado roda contra o Supabase de produção
  (`krjirhlmdnxqqrpzmowz`). Os testes E2E autenticados só rodam contra
  Supabase local ou de staging.
- A Edge Function `e2e-login` nunca entra em deploy de produção.
- Credenciais não ficam neste repositório. Os usuários de desenvolvimento
  existem só no banco local, criados por `supabase/seed.sql`.
