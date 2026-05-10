# Doutor Imigrante Constitution

## Core Principles

### I. Tipo-segurança Total

TypeScript strict em todo o código — frontend e Edge Functions. Zero `any` sem comentário explicativo. Tipos gerados pelo Supabase CLI (`database.types.ts`) são a fonte da verdade para tipos de DB. Nunca assuma o shape de dados Supabase sem verificar os tipos gerados.

### II. Supabase como Fonte da Verdade

Lógica de autorização vive em RLS policies — não no frontend. Lógica de negócio que toca múltiplas tabelas vai em Edge Functions ou funções PostgreSQL, não em hooks React. O frontend lê e escreve dados; não decide quem pode aceder a quê.

### III. Componentes Atómicos

shadcn/ui como base — nunca recriar primitivos que já existem (Button, Input, Dialog, etc.). Novos componentes de UI genéricos vão em `src/components/ui/`. Componentes com lógica de domínio vão em `src/components/<domínio>/` (ex: `src/components/quiz/`, `src/components/admin/`). Sem componentes "God" — cada componente tem uma responsabilidade.

### IV. Formulários via React Hook Form + Zod

Toda a validação de input de utilizador usa schema Zod. Zero validação inline com `if (!value)`. O schema Zod define o contrato — o componente de formulário só renderiza e submete. Tipos TypeScript derivados dos schemas Zod via `z.infer<>`.

### V. Queries via TanStack Query

Zero `useEffect` para fetch de dados. Toda a leitura de dados usa `useQuery` com uma query key semântica. Toda a escrita usa `useMutation` com `onSuccess` que chama `invalidateQueries` explicitamente. Loading states e error states tratados de forma consistente.

### VI. Secrets no Servidor

Variáveis públicas no frontend obrigatoriamente com prefixo `VITE_`. Chaves privadas (OpenAI, Stripe secret key, Resend API key) existem apenas em Supabase Edge Function Secrets — nunca no frontend, nunca em `.env` commitado. Qualquer PR que adicione uma chave privada ao frontend é rejeitado imediatamente.

### VII. Rotas Protegidas via Layout

Autenticação e verificação de acesso (requirePaid, requireAdmin) vivem em `ProtectedRoute` e nos Layout wrappers — nunca duplicados dentro de páginas individuais. Uma página nunca verifica a sua própria autorização.

---

## Constraints de Implementação

### Supabase & Edge Functions

- Tipos da DB gerados via `supabase gen types typescript` — actualizar após cada migration
- Edge Functions usam Deno — imports via `https://deno.land/std` ou `https://esm.sh/`; sem `node_modules`
- CORS headers obrigatórios em todas as Edge Functions que recebem chamadas do browser
- Verificação de assinatura Stripe obrigatória no webhook handler

### Estado & Cache

- Quiz state usa `useReducer` (state machine explícita) — sem booleans dispersos
- Quiz persiste em `localStorage` como fallback se Supabase falhar — fluxo não pode ser bloqueado por falha de DB
- TanStack Query `staleTime` deve ser definido explicitamente em queries críticas (não usar 0 para tudo)

### UI & Estilo

- Tailwind para estilos — zero CSS-in-JS, zero styled-components
- Variantes de componentes via `cva` (class-variance-authority) — sem ternários de classe inline longos
- Dark mode: não implementado no MVP — não adicionar suporte parcial
- Responsive: mobile-first — testar em 375px antes de 1440px

### Pagamentos

- Nunca processar lógica de pagamento no frontend — sempre via Edge Function
- Após pagamento bem-sucedido, fonte da verdade é o webhook Stripe → Supabase `subscriptions` — não o redirect de sucesso
- Stripe em TEST mode no desenvolvimento; LIVE keys apenas em produção

---

## Qualidade & Processo

### O que constitui "Done"

Uma feature está completa quando:
1. TypeScript compila sem erros (`npm run build` passa)
2. O fluxo principal funciona no browser (testado manualmente)
3. RLS adequado está em migration se envolver dados novos
4. Sem `console.log` de debug em código commitado

### O que NÃO fazer

- Não abstrair prematuramente — 3 linhas similares não justificam um helper
- Não adicionar loading states ou error handling para cenários impossíveis
- Não duplicar lógica que existe em RLS ou Edge Functions no frontend
- Não usar `as any` — se o tipo é desconhecido, usar `unknown` e narrowing
- Não criar ficheiros de documentação ou README sem pedido explícito

---

## Governance

Esta constituição tem precedência sobre convenções de qualquer projeto legado importado. Qualquer desvio requer comentário explicativo no código e actualização deste documento.

A arquitectura do sistema está documentada em `.spec/architecture.md`. Features novas seguem o ciclo: `/spec.specify` → `/spec.plan` → `/spec.tasks` → `/spec.implement`.

**Version**: 1.0 | **Ratified**: 2026-05-10 | **Last Amended**: 2026-05-10
