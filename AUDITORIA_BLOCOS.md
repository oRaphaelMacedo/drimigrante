# Auditoria por Blocos — Doutor Imigrante

> Plano arquitetural para revisão sistemática do código em busca de erros e melhorias.
>
> **Versão:** 1.8
> **Iniciado:** 2026-05-08
> **Última atualização:** 2026-05-11
> **Status global:** 4/12 blocos revisados · 0/12 refatorados · 27 achados fechados · 0 críticos abertos no que foi revisado · 1 blocker externo (Stripe key inválida)

## 🔍 Verificação em runtime (2026-05-11)

| Item | Estado | Notas |
|---|---|---|
| Migration `security_hardening.sql` aplicada ao remoto | ✅ | Drift detectado e corrigido — `payments` table foi recriada via `migration repair` |
| Migration `day3_payments_and_indexes.sql` aplicada ao remoto | ✅ | Estava marcada como aplicada mas a tabela não existia — repair + re-apply |
| `database.types.ts` regenerado | ✅ | B02-A02 resolvido — `Payment`, `PaymentStatus`, `PaymentProduct` agora vêm do schema gerado |
| Edge Functions deployed | ✅ | 5 das 6 nunca tinham sido deployed antes — só `chat-completion` estava em produção |
| `stripe-webhook` com `--no-verify-jwt` | ✅ | Necessário porque o gateway Supabase exige Authorization header por default |
| Secrets configurados no Supabase | ✅ | `INTERNAL_SECRET`, `APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_*`, `RESEND_API_KEY` |
| `STRIPE_WEBHOOK_SECRET` configurado | 🚫 | **Blocker:** Stripe key em MEMORY.md foi revogada/rotacionada — `invalid_request_error - Invalid API Key`. Sem key válida não é possível criar webhook endpoint nem obter o signing secret. |
| Smoke test: `send-email` requer `x-internal-secret` (B03-A05) | ✅ | Retorna 403 sem header e com header errado |
| Smoke test: `compute-eligibility` end-to-end | ✅ | Score calculado correctamente |
| Smoke test: `B02-A03` — anon não forja `user_id` | ✅ | INSERT bloqueado com 401 (era 200 antes) |
| RLS activo em `payment_events`, `tenants`, `audit_log` | ✅ | Anon recebe `[]` em vez de listar tudo (era um SELECT sem filtro antes) |
| **Achados descobertos durante verificação** | ⚠️ | **2 novos críticos** — ver B02-A21 e B02-A22 abaixo |

### Próximos passos requeridos (acção do utilizador)

1. **🚨 Stripe key inválida** — gerar nova chave em https://dashboard.stripe.com/test/apikeys → actualizar via `npx supabase secrets set STRIPE_SECRET_KEY=... --project-ref krjirhlmdnxqqrpzmowz`
2. **Criar webhook endpoint** apontando para `https://krjirhlmdnxqqrpzmowz.supabase.co/functions/v1/stripe-webhook`, copiar o signing secret → `npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
3. **Decidir abordagem para B02-A21/A22** — arquitectura do acesso anon a assessments antes de aceitar tráfego real

---

---

## 1. Método

A base de código é fatiada em **12 blocos lógicos**. Cada bloco é independente o suficiente para ser revisado isoladamente, e a ordem proposta respeita dependências (infra → dados → backend → auth → features).

Para cada bloco aplicamos sempre o mesmo ciclo:

1. **Inventário** — confirmar a lista de ficheiros que compõem o bloco
2. **Checklist** — passar pelos critérios específicos (segurança, performance, types, error handling, a11y, etc.)
3. **Achados** — registar bugs, code smells, dívidas técnicas com severidade (🔴 crítico · 🟡 alto · 🟢 baixo)
4. **Ações** — propor refactor com estimativa, ligar à PR/commit quando feito
5. **Verificação** — `npm run build` + smoke test + (quando aplicável) checagem de RLS no Supabase

### Legenda de status do bloco

| Símbolo | Significado |
|---|---|
| ⬜ | Não iniciado |
| 🟡 | Em revisão (checklist a correr) |
| 🔴 | Achados pendentes (revisado, mas com itens por resolver) |
| 🟢 | Revisado (todos os critérios verdes, sem achados) |
| ✅ | Refatorado (achados resolvidos, build verde, merged) |

### Legenda de prioridade

| Símbolo | Significado |
|---|---|
| 🔴 | Crítica — bloqueia produção / risco de segurança ou financeiro |
| 🟡 | Alta — afecta UX/perf/manutenibilidade do core |
| 🟢 | Média/baixa — polimento, tech debt não bloqueante |

---

## 2. Tabela Mestre

| # | Bloco | Prioridade | Status | Achados abertos | Última revisão |
|---|---|---|---|---|---|
| 01 | Infraestrutura & Configuração | 🟡 | ⬜ | 2 (herdados do 02) | — |
| 02 | Database & Schema | 🔴 | 🔴 | **9** (0 críticos · 4 altos · 5 médios) · 9 fixed + verified | 2026-05-11 |
| 03 | Edge Functions (Backend) | 🔴 | 🔴 | **15** (4 críticos · 6 altos · 5 médios) · 6 fixed | 2026-05-11 |
| 04 | Auth & Multi-tenancy | 🔴 | 🔴 | **13** (3 críticos · 6 altos · 4 médios) | 2026-05-11 |
| 05 | Quiz Engine | 🟡 | ⬜ | — | — |
| 06 | Checkout & Payments | 🔴 | 🔴 | **7** (1 crítico · 3 altos · 3 médios) · 1 fixed | 2026-05-11 |
| 07 | Dashboard (User) | 🟡 | ⬜ | — | — |
| 08 | Admin Panel | 🟡 | ⬜ | — | — |
| 09 | Marketing & Landing | 🟢 | ⬜ | — | — |
| 10 | Routing & Code-Splitting | 🟢 | ⬜ | — | — |
| 11 | Observabilidade | 🟡 | ⬜ | — | — |
| 12 | UI Kit / Design System | 🟢 | ⬜ | — | — |

### Ordem de revisão recomendada

`02 → 04 → 03 → 06 → 05 → 08 → 07 → 11 → 01 → 10 → 09 → 12`

> Começar pelos críticos (DB, Auth, Backend, Pagamentos) porque tudo o resto depende deles. Polimento (Landing, UI Kit) fica para o fim.

---

## 3. Detalhe dos Blocos

### Bloco 01 — Infraestrutura & Configuração
**Prioridade:** 🟡 Alta · **Status:** ⬜ Não iniciado

#### Escopo
Build, bundle, deploy, ambiente, bootstrap da aplicação. É a fundação sobre a qual todo o resto corre.

#### Ficheiros (12)
- `vite.config.ts`
- `tsconfig.json`, `tsconfig.node.json`
- `tailwind.config.ts`, `postcss.config.js`
- `vercel.json`
- `package.json`, `package-lock.json`
- `.env.example`, `.env.local`, `.gitignore`
- `index.html`
- `src/main.tsx`, `src/App.tsx`, `src/index.css`
- `components.json`

#### Checklist
- [ ] tsconfig com `strict: true` e flags úteis (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [ ] Vite: code-splitting por rota, alias `@/`, PWA configurado correctamente
- [ ] Build sem warnings, tamanho de bundle inspecionado (`vite build --mode production`)
- [ ] `.env.example` sincronizado com `.env.local` (mesmas chaves, sem valores)
- [ ] `.gitignore` cobre `dist/`, `.env*`, `.vercel/`, `node_modules/`, `supabase/.temp/`
- [ ] `vercel.json` com headers de segurança (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- [ ] Separação clara entre vars `VITE_*` (públicas, vão para o bundle) e secrets server-only
- [ ] `package.json`: scripts coerentes, sem deps desnecessárias, lockfile commitado
- [ ] PWA manifest válido (ícones, theme color, start_url)
- [ ] `index.html` com meta tags de SEO/social, idioma `pt-BR`/`pt-PT` correcto

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 02 — Database & Schema
**Prioridade:** 🔴 Crítica · **Status:** 🔴 Achados pendentes · **Revisado em:** 2026-05-10

#### Escopo
Schema PostgreSQL, RLS, triggers, índices, tipos TypeScript gerados. Toda a integridade dos dados parte daqui.

#### Ficheiros (7)
- `supabase/migrations/20260108000000_initial_schema.sql` (1167 linhas, 27 tabelas)
- `supabase/migrations/20260509000000_day3_payments_and_indexes.sql` (Day 3 — `payments`)
- `supabase/migrations/20260509000001_security_rls_phase3.sql` (Fase 3 — RLS reforçado)
- `src/lib/database.types.ts` (1887 linhas, gerado via Supabase CLI)
- `src/lib/supabase.ts` (20 linhas, client público anon)
- `src/lib/query-client.ts` (16 linhas, TanStack Query config)
- `supabase/.temp/` (gitignored)

#### Checklist
- [x] **Build TypeScript** — ❌ FALHA com 19+ erros (ver B02-A01)
- [x] **RLS em tabelas com PII** — ❌ Faltam: `payment_events`, `email_send_log`, `audit_log`, `email_templates`, `tenants` (ver B02-A06)
- [x] **`assessments`: anon só INSERT/UPDATE quando `user_id IS NULL`** — ❌ Policies antigas (`assessments_anon_insert WITH CHECK (TRUE)`) não foram dropped pela Phase 3 (ver B02-A03)
- [x] **`ai_configurations`: só `is_hub_user()` lê/escreve** — ✅ Fase 3 OK
- [x] **`payments`, `subscriptions`: utilizador só vê os próprios** — ✅ SELECT OK; ⚠️ INSERT/UPDATE em `payments` requer documentação explícita (ver B02-A05)
- [x] **Audit log triggera em mudanças de `system_prompt`/`model`** — ✅ Fase 3 OK, mas função sem `SET search_path` (ver B02-A11)
- [x] **Índices em FKs e filtros** — ✅ Generosamente indexado
- [x] **Migrations idempotentes** — ⚠️ Initial sem `IF NOT EXISTS` (ver B02-A15)
- [x] **PII sem encriptação** — ⚠️ `assessments.ip_address` e passport_number em `case_applicants` em texto plano (ver B02-A13)
- [x] **Tipos `database.types.ts` sincronizados** — ❌ Faltam `payments`, `payment_status`, `payment_product` (ver B02-A02)
- [x] **Helper types (`Assessment`, `Lead`)** — ⚠️ Cobertura mínima (4 helpers para 28 tabelas)
- [x] **`is_hub_user()` SECURITY DEFINER correcto** — ✅ OK no initial
- [x] **Storage buckets com policies adequadas** — ✅ Path `{tenant_id}/...` enforced; falta confirmar uso real (ver B02-A17)
- [x] **WITH CHECK em policies FOR ALL** — ❌ `crm_leads_tenant_write`, `cases_write` sem WITH CHECK (ver B02-A08, A09)
- [x] **INSERT/UPDATE/DELETE policies em case_*** — ❌ Apenas SELECT definido (ver B02-A10)

#### Achados

##### 🔴 Críticos

**B02-A01 🔴 Build TypeScript está quebrado (19+ erros)**
- Onde: `npm run build` falha em `tsc`
- Detalhes: PROGRESSO.md (Day 7/8) afirma "build sem erros" mas comando confirma falha em:
  - `src/components/quiz/QuizQuestionEditor.tsx` (não estava no inventário inicial)
  - `src/hooks/useQuizAdmin.ts` (não estava no inventário)
  - `src/pages/admin/AdminQuizPage.tsx` (não estava no inventário)
  - `src/components/quiz/QuizProgress.tsx`, `QuizQuestion.tsx`
- Raiz: tipos locais `FieldType` no código contêm `"multiselect"` que não existe no enum `field_type` do schema; properties `themeIcon`, `textEn`, `labelEn`, `questionKey` referenciadas mas não declaradas
- Risco: Deploy quebrado, CI/CD bloqueado, drift entre código e schema
- Acção: 
  1. Decidir: estender o enum `field_type` para incluir `multiselect` (migration) OU remover `multiselect` do TS local
  2. Reconciliar propriedades faltantes (renomear `textEn`→`text_en`, etc.)
  3. Atualizar inventário do Bloco 05 para incluir os 3 ficheiros admin de quiz
- Estado: `open`

**B02-A02 🔴 Tipos `database.types.ts` desatualizados — falta `payments`**
- Onde: `src/lib/database.types.ts` vs migration Day 3
- Detalhes: 
  - `AdminDashboardPage.tsx:177` usa `supabase.from('payments')` → retorna `any`
  - `supabase/functions/stripe-webhook/index.ts:70,112` faz upsert/insert em `payments`
  - Enums `payment_status`, `payment_product` também ausentes
- Risco: Type safety perdida no fluxo crítico de pagamentos; possível drift se migration não foi aplicada remotamente
- Acção:
  1. Confirmar aplicação remota: `npx supabase db push --linked` ou via dashboard
  2. Regenerar: `npx supabase gen types typescript --project-id krjirhlmdnxqqrpzmowz > src/lib/database.types.ts`
  3. Validar build após
- Estado: `open`

**B02-A03 🔴 Policies de `assessments` da Fase 3 NÃO substituem as antigas (acumulam-se)**
- Onde: 
  - Initial migration linhas 1073–1080 cria policies `assessments_anon_insert`, `assessments_read`, `assessments_update`
  - Phase 3 migration linhas 68, 79, 90, 101 só faz `DROP POLICY IF EXISTS "Users can insert..."` com nomes **diferentes** dos antigos
- Detalhes: PostgreSQL aplica OR entre policies do mesmo comando. As antigas continuam ativas. A pior delas:
  - `assessments_anon_insert WITH CHECK (TRUE)` — qualquer pessoa pode inserir um assessment **com `user_id` de outro utilizador**
  - `assessments_update USING (user_id = auth.uid() OR session_id IS NOT NULL)` — anon pode atualizar qualquer assessment cujo session_id seja conhecido
- Risco: Bypass total da política de Fase 3. Lead poisoning, falsificação de respostas, manipulação de score.
- Acção: Adicionar à Phase 3 (ou nova migration):
  ```sql
  DROP POLICY IF EXISTS assessments_anon_insert ON public.assessments;
  DROP POLICY IF EXISTS assessments_read       ON public.assessments;
  DROP POLICY IF EXISTS assessments_update     ON public.assessments;
  ```
  Depois validar: `SELECT polname FROM pg_policy WHERE polrelid='public.assessments'::regclass;`
- Estado: `open`

**B02-A06 🔴 Tabelas com PII / financeiro sem RLS habilitado**
- Onde: Initial migration linhas 1017–1032 — `ENABLE ROW LEVEL SECURITY` não cobre:
  - `payment_events` (financeiro + payload completo da Stripe)
  - `email_send_log` (emails, conteúdo enviado, message IDs)
  - `audit_log` (toda a actividade sensível)
  - `email_templates` (talvez OK, mas confirmar)
  - `tenants` (billing_info JSONB, stripe_customer_id)
  - `countries`, `visa_categories`, `visa_types`, `form_versions`, `form_themes`, `rule_versions` (dados de referência — provavelmente OK serem públicos, mas SELECT-only)
- Risco: Qualquer cliente com `anon_key` pode `SELECT *` destas tabelas. PII de utilizadores e webhooks expostos.
- Acção:
  ```sql
  ALTER TABLE payment_events    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE email_send_log    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
  ALTER TABLE email_templates   ENABLE ROW LEVEL SECURITY;
  ALTER TABLE tenants           ENABLE ROW LEVEL SECURITY;
  -- Policies: apenas is_hub_user pode SELECT
  CREATE POLICY hub_only_read ON payment_events FOR SELECT USING (public.is_hub_user(auth.uid()));
  -- repetir para as outras
  ```
- Estado: `open`

##### 🟡 Altos

**B02-A04 🟡 `subscriptions_self_update` — utilizador comum NÃO pode atualizar a própria subscription**
- Onde: linha 1133–1134 — `USING (public.is_hub_user(auth.uid()))`
- Detalhes: Webhook usa `service_role` (bypassa RLS) → OK. Mas confirmar que `SettingsPage` ou outros componentes não tentam UPDATE direto. Se sim, falha silenciosa.
- Acção: Auditar todos os `from('subscriptions').update(...)` no client.
- Estado: `open`

**B02-A05 🟡 `payments` sem policies INSERT/UPDATE explícitas**
- Onde: Day 3 migration linha 64–72 (apenas SELECT policy)
- Detalhes: Por default sem policy = sem acesso. Logo, anon/authenticated não podem escrever (correto). Mas falta clareza no código.
- Acção: Adicionar policy defensiva explícita:
  ```sql
  CREATE POLICY payments_no_client_write ON public.payments
    FOR ALL TO authenticated, anon
    USING (false) WITH CHECK (false);
  ```
  E confirmar que `stripe-webhook` usa `SUPABASE_SERVICE_ROLE_KEY`.
- Estado: `open`

**B02-A08 🟡 `crm_leads_tenant_write` sem `WITH CHECK` (cross-tenant escalation)**
- Onde: linha 1093–1094
- Detalhes: `FOR ALL USING (...)` sem `WITH CHECK` permite UPDATE alterar `assigned_tenant_id` para outro tenant (USING valida o estado OLD, não o NEW)
- Risco: Office X pode mover lead para Office Y. Para HUB user pode até "doar" leads.
- Acção:
  ```sql
  DROP POLICY crm_leads_tenant_write ON public.crm_leads;
  CREATE POLICY crm_leads_tenant_write ON public.crm_leads FOR ALL
    USING       (assigned_tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()))
    WITH CHECK  (assigned_tenant_id = public.get_user_tenant_id(auth.uid()) OR public.is_hub_user(auth.uid()));
  ```
- Estado: `open`

**B02-A09 🟡 `cases_write` sem `WITH CHECK` (mesma classe de bug que A08)**
- Onde: linha 1109–1110
- Risco: Tenant pode reassignar `tenant_id`/`primary_user_id` num UPDATE
- Acção: Adicionar `WITH CHECK` análogo a A08
- Estado: `open`

**B02-A10 🟡 `case_*` (applicants, documents, tasks, messages) só têm SELECT**
- Onde: linhas 1112–1127
- Detalhes: Sem policy de INSERT/UPDATE/DELETE — operações cliente vão falhar quando passarmos do mock de DocumentsPage para uploads reais.
- Acção: Decidir abordagem antes de levar `DocumentsPage` para produção:
  - (a) policies `FOR ALL` com mesmo padrão tenant/case ownership
  - (b) operações de escrita apenas via Edge Functions com service_role
- Estado: `open`

**B02-A11 🟡 `log_ai_config_changes` (SECURITY DEFINER) sem `SET search_path`**
- Onde: Phase 3 migration linhas 23–54
- Risco: Search path hijack — atacante com privilege para criar schema pode redirecionar resolução de `audit_log`
- Acção:
  ```sql
  CREATE OR REPLACE FUNCTION public.log_ai_config_changes()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_catalog
  AS $$ ... $$;
  ```
- Estado: `open`

**B02-A12 🟡 `crm_activity_insert WITH CHECK (TRUE)` — anon pode poluir activity log**
- Onde: linha 1102–1103
- Risco: Spam de eventos em qualquer lead. Activity log é append-only (triggers OK) mas o INSERT está aberto.
- Acção:
  ```sql
  DROP POLICY crm_activity_insert ON public.crm_activity_log;
  CREATE POLICY crm_activity_insert ON public.crm_activity_log FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM crm_leads l WHERE l.id = lead_id
              AND (l.assigned_tenant_id = public.get_user_tenant_id(auth.uid())
                   OR public.is_hub_user(auth.uid())))
    );
  ```
- Estado: `open`

##### 🔴 Críticos (descobertos em verificação — ✅ fixed)

**B02-A21 🔴 Anon enumera todos os assessments anónimos (PII leak)** — ✅ **fixed**
- Onde: `supabase/migrations/20260509000001_security_rls_phase3.sql` — policy `Users can view their own assessments`:
  ```sql
  USING (
    (auth.role() = 'authenticated' AND (user_id = auth.uid() OR public.is_hub_user(auth.uid()))) OR
    (auth.role() = 'anon' AND user_id IS NULL)
  )
  ```
- Detalhes: A intenção era "anon pode ver o seu próprio assessment via session_id", mas a condição `auth.role() = 'anon' AND user_id IS NULL` permite que **qualquer** anon (com a `anon_key` pública embebida no frontend) leia **todos** os assessments anónimos. Em produção, isto expõe: `full_name`, `email`, `phone`, `answers` (rendimento, nacionalidade, objectivo), `ip_address`, e dados UTM de todas as submissões anónimas.
- Verificado: `curl /rest/v1/assessments?user_id=is.null&select=...` com a anon key devolve todos os registos.
- Mesma classe de bug em policy `Users can update their own assessments` (DELETE permite apenas hub).
- Risco: 🔴 RGPD violation. Lead poisoning (anon pode reescrever as respostas de outro anon assessment).
- Solução implementada: **Opção C (RPC com `SECURITY DEFINER`)** — ver migration `20260512000002_anon_assessment_rpc.sql`. Anon perdeu acesso REST directo a `assessments`; todas as operações passam por:
  - `upsert_anon_assessment(p_session_id, p_answers, ...)` — anon escreve, idempotente por `session_id`, com guard `WHERE user_id IS NULL` para impedir hijacking de rows linkadas
  - `get_anon_assessment(p_id, p_session_id)` — anon lê SÓ se conhecer o `session_id` da row
  - `link_anon_assessment_to_user(p_id, p_session_id)` — chamado pelo `AuthContext` no evento SIGNED_IN para associar a row ao utilizador
- Verificado em runtime (todos passaram):
  - ✅ Anon REST SELECT em `assessments` retorna 0 rows
  - ✅ Anon REST UPDATE não altera dados (RLS silently filtered)
  - ✅ Anon RPC `get_anon_assessment` com `session_id` errado retorna 0 rows
  - ✅ Anon RPC `get_anon_assessment` com `session_id` correcto retorna 1 row
  - ✅ Anon RPC `upsert_anon_assessment` cria/actualiza row
- Refactor frontend: `useAssessment.ts` usa `supabase.rpc()`; `useChatData.ts` usa RPC como fallback se a row ainda não foi linkada; `AuthContext` chama `link_anon_assessment_to_user` no SIGNED_IN
- Adicionado constraint `UNIQUE (session_id)` em `assessments` (estava implícito no código mas faltava em schema)
- Estado: ✅ `fixed` — migration aplicada ao remoto, build clean, smoke tests OK

**B02-A22 🔴 Anon pode actualizar qualquer assessment anónimo** — ✅ **fixed**
- Onde: mesma migration, policy "Users can update their own assessments" — `USING ((auth.role() = 'anon' AND user_id IS NULL) OR ...)` sem proof de session_id ownership.
- Risco: Mesma classe que A21 — qualquer anon podia reescrever as respostas de qualquer assessment anónimo (manipulação de score, lead poisoning).
- Solução: mesma migration que A21 — anon perdeu REST UPDATE; só pode escrever via `upsert_anon_assessment` que valida `session_id`.
- Estado: ✅ `fixed`

##### 🟢 Médios / Baixos

**B02-A13 🟢 PII em texto plano (RGPD)**
- Onde: `assessments.ip_address`, `case_applicants.passport_number`, `case_applicants.date_of_birth`
- Detalhes: IPs e nº de passaporte são dados pessoais sensíveis (Art.º 9.º RGPD para alguns). Sem política de retenção.
- Acção: 
  - Documentar política de retenção (sugestão: 90 dias para IP, indefinido para passaporte mas com expurgo após fecho do caso + N anos)
  - Considerar coluna encriptada (pgsodium ou app-level)
  - Cron job para `expires_at` dos assessments
- Estado: `open`

**B02-A14 🟢 `assessments.expires_at` (90 dias) sem cron de limpeza**
- Onde: linha 506
- Acção: criar `pg_cron` job diário para `UPDATE assessments SET status='expired' WHERE expires_at < NOW()` + purge após X dias
- Estado: `open`

**B02-A15 🟢 Migrations sem guards de re-execução**
- Onde: Initial migration — `CREATE TYPE` sem proteção
- Detalhes: Pouco crítico — Supabase migrations são versionadas; só problemático se alguém re-rodar localmente
- Acção: Wrap em `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
- Estado: `open`

**B02-A16 🟢 `email_templates` body_html_pt sem escape de `{{var}}`**
- Onde: linhas 806–841 (templates) + `send-email` Edge Function
- Detalhes: Se a Edge Function fizer simples `replace('{{name}}', name)` sem HTML escape, e `name` vier do utilizador, é XSS no email (Outlook executa um subset de HTML)
- Acção: Auditar `send-email/index.ts` no Bloco 03 — confirmar uso de template engine seguro (Handlebars com escape, ou DOMPurify pre-send)
- Estado: `open`

**B02-A17 🟢 Storage `case_documents_read` — confirmar path de upload**
- Onde: linha 1160–1167 — política espera `{tenant_id}/...` no path
- Acção: Quando `DocumentsPage` for tornado real (Phase 2), garantir `upload(\`\${tenant_id}/\${case_id}/\${filename}\`)`. Anotar no Bloco 07.
- Estado: `deferred-phase2`

**B02-A20 🟢 `query-client.ts` sem onError global**
- Onde: `src/lib/query-client.ts`
- Detalhes: Erros silenciados se componente não tratar. Sentry não captura.
- Acção:
  ```ts
  import { QueryCache, MutationCache } from '@tanstack/react-query'
  import * as Sentry from '@sentry/react'
  import { toast } from 'sonner'

  export const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        Sentry.captureException(err, { tags: { queryKey: JSON.stringify(query.queryKey) } })
        if (query.state.data === undefined) toast.error('Erro ao carregar dados')
      },
    }),
    mutationCache: new MutationCache({
      onError: (err) => { Sentry.captureException(err); toast.error('Erro ao guardar alterações') },
    }),
    defaultOptions: { /* ... */ },
  })
  ```
- Estado: `open`

#### Ações — Prioridade de Execução

| # | Achado | Tipo | Effort | PR sugerida |
|---|---|---|---|---|
| 1 | B02-A03 | Migration SQL | 15min | `fix/rls-assessments-cleanup` |
| 2 | B02-A06 | Migration SQL | 30min | `fix/rls-enable-on-pii-tables` |
| 3 | B02-A08 + A09 + A12 | Migration SQL | 20min | `fix/rls-with-check-clauses` |
| 4 | B02-A11 | Migration SQL | 5min | (incluir no PR de A03) |
| 5 | B02-A02 | Regenerar types + push | 10min | `chore/regen-db-types` |
| 6 | B02-A01 | TS fixes em 5+ ficheiros | 1–2h | `fix/quiz-admin-type-mismatches` (interage com Bloco 05) |
| 7 | B02-A05 | Migration SQL | 5min | (incluir no PR de A06) |
| 8 | B02-A20 | TS lib | 15min | `chore/query-client-error-handler` |
| 9 | B02-A10 | Decisão arquitetural + migration | 1h | discutir antes |
| 10 | B02-A04 | Auditoria de uso | 20min | apenas verificação |
| 11 | B02-A13/A14/A15/A16/A17 | Vários | depende | post-MVP / Phase 2 |

> **Recomendação:** abrir UMA migration consolidada `20260510000000_security_hardening.sql` cobrindo A03+A05+A06+A08+A09+A11+A12, e UMA PR separada para A01+A02 (types + quiz admin). As outras ficam no backlog Phase 2.

---

### Bloco 03 — Edge Functions (Backend)
**Prioridade:** 🔴 Crítica · **Status:** 🔴 Achados pendentes · **Revisado em:** 2026-05-11

#### Escopo
Funções Deno hospedadas no Supabase. Todo o trabalho server-side: scoring, IA, pagamentos, emails.

#### Ficheiros (6)
- `supabase/functions/compute-eligibility/index.ts` — scoring do quiz
- `supabase/functions/generate-explanation/index.ts` — análise narrativa GPT (2 chamadas IA)
- `supabase/functions/chat-completion/index.ts` — chat IA com histórico (tabela `messages`)
- `supabase/functions/create-checkout-session/index.ts` — Stripe Checkout
- `supabase/functions/stripe-webhook/index.ts` — webhook de eventos Stripe
- `supabase/functions/send-email/index.ts` — Resend wrapper com templates DB

#### Checklist
- [x] **JWT em funções cliente** — ❌ `compute-eligibility` e `generate-explanation` sem auth (ver B03-A02)
- [x] **JWT em `chat-completion`** — ✅ verifica JWT + ownership do assessment
- [x] **JWT em `create-checkout-session`** — ✅ duplo check (anon + service role)
- [x] **CORS restritivo** — ❌ `'*'` em todas as 6 funções (ver B03-A01)
- [x] **Assinatura Stripe** — ✅ `stripe.webhooks.constructEvent()` com `STRIPE_WEBHOOK_SECRET`
- [x] **Idempotência webhook** — ⚠️ one_time OK (`onConflict`); subscription usa `insert` sem guard (ver B03-A08)
- [x] **Erros sanitizados** — ❌ `String(err)` exposto em todos os responses (ver B03-A07)
- [x] **service-role key no cliente** — ✅ não vazada (apenas usada server-side)
- [x] **Payload validation** — ⚠️ mínima: presence check mas sem validação de tipo/formato
- [x] **Eventos Stripe cobertos** — ⚠️ `invoice.payment_failed` sem acção; `invoice.payment_succeeded` não processado (ver B03-A12, A13)
- [x] **Custos IA controlados** — ⚠️ `chat-completion` ignora `ai_configurations` (hardcoded) (ver B03-A09)
- [x] **`send-email` autenticada** — ❌ sem auth — qualquer pessoa pode enviar email pelo domínio (ver B03-A05)
- [x] **HTML escape em emails** — ❌ variables injectadas raw no HTML — XSS em email (ver B03-A06)
- [x] **Payment gate em funções pagas** — ❌ `generate-explanation` gera texto completo (€30) sem verificar pagamento (ver B03-A04)

#### Achados

##### 🔴 Críticos (8)

**B03-A01 🔴 CORS `Access-Control-Allow-Origin: '*'` em todas as funções**
- Onde: linha 5-7 de cada função
- Detalhes: Permite requests de qualquer origem. Funções com auth dependem do JWT — CORS não é o único gate, mas é defence-in-depth. Webhook da Stripe não precisa de CORS (server-to-server).
- Acção: Usar `APP_URL` env var: `origin === Deno.env.get('APP_URL') ? origin : 'null'`. Webhook: remover CORS headers.
- Estado: `open`

**B03-A02 🔴 `compute-eligibility` e `generate-explanation` sem autenticação**
- Onde: ambas usam `service_role` directamente sem verificar quem chama
- Detalhes: Qualquer pessoa com um `assessment_id` válido (UUID adivinhável ou obtido de outra forma) pode: (a) recalcular score de outro utilizador; (b) gerar análise IA a custo da plataforma.
- Acção: Adicionar JWT check + verificação de ownership: `assessment.user_id === auth.uid() OR assessment.user_id IS NULL` (para casos anónimos).
- Estado: `open`

**B03-A03 🔴 `generate-explanation` faz 2 chamadas IA síncronas sem verificar respostas**
- Onde: `generate-explanation/index.ts:85,107`
- Detalhes: `shortRes.json()` e `fullRes.json()` são chamados sem verificar `shortRes.ok`. Se OpenAI retornar 429 (rate limit) ou 500, o texto fica vazio e é gravado como `''` em `assessment_results`.
- Acção: `if (!shortRes.ok) throw new Error(\`OpenAI short error: \${shortRes.status}\`)`
- Estado: `open`

**B03-A04 🔴 `generate-explanation` gera análise completa (paga) sem verificar subscription**
- Onde: `generate-explanation/index.ts` — sem qualquer check de `has_full_analysis`
- Detalhes: A análise completa (`ia_explanation_full`) é gerada e gravada em `assessment_results` independentemente de pagamento. Qualquer pessoa (autenticada ou não após A02 fix) obtém gratuitamente o conteúdo pago via chamada directa.
- Acção: Após fix A02 (JWT), adicionar verificação: `supabase.from('subscriptions').select('has_full_analysis').eq('user_id', user.id)`. Se `false`, gerar apenas `ia_explanation_short`.
- Estado: `open`

**B03-A05 🔴 `send-email` sem autenticação — aberta a spam**
- Onde: `send-email/index.ts` — sem qualquer header de auth
- Detalhes: A função é exposta publicamente. Qualquer pessoa pode enviar emails com o nome `Doutor Imigrante <noreply@mail.drimigrante.com>` para qualquer destinatário usando templates existentes (incluindo "payment_confirmed"). Risco de phishing e abuse do Resend.
- Acção: Verificar `x-internal-secret` header contra env var `INTERNAL_SECRET`. O `stripe-webhook` passa o header quando invoca `send-email`.
- Estado: ✅ `fixed` — ver correção abaixo

**B03-A06 🔴 XSS em emails — variables injectadas sem escape HTML**
- Onde: `send-email/index.ts:16-18` — função `interpolate` faz replace raw
- Detalhes: Se `full_name` de um utilizador contiver `<script>` ou `<img src=x onerror=...>`, é injectado directamente no HTML do email. Clientes de email como Outlook, Apple Mail e Gmail web renderizam um subset de HTML/CSS.
- Acção: Escaper todos os valores de `variables` com `escapeHtml()` antes de interpolar.
- Estado: ✅ `fixed` — ver correção abaixo

**B03-A07 🔴 Stack traces e erros internos expostos em todos os responses**
- Onde: `catch (err) { return new Response(JSON.stringify({ error: String(err) })) }` em todas as funções
- Detalhes: `String(err)` inclui mensagens de erro do Postgres, Stripe, Deno e OpenAI que podem conter: nomes de tabelas, query details, chaves API parciais, configuração interna.
- Acção: Substituir por `{ error: 'Internal server error' }`. Logar o erro internamente com `console.error`.
- Estado: ✅ `fixed` — ver correção abaixo

**B03-A08 🔴 Webhook: `payments.insert` para subscription sem idempotência**
- Onde: `stripe-webhook/index.ts:112` — `insert` sem `onConflict`
- Detalhes: Stripe re-entrega webhooks em caso de timeout ou erro 5xx. Um segundo `checkout.session.completed` para uma subscription cria um registo duplicado em `payments`. O `payment_events` tem `stripe_event_id UNIQUE` mas o insert ocorre ANTES do processamento — não serve de guard.
- Acção: Verificar `payment_events` antes de processar; ou usar `stripe_event_id` como flag de idempotência.
- Estado: ✅ `fixed` — ver correção abaixo

##### 🟡 Altos (8)

**B03-A09 🟡 `chat-completion` ignora `ai_configurations` — model/temp/prompt hardcoded**
- Onde: `chat-completion/index.ts:110-118`
- Detalhes: `model: 'gpt-4o-mini'`, `temperature: 0.7`, `max_tokens: 1000`, `system_prompt` hardcoded. O painel `AdminAiConfigPage` é inútil para o chat — as configurações do BD são ignoradas.
- Acção: Buscar `ai_configurations` com `use_case = 'chat'` no início da função (como `generate-explanation` faz).
- Estado: `open`

**B03-A10 🟡 `chat-completion` não verifica se utilizador pagou**
- Onde: `chat-completion/index.ts` — verifica ownership mas não subscription
- Detalhes: Qualquer utilizador autenticado pode chamar `chat-completion` directamente, mesmo sem `has_chat_access`. O frontend filtra, o backend não.
- Acção: `const { data: sub } = await supabaseClient.from('subscriptions').select('has_chat_access').eq('user_id', user.id).single()` → retornar 403 se `!sub?.has_chat_access`.
- Estado: `open`

**B03-A11 🟡 `chat-completion` sem limite de tamanho na `message`**
- Onde: `chat-completion/index.ts:44`
- Detalhes: `message` sem validação de comprimento. Mensagem de 1MB é processada, enviada à OpenAI, guardada na BD.
- Acção: `if (message.length > 4000) return 400 'Message too long'`
- Estado: `open`

**B03-A12 🟡 `invoice.payment_failed` sem acção na BD**
- Onde: `stripe-webhook/index.ts:142-145` — apenas `console.warn`
- Detalhes: Falha de pagamento de subscription não desactiva acesso. Utilizador continua com `has_chat_access: true` apesar de não pagar.
- Acção: `UPDATE subscriptions SET recurring_active = false WHERE stripe_subscription_id = invoice.subscription`
- Estado: ✅ `fixed` — ver correção abaixo

**B03-A13 🟡 `invoice.payment_succeeded` (renovações mensais) não processado**
- Onde: `stripe-webhook/index.ts` — evento não existe no switch
- Detalhes: Renovações mensais não criam registo em `payments`. Histórico financeiro incompleto.
- Acção: Adicionar case para `invoice.payment_succeeded` que insere em `payments`.
- Estado: ✅ `fixed` — ver correção abaixo

**B03-A14 🟡 `create-checkout-session` — `plan` sem validação de tipo**
- Onde: `create-checkout-session/index.ts:62`
- Detalhes: `(await req.json()) as RequestBody` sem validação. Se `plan` for qualquer outra string, `priceId` fica undefined e retorna 500 genérico.
- Acção: `if (plan !== 'one_time' && plan !== 'recurring') return 400 'Invalid plan'`
- Estado: `open`

**B03-A15 🟡 `create-checkout-session` não persiste `customerId` antes de criar sessão**
- Onde: `create-checkout-session/index.ts:93-107`
- Detalhes: Cria Stripe Customer mas não guarda o `customerId` na `subscriptions`. Se o checkout for abandonado, próxima chamada cria outro Customer Stripe para o mesmo user.
- Acção: `UPDATE subscriptions SET stripe_customer_id = customerId WHERE user_id = user.id` após criar o Customer.
- Estado: `open`

**B03-A16 🟡 `generate-explanation` — erros das chamadas OpenAI silenciados**
- Onde: `generate-explanation/index.ts:102-104, 124-126`
- Detalhes: `shortRes.json()` chamado sem verificar `shortRes.ok`. Resultado vazio guardado silenciosamente.
- Estado: `open` (resolvido parcialmente com A03)

##### 🟢 Médios (5)

**B03-A17 🟢 `deno.land/std@0.168.0` — versão muito antiga**
- Acção: Actualizar para `@0.224.0` ou usar importmap. Versão actual tem bugs de segurança corrigidos.
- Estado: `open`

**B03-A18 🟢 Sem rate limiting em funções de custo (generate-explanation, chat-completion)**
- Detalhes: Loop de requests pode gerar custos OpenAI sem controlo.
- Acção: Rate limit via `Deno.KV` (Supabase suporta) ou header `X-RateLimit-*`.
- Estado: `open`

**B03-A19 🟢 `email_send_log` guarda `body_html` completo com PII**
- Detalhes: Corpo do email (com nome, links personalizados) guardado indefinidamente.
- Acção: Guardar apenas `subject` + `template_id` + `variables_used` (sem o HTML expandido). Ou purge após 90 dias.
- Estado: `open`

**B03-A20 🟢 `from` hardcoded em `send-email`**
- Acção: `Deno.env.get('EMAIL_FROM') ?? 'noreply@mail.drimigrante.com'`
- Estado: `open`

**B03-A21 🟢 `payment_events.processed_at` definido antes do processamento**
- Detalhes: Se o processamento falhar após o insert, `processed_at` está errado.
- Acção: Fazer o insert sem `processed_at`; actualizar no final com `UPDATE payment_events SET processed_at = now() WHERE stripe_event_id = event.id`.
- Estado: `open`

#### Correcções aplicadas nesta sessão

| Achado | Ficheiro(s) | O que foi feito |
|---|---|---|
| B03-A05 | `send-email/index.ts` | Verificação de `x-internal-secret` header vs `INTERNAL_SECRET` env var — retorna 403 se não corresponder |
| B03-A06 | `send-email/index.ts` | Função `escapeHtml()` adicionada; `bodyHtml` usa vars escapadas; `subject` usa vars raw (plain text) |
| B03-A07 | todos os 5 ficheiros* | `String(err)` substituído por `'Internal server error'` em todos os catch blocks |
| B03-A08 | `stripe-webhook/index.ts` | Guard de idempotência antes do processamento: `SELECT id FROM payment_events WHERE stripe_event_id = event.id` → retorna 200 imediatamente se já processado |
| B03-A12 | `stripe-webhook/index.ts` | Case `invoice.payment_failed` faz `UPDATE subscriptions SET recurring_active = false, has_chat_access = false` |
| B03-A13 | `stripe-webhook/index.ts` | Case `invoice.payment_succeeded` adicionado: skip se `billing_reason = 'subscription_create'`; insere pagamento de renovação e reactiva subscriptions suspensas |

_*`chat-completion` já usava `'Internal server error'` correctamente — sem alteração necessária._

**⚠️ Env var obrigatória:** `INTERNAL_SECRET` deve ser adicionada às Edge Function secrets no dashboard Supabase (Settings → Edge Functions). Valor: qualquer string aleatória segura (ex: `openssl rand -hex 32`). Esta variável é partilhada por `send-email` (lê) e `stripe-webhook` (envia ao invocar).

---

### Bloco 04 — Auth & Multi-tenancy
**Prioridade:** 🔴 Crítica · **Status:** 🔴 Achados pendentes · **Revisado em:** 2026-05-11

#### Escopo
Login (magic link + Google OAuth), sessão, roles, proteção de rotas, redirect pós-auth.

#### Ficheiros (4)
- `src/hooks/useAuth.ts` (169 linhas)
- `src/router/ProtectedRoute.tsx` (36 linhas)
- `src/pages/auth/LoginPage.tsx` (238 linhas)
- `src/pages/auth/AuthCallbackPage.tsx` (44 linhas)

#### Checklist
- [x] **Magic link redirect URL** — ✅ usa `window.location.origin/auth/callback` (precisa whitelist no dashboard Supabase — confirmar)
- [x] **Sessão persiste após reload** — ✅ `persistSession: true`, `autoRefreshToken: true`
- [x] **`try/catch` + timeout em `loadUserData`** — ✅ Fase 2 OK (8s timeout + fallback state)
- [x] **`ProtectedRoute` sem flash durante loading** — ✅ mostra spinner
- [x] **Role check server-side** — ⚠️ `isHubUser` calculado client-side a partir de roles do BD; role check em RLS é server-side OK, mas ver B04-A05
- [x] **Logout limpa cache TanStack Query** — ❌ `signOut` não chama `queryClient.clear()` (ver B04-A04)
- [x] **`useAuth` instanciado uma vez, não por componente** — ❌ sem Context Provider — cada consumer cria estado independente (ver B04-A01)
- [x] **`AuthCallbackPage` lida com link expirado/inválido** — ❌ redireciona para `/login` sem mensagem (ver B04-A06)
- [x] **Open redirect em `AuthCallbackPage`** — ❌ `returnTo` de sessionStorage não validado (ver B04-A02)
- [x] **Race condition no AuthCallbackPage** — ❌ usa `getSession()` em vez de `onAuthStateChange` (ver B04-A06)
- [x] **Leak de `access_token`** — ✅ Supabase gere `localStorage` internamente, sem exposição adicional
- [x] **Email enumeration** — ✅ magic link não revela se email existe
- [x] **DEV panel protegido** — ⚠️ guard apenas por hostname, não por env var (ver B04-A07)
- [x] **`signInWithGoogle` com error handling** — ❌ erro não tratado (ver B04-A09)
- [x] **Links `/termos` e `/privacidade`** — ❌ rotas provavelmente inexistentes (ver B04-A10)
- [x] **GDPR consent** — ⚠️ texto passivo "ao continuar aceita..." pode ser insuficiente (ver B04-A11)
- [x] **Double fetch em `loadUserData`** — ❌ chamado por `getSession()` inicial E por `onAuthStateChange` (ver B04-A03)

#### Achados

##### 🔴 Críticos

**B04-A01 🔴 `useAuth` não usa Context — múltiplas instâncias, estado divergente**
- Onde: `src/hooks/useAuth.ts` — hook de estado local puro
- Detalhes: Cada componente que chamar `useAuth()` cria um estado independente com o seu próprio `onAuthStateChange` listener e queries ao BD. Num render tree típico com `ProtectedRoute` + `DashboardLayout` + componente filho que lê `useAuth()`, existem 3 instâncias diferentes. O utilizador pode ver dados inconsistentes e o BD recebe 3× o tráfego de auth.
- Risco: Estado divergente entre componentes. Memory leaks se subscriptions não forem limpas correctamente. Performance.
- Acção:
  ```tsx
  // src/contexts/AuthContext.tsx
  const AuthContext = createContext<UseAuthReturn>(...)
  export function AuthProvider({ children }) {
    const auth = useAuthInternal() // lógica actual do hook
    return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
  }
  export const useAuth = () => useContext(AuthContext)
  ```
  Envolver `<App>` em `<AuthProvider>`. `ProtectedRoute` passa a consumir o context.
- Estado: `open`

**B04-A02 🔴 Open Redirect — `returnTo` não validado em `AuthCallbackPage`**
- Onde: `src/pages/auth/AuthCallbackPage.tsx:22`
- Detalhes: `navigate(returnTo)` sem validação. `returnTo` vem de `sessionStorage` — que é origin-bound, mas XSS em qualquer ponto da app permite escrever um URL externo. Padrão: `navigate('https://evil.com')` funciona via React Router se passar uma string absoluta.
- Acção:
  ```ts
  const safe = returnTo?.startsWith('/') ? returnTo : '/dashboard'
  navigate(safe, { replace: true, ... })
  ```
- Estado: `open`

**B04-A03 🔴 Double fetch — `loadUserData` chamado 2× no init**
- Onde: `src/hooks/useAuth.ts:85-86` (via `getSession`) e linha `106` (via `onAuthStateChange SIGNED_IN`)
- Detalhes: Ao iniciar, `getSession()` retorna sessão → chama `loadUserData`. Milissegundos depois, `onAuthStateChange` emite `SIGNED_IN` → chama `loadUserData` outra vez. Dois conjuntos paralelos de 3 queries ao BD (6 queries totais no init). Com múltiplas instâncias (A01), multiplica-se.
- Acção: No `onAuthStateChange`, ignorar `SIGNED_IN` se `session` já carregada pelo `getSession()`. Ou substituir o `getSession()` inicial por apenas o listener:
  ```ts
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    setSession(session)
    if (event === 'INITIAL_SESSION') { /* handle */ }
    if (session?.user) setTimeout(() => loadUserData(session.user).finally(...), 0)
    else { setAuthUser(null); setLoading(false) }
  })
  ```
  `onAuthStateChange` com `INITIAL_SESSION` substitui o `getSession()` separado.
- Estado: `open`

##### 🟡 Altos

**B04-A04 🟡 `signOut` não invalida cache do TanStack Query**
- Onde: `src/hooks/useAuth.ts:147-151`
- Detalhes: Após logout, dados de admin, assessments e leads ficam em cache. Se outro utilizador fizer login no mesmo browser (partilhado / shared device), pode ver dados do utilizador anterior até o cache expirar (30 min por `gcTime`).
- Acção:
  ```ts
  import { queryClient } from '@/lib/query-client'
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    queryClient.clear()        // remove todo o cache
    setAuthUser(null)
    setSession(null)
  }, [])
  ```
- Estado: `open`

**B04-A05 🟡 `isHubUser` inclui `lawyer` e `paralegal` sem distinção de permissões**
- Onde: `src/hooks/useAuth.ts:153-155`
- Detalhes: `['super_admin', 'hub_admin', 'lawyer', 'paralegal'].includes(r)` — lawyers e paralegais recebem acesso total ao admin panel, incluindo `AdminAiConfigPage` (alteração de system prompts). Não é o esperado — lawyers deveriam ter acesso a Cases e Leads mas não a configurações de IA.
- Acção: Introduzir distinção no `ProtectedRoute`:
  ```tsx
  requireRole?: AppRole[]  // eg. ['super_admin', 'hub_admin']
  ```
  E ajustar `isHubUser` para ser apenas `super_admin | hub_admin`, criar `isStaffUser` para o conjunto mais alargado.
- Estado: `open`

**B04-A06 🟡 `AuthCallbackPage` — race condition + sem feedback de erro**
- Onde: `src/pages/auth/AuthCallbackPage.tsx:13`
- Detalhes:
  1. `getSession()` chamado antes do `detectSessionInUrl` do Supabase processar o hash da URL. Pode retornar `null` e redirecionar para `/login` mesmo com link válido. Usar `onAuthStateChange` é mais seguro.
  2. Se link expirou ou já foi usado, `session` é `null` → utilizador vai para `/login` sem saber porquê.
- Acção:
  ```tsx
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // redirect como antes
      } else if (event === 'TOKEN_REFRESHED') { /* ok */ }
      else {
        // link expirado/inválido
        navigate('/login?error=link_expired', { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [navigate])
  ```
  Mostrar mensagem em `LoginPage` se `?error=link_expired` estiver presente.
- Estado: `open`

**B04-A07 🟡 DEV login panel — guard só por `hostname`, não por env var**
- Onde: `src/pages/auth/LoginPage.tsx:15`
- Detalhes: `const isDev = window.location.hostname === 'localhost' || hostname === '127.0.0.1'`. Se este código correr num staging/preview deploy (Vercel preview URLs têm domínio diferente — correcto), o painel não aparece. MAS se alguém correr prod localmente com `npm run preview`, o painel aparece — e permite login com password em produção.
- Acção:
  ```ts
  const isDev = import.meta.env.VITE_APP_ENV === 'development'
  ```
  Garantir `VITE_APP_ENV=development` apenas em `.env.local` e nunca em `.env.production`.
- Estado: `open`

**B04-A08 🟡 `requirePaid` em `ProtectedRoute` verifica sempre `'dashboard'`**
- Onde: `src/router/ProtectedRoute.tsx:31`
- Detalhes: `hasAccess('dashboard')` hardcoded. Se uma rota futura necessitar de verificar `'chat'` ou `'full_analysis'` separadamente, não há como. Leads a feature gates incorrectos.
- Acção:
  ```tsx
  interface ProtectedRouteProps {
    requireFeature?: 'dashboard' | 'chat' | 'full_analysis'
  }
  // e usar: if (requireFeature && !hasAccess(requireFeature))
  ```
- Estado: `open`

**B04-A09 🟡 `signInWithGoogle` — erro ignorado silenciosamente**
- Onde: `src/pages/auth/LoginPage.tsx:75`
- Detalhes: `await signInWithGoogle()` — o `error` do retorno não é verificado. Se OAuth falhar (popup bloqueado, provider error), o utilizador não vê feedback.
- Acção:
  ```ts
  const handleGoogleLogin = async () => {
    // sessionStorage ...
    const { error } = await signInWithGoogle()
    if (error) toast.error('Erro ao autenticar com Google. Tente novamente.')
  }
  ```
- Estado: `open`

##### 🟢 Médios

**B04-A10 🟢 Links `/termos` e `/privacidade` — rotas provavelmente inexistentes**
- Onde: `src/pages/auth/LoginPage.tsx:231-233`
- Detalhes: `<Link to="/termos">` e `<Link to="/privacidade">` — verificar no Bloco 10 (Routing) se estas rotas existem. Se não, dão 404. Para MVP, podem ser PDF externos ou páginas Notion linkadas.
- Acção: Confirmar no Bloco 10. Se não existirem, substituir por `href` para URLs externas ou adicionar rotas stub.
- Estado: `deferred-bloco10`

**B04-A11 🟢 GDPR — consent passivo pode ser insuficiente**
- Onde: `src/pages/auth/LoginPage.tsx:230`
- Detalhes: "Ao continuar, aceita..." é consent implícito. Para RGPD (Art.º 7.º), consentimento deve ser "livre, específico, informado e inequívoco". Magic link sem checkbox explícito é grey area — especialmente se enviar emails de marketing.
- Acção: Para MVP: manter como está (base legal de execução de contrato, Art.º 6.º 1.b). Para Phase 2: adicionar checkbox de newsletter separado.
- Estado: `deferred-phase2`

**B04-A12 🟢 `signInWithMagicLink` usa `window.location.origin`**
- Onde: `src/hooks/useAuth.ts:126`
- Detalhes: Em ambientes detrás de proxy reverso ou Vercel Edge, `window.location.origin` pode diferir da URL canónica. Potencial mismatch com URLs whitelisted no Supabase.
- Acção: Usar `import.meta.env.VITE_APP_URL ?? window.location.origin` como fallback seguro.
- Estado: `open`

**B04-A13 🟢 `console.warn`/`console.error` em produção sem Sentry**
- Onde: `src/hooks/useAuth.ts:53-55, 64, 89`
- Detalhes: Erros de auth ficam apenas em console — invisíveis em produção. Auth failures são críticas para monitorizar.
- Acção: Substituir por `Sentry.captureException` para erros críticos, manter `console.warn` apenas para dev.
- Estado: `open`

#### Ações — Prioridade de Execução

| # | Achado | Tipo | Effort | PR sugerida |
|---|---|---|---|---|
| 1 | B04-A01 | Refactor arquitectural | 2–3h | `refactor/auth-context-provider` |
| 2 | B04-A04 | 1 linha no signOut | 5min | (incluir no B04-A01) |
| 3 | B04-A03 | Simplificar init auth | 30min | (incluir no B04-A01) |
| 4 | B04-A02 | 1 linha no AuthCallback | 5min | `fix/auth-callback-open-redirect` |
| 5 | B04-A06 | Refactor AuthCallback | 30min | `fix/auth-callback-race-condition` |
| 6 | B04-A07 | 1 linha isDev | 5min | `fix/dev-panel-env-guard` |
| 7 | B04-A09 | Error handling Google | 10min | (incluir no B04-A06) |
| 8 | B04-A05 | Role granularidade | 1h | `refactor/roles-granularity` (pós A01) |
| 9 | B04-A08 | `requireFeature` prop | 20min | (incluir no B04-A05) |
| 10 | B04-A12 | env var redirect URL | 5min | (incluir no B04-A06) |
| 11 | B04-A13 | Sentry em auth errors | 20min | (incluir no B04-A01) |
| 12 | B04-A10/A11 | Deferred | — | Phase 2 / Bloco 10 |

> **PR recomendada:** `refactor/auth-context-provider` é a maior mas resolve A01+A03+A04+A13 de uma vez. É a refactorização de maior impacto do bloco e desbloqueia os restantes.

---

### Bloco 05 — Quiz Engine
**Prioridade:** 🟡 Alta · **Status:** ⬜ Não iniciado

#### Escopo
Coração do produto: questões, máquina de estados, persistência, scoring, captura de leads.

#### Ficheiros (10)
- `src/data/quiz-questions.ts` — 19 perguntas, 6 temas, scoring, visa suggestions
- `src/hooks/useQuiz.ts` — orquestrador
- `src/hooks/useQuizState.ts` — reducer puro ✅ (Fase 4 OK)
- `src/hooks/useQuizPersistence.ts` — localStorage ✅ (Fase 4 OK)
- `src/hooks/useAssessment.ts` — upsert para Supabase
- `src/components/quiz/QuizIntro.tsx`
- `src/components/quiz/QuizProgress.tsx`
- `src/components/quiz/QuizQuestion.tsx`
- `src/components/quiz/QuizCaptureForm.tsx`
- `src/pages/quiz/QuizPage.tsx`
- `src/pages/quiz/ResultsPage.tsx`

#### Checklist
- [ ] Scoring determinístico (mesmas respostas → mesmo score) — calcular SEMPRE no servidor (`compute-eligibility`), nunca confiar no client
- [ ] Conditional logic das perguntas testada (cada ramo)
- [ ] Estado persistido sobrevive a reload em qualquer step
- [ ] localStorage com try/catch (Safari privado, quota) ✅ (Fase 4 OK)
- [ ] Form de captura: validação Zod em email/telefone, GDPR consent
- [ ] Acessibilidade: teclado completo, ARIA labels, focus management entre steps
- [ ] Mobile: touch targets ≥ 44px, viewport correcto
- [ ] `assessment_id` linkado correctamente quando user faz signup depois
- [ ] Não há race condition entre upsert anónimo e link ao user no signup
- [ ] Resultado pré-pagamento mostra apenas teaser (categoria, não detalhes)
- [ ] Visa suggestions cobrem todos os principais (D7, D2, CPLP, Reagrupamento, D8)
- [ ] Analytics events disparados nos pontos certos (start, step_X, complete, capture)
- [ ] PaywallCard com CTAs claros e tracking

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 06 — Checkout & Payments
**Prioridade:** 🔴 Crítica · **Status:** 🔴 Achados pendentes · **Revisado em:** 2026-05-11

#### Escopo
Fluxo de pagamento Stripe (one-time €30 + subscription €4.90/mês), webhook, success page, sincronização com BD.

#### Ficheiros (6)
- `src/pages/checkout/CheckoutPage.tsx`
- `src/pages/checkout/SuccessPage.tsx`
- `src/pages/quiz/ResultsPage.tsx` — PaywallCard com CTAs para `/checkout`
- `src/router/index.tsx` — rotas de feature gate
- `src/router/ProtectedRoute.tsx` — lógica de controlo de acesso
- `supabase/functions/create-checkout-session/index.ts` (revisto no Bloco 03)
- `supabase/functions/stripe-webhook/index.ts` (revisto no Bloco 03)

#### Checklist
- [x] **Customer Stripe único por user_id** — ✅ `create-checkout-session` verifica `subscriptions.stripe_customer_id` antes de criar
- [x] **Metadata inclui `user_id` + `assessment_id`** — ✅ ambos incluídos no `session.metadata`
- [x] **Webhook é source of truth** — ✅ acesso só activado após webhook processar
- [x] **Idempotência** — ✅ fixado no Bloco 03 (B03-A08): guard antes de processar
- [x] **Eventos webhook cobertos** — ✅ fixado no B03-A12/13: `invoice.payment_failed` + `invoice.payment_succeeded`
- [x] **Auth em `/checkout`** — ✅ `CheckoutPage` redireciona para `/login` se não autenticado quando clica em pagar
- [x] **Feature gate correcto por rota** — ❌ `/dashboard/chat` e `/dashboard/analysis` usavam `hasAccess('dashboard')` em vez do feature específico (ver B06-A01)
- [x] **Erro de checkout com UX clara** — ✅ `toast.error(...)` com descrição
- [x] **`SuccessPage` valida session_id** — ❌ página acessível sem pagamento real (ver B06-A02)
- [x] **Paywall de visa reasons** — ⚠️ blurred por CSS apenas, dados no DOM (ver B06-A05)
- [x] **`assessmentId` linkado ao pagamento** — ⚠️ perdido se utilizador refrescar `/checkout` (ver B06-A06)
- [x] **Stripe test mode** — ✅ chave TEST em `.env.local`, VITE_* não expostas em checkout

#### Achados

##### 🔴 Críticos

**B06-A01 🔴 Feature gate errado — utilizadores one-time acedem ao Chat (subscription-only)**
- Onde: `src/router/index.tsx:85-93` — `/dashboard/chat` e `/dashboard/analysis` usam `requirePaid` que chama `hasAccess('dashboard')`
- Detalhes:
  - `hasAccess('dashboard')` verifica `has_dashboard_access` (ambos os planos têm)
  - `/dashboard/chat` deve verificar `has_chat_access` (subscription only)
  - `/dashboard/analysis` deve verificar `has_full_analysis` (ambos os planos têm — bug menos grave mas semanticamente errado)
  - Um utilizador que pagou €30 (one-time) pode aceder ao chat sem pagar a subscription (€4,90/mês) — revenue leakage
  - Combinado com B03-A10 (backend sem payment gate), o chat é efectivamente grátis para todos os pagantes
- Acção:
  ```tsx
  // ProtectedRoute.tsx — adicionar requireFeature prop
  requireFeature?: 'dashboard' | 'chat' | 'full_analysis'

  // router/index.tsx
  { path: '/dashboard/analysis', element: <ProtectedRoute requireFeature="full_analysis"> }
  { path: '/dashboard/chat',     element: <ProtectedRoute requireFeature="chat"> }
  { path: '/dashboard/documents',element: <ProtectedRoute requireFeature="dashboard"> }
  // chat redireciona para /checkout (upgrade) em vez de /results
  ```
- Estado: ✅ `fixed`

##### 🟡 Altos

**B06-A02 🟡 `SuccessPage` acessível sem pagamento real**
- Onde: `src/pages/checkout/SuccessPage.tsx`
- Detalhes: Qualquer utilizador pode navegar para `/checkout/success?session_id=qualquercoisa` e ver a página de confirmação de pagamento, incluindo a animação de progresso e os "next steps". O `session_id` é exibido como `Ref: {sessionId}` mas nunca validado. A consequência é cosmética (não dá acesso a funcionalidades) pois o acesso real depende do webhook — mas cria falsa expectativa.
- Acção: Verificar `authUser` + `hasAccess('dashboard')` no mount. Se o utilizador já tem acesso, mostrar a página. Se não tem, mostrar spinner até webhook processar (polling com timeout de 15s). Se timeout, mostrar mensagem "A confirmar pagamento..." com link para `/dashboard`.
- Estado: `open`

**B06-A03 🟡 Erro de checkout pode expor detalhes internos no toast**
- Onde: `src/pages/checkout/CheckoutPage.tsx:114`
- Detalhes: `const message = err instanceof Error ? err.message : String(err)` — `supabase.functions.invoke` pode retornar um erro com `message` que inclui o status HTTP ou headers. Mitigado pelo B03-A07 (Edge Function agora retorna `'Internal server error'`), mas erros de rede do SDK ainda podem vazar.
- Acção: Substituir por mensagem genérica: `toast.error('Erro ao iniciar pagamento. Tente novamente.')` sem `description`.
- Estado: `open`

**B06-A04 🟡 `requirePaid` redireciona para `/results` se utilizador não fez quiz**
- Onde: `src/router/ProtectedRoute.tsx:44` (legado `requirePaid`)
- Detalhes: Se um utilizador autenticado sem subscription navega para `/dashboard/documents`, é redirecionado para `/results`. Se não fez o quiz, vê "Não encontrámos nenhum resultado de quiz." — UX confusa.
- Acção: Redirecionar para `/checkout` em vez de `/results`. Ou: para `requireFeature='dashboard'` e `requireFeature='full_analysis'`, redirecionar para `/checkout`.
- Estado: `open`

##### 🟢 Médios

**B06-A05 🟢 Visa reasons protegidas apenas por CSS blur**
- Onde: `src/pages/quiz/ResultsPage.tsx:194` — `blur-[3px] select-none`
- Detalhes: `visa.reason` está no DOM e acessível via DevTools / screen readers. Apenas visualmente escondido.
- Acção: Não enviar `reason` no payload de `assessment_results` que a `ResultsPage` recebe; gerar um placeholder no servidor para o campo `reason` quando não pago. Esta mudança pertence ao Bloco 05.
- Estado: `deferred-bloco05`

**B06-A06 🟢 `assessmentId` perdido se utilizador refrescar `/checkout`**
- Onde: `src/pages/checkout/CheckoutPage.tsx:104` — `location.state?.assessmentId`
- Detalhes: React Router state é lost após reload. Checkout funciona mas o assessment não fica linkado ao pagamento.
- Acção: Persistir `assessmentId` em `sessionStorage` quando navegar para checkout (já feito para `plan` em `LoginPage`). Ler de `sessionStorage` como fallback.
- Estado: `open`

**B06-A07 🟢 `JSX.Element` deprecated no router**
- Onde: `src/router/index.tsx:11`
- Detalhes: `React.LazyExoticComponent<() => JSX.Element>` — `JSX.Element` foi movido para `React.JSX.Element` no React 18.3+ e removido no React 19.
- Acção: Substituir por `React.ReactElement` ou `React.FC`.
- Estado: `open`

**B06-A08 🟢 `SuccessPage` auto-redirect sem aguardar confirmação de webhook**
- Onde: `src/pages/checkout/SuccessPage.tsx:49-55`
- Detalhes: Redirect após 8s independentemente de o webhook ter processado. Na maioria dos casos o webhook chega antes (< 2s), mas em condições de carga pode não ter chegado. O utilizador chega ao dashboard com subscription ainda não activa.
- Acção: Melhorar com polling em `subscriptions.has_dashboard_access` com timeout de 30s (como descrito em B06-A02).
- Estado: `open`

#### Ações — Prioridade de Execução

| # | Achado | Tipo | Effort | Estado |
|---|---|---|---|---|
| 1 | B06-A01 | Feature gate no router + ProtectedRoute | 30min | ✅ fixed |
| 2 | B06-A02 + A08 | Polling de webhook na SuccessPage | 1h | open |
| 3 | B06-A04 | Redirect para /checkout em vez de /results | 5min | open |
| 4 | B06-A03 | Toast genérico sem message | 5min | open |
| 5 | B06-A06 | sessionStorage para assessmentId | 10min | open |
| 6 | B06-A05 | Deferred para Bloco 05 | — | deferred |
| 7 | B06-A07 | JSX.Element → ReactElement | 5min | open |

#### Correcções aplicadas nesta sessão

| Achado | Ficheiro(s) | O que foi feito |
|---|---|---|
| B06-A01 | `src/router/ProtectedRoute.tsx`, `src/router/index.tsx` | Adicionado `requireFeature` prop; `/dashboard/chat` agora usa `requireFeature="chat"`, `/dashboard/analysis` usa `requireFeature="full_analysis"`; chat redireciona para `/checkout` (upgrade) |

---

### Bloco 07 — Dashboard (User)
**Prioridade:** 🟡 Alta · **Status:** ⬜ Não iniciado

#### Escopo
Área logada do utilizador final: home, análise, chat IA, documentos, settings.

#### Ficheiros (6)
- `src/components/layout/DashboardLayout.tsx`
- `src/pages/dashboard/DashboardHomePage.tsx`
- `src/pages/dashboard/AnalysisPage.tsx`
- `src/pages/dashboard/ChatPage.tsx`
- `src/pages/dashboard/DocumentsPage.tsx`
- `src/pages/dashboard/SettingsPage.tsx`

#### Checklist
- [ ] Loading skeletons nas queries (sem flash de empty state)
- [ ] Feature gates: análise/chat/documentos só desbloqueiam após pagamento
- [ ] `ChatPage`: streaming de resposta? Token usage tracked?
- [ ] `ChatPage`: histórico persiste e carrega ordenado
- [ ] `AnalysisPage`: dados vêm de `compute-eligibility` + `generate-explanation`
- [ ] `DocumentsPage`: upload está apenas simulado — flagged para Phase 2
- [ ] `SettingsPage`: edição de profile com optimistic update + rollback
- [ ] `SettingsPage`: cancelamento de subscription pega no Stripe Customer Portal
- [ ] Empty states informativos em todas as páginas
- [ ] Erros não silenciados (toast `sonner` consistente)
- [ ] Mobile responsive (sidebar colapsa)
- [ ] Animações `fade-in slide-in` não bloqueiam interação

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 08 — Admin Panel
**Prioridade:** 🟡 Alta · **Status:** ⬜ Não iniciado

#### Escopo
Backoffice do HUB: stats, leads, pipeline kanban, configuração de IA.

#### Ficheiros (5)
- `src/components/layout/AdminLayout.tsx`
- `src/pages/admin/AdminDashboardPage.tsx`
- `src/pages/admin/AdminLeadsPage.tsx`
- `src/pages/admin/AdminPipelinePage.tsx`
- `src/pages/admin/AdminAiConfigPage.tsx`

#### Checklist
- [ ] Acesso restrito por role server-side (RLS) e client-side (`ProtectedRoute`)
- [ ] Queries paginadas (não trazer 10k leads de uma vez)
- [ ] Export CSV: sanitiza campos (CSV injection, vírgulas em nomes)
- [ ] Kanban: drag-and-drop persiste status e dispara optimistic update ✅ (Fase 2 OK)
- [ ] Filtros no LeadsPage indexados na BD
- [ ] AdminAiConfigPage: optimistic update + rollback ✅ (Fase 2 OK)
- [ ] Mudanças em system_prompt logam em audit_log ✅ (Fase 3 OK)
- [ ] Stats no AdminDashboard são queries rápidas (views materializadas se necessário)
- [ ] Temperatura da lead é calculada de forma consistente (regra documentada)
- [ ] Sem `as any` nos handlers de mutação ✅ (Fase 1 OK)
- [ ] Nenhum dado de outro tenant vaza (multi-tenancy enforced)

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 09 — Marketing & Landing
**Prioridade:** 🟢 Média · **Status:** ⬜ Não iniciado

#### Escopo
Página pública (não logada): landing, header, footer, 404.

#### Ficheiros (5)
- `src/pages/LandingPage.tsx`
- `src/pages/NotFoundPage.tsx`
- `src/components/layout/Layout.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Footer.tsx`

#### Checklist
- [ ] SEO: title/description únicos por rota, OpenGraph, Twitter cards
- [ ] Performance: LCP < 2.5s, CLS < 0.1, lazy-load de imagens abaixo da dobra
- [ ] CTAs principais com tracking (PostHog event `cta_click_{location}`)
- [ ] Acessibilidade WCAG AA (contraste, keyboard, screen reader)
- [ ] Footer com links legais (Termos, Privacidade, Cookies, RGPD)
- [ ] Cookie banner se houver tracking (PostHog/GA4 com consent mode)
- [ ] Header com nav coerente (mobile burger funcional)
- [ ] 404: link de volta + relata o caminho que falhou (Sentry breadcrumb)
- [ ] Internacionalização: locale `pt-PT` consistente, datas/moedas formatadas

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 10 — Routing & Code-Splitting
**Prioridade:** 🟢 Média · **Status:** ⬜ Não iniciado

#### Escopo
React Router v6, lazy-loading, navegação, deep links, fallbacks.

#### Ficheiros (3)
- `src/router/index.tsx`
- `src/router/ProtectedRoute.tsx`
- `src/App.tsx`

#### Checklist
- [ ] Cada rota top-level usa `React.lazy` (já feito no Day 1)
- [ ] `Suspense` boundaries com fallback consistente (skeleton ou spinner com brand)
- [ ] Deep links funcionam após reload (Vercel rewrite para `/index.html`)
- [ ] `ProtectedRoute` preserva `from` location para redirect pós-login
- [ ] Estrutura aninhada coerente (Layout → DashboardLayout → pages)
- [ ] 404 catch-all
- [ ] Sem rotas duplicadas / shadowing
- [ ] Pre-fetch on hover em CTAs principais (opcional, perf win)
- [ ] Error boundary por rota para isolar crashes

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 11 — Observabilidade
**Prioridade:** 🟡 Alta · **Status:** ⬜ Não iniciado

#### Escopo
Sentry, PostHog, GA4. Erros, sessões, funil, métricas de negócio.

#### Ficheiros (estimados — confirmar inventário)
- `src/main.tsx` (init Sentry/PostHog/GA4)
- `vite.config.ts` (PostHog wizard)
- Eventos disparados em: Quiz, Checkout, Dashboard, Admin

#### Checklist
- [ ] Sentry inicializado com DSN correto e environment (`dev`/`prod`)
- [ ] Sentry: source maps uploaded no deploy
- [ ] Sentry: PII scrubbing (email, telefone, payload de payment)
- [ ] PostHog: events nomeados consistentemente (`snake_case`, action_object_context`)
- [ ] PostHog: identify(user_id) após login
- [ ] PostHog: feature flags wired (se houver)
- [ ] GA4: enhanced ecommerce events (`begin_checkout`, `purchase`)
- [ ] Funnel events cobrem o golden path: `quiz_start → quiz_complete → capture → checkout_view → purchase`
- [ ] Consent mode v2 do GA4 (se cookie banner vier)
- [ ] Logs server-side (Edge Functions) chegam ao Sentry/Logflare
- [ ] Dashboards já criados / planeados (PostHog Insights)
- [ ] Alertas: error rate spike, payment failed, edge function timeout

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 12 — UI Kit / Design System
**Prioridade:** 🟢 Baixa · **Status:** ⬜ Não iniciado

#### Escopo
Componentes shadcn/ui, tokens de design, primitives Radix.

#### Ficheiros
- `src/components/ui/` (actualmente vazio — precisa popular com shadcn)
- `tailwind.config.ts` (tokens `brand`, `gold`)
- `src/index.css` (CSS vars, base styles)
- `components.json` (config shadcn)

#### Checklist
- [ ] `src/components/ui/` populado com primitives usados (Button, Input, Card, Dialog, etc.)
- [ ] Design tokens (`brand.*`, `gold.*`) usados em vez de cores hardcoded
- [ ] Dark mode considerado / explicitamente ignorado
- [ ] Componentes acessíveis por default (Radix garante mas confirmar uso correcto)
- [ ] Variants `cva` documentadas (size, intent, etc.)
- [ ] Tree-shaking: importar named, não barrel files pesados
- [ ] Tipografia consistente (escala definida)
- [ ] Espaçamento via tokens (`gap-4` etc., não `gap-[17px]`)
- [ ] Componentes próprios reutilizados (não duplicar Button em cada página)

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

## 4. Como avançar

1. **Iniciar um bloco:** mudar status para 🟡, criar branch `audit/bloco-XX-nome`
2. **Correr o checklist:** marcar `[x]` no que está OK; preencher Achados para o resto
3. **Ações:** cada achado vira uma linha numerada com severidade e proposta concreta
4. **Refactor:** abrir PR pequena por achado (ou agrupar quando faz sentido)
5. **Fechar:** status 🟢 ou ✅, actualizar tabela mestre, somar progresso global

### Convenção de Achados

```
A01 🔴 [crítico] Webhook Stripe não valida assinatura
   Onde: supabase/functions/stripe-webhook/index.ts:42
   Risco: qualquer pessoa pode forjar pagamentos via POST
   Acção: usar stripe.webhooks.constructEvent() com STRIPE_WEBHOOK_SECRET
   Estado: open | in-progress | done (#PR123)
```

---

## 5. Histórico de Revisões

| Data | Bloco | Status anterior | Novo status | PR / Notas |
|---|---|---|---|---|
| 2026-05-08 | — | — | Documento criado | Inventário inicial |
| 2026-05-10 | 02 — DB & Schema | ⬜ | 🔴 Achados pendentes | 16 achados: 4 críticos, 8 altos, 4 médios. Build TS confirmado quebrado. RLS com furos críticos em `assessments`, `crm_leads`, `cases`, `crm_activity_log`. Tabelas sem RLS: `payment_events`, `email_send_log`, `audit_log`, `tenants`. Types desatualizados (falta `payments`). |
| 2026-05-11 | 04 — Auth & Multi-tenancy | ⬜ | 🔴 Achados pendentes | 13 achados: 3 críticos, 6 altos, 4 médios. `useAuth` sem Context Provider (múltiplas instâncias). Open redirect no AuthCallback. Double fetch no init. Logout sem cache clear. DEV panel com guard frágil. Race condition no AuthCallback. |
| 2026-05-11 | 02+04 — Correcção batch | 🔴 | ✅ parcial | **17 achados fechados** via 3 PRs: (1) `security_hardening.sql` fecha B02-A03/05/06/08/09/11/12; (2) regeneração de types + helper `Payment` fecha B02-A02; (3) `AuthContext` + fixes fecham B04-A01/02/03/04/06/07/09/12/13. Pendentes: B02-A04/10/13/14/15/16/17/A20, B04-A05/08/10/11. Build ✅ limpo. |

---

> **Próximo passo sugerido:** começar pelo **Bloco 02 — Database & Schema**, depois **04 — Auth** e **03 — Edge Functions**. São os que têm maior impacto em segurança e correcção do produto.
