# Arquitetura

Última revisão: 16/10/2026. Visão de conjunto do Doutor Imigrante: o que roda
onde, como os dados fluem e onde ficam as regras. Modelo de cobrança em
[modelo-comercial.md](modelo-comercial.md); testes em [testes.md](testes.md);
operação em [operacao/README.md](operacao/README.md).

## Visão geral

```
Navegador (SPA React, PWA)  ──►  Vercel (arquivos estáticos + cabeçalhos)
        │
        ├──►  Supabase  ── Postgres (RLS) · Auth · Storage · Edge Functions (Deno)
        │                                                   │
        │                                                   ├──► Stripe (checkout, webhook)
        │                                                   ├──► OpenAI (análise e chat)
        │                                                   └──► Resend (e-mail)
        └──►  PostHog · GA4 · Meta Pixel (só com consentimento) · Sentry
```

- **Front:** Vite + React 18 + TypeScript + Tailwind, React Router v6, TanStack
  Query, react-hook-form + zod. Publicado na Vercel (`npm run build` → `dist/`).
- **Backend:** Supabase. O navegador só usa a chave anon; tudo que precisa de
  segredo (Stripe, OpenAI, Resend, service role) roda nas Edge Functions.
- **Ambientes:** local (Vite na porta 33401 + Supabase local), preview da Vercel
  (`*.vercel.app`) e produção (`www.drimigrante.com`). Analytics só rodam em
  produção; o Sentry, em produção e nos previews (`src/lib/runtime-env.ts`).

## Front (`src/`)

| Pasta | Conteúdo |
|---|---|
| `router/` | Rotas (`index.tsx`) e `ProtectedRoute` (login, papel e recurso exigidos) |
| `pages/` | Telas: landing, quiz e resultado, checkout, login, painel, admin e páginas legais |
| `components/ui/` | Componentes base (Button, Card, Input, Badge, BottomSheet, StickyCTA…) |
| `components/layout/`, `components/quiz/` | Header, Footer, layout e peças do quiz |
| `contexts/AuthContext.tsx` | Sessão, perfil, papéis e assinatura do usuário |
| `hooks/` | Quiz (`useQuiz*`), assessment, chat (`useChatData`), SEO |
| `lib/` | Regras puras e integrações (abaixo) |
| `data/` | Perguntas do quiz de reserva (`quiz-questions.ts`) e dados da empresa |
| `config/contact.ts` | E-mails de suporte e privacidade, WhatsApp opcional |

Módulos de `src/lib/` que são contrato entre as telas:

| Módulo | Papel |
|---|---|
| `env.ts` | Valida as variáveis `VITE_*` (zod); o `supabase.ts` falha cedo se faltar URL ou chave anon |
| `supabase.ts` | Cliente único do Supabase |
| `offer.ts` | Oferta comercial (preço, itens, prazo, plano mensal) |
| `access.ts` | Estado de acesso (`none`, `active`, `expiring`, `expired`, `recurring`) |
| `analytics-events.ts` / `analytics.ts` | Taxonomia tipada de eventos e `track()` ([analytics.md](analytics.md)) |
| `consent.ts`, `attribution.ts`, `url-sanitize.ts` | Consentimento, UTMs e limpeza de tokens nas URLs |
| `sentry.ts` | Fachada do Sentry |
| `safe-path.ts` | Redirecionamentos internos seguros |

### Rotas

| Rota | Acesso |
|---|---|
| `/`, `/quiz`, `/results`, `/checkout`, `/checkout/success`, `/login`, `/auth/callback`, `/termos`, `/privacidade`, `/cookies` | Públicas |
| `/dashboard`, `/dashboard/analysis`, `/dashboard/chat`, `/dashboard/documents`, `/dashboard/settings` | Logado; cada tela exige o recurso correspondente de `access.ts` |
| `/admin/*` (leads, pipeline, quiz, histórico do quiz, tenants, IA, configurações) | Equipe do HUB (`ProtectedRoute requireAdmin`) |

## Fluxo principal

1. **Quiz (anônimo).** As perguntas vêm de `form_themes`, `form_questions` e
   `form_question_options`; se o banco falhar, o app usa `src/data/quiz-questions.ts`.
   As respostas ficam no `localStorage` e são enviadas pelo RPC
   `upsert_anon_assessment` (identificado por `session_id`, sem conta). Em
   seguida o front chama `compute-eligibility` (pontuação) e `generate-explanation`.
2. **Resultado (`/results`).** Mostra a categoria e um teaser desfocado. "Desbloquear
   €30" chama `create-checkout-session` com o assessment e o e-mail do quiz e
   redireciona para o Checkout do Stripe — sem login antes de pagar.
3. **Pagamento.** O Stripe chama `stripe-webhook`, que valida a assinatura do
   evento, cria (ou encontra) a conta pelo e-mail, vincula o assessment, grava
   `subscriptions` e `payments` e libera o acesso de 30 dias. O processamento é
   idempotente (`payment_events`).
4. **Volta do Stripe (`/checkout/success`).** O front chama `claim-session`,
   que devolve um token de uso único para entrar sem esperar e-mail quando a
   conta foi criada por essa compra; nos outros casos, envia um link de acesso
   para o e-mail da compra.
5. **Painel.** Análise completa, chat (`chat-completion`, resposta em streaming
   SSE), documentos (bucket `user-documents` do Storage) e configurações. Quem
   já pagou recebe, no painel, a oferta do plano de €4,90/mês.

## Edge Functions (`supabase/functions/`)

| Function | `verify_jwt` | Chamada por | Faz |
|---|---|---|---|
| `compute-eligibility` | `true` | Quiz | Pontua o assessment |
| `generate-explanation` | `true` | Quiz | Gera o texto da análise (OpenAI), com teto por hora (`AI_HOURLY_CAP`) |
| `create-checkout-session` | `false` | Resultado, `/checkout`, painel | Cria a sessão do Stripe (€30 anônimo ou €4,90 para quem já pagou) |
| `create-portal-session` | `true` | Painel (aba "Meu plano") | Abre o Customer Portal do Stripe para o próprio usuário (customer lido do banco) |
| `stripe-webhook` | `false` | Stripe | Libera ou revoga acesso a partir dos eventos de pagamento |
| `claim-session` | `false` | `/checkout/success` | Entrada automática pós-pagamento |
| `chat-completion` | `true` | Painel | Chat com IA, conferindo o acesso no servidor |
| `send-email` | `true` | Outras functions (`x-internal-secret`) | E-mails transacionais (Resend) |
| `lifecycle-emails` | `false` | Agendador (pg_net) ou dono (`x-internal-secret`) | E-mails do ciclo de vida (nutrição com opt-in, avisos de prazo, lista de espera); dry-run por padrão |
| `unsubscribe` | `false` | Link dos e-mails | Descadastro por token assinado (guarda só o hash do e-mail) |
| `export-my-data` | `true` | Conta, aba "Privacidade" | Exporta em JSON os dados da própria conta (análise completa só com acesso vigente) |
| `delete-account` | `true` | Conta, aba "Privacidade" | Apaga a conta (cancela a assinatura, remove arquivos, `lgpd_erase_user`); pagamentos ficam guardados sem vínculo |
| `e2e-login` | `false` | Só testes E2E | **Nunca vai para produção** (desligada no `config.toml` e recusa o projeto de produção) |

`verify_jwt` fica no [`supabase/config.toml`](../supabase/config.toml). A lógica
de cada function fica em `handler.ts` (testável com `deno test`, sem rede) e o
`index.ts` só injeta Supabase, Stripe, OpenAI e Resend. Código compartilhado:
`supabase/functions/_shared/` (CORS, pagamentos, prompts, vias de elegibilidade).
Secrets: [`supabase/functions/.env.example`](../supabase/functions/.env.example).

## Banco de dados

- **Migrations:** `supabase/migrations/` (Postgres 17). Aplicadas em ordem pelo
  `supabase start`/`db reset` local; em produção, pelo dono, na ordem indicada
  no cabeçalho de cada arquivo.
- **Principais tabelas:** `assessments` e `assessment_results` (quiz e
  resultado), `subscriptions` e `payments` (acesso e cobrança), `payment_events`
  e `checkout_claims` (idempotência do Stripe e da entrada pós-pagamento),
  `messages` (chat), `user_documents`, `profiles` e `user_roles`, `crm_leads` e
  `crm_activity_log` (admin), `form_*` (quiz editável), `ai_configurations`,
  `email_send_log` e `audit_log`.
- **Multi-tenant:** `tenants` do tipo `hub` (triagem central) ou `office`
  (escritórios parceiros). As políticas RLS usam `is_hub_user`, `is_staff_user`
  e `can_access_tenant`.
- **Quiz anônimo:** gravado e lido por RPCs `SECURITY DEFINER`
  (`upsert_anon_assessment`, `get_anon_assessment`) identificadas pelo
  `session_id`; `link_anon_assessment_to_user` liga o assessment à conta depois
  do login.
- **Seed local:** `supabase/seed.sql` cria usuários de desenvolvimento só no
  banco local (ver [testes.md](testes.md)).

## Variáveis de ambiente

Três camadas, cada uma com seu exemplo — `npm run check-env` confere que o
código e os exemplos batem (sem chave faltando nem órfã):

| Camada | Exemplo | Onde ficam os valores reais |
|---|---|---|
| Front (`VITE_*`, públicas) | `.env.example` | `.env.local` / `.env.development.local` local; Vercel em preview e produção |
| Edge Functions | `supabase/functions/.env.example` | `supabase/functions/.env` local; secrets do projeto no Supabase |
| E2E | `.env.test.example` | `.env.test.local`, gerado por `npm run supabase:env` |

## Qualidade e CI

- `npm run typecheck`, `npm run lint`, `npm test` (Vitest), `npm run test:scripts`
  (scripts Node), `npm run test:functions` (Deno) e E2E com Playwright.
- `.github/workflows/ci.yml` roda tudo isso em cada PR, com o E2E contra um
  Supabase local no próprio runner (`.github/workflows/e2e.yml`). Nenhum job usa
  secrets nem fala com produção.
