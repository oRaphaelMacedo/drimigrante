# Implementation Plan: Chat IA — Correcção e Completude

**Feature ID**: FEAT-007  
**Estimated Effort**: 3–4 horas  
**Risk Level**: Medium (Edge Function em produção; schema existente)

---

## 1. Estratégia de Implementação

A correcção segue uma ordem específica para minimizar risco:

1. **Edge Function primeiro** — corrigir os bugs de backend antes de tocar no frontend
2. **Verificar schema** — confirmar estrutura real das tabelas `assessments` e `messages`
3. **Frontend segundo** — substituir carregamento frágil por queries robustas
4. **Teste end-to-end** — validar fluxo completo antes de considerar done

---

## 2. Fases de Implementação

### Fase 1 — Correcção da Edge Function (Prioridade: Crítica)

**Objectivo**: Fazer a Edge Function compilar e executar correctamente.

#### 1.1 Remover bloco `headers` duplicado

Localizar a linha ~86 do ficheiro `supabase/functions/chat-completion/index.ts` onde existe um segundo bloco de definição de `corsHeaders` ou `headers`. Remover o duplicado, mantendo apenas a definição no topo do ficheiro.

**Padrão correcto**:
```typescript
// Topo do ficheiro — definido UMA VEZ
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
```

#### 1.2 Corrigir nome da tabela

Substituir todas as ocorrências de `assessment_results` por `assessments` na query de contexto.

**Antes**:
```typescript
const { data: assessment } = await supabaseClient
  .from('assessment_results')  // ❌ tabela não existe
  .select(...)
```

**Depois**:
```typescript
const { data: assessment } = await supabaseClient
  .from('assessments')  // ✅ tabela correcta
  .select('id, score, visa_types, answers')
  .eq('id', assessmentId)
  .eq('user_id', userId)
  .single()
```

#### 1.3 Implementar persistência de mensagens

Adicionar dois blocos de `insert` na tabela `messages`:

**Mensagem do utilizador** (antes da chamada OpenAI):
```typescript
await supabaseClient
  .from('messages')
  .insert({
    assessment_id: assessmentId,
    user_id: userId,
    role: 'user',
    content: message,
  })
```

**Resposta da IA** (após receber resposta OpenAI):
```typescript
const { data: assistantMessage } = await supabaseClient
  .from('messages')
  .insert({
    assessment_id: assessmentId,
    user_id: userId,
    role: 'assistant',
    content: aiReply,
  })
  .select('id')
  .single()
```

#### 1.4 Carregar histórico para contexto OpenAI

Antes de chamar OpenAI, carregar as últimas 20 mensagens para incluir no contexto:

```typescript
const { data: history } = await supabaseClient
  .from('messages')
  .select('role, content')
  .eq('assessment_id', assessmentId)
  .order('created_at', { ascending: true })
  .limit(20)

const historyMessages = (history ?? []).map(m => ({
  role: m.role as 'user' | 'assistant',
  content: m.content,
}))
```

#### 1.5 Estrutura final da Edge Function

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Auth
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Parse body
    const { message, assessmentId } = await req.json()
    if (!message || !assessmentId) {
      return new Response(JSON.stringify({ error: 'message and assessmentId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Carregar assessment (tabela correcta: assessments)
    const { data: assessment, error: assessmentError } = await supabaseClient
      .from('assessments')
      .select('id, score, visa_types, answers')
      .eq('id', assessmentId)
      .eq('user_id', user.id)
      .single()

    if (assessmentError || !assessment) {
      return new Response(JSON.stringify({ error: 'Assessment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 5. Carregar histórico de mensagens
    const { data: history } = await supabaseClient
      .from('messages')
      .select('role, content')
      .eq('assessment_id', assessmentId)
      .order('created_at', { ascending: true })
      .limit(20)

    // 6. Persistir mensagem do utilizador
    await supabaseClient
      .from('messages')
      .insert({
        assessment_id: assessmentId,
        user_id: user.id,
        role: 'user',
        content: message,
      })

    // 7. Construir prompt e chamar OpenAI
    const systemPrompt = buildSystemPrompt(assessment)
    const historyMessages = (history ?? []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMessages,
          { role: 'user', content: message },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    })

    if (!openAIResponse.ok) {
      throw new Error(`OpenAI error: ${openAIResponse.status}`)
    }

    const openAIData = await openAIResponse.json()
    const aiReply = openAIData.choices[0].message.content

    // 8. Persistir resposta da IA
    const { data: assistantMessage } = await supabaseClient
      .from('messages')
      .insert({
        assessment_id: assessmentId,
        user_id: user.id,
        role: 'assistant',
        content: aiReply,
      })
      .select('id')
      .single()

    // 9. Retornar resposta
    return new Response(
      JSON.stringify({ reply: aiReply, messageId: assistantMessage?.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('chat-completion error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

function buildSystemPrompt(assessment: {
  score: number | null
  visa_types: unknown
  answers: unknown
}): string {
  return `Você é o Doutor Imigrante, um assistente especializado em imigração para Portugal.
Você está a ajudar um utilizador com base no seu diagnóstico de elegibilidade.

DADOS DO DIAGNÓSTICO:
- Score de elegibilidade: ${assessment.score ?? 'não calculado'}
- Vistos sugeridos: ${JSON.stringify(assessment.visa_types ?? [])}
- Respostas do quiz: ${JSON.stringify(assessment.answers ?? {})}

INSTRUÇÕES:
- Responda sempre em português (pt-PT)
- Seja preciso, empático e profissional
- Baseie as suas respostas no contexto do diagnóstico acima
- Não garanta resultados jurídicos — informe e oriente
- Se não souber algo, diga claramente e sugira consultar um advogado`
}
```

---

### Fase 2 — Verificação do Schema (Prioridade: Alta)

**Objectivo**: Confirmar que as tabelas `assessments` e `messages` têm os campos esperados.

Verificar nas migrations existentes:
- `assessments`: campos `id`, `user_id`, `score`, `visa_types`, `answers`, `created_at`
- `messages`: campos `id`, `assessment_id`, `user_id`, `role`, `content`, `created_at`

Se algum campo estiver em falta, criar migration para adicionar.

**Migration de segurança** (se necessário):
```sql
-- Verificar e adicionar campos em falta na tabela messages
ALTER TABLE messages 
  ADD COLUMN IF NOT EXISTS assessment_id UUID REFERENCES assessments(id),
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  ADD COLUMN IF NOT EXISTS content TEXT;

-- RLS para messages (se não existir)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can read own messages"
  ON messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

### Fase 3 — Correcção do Frontend (Prioridade: Alta)

**Objectivo**: Substituir carregamento frágil de `assessmentId` e adicionar carregamento de histórico.

#### 3.1 Criar hook `useChatData`

Novo ficheiro: `src/hooks/useChatData.ts`

Responsabilidades:
- Carregar o assessment mais recente do utilizador autenticado via TanStack Query
- Carregar o histórico de mensagens via TanStack Query
- Expor mutation `sendMessage` que invoca a Edge Function e invalida queries

```typescript
// src/hooks/useChatData.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useChatData() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // 1. Carregar assessment mais recente
  const {
    data: assessment,
    isLoading: isLoadingAssessment,
  } = useQuery({
    queryKey: ['chat-assessment', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessments')
        .select('id, score, visa_types, answers')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutos
  })

  // 2. Carregar histórico de mensagens
  const {
    data: messages,
    isLoading: isLoadingMessages,
  } = useQuery({
    queryKey: ['chat-messages', assessment?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, role, content, created_at')
        .eq('assessment_id', assessment!.id)
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      return data
    },
    enabled: !!assessment?.id,
    staleTime: 30 * 1000, // 30 segundos
  })

  // 3. Mutation para enviar mensagem
  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke('chat-completion', {
        body: { message, assessmentId: assessment!.id },
      })
      if (error) throw error
      return data as { reply: string; messageId: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', assessment?.id] })
    },
  })

  return {
    assessment,
    isLoadingAssessment,
    messages: messages ?? [],
    isLoadingMessages,
    sendMessage,
  }
}
```

#### 3.2 Actualizar `ChatPage.tsx`

Substituir:
- `localStorage.getItem('assessmentId')` → `assessment.id` do hook
- `useEffect` para fetch de mensagens → `messages` do hook
- Lógica de envio manual → `sendMessage` mutation do hook

Adicionar:
- Estado de loading para assessment e mensagens
- Estado vazio quando não há assessment
- Scroll automático para última mensagem após carregamento do histórico
- Desabilitar input enquanto `sendMessage.isPending`

---

### Fase 4 — Teste End-to-End

**Checklist de validação manual**:

1. Abrir `/dashboard/chat` com utilizador autenticado que tem assessment
2. Verificar que histórico anterior é carregado (se existir)
3. Enviar mensagem → verificar resposta da IA
4. Verificar no Supabase Dashboard que mensagem foi persistida em `messages`
5. Recarregar página → verificar que histórico é mantido
6. Testar com utilizador sem assessment → verificar estado vazio com CTA
7. Verificar no browser DevTools que não há erros de CORS

---

## 3. Dependências e Riscos

### Dependências

| Dependência | Tipo | Notas |
|-------------|------|-------|
| Tabela `messages` existe com campos correctos | Schema | Verificar migrations existentes |
| Tabela `assessments` tem RLS que permite leitura pela Edge Function | RLS | Edge Function usa JWT do utilizador |
| `OPENAI_API_KEY` configurado nos Supabase Secrets | Config | Verificar no painel Supabase |
| `supabase.functions.invoke` disponível no cliente | SDK | Já configurado no projecto |

### Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Tabela `messages` tem schema diferente do esperado | Média | Verificar migrations antes de implementar; criar migration se necessário |
| RLS em `messages` bloqueia Edge Function | Baixa | Edge Function usa JWT do utilizador — RLS aplica-se correctamente |
| `assessments` tem campos com nomes diferentes | Baixa | Verificar `database.types.ts` gerado |

---

## 4. Ordem de Execução

```
Task 1: Verificar schema das tabelas (assessments + messages)
    ↓
Task 2: Criar migration se schema incompleto
    ↓
Task 3: Corrigir Edge Function (syntax error + tabela + persistência)
    ↓
Task 4: Criar hook useChatData
    ↓
Task 5: Actualizar ChatPage.tsx
    ↓
Task 6: Teste end-to-end
```

---

## 5. Ficheiros Afectados

| Ficheiro | Operação | Notas |
|----------|----------|-------|
| `supabase/functions/chat-completion/index.ts` | Modificar | Correcção completa da Edge Function |
| `src/hooks/useChatData.ts` | Criar | Novo hook para dados do chat |
| `src/pages/dashboard/ChatPage.tsx` | Modificar | Usar novo hook, remover localStorage |
| `supabase/migrations/YYYYMMDD_fix_messages_schema.sql` | Criar (se necessário) | Apenas se schema incompleto |