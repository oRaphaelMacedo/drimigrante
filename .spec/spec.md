# Feature Specification: Chat IA — Correcção e Completude

**Version**: 1.0 | **Created**: 2026-05-10 | **Status**: Draft  
**Feature ID**: FEAT-007  
**Priority**: Critical (funcionalidade core quebrada)

---

## 1. Overview

O Chat IA (`/dashboard/chat`) é uma funcionalidade central do produto pago — permite ao utilizador conversar com um assistente IA contextualizado no seu processo de imigração. Actualmente, a feature está completamente não-funcional devido a múltiplos bugs críticos na Edge Function e no frontend. Esta spec define o comportamento correcto esperado e os requisitos de correcção.

---

## 2. Problemas Identificados

### 2.1 Edge Function `chat-completion` — Bugs Críticos

| # | Problema | Localização | Impacto |
|---|----------|-------------|---------|
| 1 | Bloco `headers` duplicado na linha ~86 | `supabase/functions/chat-completion/index.ts` | Syntax error — função não compila/executa |
| 2 | Query a tabela `assessment_results` que não existe | `supabase/functions/chat-completion/index.ts` | Runtime error — contexto do utilizador nunca carregado |
| 3 | Mensagens não persistidas na tabela `messages` | `supabase/functions/chat-completion/index.ts` | Histórico perdido entre sessões |

### 2.2 Frontend `ChatPage` — Bugs de Integração

| # | Problema | Localização | Impacto |
|---|----------|-------------|---------|
| 4 | `assessmentId` carregado via `localStorage` de forma frágil | `src/pages/dashboard/ChatPage.tsx` | Falha silenciosa se localStorage não tiver o valor |
| 5 | Histórico de conversa não carregado do Supabase ao abrir | `src/pages/dashboard/ChatPage.tsx` | Utilizador perde contexto entre sessões |

---

## 3. Comportamento Esperado (After Fix)

### 3.1 Fluxo Completo do Chat

```
1. Utilizador abre /dashboard/chat
2. Frontend carrega assessmentId do Supabase (tabela assessments, filtrado por user_id)
3. Frontend carrega histórico de mensagens da tabela messages (filtrado por assessment_id + user_id)
4. Mensagens anteriores são renderizadas na UI
5. Utilizador escreve mensagem
6. Frontend invoca Edge Function chat-completion com: { message, assessmentId, chatSessionId? }
7. Edge Function:
   a. Valida JWT do utilizador
   b. Carrega contexto do assessment da tabela `assessments` (não assessment_results)
   c. Persiste mensagem do utilizador na tabela `messages`
   d. Chama OpenAI com contexto + histórico recente
   e. Persiste resposta da IA na tabela `messages`
   f. Retorna resposta ao frontend
8. Frontend adiciona resposta à UI
9. Próxima abertura da página: histórico é carregado do Supabase (passo 3)
```

### 3.2 Carregamento do `assessmentId`

**Antes (frágil):**
```typescript
const assessmentId = localStorage.getItem('assessmentId')
```

**Depois (robusto):**
- Usar `useQuery` (TanStack Query) para buscar o assessment mais recente do utilizador autenticado directamente da tabela `assessments` no Supabase
- Fallback para `localStorage` apenas se o utilizador não estiver autenticado (edge case)
- Se não existir assessment, mostrar estado vazio com CTA para fazer o quiz

### 3.3 Persistência de Mensagens

A tabela `messages` (já existente no schema) deve ser usada para:
- Guardar cada mensagem do utilizador (`role: 'user'`)
- Guardar cada resposta da IA (`role: 'assistant'`)
- Associar mensagens ao `assessment_id` e `user_id`

### 3.4 Histórico de Conversa

Ao abrir `/dashboard/chat`:
- Carregar as últimas N mensagens (ex: 50) da tabela `messages` ordenadas por `created_at ASC`
- Renderizar na UI antes de qualquer nova interacção
- Scroll automático para a mensagem mais recente

---

## 4. Schema de Dados Relevante

### 4.1 Tabela `assessments` (existente)

```sql
-- Campos relevantes para o contexto da IA
assessments.id              -- UUID, PK
assessments.user_id         -- UUID, FK → profiles
assessments.score           -- integer
assessments.visa_types      -- jsonb (vistos sugeridos)
assessments.answers         -- jsonb (respostas do quiz)
assessments.created_at      -- timestamptz
```

### 4.2 Tabela `messages` (existente)

```sql
messages.id                 -- UUID, PK
messages.assessment_id      -- UUID, FK → assessments
messages.user_id            -- UUID, FK → profiles
messages.role               -- text ('user' | 'assistant' | 'system')
messages.content            -- text
messages.created_at         -- timestamptz
```

### 4.3 Tabela `chat_sessions` (existente, opcional no MVP)

```sql
chat_sessions.id            -- UUID, PK
chat_sessions.assessment_id -- UUID, FK → assessments
chat_sessions.user_id       -- UUID, FK → profiles
chat_sessions.created_at    -- timestamptz
```

> **Nota**: No MVP, o chat não usa sessões múltiplas — uma conversa por assessment. `chat_sessions` pode ser ignorada na correcção inicial.

---

## 5. Edge Function — Comportamento Correcto

### 5.1 Request Shape

```typescript
// POST /functions/v1/chat-completion
{
  message: string;          // Mensagem do utilizador
  assessmentId: string;     // UUID do assessment
}
```

### 5.2 Response Shape

```typescript
// 200 OK
{
  reply: string;            // Resposta da IA
  messageId: string;        // UUID da mensagem persistida
}

// 4xx/5xx
{
  error: string;
}
```

### 5.3 Lógica da Edge Function (Pseudocódigo)

```
1. Parse CORS preflight (OPTIONS → return 200 com headers)
2. Verificar JWT → obter user_id
3. Parse body → { message, assessmentId }
4. Validar inputs (message não vazio, assessmentId é UUID válido)
5. Carregar assessment da tabela `assessments` WHERE id = assessmentId AND user_id = userId
   → Se não encontrado: return 404
6. Carregar últimas 20 mensagens de `messages` WHERE assessment_id = assessmentId ORDER BY created_at ASC
7. Persistir mensagem do utilizador em `messages` (role: 'user')
8. Construir prompt do sistema com contexto do assessment (score, visa_types, answers)
9. Chamar OpenAI chat completions com:
   - system prompt (contexto do caso)
   - histórico de mensagens (últimas 20)
   - nova mensagem do utilizador
10. Persistir resposta da IA em `messages` (role: 'assistant')
11. Return { reply, messageId }
```

### 5.4 Headers CORS — Estrutura Correcta

```typescript
// ÚNICO bloco de headers — definido uma vez, reutilizado
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Handler OPTIONS
if (req.method === 'OPTIONS') {
  return new Response('ok', { headers: corsHeaders })
}

// Todas as respostas incluem corsHeaders
return new Response(JSON.stringify(data), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  status: 200,
})
```

---

## 6. Frontend — Comportamento Correcto

### 6.1 Hook `useChatMessages`

Novo hook (ou lógica integrada em `ChatPage`) responsável por:

```typescript
// Carregar assessment do utilizador autenticado
const { data: assessment } = useQuery({
  queryKey: ['assessment', user?.id],
  queryFn: () => supabase
    .from('assessments')
    .select('id, score, visa_types, answers')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single(),
  enabled: !!user?.id,
})

// Carregar histórico de mensagens
const { data: messages } = useQuery({
  queryKey: ['messages', assessment?.id],
  queryFn: () => supabase
    .from('messages')
    .select('*')
    .eq('assessment_id', assessment.id)
    .order('created_at', { ascending: true })
    .limit(50),
  enabled: !!assessment?.id,
})
```

### 6.2 Mutation `sendMessage`

```typescript
const sendMessage = useMutation({
  mutationFn: async (message: string) => {
    const { data } = await supabase.functions.invoke('chat-completion', {
      body: { message, assessmentId: assessment.id },
    })
    return data
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['messages', assessment?.id] })
  },
})
```

### 6.3 Estados da UI

| Estado | Condição | UI |
|--------|----------|----|
| Loading assessment | `isLoadingAssessment` | Skeleton / spinner |
| Sem assessment | `!assessment` | Card com CTA "Fazer o Quiz" |
| Loading histórico | `isLoadingMessages` | Skeleton de mensagens |
| Chat pronto | `assessment && messages` | Interface de chat normal |
| Enviando mensagem | `sendMessage.isPending` | Input desabilitado + spinner no botão |
| Erro no envio | `sendMessage.isError` | Toast de erro + input reactivado |

---

## 7. Critérios de Aceitação

- [ ] Edge Function compila sem erros de sintaxe
- [ ] Edge Function consulta tabela `assessments` (não `assessment_results`)
- [ ] Cada mensagem enviada é persistida na tabela `messages` com `role: 'user'`
- [ ] Cada resposta da IA é persistida na tabela `messages` com `role: 'assistant'`
- [ ] Ao abrir `/dashboard/chat`, mensagens anteriores são carregadas e renderizadas
- [ ] `assessmentId` é obtido do Supabase (não apenas do localStorage)
- [ ] Se utilizador não tem assessment, UI mostra estado vazio com CTA
- [ ] CORS funciona correctamente (sem erros de CORS no browser)
- [ ] Erros da Edge Function são tratados graciosamente no frontend

---

## 8. Fora de Scope

- Streaming de respostas (OpenAI streaming) — Phase 2
- Múltiplas sessões de chat por assessment — Phase 2
- Upload de documentos no chat — Phase 2
- Notificações em tempo real (Supabase Realtime) — Phase 2
- Rate limiting por utilizador — Phase 2