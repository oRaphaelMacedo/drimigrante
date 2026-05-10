---
description: Instala Maestro + SpecKit e gera architecture.md + constitution.md para este projeto
---

Você é um engenheiro de plataforma configurando o workflow de desenvolvimento do projeto **drimigrante**.
Siga cada etapa na ordem exata. Não pule etapas. Não peça confirmação entre elas.

---

## ETAPA 1 — Instalar os comandos do SpecKit

Copie todos os arquivos `.md` de `/Users/rmb/Projects/SpecKit/spec-kit/commands/` para `.claude/commands/` deste projeto.

```bash
cp /Users/rmb/Projects/SpecKit/spec-kit/commands/*.md .claude/commands/
```

---

## ETAPA 2 — Inicializar o Maestro

Execute `maestro init` neste diretório para criar a pasta `.spec/` com os templates padrão.

```bash
maestro init
```

---

## ETAPA 3 — Copiar templates do SpecKit para `.spec/templates/`

Os templates do SpecKit precisam estar em `.spec/templates/` para que os slash commands funcionem.

```bash
mkdir -p .spec/templates
cp /Users/rmb/Projects/SpecKit/spec-kit/templates/* .spec/templates/
cp /Users/rmb/Projects/SpecKit/spec-kit/config.json .spec/config.json
```

---

## ETAPA 4 — Gerar `architecture.md`

Faça um scan completo do codebase deste projeto e gere `.spec/architecture.md`.

O projeto é uma **SPA React (brownfield)** com a seguinte stack confirmada:

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Roteamento | React Router v6 |
| Estado servidor | TanStack Query v5 |
| Backend/DB | Supabase (PostgreSQL + Edge Functions) |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) |
| Formulários | React Hook Form + Zod |
| Pagamentos | (verificar em src/) |
| Analytics | PostHog |
| Erros | Sentry |
| Deploy | Vercel |

Para gerar o `architecture.md`, faça o seguinte:

1. Leia `src/App.tsx`, `src/router/`, `src/pages/` (estrutura de rotas e páginas)
2. Leia `src/components/` (componentes de domínio)
3. Leia `src/hooks/`, `src/lib/` (hooks e utilitários)
4. Leia `supabase/migrations/` (schema do banco — primeiros e últimos arquivos)
5. Leia `supabase/functions/` (Edge Functions existentes)
6. Leia `src/data/` se existir (dados estáticos ou mocks)

Com base nessa leitura, gere `.spec/architecture.md` seguindo **exatamente** o template em `.spec/templates/architecture-template.md`, preenchendo as 7 visões:

- **Context View** — escopo, usuários, sistemas externos (Supabase, Vercel, PostHog, Sentry)
- **Functional View** — módulos principais (auth, quiz, dashboard, checkout, admin) e suas responsabilidades
- **Information View** — schema Prisma/SQL do banco, modelos principais, fluxo de dados
- **Concurrency View** — queries TanStack Query, optimistic updates, edge functions assíncronas
- **Development View** — estrutura de pastas, convenções de código, CI/CD
- **Deployment View** — Vercel + Supabase, variáveis de ambiente necessárias
- **Operational View** — Sentry para erros, PostHog para analytics, observabilidade

Salve em `.spec/architecture.md`.

---

## ETAPA 5 — Gerar `constitution.md`

Leia `.spec/templates/constitution-template.md` e gere `.spec/constitution.md` adaptado para este projeto.

Princípios que **obrigatoriamente** devem constar:

1. **Tipo-segurança total** — TypeScript strict em todo o código; zero `any` sem justificativa
2. **Supabase como fonte da verdade** — sem lógica de negócio duplicada no frontend que deveria estar em RLS ou Edge Functions
3. **Componentes atômicos** — shadcn/ui como base; novos componentes de UI vão em `src/components/ui/`; componentes de domínio em `src/components/<domínio>/`
4. **Formulários via React Hook Form + Zod** — toda validação via schema Zod; sem validação manual inline
5. **Queries via TanStack Query** — sem `useEffect` para fetch de dados; toda mutação via `useMutation` com invalidação explícita
6. **Sem secrets no frontend** — variáveis de ambiente públicas apenas com prefixo `VITE_`; chaves privadas só em Edge Functions
7. **Rotas protegidas via layout** — autenticação verificada em layout wrapper, não em cada página individual

Salve em `.spec/constitution.md`.

---

## ETAPA 6 — Verificar e reportar

Após concluir todas as etapas, liste os arquivos criados/modificados e confirme:

```
✓ .claude/commands/spec.architect.md
✓ .claude/commands/spec.constitution.md
✓ .claude/commands/spec.specify.md
✓ .claude/commands/spec.clarify.md
✓ .claude/commands/spec.plan.md
✓ .claude/commands/spec.tasks.md
✓ .claude/commands/spec.analyze.md
✓ .claude/commands/spec.implement.md
✓ .claude/commands/spec.checklist.md
✓ .claude/commands/spec.update.md
✓ .spec/ (inicializado pelo maestro init)
✓ .spec/templates/ (templates do SpecKit)
✓ .spec/config.json
✓ .spec/architecture.md (gerado por scan do codebase)
✓ .spec/constitution.md (gerado com princípios do projeto)
```

Se algum arquivo estiver faltando, crie-o antes de reportar.

O workflow estará pronto quando todos os arquivos acima existirem. A partir daí, use:
- `/spec.specify "nome da feature"` → para especificar uma nova feature
- `maestro plan "nome da feature"` → para gerar spec + plan + tasks via CLI
- `maestro run` → para executar as tasks via Claude Code com subagents
