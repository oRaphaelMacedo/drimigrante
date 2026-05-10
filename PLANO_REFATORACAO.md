# Plano de Refatoração Arquitetural — Doutor Imigrante

Com base na auditoria arquitetural realizada após o lançamento da v1.0, este documento estabelece um roteiro (roadmap) em 4 fases para eliminar dívidas técnicas, melhorar a segurança e garantir que a aplicação consiga escalar sem gargalos.

---

## Fase 1: Fundações e Tipagem Forte (Alta Prioridade) 🔴
*Objetivo: Eliminar o uso do `any` e garantir que o TypeScript reflita o banco de dados real.*

- [x] **Atualização Automática de Tipos:** Remover os tipos "stub" feitos manualmente. Utilizar a CLI do Supabase para injetar os tipos reais de todas as tabelas:
  ```bash
  # Requer Docker aberto (Docker Desktop)
  supabase gen types typescript --local > src/lib/database.types.ts
  # OU requerer o login via supabase CLI para acesso remoto
  # supabase login
  # supabase gen types typescript --project-id krjirhlmdnxqqrpzmowz > src/lib/database.types.ts
  ```
- [x] **Limpeza de `as any`:** Buscar e remover `as any` em arquivos como `src/pages/admin/AdminAiConfigPage.tsx` e garantir que as tabelas (`ai_configurations`, etc.) estejam corretamente mapeadas.
- [x] **Validação do Build:** Rodar `npm run build` para garantir que as tipagens automáticas não quebraram lógicas antigas, ajustando propriedades onde necessário.

---

## Fase 2: TanStack Query & Otimização de Rede (Média Prioridade) 🟡
*Objetivo: Remover `useEffect` e `Promise.all` não geridos para buscas assíncronas, aproveitando o cache e as reconexões.*

- [x] **Refatorar `useAuth.ts`:**
  - Adicionar blocos `try/catch` para garantir que o erro numa Promessa não falhe o login de forma silenciosa.
  - *Opcional:* Criar uma View no Supabase (`user_full_profile_view`) para consolidar Perfil, Subscrição e Roles numa única requisição em vez de três.
- [x] **Migrar Páginas de Admin para `useQuery`:**
  - Substituir o data fetching nativo em `AdminPipelinePage.tsx` e `AdminLeadsPage.tsx` por hooks do React Query, adicionando estados de *Loading* mais fluidos e *Cache*.
- [x] **Optimistic Updates em Configurações:**
  - Refatorar as mutações em `AdminAiConfigPage.tsx` utilizando `useMutation`, implementando a função `onMutate` nativa para prevenir inconsistências de rollback no painel de administração.

---

## Fase 3: Segurança de Banco de Dados e RLS (Alta Prioridade) 🔴
*Objetivo: Impedir acessos não autorizados por clientes manipulando payloads no frontend.*

- [x] **Auditar `ai_configurations`:** O painel edita propriedades IA no cliente. Revisar no Supabase se as políticas de *Row Level Security (RLS)* na tabela restringem gravações **apenas a administradores autorizados** (`is_hub_user`).
- [x] **Auditar `assessments`:** Garantir que utilizadores normais não possam alterar pontuações ou leads de outras pessoas.
- [x] **Logs de Segurança:** Considerar disparar eventos de auditoria silenciosa quando configurações críticas como "System Prompt" são alteradas.

---

## Fase 4: Otimização do Motor de Quiz (Baixa Prioridade) 🟢
*Objetivo: Tornar o estado complexo do Quiz mais testável e modular.*

- [x] **Abstração de Regras de Negócio:** Extrair a lógica do hook `useQuiz.ts` (que já possui quase 300 linhas) para um padrão *Reducer* ou separar em hooks menores (`useQuizState`, `useQuizPersistence`).
- [x] **Limpeza LocalStorage:** Sincronizar de forma mais previsível o cache em localStorage com o banco de dados online.

---

> **Nota do Arquiteto:** Realize e teste cada fase em branches separadas. Só avance para a Fase 2 quando a Fase 1 (Tipagem) estiver 100% resolvida, pois os tipos corretos irão acelerar a reescrita do React Query.
