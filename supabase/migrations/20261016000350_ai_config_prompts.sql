-- =====================================================================
-- 20261016000350_ai_config_prompts.sql
-- DI-008 / DI-017: prompts de ai_configurations em pt-BR, sem persona.
--
-- Antes: 'analysis' se apresentava como "Dra. Sofia, a senior Portuguese immigration
-- lawyer" e pedia pt-PT; 'chat' e 'scoring' também em inglês/pt-PT. Agora o banco
-- guarda só o tom e o estilo; as regras fixas (sem persona, sem promessas, pt-BR,
-- vias de nacionalidade) ficam no código (_shared/prompts.ts) e vêm antes deste texto.
--
-- Também alinha modelo e max_tokens aos limites que as Edge Functions aplicam
-- (_shared/ai-config.ts): allowlist gpt-4o-mini / gpt-4.1-mini / gpt-4.1-nano,
-- análise até 2000 tokens, chat até 1000.
--
-- Funções dependentes: generate-explanation e chat-completion (deploy no mesmo release).
-- As funções novas funcionam com ou sem esta migration (clamp no código); a ordem
-- recomendada é aplicar esta migration junto com o deploy delas.
--
-- Idempotente: pode rodar mais de uma vez. Sobrescreve o system_prompt atual
-- desses 3 casos de uso (o texto antigo fica registrado em audit_log pelo trigger
-- audit_ai_config_changes).
-- =====================================================================

UPDATE public.ai_configurations
SET system_prompt = $prompt$Escreva com tom acolhedor, claro e honesto, em português do Brasil. Explique termos técnicos em linguagem simples, sem jargão jurídico desnecessário, e priorize o que a pessoa precisa fazer a seguir. Seja direto sobre as dificuldades sem desanimar e não use personagem.$prompt$
WHERE use_case = 'analysis';

UPDATE public.ai_configurations
SET system_prompt = $prompt$Responda com tom acolhedor e objetivo, em português do Brasil, em poucos parágrafos curtos ou listas. Explique termos técnicos em linguagem simples e, quando fizer sentido, indique o próximo passo prático. Não use personagem.$prompt$
WHERE use_case = 'chat';

UPDATE public.ai_configurations
SET system_prompt = $prompt$Você avalia respostas de um questionário sobre nacionalidade portuguesa e devolve apenas JSON estruturado com a pontuação de elegibilidade. Não use personagem.$prompt$
WHERE use_case = 'scoring';

-- Modelo fora da allowlist volta ao padrão barato.
UPDATE public.ai_configurations
SET model = 'gpt-4o-mini'
WHERE provider = 'openai'
  AND model NOT IN ('gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano');

-- Tetos de max_tokens iguais aos aplicados no código.
UPDATE public.ai_configurations
SET max_tokens = LEAST(GREATEST(COALESCE(max_tokens, 2000), 256), 2000)
WHERE use_case = 'analysis'
  AND (max_tokens IS NULL OR max_tokens < 256 OR max_tokens > 2000);

UPDATE public.ai_configurations
SET max_tokens = LEAST(GREATEST(COALESCE(max_tokens, 1000), 100), 1000)
WHERE use_case IN ('chat', 'scoring', 'document_extraction')
  AND (max_tokens IS NULL OR max_tokens < 100 OR max_tokens > 1000);

-- Disjuntor AI_HOURLY_CAP: generate-explanation conta as gerações da última hora
-- em audit_log (action = 'ai_generation'). Índice parcial para essa contagem.
CREATE INDEX IF NOT EXISTS idx_audit_log_ai_generation_created
  ON public.audit_log (created_at DESC)
  WHERE action = 'ai_generation';

-- ─── Verificação (rodar manualmente, só leitura) ─────────────────────────────
-- SELECT use_case, model, max_tokens, left(system_prompt, 80) FROM public.ai_configurations ORDER BY use_case;
-- Nenhuma linha deve conter 'lawyer', 'Dra.' ou 'pt-PT':
-- SELECT count(*) FROM public.ai_configurations
--  WHERE system_prompt ILIKE '%lawyer%' OR system_prompt ILIKE '%Dra.%' OR system_prompt ILIKE '%pt-PT%';
