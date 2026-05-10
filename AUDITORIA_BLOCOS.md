# Auditoria por Blocos — Doutor Imigrante

> Plano arquitetural para revisão sistemática do código em busca de erros e melhorias.
>
> **Versão:** 1.0
> **Iniciado:** 2026-05-08
> **Última atualização:** 2026-05-08
> **Status global:** 0/12 blocos revisados · 0/12 refatorados

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
| 01 | Infraestrutura & Configuração | 🟡 | ⬜ | — | — |
| 02 | Database & Schema | 🔴 | ⬜ | — | — |
| 03 | Edge Functions (Backend) | 🔴 | ⬜ | — | — |
| 04 | Auth & Multi-tenancy | 🔴 | ⬜ | — | — |
| 05 | Quiz Engine | 🟡 | ⬜ | — | — |
| 06 | Checkout & Payments | 🔴 | ⬜ | — | — |
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
**Prioridade:** 🔴 Crítica · **Status:** ⬜ Não iniciado

#### Escopo
Schema PostgreSQL, RLS, triggers, índices, tipos TypeScript gerados. Toda a integridade dos dados parte daqui.

#### Ficheiros (7)
- `supabase/migrations/20260108000000_initial_schema.sql`
- `supabase/migrations/20260509000000_day3_payments_and_indexes.sql`
- `supabase/migrations/20260509000001_security_rls_phase3.sql`
- `src/lib/database.types.ts` (gerado via Supabase CLI — não editar manualmente)
- `src/lib/supabase.ts` (client público anon)
- `src/lib/query-client.ts` (TanStack Query config)
- `supabase/.temp/` (gitignored)

#### Checklist
- [ ] RLS activo em **todas** as tabelas com dados de utilizador (`auth.uid()` checks)
- [ ] Tabela `assessments`: anon só pode INSERT/UPDATE quando `user_id IS NULL` ✅ (Fase 3 OK)
- [ ] Tabela `ai_configurations`: só `is_hub_user()` lê/escreve ✅ (Fase 3 OK)
- [ ] Tabelas `payments`, `subscriptions`: utilizador só vê os próprios
- [ ] Audit log triggera em mudanças de `system_prompt`/`model` ✅ (Fase 3 OK)
- [ ] Índices presentes em FKs e colunas usadas em filtros (status, tenant_id, user_id, created_at)
- [ ] Migrations idempotentes ou com guards apropriados
- [ ] Sem PII em colunas sem encriptação (passaportes, NIF, etc.)
- [ ] Tipos `database.types.ts` sincronizados com schema remoto (`supabase gen types`)
- [ ] Helper types (`Assessment`, `Lead`, etc.) cobrindo as tabelas usadas no frontend
- [ ] Função `is_hub_user()` com `SECURITY DEFINER` correcto
- [ ] Storage buckets (documentos) com policies adequadas

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 03 — Edge Functions (Backend)
**Prioridade:** 🔴 Crítica · **Status:** ⬜ Não iniciado

#### Escopo
Funções Deno hospedadas no Supabase. Todo o trabalho server-side: scoring, IA, pagamentos, emails.

#### Ficheiros (6)
- `supabase/functions/compute-eligibility/index.ts` — scoring do quiz
- `supabase/functions/generate-explanation/index.ts` — análise narrativa GPT
- `supabase/functions/chat-completion/index.ts` — chat IA com histórico
- `supabase/functions/create-checkout-session/index.ts` — Stripe Checkout
- `supabase/functions/stripe-webhook/index.ts` — webhook de eventos Stripe
- `supabase/functions/send-email/index.ts` — Resend wrapper

#### Checklist
- [ ] Todas as funções validam JWT do utilizador (excepto webhook)
- [ ] CORS configurado restritivamente (origin ≠ `*` em produção)
- [ ] `stripe-webhook` valida assinatura `Stripe-Signature` com secret correcto
- [ ] Idempotência em `stripe-webhook` (evitar duplo processamento de eventos)
- [ ] Rate limiting / throttling em endpoints IA (compute, chat, generate)
- [ ] Sem service-role key vazada para o cliente
- [ ] Erros sanitizados antes de retornar ao cliente (não vazar stack traces, schemas)
- [ ] Logs estruturados (JSON) com correlation ID
- [ ] Timeouts coerentes com SLA das APIs externas (OpenAI ~30s, Stripe ~10s)
- [ ] Retry/backoff em chamadas externas idempotentes
- [ ] Variáveis de ambiente esperadas documentadas no header de cada função
- [ ] Validação de payload (Zod ou similar) na entrada
- [ ] Tipos de eventos Stripe tratados explicitamente (whitelist, não blacklist)
- [ ] Custos OpenAI sob controlo (max_tokens, modelo configurável)

#### Achados
_(preencher)_

#### Ações
_(preencher)_

---

### Bloco 04 — Auth & Multi-tenancy
**Prioridade:** 🔴 Crítica · **Status:** ⬜ Não iniciado

#### Escopo
Login (magic link), sessão, roles, gestão de tenants (HUB vs OFFICE), proteção de rotas.

#### Ficheiros (4)
- `src/hooks/useAuth.ts`
- `src/router/ProtectedRoute.tsx`
- `src/pages/auth/LoginPage.tsx`
- `src/pages/auth/AuthCallbackPage.tsx`

#### Checklist
- [ ] Magic link com redirect URL whitelisted no Supabase
- [ ] Sessão persiste após reload (Supabase auto-refresh OK)
- [ ] `try/catch` envolvendo `Promise.all` em `useAuth` ✅ (Fase 2 OK)
- [ ] `ProtectedRoute`: não renderiza children durante loading (evita flash)
- [ ] Role check (`is_hub_user`) feito server-side, nunca confiando no cliente
- [ ] Logout limpa cache de TanStack Query (evitar leaking entre utilizadores)
- [ ] Páginas admin têm `ProtectedRoute` + role gate adicional
- [ ] Tenant context propagado consistentemente (HUB vs OFFICE_x)
- [ ] Quiz anónimo → email Step 1 → conta no checkout: linkagem do `assessment_id` correcta
- [ ] `AuthCallbackPage` lida com erros (link expirado, inválido)
- [ ] Não há leak do `access_token` para `localStorage` desnecessariamente
- [ ] Mensagens de erro não revelam se o email existe ou não (enumeration)

#### Achados
_(preencher)_

#### Ações
_(preencher)_

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
**Prioridade:** 🔴 Crítica · **Status:** ⬜ Não iniciado

#### Escopo
Fluxo de pagamento Stripe (one-time €30 + subscription €4.90/mês), webhook, success page, sincronização com BD.

#### Ficheiros (4 + 2 do Bloco 03)
- `src/pages/checkout/CheckoutPage.tsx`
- `src/pages/checkout/SuccessPage.tsx`
- `supabase/functions/create-checkout-session/index.ts` (referenciada no Bloco 03)
- `supabase/functions/stripe-webhook/index.ts` (referenciada no Bloco 03)

#### Checklist
- [ ] Customer Stripe único por user_id (sem duplicação)
- [ ] Metadata do checkout inclui `user_id` e `assessment_id` para reconciliação
- [ ] Webhook é a única source of truth de status (não confiar em redirect URL)
- [ ] Idempotência: re-receber `checkout.session.completed` não duplica registo
- [ ] Eventos cobertos: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated/deleted`
- [ ] `SuccessPage` lida com pagamento ainda em pending (mostra spinner até webhook chegar)
- [ ] Erros de payment (cartão recusado) têm UX clara
- [ ] VAT/IVA português correcto se aplicável (€30 inclui ou não IVA?)
- [ ] Receipt email enviado pela Stripe ou pela própria app (Resend)?
- [ ] Cupons / descontos: rota de extensão pensada
- [ ] Test cards funcionam em STAGING; chave LIVE não vaza em DEV
- [ ] Subscription cancellation flow: utilizador pode cancelar, downgrade limpa features?
- [ ] Histórico de pagamentos visível no Settings

#### Achados
_(preencher)_

#### Ações
_(preencher)_

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

---

> **Próximo passo sugerido:** começar pelo **Bloco 02 — Database & Schema**, depois **04 — Auth** e **03 — Edge Functions**. São os que têm maior impacto em segurança e correcção do produto.
