# Atomic Tasks: Chat IA — Correcção e Completude

**Feature ID**: FEAT-007  
**Total Tasks**: 12

---

## Fase 1 — Verificação de Schema

- [x] [Backend] **TASK-001**: Verificar schema actual das tabelas `assessments` e `messages` nas migrations existentes em `supabase/migrations/`. Confirmar que `assessments` tem os campos `id`, `user_id`, `score`, `visa_types`, `answers`, `created_at`. Confirmar que `messages` tem os campos `id`, `assessment_id`, `user_id`, `role`, `content`, `created_at`. Anotar qualquer campo em falta.

- [x] [Backend] **TASK-002**: Verificar que existem RLS policies na tabela `messages` que permitem ao utilizador autenticado ler e inserir as suas próprias mensagens (`auth.uid() = user_id`). Se não existirem, criar migration `supabase/migrations/YYYYMMDD_fix_messages_rls.sql` com as policies necessárias. Verificar também que a tabela `messages` tem RLS activado (`ALTER TABLE messages ENABLE ROW LEVEL SECURITY`).

- [x] [Backend] **TASK-003**: Se algum campo estiver em falta nas tabelas identificadas na TASK-001, criar migration `supabase/migrations/YYYYMMDD_fix_messages_schema.sql` com `ALTER TABLE messages ADD COLUMN IF NOT EXISTS ...` para os campos em falta. Aplicar a migration localmente e verificar que não há erros.

---

## Fase 2 — Correcção da Edge Function

- [x] [Backend] **TASK-004**: Abrir `supabase/functions/chat-completion/index.ts`. Localizar o bloco `corsHeaders` duplicado (linha ~86). Remover o bloco duplicado, mantendo apenas a definição no topo do ficheiro. Verificar que o ficheiro não tem outros blocos de headers duplicados. O bloco correcto deve ser:
  ```typescript
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  ```

- [x] [Backend] **TASK-005**: Na Edge Function `chat-completion`, localizar a query que referencia `assessment_results` e substituir por `assessments`. A query deve filtrar por `id = assessmentId` E `user_id = userId` (segurança — utilizador só acede ao seu próprio assessment). Usar `.single()` e tratar o erro retornando 404 se não encontrado.

- [x] [Backend] **TASK-006**: Na Edge Function `chat-completion`, adicionar carregamento do histórico de mensagens da tabela `messages` antes da chamada OpenAI. Query: `SELECT role, content FROM messages WHERE assessment_id = assessmentId ORDER BY created_at ASC LIMIT 20`. Mapear o resultado para o formato `{ role: 'user' | 'assistant', content: string }[]` esperado pela API OpenAI.

- [x] [Backend] **TASK-007**: Na Edge Function `chat-completion`, adicionar persistência da mensagem do utilizador na tabela `messages` (antes da chamada OpenAI) com `role: 'user'`. Adicionar persistência da resposta da IA (após receber resposta OpenAI) com `role: 'assistant'`. A segunda inserção deve usar `.select('id').single()` para retornar o `messageId` na resposta. Ambas as inserções devem incluir `assessment_id`, `user_id`, `role`, `content`.

- [x] [Backend] **TASK-008**: Rever a Edge Function `chat-completion` completa para garantir que: (a) o handler `OPTIONS` retorna `new Response('ok', { headers: corsHeaders })`; (b) TODAS as respostas (200, 400, 401, 404, 500) incluem `{ ...corsHeaders, 'Content-Type': 'application/json' }` nos headers; (c) existe um bloco `try/catch` global que captura erros inesperados e retorna 500 com `console.error`; (d) o body é validado (`message` não vazio, `assessmentId` presente).

---

## Fase 3 — Frontend: Hook `useChatData`

- [x] [Frontend] **TASK-009**: Criar ficheiro `src/hooks/useChatData.ts`. Implementar o hook `useChatData()` que:
  1. Usa `useAuth()` para obter `user`
  2. Usa `useQuery` com queryKey `['chat-assessment', user?.id]` para carregar o assessment mais recente do utilizador da tabela `assessments` (`.order('created_at', { ascending: false }).limit(1).single()`), com `staleTime: 5 * 60 * 1000` e `enabled: !!user?.id`
  3. Usa `useQuery` com queryKey `['chat-messages', assessment?.id]` para carregar mensagens da tabela `messages` ordenadas por `created_at ASC`, limit 50, com `staleTime: 30 * 1000` e `enabled: !!assessment?.id`
  4. Usa `useMutation` para invocar `supabase.functions.invoke('chat-completion', { body: { message, assessmentId: assessment.id } })`, com `onSuccess` que chama `queryClient.invalidateQueries({ queryKey: ['chat-messages', assessment?.id] })`
  5. Retorna `{ assessment, isLoadingAssessment, messages, isLoadingMessages, sendMessage }`
  
  Tipos: usar tipos gerados de `database.types.ts` para os dados retornados.

---

## Fase 4 — Frontend: Actualização do `ChatPage`

- [x] [Frontend] **TASK-010**: Abrir `src/pages/dashboard/ChatPage.tsx`. Remover toda a lógica de `localStorage.getItem('assessmentId')`. Remover qualquer `useEffect` usado para fetch de dados. Substituir pelo hook `useChatData()`. Garantir que o `assessmentId` usado na chamada à Edge Function vem de `assessment.id` (do hook).

- [x] [Frontend] **TASK-011**: Em `ChatPage.tsx`, implementar os seguintes estados de UI:
  1. **Loading assessment** (`isLoadingAssessment`): mostrar spinner ou skeleton centralizado
  2. **Sem assessment** (`!isLoadingAssessment && !assessment`): mostrar card com mensagem "Ainda não tens um diagnóstico" e botão/link para `/quiz`
  3. **Loading mensagens** (`isLoadingMessages`): mostrar skeletons de mensagens (3 linhas de placeholder)
  4. **Chat pronto** (`assessment && !isLoadingMessages`): renderizar lista de mensagens do histórico + input
  5. **Enviando** (`sendMessage.isPending`): desabilitar input e botão de envio, mostrar indicador de loading no botão
  6. **Erro no envio** (`sendMessage.isError`): mostrar mensagem de erro (toast ou inline), reactivar input

- [x] [Frontend] **TASK-012**: Em `ChatPage.tsx`, implementar scroll automático para a última mensagem. Usar `useRef` num elemento `div` no final da lista de mensagens e chamar `ref.current?.scrollIntoView({ behavior: 'smooth' })` via `useEffect` sempre que a lista de `messages` mudar (dependência: `messages`). Garantir que o scroll acontece tanto no carregamento inicial do histórico como após cada nova mensagem.
