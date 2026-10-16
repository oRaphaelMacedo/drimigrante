# Cards — Doutor Imigrante

> Gerado a partir da auditoria multi-agente de 2026-10-15/16 (9 dimensões, 169 achados verificados → 89 cards) e do estado real da implementação na branch `feat/mobile-ux-retencao`. Nada aqui foi aplicado em produção, exceto o hotfix de segurança registado abaixo.

**Estado:** 79 feitos · 10 parciais · 0 não feitos · 0 a fazer — total 89

**Legenda de custo/produção:** `—` só código · 👤 exige ação do dono (painel/segredo/decisão) · 🚀 exige aplicar migration/deploy em produção · 💶 gasta dinheiro

## Hotfix aplicado em produção (2026-10-16, autorizado pelo dono)

- `public.is_hub_user()` passou a decidir por papel (`super_admin`/`hub_admin` em `user_roles`) — antes, todo cliente era tratado como admin do HUB (DI-001). Verificado: 1 conta passa no teste.
- Conta `dev@drimigrante.test` bloqueada (`banned_until = infinity`) — a senha estava publicada no repositório público (DI-003).

## Resumo executivo da auditoria

Consolidei 169 cards de 9 dimensões em 89 cards (DI-001 a DI-089) e 27 pacotes distribuídos em 4 ondas. Nenhum arquivo do repositório foi alterado.
Diagnóstico: o MVP está em produção, mas tem cinco grupos de falhas graves:
1) Segurança. `is_hub_user` faz de todo cliente um admin do HUB (com isso, qualquer pessoa lê a PII de todos e concede a si mesma acesso pago). Também: o e-mail do perfil é editável, o que permite sequestrar uma compra; a `e2e-login` em produção funciona como backdoor; e a `generate-explanation` é pública e entrega a análise de €30 de graça.
2) O produto pago está errado. O quiz em produção mostra as perguntas de todos os casos porque as `display_conditions` foram perdidas. O score do servidor sai sempre 0/'baixa' (erro PGRST201). A IA recomenda 'Visto D7' a quem busca nacionalidade. A página da análise paga cai sempre num texto genérico de visto.
3) Promessas falsas na compra: advogados, 24h, garantia, 'Válido para sempre', 'Mais popular'. Além disso, o chat prometido no €30 não é liberado e gera um loop silencioso.
4) O funil 1-clique quebra fora do /results: quem cancela no Stripe cai num login, a página de sucesso é frágil e 100% dos e-mails falham porque o domínio do Resend não está verificado.
5) No celular falta tudo o que faz voltar e comprar: CTA fixo, barra de navegação no dashboard, prazo de 30 dias visível, retomada do quiz, inputs de 16px, ícones PWA.
Plano: a onda 1 cria as fundações (lint, Vitest, fontes de verdade da oferta, componentes de UI, auth/acesso, analytics consentido) e reescreve o backend de segurança e de pagamentos como código e migrations NÃO aplicadas. As ondas 2 e 3 refazem o funil mobile (quiz, resultado, compra, dashboard), a análise paga e a retenção. A onda 4 faz a varredura visual e de idioma, LGPD e e-mails de ciclo de vida em dry-run.
Direção visual escolhida: 'Azulejo' (cobalto #1f41c7, âmbar #fdba2f só no CTA de compra, Literata + Figtree).
Nada aqui gasta dinheiro. O que toca produção (migrations, deploy das functions, merge na main, DNS do Resend, Stripe) está em acoes_manuais_dono, com a ordem de aplicação.

## Quadro por onda e pacote

### Onda 1

| Pacote | Cards | Integrado |
|---|---|---|
| **W1-01** Base de engenharia e fontes de verdade | DI-057✅ DI-058✅ DI-085✅ DI-009✅ | sim |
| **W1-02** Segurança do banco e isolamento de testes | DI-001✅ DI-003✅ DI-023✅ DI-059🟡 | sim |
| **W1-03** Pagamentos Stripe no servidor | DI-002✅ DI-012✅ DI-019✅ DI-020✅ DI-021✅ DI-022✅ | sim |
| **W1-04** IA e e-mail no servidor | DI-004✅ DI-008✅ DI-014🟡 DI-017✅ | sim |
| **W1-05** Motor do quiz | DI-005✅ DI-065✅ DI-066✅ DI-067✅ | sim |
| **W1-06** Autenticação e regras de acesso | DI-025✅ DI-027✅ | sim |
| **W1-07** Observabilidade, erros e cabeçalhos | DI-054✅ DI-055🟡 DI-056✅ DI-061✅ | sim |
| **W1-08** Fundação de UI e PWA | DI-063✅ DI-044✅ DI-064✅ | sim |

### Onda 2

| Pacote | Cards | Integrado |
|---|---|---|
| **W2-01** Identidade visual Azulejo | DI-062✅ | sim |
| **W2-02** Functions: motor de elegibilidade e higiene | DI-006✅ DI-082✅ | sim |
| **W2-03** Quiz mobile: fluxo e navegação | DI-039✅ DI-040✅ DI-041✅ DI-042✅ DI-068✅ | sim |
| **W2-04** Compra em 1 clique | DI-011✅ DI-010✅ DI-032✅ DI-026✅ DI-033🟡 | sim |
| **W2-05** Dashboard: navegação, acesso e upsell | DI-045✅ DI-013✅ DI-046✅ DI-047✅ DI-048✅ | sim |
| **W2-06** Análise paga de verdade | DI-007✅ DI-016✅ DI-050✅ | sim |
| **W2-07** CI, documentação e ambiente | DI-060🟡 DI-084🟡 | sim |
| **W2-08** Navegação pública e modo foco | DI-038✅ | sim |

### Onda 3

| Pacote | Cards | Integrado |
|---|---|---|
| **W3-01** Resultado que converte | DI-029✅ DI-070✅ DI-028✅ DI-030✅ DI-031✅ DI-024✅ | sim |
| **W3-02** Landing que converte | DI-034✅ DI-035✅ DI-036✅ DI-076✅ | sim |
| **W3-03** Quiz: captura, lista de espera e acessibilidade | DI-037✅ DI-043✅ DI-069✅ | sim |
| **W3-04** Retenção na área logada | DI-049✅ DI-071✅ DI-052🟡 DI-078✅ DI-072✅ | sim |
| **W3-05** Análise sob demanda e chat no celular | DI-018✅ DI-051✅ | sim |
| **W3-06** Hardening do banco e processo de release | DI-081✅ DI-015✅ | sim |
| **W3-07** E2E do modelo P0 | DI-086✅ | sim |

### Onda 4

| Pacote | Cards | Integrado |
|---|---|---|
| **W4-01** Ganchos de retorno | DI-053✅ | sim |
| **W4-02** E-mails do ciclo de vida (dry-run) | DI-077✅ | sim |
| **W4-03** LGPD/RGPD | DI-083✅ | sim |
| **W4-04** Varredura do funil público: visual e idioma | DI-079✅ DI-074🟡 DI-075✅ | sim |
| **W4-05** Varredura do dashboard e admin + dívida técnica | DI-080✅ DI-073✅ DI-088🟡 | sim |
| **W4-06** Stripe Checkout e higiene do repositório | DI-087✅ DI-089🟡 | sim |

## Todos os cards

| ID | P | Esforço | Título | Estado | Custo/produção | Depende de |
|---|---|---|---|---|---|---|
| DI-001 | P0 | L | RLS: is_hub_user trata todo cliente como admin do HUB | ✅ Feito | 🚀 aplicar em produção | — |
| DI-002 | P0 | M | Sequestro de compra: profiles.email e tenant_id editáveis, e o webhook resolve o comprador por profiles.email | ✅ Feito | 🚀 aplicar em produção | — |
| DI-003 | P0 | M | Credenciais de teste em produção: backdoor e2e-login e senha publicada no TESTING.md | ✅ Feito | 🚀 aplicar em produção | — |
| DI-004 | P0 | M | generate-explanation e compute-eligibility públicas: análise paga na resposta, custo OpenAI sem limite e e-mail repetido | ✅ Feito | 🚀 aplicar em produção | — |
| DI-005 | P0 | M | Quiz em produção mostra perguntas de todos os casos (display_conditions sem answer_contains/any) e o editor do admin quebra | ✅ Feito | — | — |
| DI-006 | P0 | M | Score do servidor sempre 0/'baixa' (PGRST201) e fórmula diferente da do cliente: motor de elegibilidade único | ✅ Feito | 🚀 aplicar em produção | DI-005, DI-067, DI-058, DI-008 |
| DI-007 | P0 | L | Análise paga mostra texto genérico de visto e fica vazia em outro aparelho | ✅ Feito | — | DI-009 |
| DI-008 | P0 | M | Prompt da análise IA: chaves inexistentes, 'Visto D7', português europeu e persona 'Dra. Sofia' | ✅ Feito | 🚀 aplicar em produção | — |
| DI-009 | P0 | S | Fonte única da oferta, dos contatos e da identificação legal + Termos coerentes | ✅ Feito | 👤 ação do dono | — |
| DI-010 | P0 | S | Telas de compra sem promessas falsas (advogados, 24h, garantia, 'Mais popular', assinatura) | ✅ Feito | — | DI-009 |
| DI-011 | P0 | M | /checkout quebra o funil 1-clique: cancelado ou anônimo vai para login | ✅ Feito | — | DI-009 |
| DI-012 | P0 | S | Chat incluso no €30: liberar has_chat_access no pagamento único | ✅ Feito | 👤 ação do dono | — |
| DI-013 | P0 | S | Chat sem acesso: acabar com o redirecionamento silencioso e mostrar o upsell na página | ✅ Feito | — | DI-012, DI-025, DI-063 |
| DI-014 | P0 | S | E-mails transacionais 100% falhando (domínio não verificado no Resend) sem ninguém saber | 🟡 Parcial | 👤 ação do dono | — |
| DI-015 | P0 | M | Deriva de deploy: backend P0 em produção com frontend antigo na main; processo de release | ✅ Feito | 🚀 aplicar em produção | DI-059, DI-060 |
| DI-016 | P1 | M | Paywall da análise completa aplicado no servidor (has_active_access e get_full_analysis) | ✅ Feito | 🚀 aplicar em produção | DI-001 |
| DI-017 | P1 | M | chat-completion sem gate de pagamento, sem limites e com o histórico errado | ✅ Feito | 🚀 aplicar em produção | — |
| DI-018 | P1 | M | Análise completa gerada só depois do pagamento, sob demanda e autenticada | ✅ Feito | 🚀 aplicar em produção | DI-004, DI-016 |
| DI-019 | P1 | S | create-checkout-session: cancel_url para /results, sem recompra, sem customer antecipado | ✅ Feito | 🚀 aplicar em produção | — |
| DI-020 | P1 | M | stripe-webhook: payment_status, reembolso/disputa, idempotência atômica, erros e payload mínimo | ✅ Feito | 🚀 aplicar em produção | — |
| DI-021 | P1 | S | Upsell €4,90: subscription_data.cancel_at não existe no Checkout, mover o limite de 12 ciclos para o webhook | ✅ Feito | 🚀 aplicar em produção | — |
| DI-022 | P1 | S | claim-session: token de login reutilizável e session_id do Stripe vazando | ✅ Feito | 🚀 aplicar em produção | — |
| DI-023 | P1 | S | Upload de documentos quebrado: bucket user-documents sem policies e sem limites | ✅ Feito | 🚀 aplicar em produção | — |
| DI-024 | P1 | M | Link de retomada do resultado entre aparelhos (token opaco) | ✅ Feito | 🚀 aplicar em produção | DI-014, DI-011 |
| DI-025 | P1 | M | AuthContext: refreshUser, falha ≠ 'sem assinatura', regras de acesso testáveis e redirecionamentos corretos | ✅ Feito | — | — |
| DI-026 | P1 | M | Página de sucesso à prova de falha | ✅ Feito | — | DI-025, DI-054 |
| DI-027 | P1 | M | Login e retorno por link: callback robusto, deep link e login pensado para celular | ✅ Feito | — | — |
| DI-028 | P1 | M | Resultado: CTA de compra fixo no celular e ScoreCard compacto | ✅ Feito | — | DI-063, DI-011, DI-032 |
| DI-029 | P1 | S | Resultado: apresentação única por categoria (sem '?', '+', '~' e iguais no reload) | ✅ Feito | — | — |
| DI-030 | P1 | M | Resultado: oferta personalizada por categoria e caminho, com o que se recebe e mini-FAQ | ✅ Feito | — | DI-009, DI-010 |
| DI-031 | P1 | S | Resultado: e-mail de acesso visível e editável antes de pagar | ✅ Feito | — | DI-011 |
| DI-032 | P1 | M | Erros do botão de compra: português claro, timeout, repersistência e toasts no lugar certo | ✅ Feito | — | — |
| DI-033 | P1 | S | Eventos da compra: paywall visto, checkout, cancelamento e purchase sem duplicação | 🟡 Parcial | — | DI-054 |
| DI-034 | P1 | M | Landing reposicionada para nacionalidade, com preço único e sem promessas falsas | ✅ Feito | — | DI-009, DI-062 |
| DI-035 | P1 | M | Landing: CTA fixo no celular, FAQ de objeções e 'quem somos' só com dados reais | ✅ Feito | — | DI-063, DI-009 |
| DI-036 | P1 | S | Banner de cookies cobre o CTA do hero e tem botões desiguais | ✅ Feito | — | — |
| DI-037 | P1 | S | Lista de espera 'Em breve' perde todos os e-mails e estoura a largura | ✅ Feito | — | — |
| DI-038 | P1 | M | Navegação pública: rolagem restaurada, âncoras, menu mobile e modo foco no funil | ✅ Feito | — | — |
| DI-039 | P1 | M | Quiz: barra fixa na zona do polegar, auto-avanço e topo da pergunta ao avançar | ✅ Feito | — | DI-063, DI-005 |
| DI-040 | P1 | S | Quiz: progresso honesto ('Pergunta 1 de 1' e 'Concluir' na primeira tela) | ✅ Feito | — | DI-005 |
| DI-041 | P1 | M | Quiz: retomada real, sessão nova depois do envio e voltar do celular entre perguntas | ✅ Feito | — | — |
| DI-042 | P1 | S | Quiz: processamento sem esperar a OpenAI e envio só das respostas visíveis | ✅ Feito | — | DI-004, DI-067 |
| DI-043 | P1 | S | Formulário de captura: sem zoom, validação única, voltar, privacidade e opt-in | ✅ Feito | — | DI-039 |
| DI-044 | P1 | S | Inputs com 16px ou mais em todo o app (anti-zoom do iOS) | ✅ Feito | — | — |
| DI-045 | P1 | M | Dashboard no celular: barra de navegação inferior e logout seguro | ✅ Feito | — | DI-063 |
| DI-046 | P1 | M | Home do dashboard por estado de acesso: não pagante, ativo, perto de expirar e expirado | ✅ Feito | — | DI-025, DI-063 |
| DI-047 | P1 | S | Upsell €4,90 honesto, no momento certo e confirmado depois da assinatura | ✅ Feito | — | DI-025, DI-012 |
| DI-048 | P1 | S | Linha do tempo com dados reais e boas-vindas depois da compra | ✅ Feito | — | — |
| DI-049 | P1 | L | Checklist de próximos passos por via, ligado ao upload | ✅ Feito | — | DI-007, DI-023 |
| DI-050 | P1 | M | Análise legível no celular: markdown, seções recolhíveis e PDF | ✅ Feito | — | DI-085, DI-008 |
| DI-051 | P1 | M | Chat no celular: altura dvh, 16px, sugestões, histórico mais recente e erro sem perder o texto | ✅ Feito | — | DI-017, DI-045, DI-050 |
| DI-052 | P1 | M | Definições: 'Meu plano', cancelamento self-service, sessões reais e perfil atualizado | 🟡 Parcial | 👤 ação do dono | DI-046, DI-025 |
| DI-053 | P1 | M | Ganchos de retorno: visitante reconhecido, pagante em /results e partilha com a família | ✅ Feito | — | DI-024, DI-025 |
| DI-054 | P1 | M | Analytics: taxonomia tipada, dedupe, identify, atribuição e bloqueio em dev/E2E | ✅ Feito | — | — |
| DI-055 | P1 | M | Sentry e PostHog: consentimento, máscara de PII e carregamento tardio | 🟡 Parcial | — | — |
| DI-056 | P1 | S | Erros de rota e de chunk após deploy: errorElement, preloadError, 404 real e future flags | ✅ Feito | — | — |
| DI-057 | P1 | S | Restaurar o ESLint (config 8) | ✅ Feito | — | — |
| DI-058 | P1 | S | Vitest e primeiros testes da lógica pura | ✅ Feito | — | — |
| DI-059 | P1 | S | supabase/config.toml com verify_jwt por função e seed local | 🟡 Parcial | — | — |
| DI-060 | P1 | L | CI com gates e E2E fora da produção (Supabase local) | 🟡 Parcial | — | DI-059, DI-057, DI-058, DI-003 |
| DI-061 | P1 | S | Cabeçalhos de segurança no vercel.json (CSP em Report-Only) | ✅ Feito | — | — |
| DI-062 | P1 | L | Identidade visual 'Azulejo': tokens, fontes, escala tipográfica e movimento | ✅ Feito | — | DI-063, DI-085 |
| DI-063 | P1 | M | Componentes base em src/components/ui | ✅ Feito | — | — |
| DI-064 | P1 | S | PWA instalável: favicon, ícones, manifest em pt e um único theme-color | ✅ Feito | — | — |
| DI-065 | P1 | S | Textos do quiz prometem advogado e serviços que não existem | ✅ Feito | — | — |
| DI-066 | P2 | S | Quiz fica em branco se a busca das perguntas falhar | ✅ Feito | — | — |
| DI-067 | P2 | S | Respostas de ramos ocultos continuam visíveis e pontuadas | ✅ Feito | — | — |
| DI-068 | P2 | S | Eventos por etapa do quiz | ✅ Feito | — | DI-054 |
| DI-069 | P2 | M | Acessibilidade do quiz e dos formulários | ✅ Feito | — | DI-039, DI-040 |
| DI-070 | P2 | S | Teaser de caminhos: nacionalidade, o mais forte primeiro e blur acessível | ✅ Feito | — | — |
| DI-071 | P2 | M | Documentos no celular: validação, status honesto e alvos de 44px | ✅ Feito | — | DI-023, DI-007 |
| DI-072 | P2 | S | Eventos da área logada | ✅ Feito | — | DI-054 |
| DI-073 | P2 | S | Admin no celular: menu e overflow horizontal | ✅ Feito | — | — |
| DI-074 | P2 | M | Idioma único pt-BR em todo o funil | 🟡 Parcial | 👤 ação do dono | — |
| DI-075 | P2 | S | Atritos de entrada: intro duplicada e caso_tipo sem 'Nenhuma destas' | ✅ Feito | 👤 ação do dono | DI-005 |
| DI-076 | P2 | S | SEO por rota: title, canonical, noindex e og:image | ✅ Feito | — | — |
| DI-077 | P2 | L | E-mails do ciclo de vida com consentimento, descadastro e dry-run | ✅ Feito | 🚀 aplicar em produção | DI-014, DI-024, DI-043, DI-006 |
| DI-078 | P2 | S | Convite para instalar o app no dashboard | ✅ Feito | — | DI-064 |
| DI-079 | P2 | L | Varredura visual do funil público: tokens semânticos, contraste AA e tipografia | ✅ Feito | — | DI-062 |
| DI-080 | P2 | M | Varredura do dashboard e admin: tokens, contraste e pt-BR | ✅ Feito | — | DI-062 |
| DI-081 | P2 | M | Hardening do banco: advisors e RPCs anônimas | ✅ Feito | 🚀 aplicar em produção | DI-001, DI-016 |
| DI-082 | P2 | M | Edge functions: CORS com allowlist, versões fixas, erros reportados e runbook | ✅ Feito | 🚀 aplicar em produção | DI-059 |
| DI-083 | P2 | L | LGPD/RGPD: exclusão e exportação de conta, retenção aplicada e minimização | ✅ Feito | 🚀 aplicar em produção | DI-001 |
| DI-084 | P2 | M | Documentação normativa e variáveis de ambiente | 🟡 Parcial | — | DI-012 |
| DI-085 | P2 | S | Gerenciador de pacotes único, Node fixo, vulnerabilidades e dependências das próximas ondas | ✅ Feito | — | — |
| DI-086 | P2 | M | Specs E2E do modelo P0 (one_time, expiração, auto-login) e Android | ✅ Feito | — | DI-060, DI-012, DI-046 |
| DI-087 | P3 | S | Stripe Checkout: locale, código promocional sob flag e texto de reforço | ✅ Feito | 🚀 aplicar em produção | DI-009 |
| DI-088 | P3 | M | Dívida: casts as any, código morto e lint estrito | 🟡 Parcial | — | DI-057 |
| DI-089 | P3 | S | Higiene do repositório: branches, worktree, seed script e telemetria versionada | 🟡 Parcial | 👤 ação do dono | DI-060 |

## Detalhe dos cards

<details><summary><b>DI-001</b> [P0] RLS: is_hub_user trata todo cliente como admin do HUB — ✅ Feito</summary>

- **Área:** backend/banco · **Tipo:** seguranca · **Esforço:** L · **Pacote:** W1-02 · **Mobile:** não
- **Problema:** is_hub_user decide pelo tipo do tenant e handle_new_user põe todos os usuários no único tenant 'hub'. Com isso, qualquer conta lê PII e análises de todos, faz UPDATE na própria subscription (acesso pago grátis) e altera ai_configurations, tenants, crm e cases.
- **Evidência:** Produção: 1 tenant tipo 'hub' com 102 profiles; pg_get_functiondef(is_hub_user) filtra t.type='hub'; subscriptions_self_update USING is_hub_user; 'Admins can manage AI configs' ALL; 25 policies usam is_hub_user. supabase/migrations/20260108000000_initial_schema.sql:984-1056. Sem sinal de abuso.
- **Proposta:** Migration 20261016000000_fix_is_hub_user_rls.sql: is_hub_user por papel (super_admin/hub_admin em user_roles, não expirado, search_path fixo); novas is_staff_user e can_access_tenant. Recriar com o padrão staff as policies profiles_self_read, tenants_read, crm_*, cases_*, case_applicants_read, case_tasks_read, case_documents_read (tabela), case_messages_read e storage case_documents_*. subscriptions passa a aceitar UPDATE só de hub. Validar em Supabase local.
- **Critérios de aceite:**
  - Em produção, só o super_admin passa em is_hub_user (SELECT count = 1)
  - Com JWT de cliente local: GET profiles retorna 1 linha; payment_events, email_send_log e audit_log retornam []; PATCH em subscriptions e ai_configurations altera 0 linhas
  - O super_admin continua vendo /admin, leads e pipeline
- **Arquivos:** `supabase/migrations/20261016000000_fix_is_hub_user_rls.sql`
- **Nota para o dono:** Aplicar em produção depois de validar localmente. Revisar logs REST para avaliar a obrigação de notificação RGPD.
- **Implementação:** ✅ Feito no pacote W1-02 (onda 1). Migration 20261016000000_fix_is_hub_user_rls.sql (NÃO aplicada). is_hub_user passa a usar o papel super_admin/hub_admin não expirado; foram criadas is_staff_user, can_access_tenant(uid,tenant) e can_access_tenant_folder; is_hub_admin passa a delegar a is_hub_user; get_user_tenant_id ganhou search_path fixo. Policies recriadas no padrão staff: profiles_self_read/update, tenants_read/hub_write, crm_leads_*, crm_activity_*, cases_read/write, case_applicants/documents/tasks/messages_read e storage case_documents_*. subscriptions_self_update ficou só para o HUB (USING + WITH CHECK). Extra: um trigger impede o cliente de alterar id/tenant_id/email/is_active do próprio perfil, porque stripe-webhook e claim-session resolvem o usuário por profiles.email. A migration é idempotente (reaplicada sem erro) e compatível com um hotfix CREATE OR REPLACE desde que o parâmetro continue se chamando _user_id. Validado no Supabase local, com o mesmo script antes e depois. Antes: 21/37 (cliente via 3 profiles, alterava a própria subscription, ai_configurations e tenants, is_hub_user=true). Depois: 37/37 (cliente vê 1 profile; payment_events, email_send_log e audit_log retornam []; PATCH em subscriptions/ai_configurations/tenants altera 0 linhas; super_admin vê todos os profiles, assessments e subscriptions e altera crm_stage). office_admin num tenant de escritório só vê os leads do próprio tenant. Nenhuma policy usa mais get_user_tenant_id. O critério 'em produção count=1' depende do dono aplicar a migration; com o seed local deu count=1.

</details>

<details><summary><b>DI-002</b> [P0] Sequestro de compra: profiles.email e tenant_id editáveis, e o webhook resolve o comprador por profiles.email — ✅ Feito</summary>

- **Área:** backend/pagamentos · **Tipo:** seguranca · **Esforço:** M · **Pacote:** W1-03 · **Mobile:** não
- **Problema:** O cliente pode trocar profiles.email para o e-mail de outra pessoa. Na próxima compra anônima dessa pessoa, o webhook concede o acesso ao atacante e o claim-session da vítima falha. E-mails duplicados geram retry infinito no Stripe.
- **Evidência:** column_privileges: authenticated tem UPDATE em profiles.email, tenant_id e is_active; não há UNIQUE em email. stripe-webhook/index.ts:95-114 e claim-session/index.ts:80-87 fazem .eq('email').maybeSingle().
- **Proposta:** Migration 20261016000100_profiles_hardening_email_resolver.sql: REVOKE UPDATE em profiles e GRANT por coluna (full_name, phone, avatar_url, language, timezone, notification_preferences, updated_at); índice único em lower(email); RPC get_auth_user_id_by_email só para service_role; trigger que sincroniza o e-mail a partir de auth.users. stripe-webhook e claim-session resolvem o usuário pelo RPC.
- **Critérios de aceite:**
  - PATCH em profiles {email} ou {tenant_id} com JWT de cliente → permission denied; {full_name} funciona
  - stripe-webhook e claim-session não consultam profiles por e-mail (grep)
  - SettingsPage continua salvando o perfil
- **Arquivos:** `supabase/migrations/20261016000100_profiles_hardening_email_resolver.sql`, `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/claim-session/index.ts`
- **Nota para o dono:** Migration e deploy das duas functions com --no-verify-jwt (ou via config.toml).
- **Implementação:** ✅ Feito no pacote W1-03 (onda 1). Migration 000100: REVOKE INSERT/UPDATE/DELETE/TRUNCATE em profiles para anon/authenticated; GRANT UPDATE só em full_name, phone, avatar_url, language, timezone, notification_preferences e updated_at; ressincroniza profiles.email a partir de auth.users; índice único em lower(email), com checagem prévia que aborta se houver duplicados; RPC get_auth_user_id_by_email (SECURITY DEFINER, search_path '', EXECUTE só para service_role); trigger on_auth_user_email_updated. O webhook, o claim-session e o create-checkout-session resolvem o comprador por _shared/buyer.ts (RPC); um grep não encontra consulta a profiles por e-mail. Validei num Postgres local descartável: PATCH de email/tenant_id/is_active dá permission denied; os updates da SettingsPage (full_name/phone/notification_preferences) dão UPDATE 1; o RPC é negado a anon e authenticated.

</details>

<details><summary><b>DI-003</b> [P0] Credenciais de teste em produção: backdoor e2e-login e senha publicada no TESTING.md — ✅ Feito</summary>

- **Área:** backend/devops · **Tipo:** seguranca · **Esforço:** M · **Pacote:** W1-02 · **Mobile:** não
- **Problema:** e2e-login (verify_jwt=false, E2E_MODE ativo) devolve sessão válida para QUALQUER e-mail a quem tiver o INTERNAL_SECRET, que também autoriza o send-email. O TESTING.md do repositório público expõe a senha de uma conta real de produção.
- **Evidência:** list_edge_functions: e2e-login ACTIVE v5; 97 de 102 usuários são e2e, o último criado em 15/10. e2e-login/index.ts:31-44 e :79-124. TESTING.md:9-10 e :23 (commit fe0008a), usuário existente em produção.
- **Proposta:** e2e-login: 403 se SUPABASE_URL contiver o ref de produção; allowlist /^e2e\+[0-9]+-[a-z0-9]+@drimigrante\.test$/; segredo próprio E2E_LOGIN_SECRET com comparação em tempo constante; erro genérico. e2e/fixtures/auth.ts passa a usar @drimigrante.test. Tirar credenciais e IDs do TESTING.md (conteúdo útil vai para docs/testes.md). Specs 04/05 ficam em skip até o DI-060.
- **Critérios de aceite:**
  - Teste do handler: ref de produção → 403; e-mail fora da allowlist → 400
  - git grep não encontra senha em TESTING.md nem docs/
  - Depois da ação do dono, a e2e-login não aparece em list_edge_functions de produção
- **Arquivos:** `supabase/functions/e2e-login/index.ts`, `e2e/fixtures/auth.ts`, `.github/workflows/e2e.yml`, `TESTING.md`, `docs/testes.md`
- **Nota para o dono:** Dono: apagar a function, o secret E2E_MODE e a conta dev; rotacionar o INTERNAL_SECRET; remover segredos de produção do GitHub.
- **Implementação:** ✅ Feito no pacote W1-02 (onda 1). e2e-login refeita em handler.ts (puro) + index.ts. Regras: 405 fora de POST; 403 sem E2E_MODE=true; 403 se SUPABASE_URL contém krjirhlmdnxqqrpzmowz; 403 sem o segredo próprio E2E_LOGIN_SECRET (32+ caracteres, cabeçalho x-e2e-login-secret, comparação em tempo constante via SHA-256); 400 para e-mail fora de /^e2e\+[0-9]+-[a-z0-9]+@drimigrante\.test$/; erro genérico. 13 testes Deno passam, incluindo 'ref de produção → 403' e 'e-mail fora da allowlist → 400'. Teste de integração no Supabase local: 200 com JWT, 400 e 403. O fixture e2e/fixtures/auth.ts usa @drimigrante.test e a chave de storage do SDK. Sem E2E_LOGIN_SECRET, ou com VITE_SUPABASE_URL de produção, ele faz testInfo.skip com o motivo. Verificado: com o .env.local atual, os 3 testes autenticados (spec 04 autenticado e spec 05) ficam em skip sem nenhuma chamada; contra o Supabase local, os 3 passam. Os specs 04/05 não foram editados. e2e.yml: só workflow_dispatch, aviso no topo, secrets E2E_* e um passo que aborta se os secrets apontarem para produção. TESTING.md ficou sem senha nem IDs (git grep limpo); o conteúdo útil foi para docs/testes.md, com a lista explícita das functions de produção sem e2e-login. O 3º critério (e2e-login fora do list_edge_functions de produção) depende do dono.

</details>

<details><summary><b>DI-004</b> [P0] generate-explanation e compute-eligibility públicas: análise paga na resposta, custo OpenAI sem limite e e-mail repetido — ✅ Feito</summary>

- **Área:** backend/ia · **Tipo:** seguranca · **Esforço:** M · **Pacote:** W1-04 · **Mobile:** não
- **Problema:** Com a anon key e um assessment_id, qualquer pessoa recebe o campo `full` (o produto de €30), dispara 2 chamadas OpenAI por requisição e reenvia o welcome_free. A compute-eligibility reescreve resultados de terceiros. O prompt envia nome e e-mail à OpenAI.
- **Evidência:** generate-explanation/index.ts:18-34 (sem posse), :95-96 (PII), :110-157 (2 chamadas OpenAI), :172-192 (e-mail), :194-198 (devolve full); v13 em produção idêntica. compute-eligibility/index.ts:96-117. useQuiz.ts:155-163.
- **Proposta:** Exigir posse: JWT do dono ou session_id com user_id nulo, senão 404. Idempotência: se já existir short, devolver sem OpenAI e sem e-mail. Nunca devolver `full`. Tirar nome e e-mail do contexto e truncar valores em 200 caracteres. Disjuntor por hora (AI_HOURLY_CAP) que responde 202. useQuiz envia session_id nas duas chamadas.
- **Critérios de aceite:**
  - Sem session_id ou JWT do dono → 404 e nenhuma chamada a api.openai.com (teste local com fetch mockado)
  - Segunda chamada não chama OpenAI nem grava email_send_log
  - A resposta nunca contém a chave `full`
- **Arquivos:** `supabase/functions/generate-explanation/index.ts`, `supabase/functions/compute-eligibility/index.ts`, `src/hooks/useQuiz.ts`
- **Nota para o dono:** Fazer deploy no mesmo release do front (o useQuiz passa a enviar session_id). Definir teto de gasto na OpenAI.
- **Implementação:** ✅ Feito no pacote W1-04 (onda 1). Bloqueante da revisão corrigido em src/hooks/useQuiz.ts com o módulo puro novo src/lib/quiz-submission.ts. A regra é: um session_id corresponde a um conjunto de respostas enviado. Se a sessão atual já foi enviada com respostas diferentes, o envio usa um session_id novo (crypto.randomUUID; aceito pelo RPC, que pede de 8 a 64 caracteres, e pelo formato previsto no DI-081). Reenviar as mesmas respostas reaproveita o id, sem lead duplicado. A detecção usa o dr_imigrante_quiz_result gravado antes desta versão e uma lista curta de envios (dr_imigrante_quiz_submitted, até 10), que também cobre uma aba antiga com o id em memória. Depois de um envio persistido (assessmentId não nulo), o useQuiz registra o envio e chama resetSession(): 'Refazer o quiz' começa do zero e vira outro assessment, como propõe o DI-041. O mesmo id vai para o RPC, para o resultado guardado (que ResultsPage, Checkout e AuthContext leem) e para compute-eligibility e generate-explanation. Testes: supabase/functions/_shared/quiz-submission_test.ts, com 10 casos (refação com respostas novas → id novo, mesmas respostas → mesmo id, estado anterior ao release, aba antiga depois de 2 envios, fluxo completo de 3 refações, storage quebrado ou ausente, limite da lista, formato do id). Conferi também no navegador, com o RPC e as functions mockados, em dois cenários. 'changed': o RPC e as 2 functions receberam um UUID novo, diferente do seed, e a sessão girou. 'same': os três receberam o id do seed. Nos dois, 'Refazer' levou a /quiz com sessão nova e sem respostas. O resto do DI-004 não mudou: posse ou 404, idempotência, nunca `full`, contexto sem PII e disjuntor 202.

</details>

<details><summary><b>DI-005</b> [P0] Quiz em produção mostra perguntas de todos os casos (display_conditions sem answer_contains/any) e o editor do admin quebra — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** bug · **Esforço:** M · **Pacote:** W1-05 · **Mobile:** sim
- **Problema:** Quem marca só 'Casado(a)' responde 11 perguntas, incluindo descendência, residência e ex-colônias. A d7 nunca aparece e o pré-resultado sai diluído (Média 39% em vez de Alta). O editor do admin chama useMemo depois de um return condicional e quebra ao abrir.
- **Evidência:** Produção: a1, a6, b1, c1, d1, d8 e f1 têm só {question_key:'caso_tipo'}; d7 = {}. useQuizQuestions.ts:91-96 só mapeia answer_key; quiz-questions.ts:415-426; seed :32/:80; generate-quiz-seed.mjs:72-73; QuizQuestionEditor.tsx:129/:135; shots/mobile-topo-funil/quiz-q3-soB-375.png.
- **Proposta:** 1) Mapear answer_contains e any/all em useQuizQuestions; se a condição do banco estiver incompleta, usar o showIf hardcoded da mesma key e registrar console.warn. 2) Tipos em useQuizAdmin e QuizQuestionEditor preservam e editam answer_contains/any; mover o useMemo para antes do return. 3) Corrigir generate-quiz-seed.mjs. 4) Migration 20261016000200_fix_quiz_display_conditions.sql com os valores do hardcoded. 5) Spec e2e/tests/06-quiz-branching.spec.ts só com GET.
- **Critérios de aceite:**
  - Marcando só B, a sequência é processo_tipo → caso_tipo → b1 → captura
  - d7 aparece quando d1='sim' ou d4='nao'; nada de descendência para quem não marcou A
  - Abrir, fechar e reabrir o editor sem erro; salvar preserva answer_contains
  - O spec 06 passa localmente sem nenhuma requisição não-GET
- **Arquivos:** `src/hooks/useQuizQuestions.ts`, `src/hooks/useQuizAdmin.ts`, `src/components/quiz/QuizQuestionEditor.tsx`, `src/pages/admin/AdminQuizPage.tsx`, `scripts/generate-quiz-seed.mjs`, `supabase/migrations/20261016000200_fix_quiz_display_conditions.sql`, `e2e/tests/06-quiz-branching.spec.ts`
- **Nota para o dono:** A migration de dados precisa ser aplicada em produção pelo dono (toca_producao). O fallback no cliente já corrige sem ela.
- **Implementação:** ✅ Feito no pacote W1-05 (onda 1). src/lib/quiz-conditions.ts (novo, módulo puro) faz parse/serialização de display_conditions com answer_contains e any/all. Condição incompleta no banco usa o showIf do código para a mesma key (console.warn uma vez por key) ou oculta a pergunta (NEVER_SHOW) quando não há equivalente. useQuizQuestionsAdmin lê só do banco, com erro visível, e marca showIfRepaired; o AdminQuizPage mostra aviso e resumo legível. QuizQuestionEditor: o wrapper não tem hooks e monta o painel com key; o estado inicial vem das props; editor de condições por linhas (igual a / inclui) com OU/E, sem perda de dados; multiselect editável; preserva textos EN; validação impede salvar condição ou opção incompleta. Também corrigi o rodapé do drawer coberto (min-h-0). useQuizAdmin com tipos DbDisplayConditions e option_text_en no update. generate-quiz-seed.mjs usa o mesmo conversor, importa .ts nativo (sem npx -y tsx), valida condições e não regrava a migration aplicada. Migration 20261016000200 (NÃO aplicada): corrige só as linhas incompletas, faz snapshot em form_versions e traz SELECTs de verificação; o predicado foi validado com SELECT só de leitura nos dados reais (exatamente as 9 linhas quebradas). Spec 06: 25 passaram e 1 foi pulado, sem nenhuma requisição não-GET. Com o banco real ainda quebrado, marcando só B o quiz mostra 'Pergunta 3 de 3' (b1) e vai para a captura.

</details>

<details><summary><b>DI-006</b> [P0] Score do servidor sempre 0/'baixa' (PGRST201) e fórmula diferente da do cliente: motor de elegibilidade único — ✅ Feito</summary>

- **Área:** backend/elegibilidade · **Tipo:** bug · **Esforço:** M · **Pacote:** W2-02 · **Mobile:** sim
- **Problema:** O embed ambíguo de form_questions faz options=[] e o score 0 é gravado em 100% dos casos. O dashboard pago, a IA e o e-mail mostram 'Baixa' a quem viu 'Alta'. Mesmo corrigido o embed, o denominador fixo de 428 pontos e o limiar 65 divergem do front.
- **Evidência:** compute-eligibility/index.ts:122-135; GET somente leitura devolve PGRST201; as 4 linhas de assessment_results estão com 0.00/'baixa'; useAssessmentResult.ts:91-92 prefere o valor do banco; quiz-questions.ts:441-505 (limiares 60/35, só perguntas visíveis).
- **Proposta:** Criar supabase/functions/_shared/quiz-engine.ts sem imports (visibilidade com checagem do pai, computeScore igual ao do front, limiares 60/35, bônus do caso E), reaproveitando _shared/pathways.ts do DI-008. Na compute-eligibility: hint form_question_options_question_id_fkey, checar `error` (500 sem gravar) e usar o motor. Teste de paridade no Vitest para os casos A–F. Script scripts/backfill-scores.mjs (sem OpenAI) para o dono rodar.
- **Critérios de aceite:**
  - Paridade: categoria igual entre cliente e servidor para pelo menos 6 perfis
  - Casado há mais de 3 anos grava 'alta' com score ≥60 (teste local)
  - Erro na query → 500 e nada é gravado
- **Arquivos:** `supabase/functions/compute-eligibility/index.ts`, `supabase/functions/_shared/quiz-engine.ts`, `supabase/functions/_shared/quiz-engine.test.ts`, `scripts/backfill-scores.mjs`
- **Nota para o dono:** Deploy da function e backfill só do score. Não regenerar explicações (custa OpenAI).
- **Implementação:** ✅ Feito no pacote W2-02 (onda 2). Revisei o WIP e completei. _shared/quiz-engine.ts porta o score do front: pai visível (DI-067), só perguntas visíveis pontuam, multisseleção não pontua, bônus do caso E e limiares 60/35. Ele usa o QUESTION_CATALOG de _shared/pathways.ts e lê display_conditions como o navegador. O compute-eligibility usa a hint form_question_options_question_id_fkey, checa `error` em toda query e faz todas as leituras antes de gravar: se uma query falha, responde 500 sem gravar nada. O cálculo antigo (denominador fixo e limiar 65) saiu. Os testes de paridade rodam no Vitest e no Deno: 11 perfis A–F, 2000 perfis gerados pelo fluxo e as linhas do banco como estão hoje em produção, comparadas com o mapQuizRows do front. Teste do handler: casado há mais de 3 anos grava 100/'alta'; erro de query devolve 500 sem upsert. Novo: planScoreBackfill (cálculo puro, testado) e scripts/backfill-scores.mjs. O script simula por padrão; com --apply pede confirmação, recusa chave anon e grava só score_numeric e score_category, sem chamar functions nem OpenAI. Testei contra um PostgREST falso local, nunca contra produção.

</details>

<details><summary><b>DI-007</b> [P0] Análise paga mostra texto genérico de visto e fica vazia em outro aparelho — ✅ Feito</summary>

- **Área:** dashboard/análise · **Tipo:** bug · **Esforço:** L · **Pacote:** W2-06 · **Mobile:** sim
- **Problema:** visaDetails está indexado por D7/D2/CPLP e nunca casa com as vias de nacionalidade. Todo pagante vê 'Opção de visto com base no seu perfil', 'Variável' e 3 documentos genéricos. O reason é descartado. Sem localStorage, a lista fica vazia, e o score 0 do banco sobrepõe o local.
- **Evidência:** AnalysisPage.tsx:23-85, :100-104, :211-227; suggestVisas em quiz-questions.ts:514-630 (9 códigos); useAssessmentResult.ts:66, :91-92 e :107; shots/mobile-dashboard/analysis-paid-crop-vistos.png e analysis-sem-ls-crop.png; mailto doutorimigrante.com em :303 (NXDOMAIN).
- **Proposta:** Criar src/data/nationality-paths.ts indexado pelos 9 códigos (descrição, prazo, documentos e próximos passos, com placeholders 'A_PREENCHER_PELO_DONO' e sem inventar requisitos). A AnalysisPage busca por code, mostra reason e usa a copy 'Caminhos para a nacionalidade'. useAssessmentResult inclui answers e recalcula suggestVisas/computeScore quando falta localStorage. Ignorar score_numeric 0 do banco quando houver respostas. Contato via SUPPORT_EMAIL (oculto se vazio).
- **Critérios de aceite:**
  - Nenhum card com 'Opção de visto com base no seu perfil'; reason visível
  - Com localStorage limpo, as mesmas vias do aparelho original
  - Teste: todo code de suggestVisas tem entrada em nationality-paths
  - Sem 'visto' nem 'doutorimigrante.com' na página
- **Arquivos:** `src/pages/dashboard/AnalysisPage.tsx`, `src/hooks/useAssessmentResult.ts`, `src/data/nationality-paths.ts`, `src/data/nationality-paths.test.ts`
- **Nota para o dono:** O dono ou um advogado preenche prazos e documentos de cada via.
- **Implementação:** ✅ Feito no pacote W2-06 (onda 2). nationality-paths.ts cobre os 9 códigos de suggestVisas. Os campos pendentes ('A_PREENCHER_PELO_DONO') nunca são renderizados: os helpers devolvem null/[] e a tela mostra copy neutra; há teste de DOM sem 'A_PREENCHER'. useAssessmentResult lê as respostas do banco e recalcula as vias, então com o localStorage limpo aparecem as mesmas vias (testado). O score 0 do banco é ignorado (ordem: banco > 0, depois localStorage do mesmo assessment, depois recálculo). O localStorage de outro assessment não se mistura com o do banco. O reason aparece no card de cada via; o contato usa SUPPORT_EMAIL (some se estiver vazio). Não há 'visto' nem 'doutorimigrante.com' na página (teste e screenshots). O WIP trouxe a base; nesta retomada entraram a compatibilidade de tipos com o W2-05, o estado de erro do banco com 'Tentar de novo' e o ajuste de copy.

</details>

<details><summary><b>DI-008</b> [P0] Prompt da análise IA: chaves inexistentes, 'Visto D7', português europeu e persona 'Dra. Sofia' — ✅ Feito</summary>

- **Área:** backend/ia · **Tipo:** bug · **Esforço:** M · **Pacote:** W1-04 · **Mobile:** não
- **Problema:** O contexto lê chaves que não existem (caso, b1_casamento_anos…) e usa o top visa D7 (eligible=false). As 3 análises pagas citam D7. O prompt se apresenta como advogada fictícia e pede pt-PT.
- **Evidência:** generate-explanation/index.ts:67, :72-106, :117, :121, :143-147; produção: 3 de 3 ia_explanation_full mencionam D7; ai_configurations.analysis 'You are Dra. Sofia, a senior … lawyer'.
- **Proposta:** Criar supabase/functions/_shared/pathways.ts (port de suggestVisas) e montar o contexto com as chaves reais (caso_tipo, a1 com 'avo'/'bisavo', b1_tempo_casamento, d2_tempo_autorizacao…) e os reasons. Pedir via de nacionalidade, saída em markdown com '## ' em 5 seções, pt-BR (padrão) e sem persona de advogado. Migration 20261016000350_ai_config_prompts.sql atualiza o system_prompt.
- **Critérios de aceite:**
  - Teste do buildContext: caso A/pai_mae cita 'Nacionalidade por Descendência (1.º grau)' e não D7
  - Contexto sem 'Não aplicável' para perguntas respondidas
  - Nenhum prompt contém 'lawyer' nem persona
- **Arquivos:** `supabase/functions/generate-explanation/index.ts`, `supabase/functions/_shared/pathways.ts`, `supabase/migrations/20261016000350_ai_config_prompts.sql`
- **Nota para o dono:** Regenerar as 3 análises antigas custa OpenAI: decisão do dono.
- **Implementação:** ✅ Feito no pacote W1-04 (onda 1). Sem mudanças nesta ronda. pathways.ts continua sendo port fiel de suggestVisas (paridade em 3000 perfis). O contexto usa as chaves reais e não traz 'Não aplicável'. Os prompts estão em pt-BR, sem persona, com 5 seções '## '. A migration 20261016000350 continua sem aplicar. O teste do caso A/pai_mae cita 'Nacionalidade por Descendência (1.º grau)' e não D7. Regerar as 3 análises antigas continua sendo decisão do dono.

</details>

<details><summary><b>DI-009</b> [P0] Fonte única da oferta, dos contatos e da identificação legal + Termos coerentes — ✅ Feito</summary>

- **Área:** conteúdo · **Tipo:** conversao · **Esforço:** S · **Pacote:** W1-01 · **Mobile:** sim
- **Problema:** Preço, prazo, inclusões, garantia e contatos estão espalhados e se contradizem. Os Termos dizem que o €30 inclui chat e não é reembolsável. Há 3 e-mails em 2 domínios, um deles inexistente, e nenhuma razão social/NIF.
- **Evidência:** TermsPage.tsx:11-16, :27, :33-35, :64; PrivacyPage.tsx:13; AnalysisPage.tsx:303 (NXDOMAIN); dig MX drimigrante.com sem registros.
- **Proposta:** Criar src/lib/offer.ts (OFFER conforme decisoes_de_design), src/config/contact.ts e src/data/company.ts (campos null). Alinhar TermsPage ao OFFER (30 dias, chat se includesChat, reembolso conforme guarantee, identificação vinda de company.ts).
- **Critérios de aceite:**
  - OFFER, contact e company exportados e tipados
  - TermsPage importa OFFER e company; nenhum e-mail fixo fora de contact.ts
- **Arquivos:** `src/lib/offer.ts`, `src/config/contact.ts`, `src/data/company.ts`, `src/pages/legal/TermsPage.tsx`
- **Nota para o dono:** O dono confirma revisão humana, reembolso, prazo de entrega, e-mail funcional e dados da empresa.
- **Implementação:** ✅ Feito no pacote W1-01 (onda 1). src/lib/offer.ts, src/config/contact.ts e src/data/company.ts estão tipados e seguem o contrato. Extras: mailtoHref, isUsableWhatsAppUrl/HAS_WHATSAPP e getCompanyIdentification/isFilledValue, que filtram null e placeholders. A TermsPage foi reescrita em pt-BR e lê tudo do OFFER, do COMPANY e do contact.ts: 30 dias a partir da confirmação do pagamento, chat condicionado a includesChat, plano de €4,90 sem 'ilimitado' e sem 'atualizações regulatórias', limite de 12 cobranças, cancelamento pelo SUPPORT_EMAIL. Como guarantee é null, o reembolso não é prometido nem negado. Também não afirma revisão humana, e a identificação da empresa fica oculta enquanto os campos forem null. Saíram o 'SEF' extinto e o 'Definições' inexistente. 24 testes cobrem esses módulos, incluindo a TermsPage em jsdom. A confirmação de reembolso, e-mail funcional e dados da empresa continua com o dono.

</details>

<details><summary><b>DI-010</b> [P0] Telas de compra sem promessas falsas (advogados, 24h, garantia, 'Mais popular', assinatura) — ✅ Feito</summary>

- **Área:** compra · **Tipo:** conversao · **Esforço:** S · **Pacote:** W2-04 · **Mobile:** sim
- **Problema:** Results, Checkout e Success prometem equipa de advogados, resultado em 24h, garantia, 'Mais popular', 'Cancele quando quiser' e uma FAQ de assinatura. A análise é IA gerada na hora e os Termos negam reembolso. Há risco de chargeback e de prática enganosa.
- **Evidência:** ResultsPage.tsx:309, :353; CheckoutPage.tsx:52, :60-61, :190, :361-369; SuccessPage.tsx:129-131, :154-160; screenshot checkout-anon-full.png.
- **Proposta:** Substituir esses textos por OFFER (entrega imediata, 30 dias, sem garantia enquanto guarantee=null, 'gerada a partir das suas respostas e da Lei da Nacionalidade'). Remover 'Mais popular', 'Cancele quando quiser' e a FAQ de subscrição. Na Success, não afirmar 'Enviámos um recibo'.
- **Critérios de aceite:**
  - grep por 'advogados', '24h', 'Garantia', 'Mais popular', 'Cancele quando quiser' e 'subscrição mensal' em ResultsPage e checkout/* → vazio
  - Nenhum '€4,90' antes do pagamento
  - As 3 páginas importam OFFER
- **Arquivos:** `src/pages/quiz/ResultsPage.tsx`, `src/pages/checkout/CheckoutPage.tsx`, `src/pages/checkout/SuccessPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-04 (onda 2). Os textos da oferta vêm de OFFER e as 3 páginas importam OFFER. Saíram advogados, 24h, garantia, 'Mais popular', 'Cancele quando quiser', a FAQ de assinatura e o 'Enviámos um recibo'. Rodei o grep do critério (advogados|24h|Garantia|Mais popular|Cancele quando quiser|subscrição mensal) em ResultsPage e checkout/: vazio. Para isso tirei a palavra de um comentário e pus o teste das telas em src/pages/purchase-pages.test.tsx. Nenhum 4,90 nem OFFER.recurring nos arquivos do pacote. Há um teste de DOM que procura esses textos nas três telas.

</details>

<details><summary><b>DI-011</b> [P0] /checkout quebra o funil 1-clique: cancelado ou anônimo vai para login — ✅ Feito</summary>

- **Área:** compra · **Tipo:** conversao · **Esforço:** M · **Pacote:** W2-04 · **Mobile:** sim
- **Problema:** Quem volta do Stripe ou do e-mail cai num /checkout que exige magic link, ignora ?cancelled, tem cabeçalho duplicado, simula escolha com um único plano e põe o botão a 1002px.
- **Evidência:** create-checkout-session/index.ts:160; CheckoutPage.tsx:105-110, :140-156, :143, :166-184, :272-279; shots/mobile-resultado-checkout/checkout-cancelled-fold.png.
- **Proposta:** Extrair o handler de compra do ResultsPage para src/hooks/useStartCheckout.ts. O CheckoutPage ganha 3 modos: anônimo com dados locais (1 clique sem login), autenticado, e vazio ('Refazer quiz' / 'Já paguei, entrar'). Banner 'Pagamento não concluído. Nada foi cobrado' com ?cancelled; Voltar → /results; resumo único em vez do rádio; CTA acima da dobra; um só cabeçalho. Manter os testids checkout-submit e checkout-plan-onetime.
- **Critérios de aceite:**
  - Anônimo com localStorage: o CTA chama create-checkout-session (mock) sem ir a /login
  - ?cancelled mostra o banner acima da dobra em 375x812
  - Sem 'Será pedido para entrar' no modo anônimo
- **Arquivos:** `src/pages/checkout/CheckoutPage.tsx`, `src/pages/quiz/ResultsPage.tsx`, `src/hooks/useStartCheckout.ts`, `e2e/pages/CheckoutPage.ts`, `e2e/tests/04-checkout-test-mode.spec.ts`
- **Implementação:** ✅ Feito no pacote W2-04 (onda 2). Retomei o WIP (onda2/W2-04-wip), que aplicou sem conflito sobre a4fd3b6, e revisei. O useStartCheckout é a fonte única do botão na ResultsPage e no /checkout, com 3 modos: anônimo (vai direto ao create-checkout-session, sem /login), autenticado e vazio ('Fazer o quiz grátis' / 'Já paguei, entrar'). Correções e acréscimos meus: (1) o /checkout espera o auth carregar antes de mostrar a oferta, para não aparecer a anônima e depois trocar; (2) 'Voltar' leva ao resultado, ou ao painel quando não há resultado, e some no estado vazio; (3) no celular o e-mail fica numa linha própria, sem quebrar no meio do endereço; (4) diagnóstico já ligado a uma conta agora pede para entrar, em vez de 'tentar de novo'; (5) o login sai com o e-mail pré-preenchido. ?cancelled no /checkout e ?checkout=cancelled na ResultsPage mostram o aviso 'Nada foi cobrado' acima da dobra e limpam a URL. Medido: em 375x812 e 360x740 o banner e o CTA ficam acima da dobra (CTA termina a ~690px em 360x740). Testids checkout-submit, checkout-plan-onetime, checkout-success e results-cta-paywall mantidos.

</details>

<details><summary><b>DI-012</b> [P0] Chat incluso no €30: liberar has_chat_access no pagamento único — ✅ Feito</summary>

- **Área:** backend/pagamentos · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-03 · **Mobile:** sim
- **Problema:** BACKLOG, Termos e o modelo documentado dizem que o €30 inclui chat IA, mas o webhook one_time não o libera. O único pagante real tem has_chat_access=false.
- **Evidência:** stripe-webhook/index.ts:151-162; produção: 1 one_time_paid com has_chat_access=false; BACKLOG.md:16; TermsPage.tsx:27.
- **Proposta:** Opção A (padrão, conforme o modelo documentado): o upsert one_time grava has_chat_access=true, limitado pela expiração de 30 dias. Migration 20261016000150_one_time_chat_access.sql faz backfill das subscriptions one_time existentes.
- **Critérios de aceite:**
  - Webhook simulado localmente deixa has_chat_access=true no one_time
  - A migration de backfill é idempotente
- **Arquivos:** `supabase/functions/stripe-webhook/index.ts`, `supabase/migrations/20261016000150_one_time_chat_access.sql`
- **Nota para o dono:** O dono confirma a opção A. Se escolher B (chat só no €4,90), descartar esta migration e corrigir os Termos.
- **Implementação:** ✅ Feito no pacote W1-03 (onda 1). O upsert one_time grava has_chat_access=true; o limite continua sendo one_time_access_expires_at. Fim do recorrente, falha final ou exclusão mantêm o chat só se o €30 ainda estiver no prazo. Migration 000150 faz backfill idempotente dos one_time_paid com prazo vigente. Consultei produção só para leitura: 1 pagante com prazo, has_chat_access=false e nenhuma compra sem prazo. Sigo a opção A (padrão); a confirmação é do dono.

</details>

<details><summary><b>DI-013</b> [P0] Chat sem acesso: acabar com o redirecionamento silencioso e mostrar o upsell na página — ✅ Feito</summary>

- **Área:** dashboard · **Tipo:** bug · **Esforço:** S · **Pacote:** W2-05 · **Mobile:** sim
- **Problema:** O card Chat aparece como 'Abrir', o clique vai a /checkout, que devolve ao /dashboard sem mensagem. O momento de upsell é perdido.
- **Evidência:** DashboardHomePage.tsx:118-126 (locked={!hasPaid}); ProtectedRoute.tsx:48-51; CheckoutPage.tsx:94-97; ChatPage.tsx:151-168; shots/mobile-dashboard/paid-click-chat.png.
- **Proposta:** O card Chat usa hasAccess('chat'); sem acesso, mostra cadeado e o selo do plano. /dashboard?upsell=chat (vindo do ProtectedRoute, DI-025) abre um BottomSheet com os benefícios reais de OFFER.recurring e o botão de assinatura (hook useSubscribeCheckout extraído). O 'Acesso Restrito' do ChatPage reaproveita o sheet. O item 'Chat IA' do menu mostra cadeado.
- **Critérios de aceite:**
  - Com mock de one_time expirado ou sem chat, nunca há bounce silencioso
  - O sheet mostra '€4,90/mês · até 12 meses' e o botão de assinar
  - Assinante abre o chat normalmente
- **Arquivos:** `src/pages/dashboard/DashboardHomePage.tsx`, `src/pages/dashboard/ChatPage.tsx`, `src/components/dashboard/UpsellSheet.tsx`, `src/hooks/useSubscribeCheckout.ts`
- **Implementação:** ✅ Feito no pacote W2-05 (onda 2). Os cards e o item 'Chat' usam hasAccess('chat') e mostram cadeado e selo do plano. ?upsell=chat abre o BottomSheet com a oferta certa: €4,90 de OFFER.recurring para quem já pagou, €30 para 'none'. O ChatPage bloqueado reaproveita o sheet. O hook useSubscribeCheckout foi extraído com timeout de 15 s, reset ao voltar pelo bfcache, tratamento de 409 already_active e 403 one_time_required, e só aceita URL https. Assinante abre o chat normalmente (tem teste).

</details>

<details><summary><b>DI-014</b> [P0] E-mails transacionais 100% falhando (domínio não verificado no Resend) sem ninguém saber — 🟡 Parcial</summary>

- **Área:** backend/e-mail · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-04 · **Mobile:** sim
- **Problema:** welcome_free e payment_confirmed falham com 403. Ninguém é avisado, e não existe outro canal de retorno.
- **Evidência:** email_send_log: 2 de 2 'failed' ('The mail.drimigrante.com domain is not verified'); send-email/index.ts:114 e :139-141; grep email_send_log em src/pages/admin = 0.
- **Proposta:** send-email registra falhas com log estruturado (trigger_key, status, code). generate-explanation lê { error } do invoke; o webhook é coberto no DI-020. AdminDashboardPage ganha o card 'Saúde dos e-mails' (enviados e falhas em 7 dias, último erro).
- **Critérios de aceite:**
  - Falha do Resend gera log JSON com trigger_key
  - O admin mostra a contagem de falhas em 7 dias
  - Depois da ação do dono, um envio de teste fica 'sent'
- **Arquivos:** `supabase/functions/send-email/index.ts`, `src/pages/admin/AdminDashboardPage.tsx`
- **Nota para o dono:** Verificar o domínio no Resend (DNS no Cloudflare) e conferir o SMTP do Supabase Auth.
- **Implementação:** 🟡 Parcial no pacote W1-04 (onda 1). Código pronto, com a melhoria da revisão: o send-email passa a gravar trigger_key no error_message JSON da linha 'failed' (teste novo). O card 'Saúde dos e-mails' usa esse valor quando o embed email_templates(trigger_key) volta nulo pela RLS. Conferi em screenshot com o embed nulo: aparece 'payment_confirmed · 15 de out.' em vez de 'modelo desconhecido'. Linhas antigas, gravadas sem trigger_key, continuam como 'modelo desconhecido'. Também a pedido da revisão, o AdminDashboardPage passou a degradar por card: cada contagem e os pagamentos carregam à parte, o que falha aparece como '—' (com 'Indisponível' para leitor de tela) e um aviso diz que alguns números não carregaram. O painel inteiro não vira mais erro. Screenshots em 375 e 360 com subscriptions:count e payments respondendo 500 não mostram overflow horizontal. O critério 3 ('envio de teste fica sent') continua dependendo do dono verificar o domínio no Resend.

</details>

<details><summary><b>DI-015</b> [P0] Deriva de deploy: backend P0 em produção com frontend antigo na main; processo de release — ✅ Feito</summary>

- **Área:** devops · **Tipo:** devops · **Esforço:** M · **Pacote:** W3-06 · **Mobile:** sim
- **Problema:** As functions P0 foram publicadas da pasta local, mas a main (Vercel) ainda oferece €4,90 em /results, que o backend recusa com 403. Não há processo de release nem proteção da main.
- **Evidência:** list_edge_functions com entrypoint file:///Users/rmb/...; bundle ResultsPage-C8YUuJFI.js contém '€4,90'; create-checkout-session/index.ts:186; main sem proteção (404).
- **Proposta:** Criar docs/operacao/release.md (ordem migrations → functions → frontend, checklist pós-deploy, rollback) e .github/workflows/deploy-functions.yml com workflow_dispatch e environment com aprovação, usando config.toml. Tags vAAAA.MM.DD.
- **Critérios de aceite:**
  - release.md com ordem, checklist e rollback
  - O workflow só roda manualmente e com aprovação
- **Arquivos:** `docs/operacao/release.md`, `.github/workflows/deploy-functions.yml`
- **Nota para o dono:** O dono faz o merge do PR na main, cria SUPABASE_ACCESS_TOKEN e ativa a proteção da main.
- **Implementação:** ✅ Feito no pacote W3-06 (onda 3). Criado docs/operacao/release.md como fonte única. Ordem: tag no commit do PR → functions que vêm antes (compute-eligibility, send-email, chat-completion antes da 000300) → supabase db push com a tabela de TODAS as migrations pendentes (000000 até 20261025000100, mais um item para a 000200 da W3-01 e as outras da onda) → functions dependentes (generate-explanation, create-checkout-session, claim-session, stripe-webhook) → merge na main. Inclui checklist pós-deploy (CORS, 404 do is_hub_user, advisors, quiz, painel, logs), rollback (Vercel, functions por tag, forward fix e SQL de emergência) e ações do dono com links. Criado .github/workflows/deploy-functions.yml: só workflow_dispatch, só da main ou de tag v*, lista explícita de 7 functions (e2e-login recusada), verify_jwt lido do config.toml, dry_run por padrão com testes Deno, e job deploy no environment production (aprovação; token só nesse environment). A lógica do plano e do deploy foi simulada localmente com CLI falso e entradas maliciosas. README e runbook-pagamentos §6 agora apontam para o release.md, para não haver documento concorrente.

</details>

<details><summary><b>DI-016</b> [P1] Paywall da análise completa aplicado no servidor (has_active_access e get_full_analysis) — ✅ Feito</summary>

- **Área:** backend/dashboard · **Tipo:** seguranca · **Esforço:** M · **Pacote:** W2-06 · **Mobile:** não
- **Problema:** ia_explanation_full pode ser lido via REST pelo dono do assessment mesmo sem pagar ou com o acesso expirado. A expiração de 30 dias só existe no React.
- **Evidência:** Policy assessment_results_read sem checar pagamento; AuthContext.tsx:216-236; useAssessmentResult.ts:66 e useAssessment.ts:114-133 com select('*').
- **Proposta:** Migration 20261020000000_full_analysis_paywall.sql: has_active_access(uid, feature) (SECURITY DEFINER, só service_role); GRANT SELECT por coluna sem ia_explanation_full; RPC get_full_analysis que exige posse e acesso ativo. No front, colunas explícitas, rpc na AnalysisPage, estado 'acesso expirado' e tipos da RPC em database.types.ts.
- **Critérios de aceite:**
  - Sem pagamento: SELECT de ia_explanation_full → permission denied; rpc → 'Payment required'
  - Pagante não expirado vê a análise
  - Nenhum assessment_results(*) ou select('*') em src (grep)
- **Arquivos:** `supabase/migrations/20261020000000_full_analysis_paywall.sql`, `src/hooks/useAssessmentResult.ts`, `src/hooks/useAssessment.ts`, `src/pages/dashboard/AnalysisPage.tsx`, `src/lib/database.types.ts`
- **Nota para o dono:** Aplicar a migration no mesmo release do front.
- **Implementação:** ✅ Feito no pacote W2-06 (onda 2). Migration 20261020000000 criada e NÃO aplicada em produção: has_active_access (só service_role), GRANT SELECT por coluna sem ia_explanation_full e RPC get_full_analysis (PT401/PT404/PT402). Rodei todas as migrations num Postgres 17 + PostgREST 14 locais e descartáveis (containers w206-pg/w206-rest). Resultados: embed com colunas explícitas dá 200; assessment_results(*) dá 403; RPC sem pagamento ou expirada dá 402 'Payment required'; RPC de outra conta dá 404; anon dá 401; assinante e staff leem. No front: colunas explícitas, a AnalysisPage usa a RPC, estados de acesso não ativo (recarrega a assinatura com refreshUser uma vez), sessão expirada (vai para /login?next=) e erro. Tipos adicionados à mão em database.types.ts. Fica de fora do critério 'nenhum select(*) em src': restam select('*') em arquivos de outros pacotes (AuthContext, useQuizQuestions, useQuizAdmin, AdminLeads, AdminPipeline, DocumentsPage), e nenhum deles lê assessment_results.

</details>

<details><summary><b>DI-017</b> [P1] chat-completion sem gate de pagamento, sem limites e com o histórico errado — ✅ Feito</summary>

- **Área:** backend/ia · **Tipo:** seguranca · **Esforço:** M · **Pacote:** W1-04 · **Mobile:** sim
- **Problema:** Qualquer conta dona de um assessment usa o chat ilimitadamente. O histórico enviado à IA são as 20 mensagens MAIS ANTIGAS. O cliente insere mensagens 'system'. A versão em produção não faz streaming.
- **Evidência:** chat-completion/index.ts:19-41, :49-59, :86; policy 'Users can insert own messages'; get_edge_function v18 sem stream; ai_configurations chat com max_tokens 1500.
- **Proposta:** Verificar subscriptions com service role: (recurring_active) ou (has_chat_access e não expirado), senão 403 'no_access'. Mensagem com 1 a 2000 caracteres. Limite de 30/hora e 200/dia (429). Histórico com as 20 mais recentes, em ordem cronológica, só user/assistant. Inserts com service role e migration 20261016000300_messages_server_only_insert.sql. Não gravar assistant vazio. max_tokens vindo de ai_configurations com teto de 1000.
- **Critérios de aceite:**
  - Usuário sem acesso → 403, sem chamar OpenAI (teste local)
  - Teste do montador de histórico: últimas 20 em ordem
  - INSERT direto em messages com JWT de cliente é negado
- **Arquivos:** `supabase/functions/chat-completion/index.ts`, `supabase/migrations/20261016000300_messages_server_only_insert.sql`
- **Nota para o dono:** Fazer o deploy depois do DI-001 e do DI-012; trocar a copy 'ilimitado' por uso justo.
- **Implementação:** ✅ Feito no pacote W1-04 (onda 1). Melhoria da revisão: o chat-completion continua gravando a pergunta antes da OpenAI, para os limites de 30/h e 200/dia valerem também em rajadas paralelas. Agora ele a apaga (service role, repo.deleteMessage) quando não há resposta: falha de rede (antes caía em 500, agora responde 502), HTTP não-2xx (502), stream interrompido ou resposta vazia. Assim a pergunta não fica órfã no histórico nem conta no limite. insertMessage passou a devolver o id. 4 testes novos (13 no total no chat). O gate, os limites, o histórico das 20 mais recentes, o teto de max_tokens e a allowlist não mudaram. A migration 000300 (só um comentário novo, ainda não aplicada) não revoga nada da service_role, então o DELETE do servidor continua permitido. O critério 'INSERT direto negado' só pode ser verificado depois de aplicar a migration.

</details>

<details><summary><b>DI-018</b> [P1] Análise completa gerada só depois do pagamento, sob demanda e autenticada — ✅ Feito</summary>

- **Área:** backend/dashboard · **Tipo:** performance · **Esforço:** M · **Pacote:** W3-05 · **Mobile:** sim
- **Problema:** Todo lead gratuito gera (e paga em OpenAI) a análise completa durante o quiz. O conteúdo pago existe antes da compra.
- **Evidência:** useQuiz.ts:151-164; 3 de 7 completos têm ia_explanation_full; generate-explanation:136-157.
- **Proposta:** generate-explanation com mode 'full' exige JWT, has_active_access('full_analysis') e idempotência. O quiz gera só o short. A AnalysisPage, sem full, mostra 'Preparando sua análise…', dispara a geração e faz polling curto.
- **Critérios de aceite:**
  - O fluxo do quiz não gera full (rede mockada)
  - Pagante sem full vê o estado de preparação e depois o texto
  - Sem acesso → 403
- **Arquivos:** `supabase/functions/generate-explanation/index.ts`, `src/pages/dashboard/AnalysisPage.tsx`
- **Nota para o dono:** Decisão do dono (padrão: sim). Deploy da function.
- **Implementação:** ✅ Feito no pacote W3-05 (onda 3). generate-explanation agora tem `mode`. 'short' é o padrão e é o que o quiz manda sem o campo: gera só o resumo e o welcome_free, com uma chamada à OpenAI. 'full' exige JWT do dono (o session_id não vale), confere has_active_access(dono,'full_analysis') via RPC com a service role e responde 401 auth_required, 404 ou 403 payment_required. A service role também é barrada se o dono não pagou. Os dois modos são idempotentes (o texto já gravado volta sem OpenAI). Comportamentos: trava compartilhada (202 in_progress), disjuntor (202 deferred), limpeza condicional de texto vazio legado, timeout na OpenAI (502). A resposta nunca traz a análise. Na AnalysisPage, o hook novo useFullAnalysisGeneration dispara o modo full uma vez por visita, com o JWT do supabase-js, e relê pela RPC get_full_analysis com polling de 5 s × 24. Em 403 recarrega o acesso; em 401 pede novo login. Em erro ou deferred mostra 'Tentar de novo', sem loop. Critérios cobertos: (1) teste Deno com rede mockada: sem mode há só 1 chamada à OpenAI e nada de análise completa; (2) Vitest: o pagante sem a análise vê 'Preparando sua análise detalhada…' e depois o texto; (3) Deno: sem acesso dá 403 sem OpenAI. Deploy da function e decisão do dono ficam pendentes; nada foi publicado.

</details>

<details><summary><b>DI-019</b> [P1] create-checkout-session: cancel_url para /results, sem recompra, sem customer antecipado — ✅ Feito</summary>

- **Área:** backend/pagamentos · **Tipo:** conversao · **Esforço:** S · **Pacote:** W1-03 · **Mobile:** sim
- **Problema:** Cancelar no Stripe leva a /checkout (login). É possível pagar o €30 de novo com acesso ativo ou assinar duas vezes. Um customer é criado antes de a pessoa decidir.
- **Evidência:** create-checkout-session/index.ts:35-45, :121-191, :142-160, :214.
- **Proposta:** Anônimo: cancel_url `${app}/results?checkout=cancelled`; customer_email + customer_creation:'always'. Responder de forma genérica a quem já tem acesso (sem enumerar e-mails). Autenticado: 409 'already_active' para one_time com acesso ativo ou recurring já ativo. success_url do recurring = /dashboard?subscribed=1. Mover resolveAppUrl para _shared/origin.ts.
- **Critérios de aceite:**
  - Teste local: one_time ativo → 409; recurring ativo → 409
  - Sessão anônima com cancel_url em /results
  - origin.ts rejeita https://evil.com e http://localhost.evil.com
- **Arquivos:** `supabase/functions/create-checkout-session/index.ts`, `supabase/functions/_shared/origin.ts`
- **Implementação:** ✅ Feito no pacote W1-03 (onda 1). _shared/origin.ts: isAllowedOrigin/resolveAppUrl/getAppUrl aceitam a origem exata de APP_URL, previews do projeto e localhost/127.0.0.1, e rejeitam https://evil.com, http://localhost.evil.com e variações (testado). Checkout anônimo: customer_email + customer_creation 'always', sem customers.list/create, e cancel_url em /results?checkout=cancelled. E-mail com acesso vigente: envia link de login e responde 200 {status:'email_sent', url:'<app>/login'}, genérico e com url de fallback para o frontend antigo; a checagem é de melhor esforço e não bloqueia a venda se o RPC falhar. Autenticado: 409 already_active para one_time com acesso vigente ou recorrente ativo; 403 one_time_required; o recorrente usa success_url /dashboard?subscribed=1 e cancel_url /dashboard. Validação de plan, e-mail e assessmentId (uuid) com 400.

</details>

<details><summary><b>DI-020</b> [P1] stripe-webhook: payment_status, reembolso/disputa, idempotência atômica, erros e payload mínimo — ✅ Feito</summary>

- **Área:** backend/pagamentos · **Tipo:** bug · **Esforço:** M · **Pacote:** W1-03 · **Mobile:** não
- **Problema:** O webhook concede acesso sem 'paid', ignora reembolso e disputa, processa em dobro sob concorrência, engole erros de upsert e de e-mail, e guarda o evento Stripe inteiro com PII.
- **Evidência:** stripe-webhook/index.ts:43-63, :144, :166-217, :237-251, :296-297; claim-session:64 exige 'paid'.
- **Proposta:** Inserir direto em payment_events (23505 → 200) com payload mínimo {id,type,livemode,object_id,amount,currency}. Conceder só com payment_status 'paid' e tratar async_payment_succeeded/failed. Revogar em charge.refunded total e em dispute.created. Checar { error } de upserts e do sendEmail e lançar erro (500). Revogar o chat só na última tentativa de invoice. Sincronizar customer.subscription.updated.
- **Critérios de aceite:**
  - Evento com 'unpaid' não altera subscriptions (teste local)
  - charge.refunded revoga o one_time
  - Mesmo evento 2x gera 1 linha em payments; erro no upsert → 500
- **Arquivos:** `supabase/functions/stripe-webhook/index.ts`
- **Nota para o dono:** Adicionar os novos eventos no endpoint do Stripe e fazer o deploy.
- **Implementação:** ✅ Feito no pacote W1-03 (onda 1). stripe-webhook/handler.ts. Idempotência atômica por INSERT em payment_events com status 'processing': 23505 já processado → 200; ainda em processamento → 409; reivindicação abandonada há mais de 10 min é retomada; em caso de falha a reivindicação é liberada e a resposta é 500. Payload mínimo {id,type,livemode,object_id,amount,currency}, sem PII. Acesso só com payment_status 'paid' ou 'no_payment_required' (cupom de 100%; ver riscos). Trata checkout.session.async_payment_succeeded/failed, charge.refunded total (o parcial não revoga), charge.dispute.created, invoice.payment_failed (revoga só quando next_payment_attempt=null) e customer.subscription.updated/deleted. O { error } de todo upsert/update e do send-email vira 500. paid_at usa event.created, estável entre reenvios. Testes: 'unpaid' não altera subscriptions; mesmo evento 2x gera 1 linha em payments; erro no upsert dá 500.

</details>

<details><summary><b>DI-021</b> [P1] Upsell €4,90: subscription_data.cancel_at não existe no Checkout, mover o limite de 12 ciclos para o webhook — ✅ Feito</summary>

- **Área:** backend/pagamentos · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-03 · **Mobile:** sim
- **Problema:** O parâmetro não existe nos tipos de stripe@14.14.0. O upsell provavelmente nunca funcionou: há 0 assinaturas em produção.
- **Evidência:** create-checkout-session/index.ts:17, :103, :225-236; os tipos oficiais de SessionCreateParams.SubscriptionData não têm cancel_at; DashboardHomePage.tsx:171-180.
- **Proposta:** Remover cancel_at do Checkout. No webhook (checkout.session.completed de subscription), aplicar stripe.subscriptions.update com cancel_at = início + 12 meses de calendário (idempotente) e gravar a data.
- **Critérios de aceite:**
  - No modo teste, o checkout recorrente abre (200)
  - A assinatura fica com cancel_at = início + 12 meses; reprocessar não muda
- **Arquivos:** `supabase/functions/create-checkout-session/index.ts`, `supabase/functions/stripe-webhook/index.ts`
- **Nota para o dono:** Testar só no modo teste do Stripe e conferir os logs 400 no dashboard.
- **Implementação:** ✅ Feito no pacote W1-03 (onda 1). Removi subscription_data.cancel_at do Checkout (só fica subscription_data.metadata). No checkout.session.completed de assinatura, o webhook busca a assinatura, aplica cancel_at = billing_cycle_anchor (ou start_date) + 12 meses de calendário (fim de mês tratado) via subscriptions.update com proration_behavior 'none' e grava subscriptions.recurring_cancel_at (coluna nova na migration 000150). É idempotente: não chama o Stripe se já houver cancel_at <= limite e nunca adia um cancelamento já agendado. Também reaplica o limite em customer.subscription.updated se o cancel_at sumir. Falta o teste real no modo teste do Stripe (ação do dono).

</details>

<details><summary><b>DI-022</b> [P1] claim-session: token de login reutilizável e session_id do Stripe vazando — ✅ Feito</summary>

- **Área:** backend/pagamentos · **Tipo:** seguranca · **Esforço:** S · **Pacote:** W1-03 · **Mobile:** sim
- **Problema:** O mesmo session_id gera tokens indefinidamente enquanto a conta não fizer login, sem janela de tempo nem verificação do produto.
- **Evidência:** claim-session/index.ts:63-113; SuccessPage.tsx:46, :60 e :224-226 expõem o id.
- **Proposta:** Migration 20261016000400_checkout_claims.sql (stripe_session_id PK, RLS sem acesso de cliente). Exigir product_type one_time, ausência de metadata.user_id e sessão com menos de 24h. Auto-login só se o usuário foi criado por esta compra. Insert antes do token; duplicado → caminho de e-mail.
- **Critérios de aceite:**
  - Segunda chamada com o mesmo session_id não devolve token
  - Sessão com mais de 24h ou autenticada não devolve token
- **Arquivos:** `supabase/functions/claim-session/index.ts`, `supabase/migrations/20261016000400_checkout_claims.sql`
- **Implementação:** ✅ Feito no pacote W1-03 (onda 1). Migration 000400: checkout_claims (stripe_session_id PK com CHECK de formato, user_id ON DELETE SET NULL, RLS sem policies, REVOKE de anon/authenticated). claim-session só devolve token se: pagamento confirmado, mode payment, product_type one_time, sem metadata.user_id, sessão com menos de 24h, conta criada por esta compra (app_metadata.checkout_session_id, gravado pelo webhook ou pelo próprio claim) e nunca logada. O INSERT do claim acontece antes do generateLink; duplicado → link por e-mail; falha no generateLink libera o claim. Testes: a segunda chamada não devolve token; mais de 24h ou sessão autenticada não devolvem token.

</details>

<details><summary><b>DI-023</b> [P1] Upload de documentos quebrado: bucket user-documents sem policies e sem limites — ✅ Feito</summary>

- **Área:** backend/dashboard · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-02 · **Mobile:** sim
- **Problema:** Todo upload de cliente é negado pela RLS do Storage. O bucket não limita tamanho nem tipo, e o cliente pode marcar o próprio documento como 'verified'.
- **Evidência:** pg_policies em storage.objects só para case-documents; bucket com limites nulos e 0 objetos; DocumentsPage.tsx:76-79 (upsert:true) e :121; migration 20260512000000:62-66.
- **Proposta:** Migration 20261016000500_user_documents_storage.sql: INSERT/SELECT/DELETE para o dono pela pasta auth.uid() e SELECT para staff; file_size_limit 10MB e MIME pdf/jpeg/png; trigger que impede o não-staff de alterar status, feedback, user_id ou storage_path. DocumentsPage passa a usar upsert:false.
- **Critérios de aceite:**
  - Num ambiente local, o upload de PDF de 1MB funciona e o de 11MB é recusado
  - O usuário A não lê arquivos do B
  - O cliente não consegue gravar status 'verified'
- **Arquivos:** `supabase/migrations/20261016000500_user_documents_storage.sql`, `src/pages/dashboard/DocumentsPage.tsx`
- **Implementação:** ✅ Feito no pacote W1-02 (onda 1). Migration 20261016000500_user_documents_storage.sql (NÃO aplicada). Faz upsert do bucket user-documents (privado, 10 MB, pdf/jpeg/png). Policies em storage.objects: o dono faz insert/select/delete só na pasta auth.uid(); a equipe lê tudo; não há UPDATE. Em public.user_documents: o dono faz select/insert/delete e a equipe faz select/update (is_staff_user); a policy FOR ALL antiga foi removida. Um trigger BEFORE INSERT/UPDATE impede o não-staff de gravar status diferente de 'uploaded', gravar feedback ou mudar user_id/storage_path. DocumentsPage passou a usar upsert:false (só isso, como manda a instrução do pacote). Validado no local pela API e pela UI real em 375x812 e 360x740: upload de PDF de 1 MB funciona, 11 MB é recusado (413), text/plain é recusado, upload na pasta de outra conta é recusado, cliente2 não baixa o arquivo do dev, admin baixa, o cliente não grava 'verified' e o admin consegue.

</details>

<details><summary><b>DI-024</b> [P1] Link de retomada do resultado entre aparelhos (token opaco) — ✅ Feito</summary>

- **Área:** resultado/retenção · **Tipo:** retencao · **Esforço:** M · **Pacote:** W3-01 · **Mobile:** sim
- **Problema:** Quem abre o e-mail em outro aparelho não encontra o resultado, porque ele só existe no localStorage. Usar o session_id na URL daria escrita no assessment.
- **Evidência:** ResultsPage.tsx:33-88; generate-explanation:184; migration 20260512000002 (upsert por session_id).
- **Proposta:** Migration 20261025000200_resume_token.sql: coluna resume_token aleatória e RPC get_assessment_by_resume_token, só de leitura e liberada para anon. ResultsPage aceita ?r=, recalcula com computeScore/suggestVisas, grava no localStorage e limpa a URL antes de qualquer pageview (replaceState). O botão 'Guardar meu resultado' copia o link.
- **Critérios de aceite:**
  - /results?r=token em navegador limpo (RPC mockada) mostra o resultado e o CTA funciona
  - A URL final não tem r; token inválido mostra estado com CTA para refazer
- **Arquivos:** `supabase/migrations/20261025000200_resume_token.sql`, `src/pages/quiz/ResultsPage.tsx`
- **Nota para o dono:** O link nos e-mails é implementado no DI-077.
- **Implementação:** ✅ Feito no pacote W3-01 (onda 3). A migration não mudou e continua NÃO aplicada. O critério agora também está em Playwright (e2e/tests/10-results-resume.spec.ts). Cenários cobertos: /results?r=token num navegador limpo mostra o resultado; o r sai da URL e o utm_source fica; o registro local tem session_id novo e nenhum assessmentId; o CTA salva um diagnóstico novo (upsert com o session_id novo) e o create-checkout-session vai com assessmentId, sessionId e e-mail até a página de pagamento simulada; o token nunca aparece em URL nem em outra chamada. Também: token inválido mostra o estado com CTA para refazer o quiz; token malformado não chama a RPC. Todo o tráfego para fora da origem do app é mockado pelo caminho ou abortado, então nada chega ao Supabase ou à Stripe. No dev server, o React.StrictMode faz a RPC de leitura rodar 2 vezes; o teste aceita 1 ou 2 leituras.

</details>

<details><summary><b>DI-025</b> [P1] AuthContext: refreshUser, falha ≠ 'sem assinatura', regras de acesso testáveis e redirecionamentos corretos — ✅ Feito</summary>

- **Área:** auth · **Tipo:** bug · **Esforço:** M · **Pacote:** W1-06 · **Mobile:** sim
- **Problema:** As permissões são carregadas uma única vez. Um timeout trata o pagante como não pagante (risco de cobrança dupla). A regra de expiração não é testável. O ProtectedRoute manda o pagante para /checkout ou /results.
- **Evidência:** AuthContext.tsx:83-123, :138-160, :216-240; ProtectedRoute.tsx:47-51; Sentry importado direto em AuthContext.tsx:22.
- **Proposta:** Criar src/lib/access.ts (getAccessState e hasFeatureAccess) com testes. No AuthContext: expor refreshUser() e userDataError com retry e backoff; chamar identify(user.id)/resetAnalytics() existentes; importar `{ Sentry } from '@/lib/sentry'`. ProtectedRoute: chat sem acesso → /dashboard?upsell=chat; acesso expirado → /dashboard?acesso=expirado; nunca /results.
- **Critérios de aceite:**
  - Testes de getAccessState: none, active, expiring, expired (now == expires_at ainda tem acesso), recurring e staff
  - Timeout simulado expõe userDataError sem subscription=null silencioso
  - Nenhum redirect do ProtectedRoute para /checkout ou /results
- **Arquivos:** `src/contexts/AuthContext.tsx`, `src/hooks/useAuth.ts`, `src/lib/access.ts`, `src/lib/access.test.ts`, `src/router/ProtectedRoute.tsx`
- **Implementação:** ✅ Feito no pacote W1-06 (onda 1). Tudo da ronda 0 continua valendo: access.ts com getAccessState, hasFeatureAccess, canOfferRecurring, routeFeature e accessDeniedRedirect; documents_read e documents_upload; auth-user-data com AbortSignal, 3 tentativas, backoff e .retry(false); AuthContext com refreshUser, userDataError e access; ProtectedRoute leva o chat a /dashboard?upsell=chat e o expirado a /dashboard?acesso=expirado, nunca a /checkout ou /results. Melhorias desta ronda: (1) o acesso acompanha o relógio com a aba aberta. Criei o nextAccessChangeAt em access.ts, com 6 testes, e o AuthContext agenda um timer para o próximo instante em que o estado muda (um dia a menos, entrada em 'expiring', 'expired' 1 ms depois de expires_at); ao voltar para a aba, confere se esse instante já passou. Um teste do AuthContext mostra expiring virando expired sem nova consulta ao banco. (2) identify só marca o usuário como identificado com consentimento e o identifica no evento consent-changed. O evento existe tanto no analytics.ts atual quanto no do W1-07; há teste. (3) O timeout por tentativa caiu de 8 s para 5 s: no pior caso, a tela de erro aparece em cerca de 18 s, contra ~27 s antes.

</details>

<details><summary><b>DI-026</b> [P1] Página de sucesso à prova de falha — ✅ Feito</summary>

- **Área:** compra · **Tipo:** bug · **Esforço:** M · **Pacote:** W2-04 · **Mobile:** sim
- **Problema:** A contagem de 8s ignora o claim-session e manda para /login. 'Confirmado' aparece sem session_id, a barra de progresso é fictícia, o session_id fica na tela, na URL e no analytics, e checkout_completed é contado em cada reload.
- **Evidência:** SuccessPage.tsx:21-61, :92-113, :126-160, :206-226; shots/mobile-resultado-checkout/success-fake-session-11s.png.
- **Proposta:** Máquina de estados verifying → signing_in → confirming (polling de refreshUser a cada 2s até 30s, até ter acesso) → ready, com ramos email_sent, processing (403) e fallback (e-mail mascarado + 'Reenviar link' + contato). Limpar session_id da URL ao montar (setSearchParams replace) e guardar em sessionStorage. Passos reais no lugar da barra fictícia. Evento purchase {value, currency:'EUR'} uma vez por sessão. Manter os testids.
- **Critérios de aceite:**
  - Claim mockado com 12s não redireciona para /login
  - Claim 500 mostra o fallback com reenvio
  - URL sem session_id e DOM sem 'Ref:'; purchase disparado uma única vez
- **Arquivos:** `src/pages/checkout/SuccessPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-04 (onda 2). SuccessPage com máquina de estados: verifying → signing_in (verifyOtp) → confirming (refreshUser a cada 2s até 30s) → ready. Ramos: email_sent (com 'Reenviar link' e espera de 60s), processing (403, nova consulta automática a cada 5s, até 6 vezes, sem piscar a tela), delayed, fallback (e-mail mascarado, 'Tentar de novo', 'Receber link de acesso' → /login pré-preenchido, e o contato SUPPORT_EMAIL) e missing. Acrescentei um catch para falhas inesperadas (nunca fica preso no spinner) e tirei o contorno de foco do título. O session_id sai da URL ao montar e fica só na sessionStorage. Passos reais no lugar da barra. purchase {value:30, currency:'EUR'} via trackOnce com chave em hash, sem o cs_. Testes: claim de 12s sem ir ao /login (E2E), claim 500 → fallback, URL sem session_id e DOM sem 'Ref:'.

</details>

<details><summary><b>DI-027</b> [P1] Login e retorno por link: callback robusto, deep link e login pensado para celular — ✅ Feito</summary>

- **Área:** auth · **Tipo:** bug · **Esforço:** M · **Pacote:** W1-06 · **Mobile:** sim
- **Problema:** O AuthCallback pode ficar num spinner infinito (ignora INITIAL_SESSION com sessão). O login ignora state.from, não pré-preenche o e-mail, tem input de 14px, não redireciona quem já está logado e o bloco DEV depende só de env.
- **Evidência:** AuthCallbackPage.tsx:21-49; auth-js GoTrueClient.js:3408-3420; LoginPage.tsx:17, :38, :43, :107-128, :158; AuthContext.tsx:184.
- **Proposta:** Callback: sucesso em SIGNED_IN ou INITIAL_SESSION com sessão; tratar error_description; timeout de 10s → /login?error=link_expired; ler next da URL com safeInternalPath. signInWithMagicLink(email, next). Login: returnTo de state.from; e-mail de state.email ou leadInfo; faixa pós-compra; reenvio com cooldown de 30s; redirect se autenticado; bloco DEV só com localhost; verifyOtp opcional.
- **Critérios de aceite:**
  - Sessão já existente com chunk atrasado → redirect em até 1s
  - next=//evil.com é ignorado (teste de safeInternalPath)
  - Input com 16px, e-mail pré-preenchido, autenticado vai para /dashboard
- **Arquivos:** `src/pages/auth/AuthCallbackPage.tsx`, `src/pages/auth/LoginPage.tsx`, `src/lib/safe-path.ts`, `src/lib/safe-path.test.ts`
- **Nota para o dono:** Redirect URLs com curinga e template com {{ .Token }} no Supabase Auth.
- **Implementação:** ✅ Feito no pacote W1-06 (onda 1). Bloqueante corrigido: safeInternalPath roda as mesmas checagens no resultado normalizado (hasSafeShape antes e depois do new URL). '/.//evil.com', '/a/..//evil.com', '/%2e//evil.com', '/%2e%2e//evil.com', '/a/../..//evil.com', '/./\evil.com' e '/.//\evil.com' agora caem no fallback, e há teste de idempotência garantindo que a saída nunca começa com '//' ou '/\'. No navegador, com Supabase 100% mockado, /auth/callback?next=/.//evil.com e suas variantes (/a/..//, %2F%2e%2F%2F, /%252e//) e /login?next=/.//evil.com levam todos a /dashboard; next=/dashboard/documents continua funcionando. Bloqueante do teste: auth-redirect.test usa '' para 'sem env' e ganhou dois testes com vi.stubEnv/vi.unstubAllEnvs. npm test passa com e sem o .env.local. Melhorias: a copy antes do envio diz 'Vamos enviar um link de acesso para o seu e-mail. Não precisa de senha.'; a espera de reenvio passou a valer por e-mail. Com o mesmo e-mail depois de 'Usar outro e-mail', não sai nova requisição de OTP e volta a tela 'Confira seu e-mail' com o tempo restante (29 s); outro e-mail envia normalmente. O erro de limite no formulário só trava o botão e não leva à tela de 'Enviamos'. Mantidos: input de 16px e 48px de altura, e-mail pré-preenchido, autenticado vai para /dashboard, sem overflow em 375 e 360.

</details>

<details><summary><b>DI-028</b> [P1] Resultado: CTA de compra fixo no celular e ScoreCard compacto — ✅ Feito</summary>

- **Área:** resultado · **Tipo:** conversao · **Esforço:** M · **Pacote:** W3-01 · **Mobile:** sim
- **Problema:** O botão de €30 fica entre 1318 e 1611px numa tela de 812 e não há CTA fixo.
- **Evidência:** Medição do #results-unlock-btn em 1458, 1551 e 1318px; shots/mobile-resultado-checkout/results-alta-fold.png; ResultsPage.tsx:99-136.
- **Proposta:** StickyBuyBar (StickyCTA): '€30 · pagamento único' + 'Ver minha análise completa'; aparece quando o ScoreCard sai da tela e some quando o PaywallCard está visível; testid results-sticky-cta; usa useStartCheckout. ScoreCard com p-5, ícone de 40px e gauge baixo; link-âncora 'Ver o que inclui'.
- **Critérios de aceite:**
  - Em 375x812 há sempre um CTA visível depois do ScoreCard
  - A barra some com o PaywallCard e não cobre conteúdo nem o banner de cookies
  - results-cta-paywall continua único
- **Arquivos:** `src/pages/quiz/ResultsPage.tsx`, `src/components/results/StickyBuyBar.tsx`
- **Implementação:** ✅ Feito no pacote W3-01 (onda 3). Bloqueante corrigido. A StickyBuyBar passou a receber inlineCtaRef = ctaRef, o próprio botão results-cta-paywall, no lugar do buyBlockRef. O buyBlockRef saiu do PaywallCard e o comentário do StickyBuyBar foi refeito. Medi rolando de 10 em 10px, sem o banner de cookies, em Alta, Média e Baixa, nas telas 375x812 e 360x740: nenhuma posição sem CTA e nenhuma com a barra e o botão juntos. No código anterior, o mesmo spec acusa vão entre 720 e 880 em 375 e entre 880 e 1000 em 360, os mesmos números da revisão. Há um teste Vitest com IntersectionObserver controlado: o alvo observado é o botão, não o bloco, e a barra some quando ele entra na tela e volta quando ele sai. Há também um teste Playwright que rola a página inteira de 40 em 40px nas duas telas e passou em chromium e webkit. Ainda há dois casos de borda, descritos nos riscos: com o banner de cookies aberto e no fim da página em 360x740. results-cta-paywall continua único.

</details>

<details><summary><b>DI-029</b> [P1] Resultado: apresentação única por categoria (sem '?', '+', '~' e iguais no reload) — ✅ Feito</summary>

- **Área:** resultado · **Tipo:** bug · **Esforço:** S · **Pacote:** W3-01 · **Mobile:** sim
- **Problema:** Quem vem do quiz vê um glifo gigante e títulos diferentes dos que aparecem ao recarregar. Há 3 conjuntos de rótulos.
- **Evidência:** quiz-questions.ts:479-499; ResultsPage.tsx:35-56 e :362-386; useAssessmentResult.ts:46-50; results-baixa-via-quiz-routerstate.png e results-baixa-fold.png.
- **Proposta:** Criar src/lib/category.ts com CATEGORY_PRESENTATION (rótulo, subtítulo, cor, ícone lucide) usado por computeScore, ResultsPage e useAssessmentResult. Baixa com framing de caminho alternativo, sem promessa.
- **Critérios de aceite:**
  - Router state e reload exibem título e ícone idênticos (Playwright)
  - Nenhum '+', '~' ou '?' como ícone
- **Arquivos:** `src/lib/category.ts`, `src/data/quiz-questions.ts`, `src/pages/quiz/ResultsPage.tsx`, `src/hooks/useAssessmentResult.ts`
- **Implementação:** ✅ Feito no pacote W3-01 (onda 3). Sem mudança de código nesta ronda. Agora o critério também tem cobertura em Playwright, no spec novo e2e/tests/10-results-resume.spec.ts. O teste injeta router state pelo history, com rótulo e emoji antigos e 22%, e depois recarrega. Em seguida abre /results numa entrada nova do histórico, lendo do localStorage com 20%. As três telas mostram o mesmo título (CATEGORY_PRESENTATION.baixa.label) e o mesmo ícone (data-icon=compass), sem nenhum glifo no lugar do ícone. Passou em chromium e no mobile (webkit, iPhone 14). Um detalhe que só apareceu no teste: no Chromium, page.goto para a mesma URL mantém o history.state, por isso o teste passa antes por about:blank.

</details>

<details><summary><b>DI-030</b> [P1] Resultado: oferta personalizada por categoria e caminho, com o que se recebe e mini-FAQ — ✅ Feito</summary>

- **Área:** resultado · **Tipo:** conversao · **Esforço:** M · **Pacote:** W3-01 · **Mobile:** sim
- **Problema:** O PaywallCard é idêntico para Alta, Média e Baixa, ignora o caminho detectado, não explica o que se recebe e responde objeções só no /checkout.
- **Evidência:** ResultsPage.tsx:246-262, :305-354; CheckoutPage.tsx:357-386; results-*-full.png.
- **Proposta:** Título '{nome}, veja o passo a passo para {caminho mais forte}'; subtítulo honesto por categoria; lista vinda de OFFER.includes; '€30, pagamento único, com 30 dias de acesso' (nunca 'menos de €1/dia'); bloco 'Pagamento processado pela Stripe' + Privacidade + company (oculto se null); mini-FAQ em <details> com 3 itens vindos de OFFER.
- **Critérios de aceite:**
  - O título contém o caminho mais forte; 3 subtítulos distintos
  - Inclusões vindas de OFFER; placeholders vazios não renderizam
- **Arquivos:** `src/pages/quiz/ResultsPage.tsx`, `src/components/results/PaywallCard.tsx`
- **Implementação:** ✅ Feito no pacote W3-01 (onda 3). Melhoria aplicada. Quando o caminho mais forte é só 'a explorar' (weak), offerTitle usa o título neutro 'veja a análise completa do seu caso'. Isso evita prometer 'o passo a passo para a naturalização' a quem está irregular. Tem teste, e o screenshot da Baixa com caminho fraco foi conferido. Nos casos possible e strong o título continua com o caminho. O resto da oferta não mudou: OFFER sem vazios, nada de 'menos de €1' nem €4,90, mini-FAQ com 3 itens.

</details>

<details><summary><b>DI-031</b> [P1] Resultado: e-mail de acesso visível e editável antes de pagar — ✅ Feito</summary>

- **Área:** resultado · **Tipo:** ux · **Esforço:** S · **Pacote:** W3-01 · **Mobile:** sim
- **Problema:** O e-mail do quiz vira o login da conta sem que a pessoa o veja. Um erro de digitação faz perder o acesso depois de pagar.
- **Evidência:** ResultsPage.tsx:246-279; create-checkout-session:142-156; stripe-webhook:104-107.
- **Proposta:** Mostrar 'Seu acesso será criado para: x@… · Alterar' com input inline de 16px validado por zod, sugestão de correção de domínio (src/lib/email-typo.ts) e persistAssessment antes do checkout.
- **Critérios de aceite:**
  - O e-mail aparece acima do CTA
  - Alterar atualiza o localStorage e o próximo POST
  - 'x@gmial.com' sugere 'gmail.com' (teste)
- **Arquivos:** `src/pages/quiz/ResultsPage.tsx`, `src/lib/email-typo.ts`, `src/lib/email-typo.test.ts`
- **Implementação:** ✅ Feito no pacote W3-01 (onda 3). Melhorias aplicadas. (1) O email-typo deixou de 'corrigir' domínios reais: ymail.com, aol.com, mac.com, me.com, msn.com, gmx.com, gmx.net, aim.com, googlemail.com, protonmail.ch e oi.com.br entraram na lista. Para provedores regionais (hotmail, outlook, live, yahoo, msn), a sugestão não troca mais o país digitado (hotmail.com.ar, yahoo.ca, outlook.pt, yahoo.com.co ficam como estão) e corrige só o nome do provedor (hotmial.com.ar vira hotmail.com.ar). Erros como hotmail.com.bt, hotmail.co e gmail.co continuam sendo corrigidos; uol.com e bol.com sugerem .com.br em vez de aol.com. A suíte passou de 15 para 22 testes, e numa lista de cerca de 140 domínios reais não sobrou nenhum falso positivo. (2) Com o resultado aberto pelo link (resumedAt e nenhum assessmentId), corrigir o e-mail grava só no aparelho e não cria diagnóstico. O useStartCheckout salva uma única vez ao pagar, já com o e-mail novo (teste em access-email e na ResultsPage). (3) Em navegador que bloqueia o armazenamento (modo 'empty' e falha ao gravar no localStorage), clicar em comprar mostra o motivo real e envia checkout_failed{reason:'storage_unavailable'}, sem chamar a function. Antes aparecia 'Não encontramos seu diagnóstico'. Tem teste.

</details>

<details><summary><b>DI-032</b> [P1] Erros do botão de compra: português claro, timeout, repersistência e toasts no lugar certo — ✅ Feito</summary>

- **Área:** compra · **Tipo:** ux · **Esforço:** M · **Pacote:** W2-04 · **Mobile:** sim
- **Problema:** Toast em inglês no topo, beco 'refaça o quiz' quando o assessmentId falta, sem timeout e sem tratamento do bfcache. O Toaster cobre o header no celular.
- **Evidência:** ResultsPage.tsx:266-291; CheckoutPage.tsx:127-133; functions-js types.js:39/:69; App.tsx:15; results-unlock-network-error.png.
- **Proposta:** Criar src/lib/errors.ts (toUserMessage lendo FunctionsHttpError.context e FunctionsFetchError). useStartCheckout: repersistir se faltar o assessmentId, AbortController de 15s, erro inline com 'Tentar novamente' (role=alert), reset em pageshow persisted, Sentry. Toaster bottom-center no mobile, com safe-area.
- **Critérios de aceite:**
  - Function abortada: mensagem em pt e retry a até 120px do CTA
  - assessmentId null com dados locais não pede para refazer o quiz
  - Nenhum err.message cru em toast (grep)
- **Arquivos:** `src/lib/errors.ts`, `src/hooks/useStartCheckout.ts`, `src/App.tsx`
- **Implementação:** ✅ Feito no pacote W2-04 (onda 2). src/lib/errors.ts: toUserMessage (síncrona) e toUserError (lê o código do corpo da FunctionsHttpError), cobrindo FunctionsFetchError, FunctionsRelayError, timeout e falta de rede; acrescentei one_time_required. Hook: salva o diagnóstico de novo quando falta o assessmentId e uma vez após assessment_not_found. Ao salvar de novo, agora espera o compute-eligibility (até 4s), porque o redirecionamento para o Stripe cancelava a chamada. Tem AbortController de 15s, erro inline com role=alert e 'Tentar novamente' (medido: ~75px abaixo do CTA), destrava no pageshow persisted e manda ao Sentry só tags (sem e-mail nem session_id). App.tsx: Toaster bottom-center no celular, com offset de safe-area + --cookie-banner-h + 5,5rem e z-index 70; acrescentei o fallback addListener para Safari < 14. Nenhum err.message cru em toast (grep).

</details>

<details><summary><b>DI-033</b> [P1] Eventos da compra: paywall visto, checkout, cancelamento e purchase sem duplicação — 🟡 Parcial</summary>

- **Área:** analytics · **Tipo:** conversao · **Esforço:** S · **Pacote:** W2-04 · **Mobile:** não
- **Problema:** quiz_completed e checkout_completed duplicam a cada visita, e não há paywall_viewed, checkout_failed nem checkout_cancelled.
- **Evidência:** ResultsPage.tsx:66-75; SuccessPage.tsx:58-61; CheckoutPage.tsx:113.
- **Proposta:** Usar trackOnce: results_viewed por assessmentId; paywall_viewed (IntersectionObserver); paywall_cta_clicked {position}; checkout_failed {reason}; checkout_cancelled; email_edited. purchase fica no DI-026.
- **Critérios de aceite:**
  - Recarregar /results não gera novo evento
  - Com consentimento negado, nada é enviado
- **Arquivos:** `src/pages/quiz/ResultsPage.tsx`, `src/pages/checkout/CheckoutPage.tsx`
- **Implementação:** 🟡 Parcial no pacote W2-04 (onda 2). Feito: quiz_completed e results_viewed com trackOnce por envio do quiz (session_id, que é estável mesmo quando o assessmentId só aparece depois), paywall_viewed por IntersectionObserver (metade do card visível), paywall_cta_clicked {position: results_paywall|checkout}, checkout_started {value, currency}, checkout_failed {reason, status} e checkout_cancelled (uma vez, URL limpa). Com consentimento negado nada é enviado (o analytics só marca o trackOnce quando envia de fato; coberto no E2E). Falta o email_edited: não existe UI de editar o e-mail neste pacote. Ela é do DI-031 (W3-01), que deve disparar track('email_edited', {position}).

</details>

<details><summary><b>DI-034</b> [P1] Landing reposicionada para nacionalidade, com preço único e sem promessas falsas — ✅ Feito</summary>

- **Área:** landing · **Tipo:** conversao · **Esforço:** M · **Pacote:** W3-02 · **Mobile:** sim
- **Problema:** A landing vende 'visto' (que cai em 'Em breve'), '20 perguntas', 'Válido para sempre' e €4,90 'Mais Popular' como alternativa. Hero de template, title divergente do OG e página de 4052px.
- **Evidência:** LandingPage.tsx:5-14, :21-54, :108-139; index.html:8-9 vs :16-17; useSEO.ts:10-13; shots/design-visual-pwa/01-landing-fold.png.
- **Proposta:** H1 de nacionalidade, microcopy 'Grátis · sem criar conta · poucos minutos', hero em primary sólido com mock do cartão de resultado e motivo de azulejo. Passos honestos. Um único cartão de €30 vindo de OFFER e nenhuma menção a €4,90. Seções com py-12 sm:py-20. Title e description do index.html e defaults do useSEO alinhados; og-image .jpg. Manter cta-start-quiz-hero.
- **Critérios de aceite:**
  - Zero '€4,90', 'Válido para sempre', 'Mais Popular' e '20 perguntas' em /
  - H1, title e og:title sobre o mesmo produto
  - Altura em 375px pelo menos 25% menor
- **Arquivos:** `src/pages/LandingPage.tsx`, `index.html`, `src/hooks/useSEO.ts`, `e2e/tests/01-landing.spec.ts`
- **Implementação:** ✅ Feito no pacote W3-02 (onda 3). H1 de nacionalidade alinhado com title, og:title e twitter:title (DEFAULT_TITLE no useSEO = <title> do index.html, conferido por teste). Microcopy 'Grátis · sem criar conta · poucos minutos'. Hero em bg-primary com bg-azulejo-inverse e prévia do pré-resultado rotulada como 'Exemplo ilustrativo'. Passos honestos. Um único cartão de preço vindo de OFFER (preço, 30 dias, includes, delivery; guarantee e reviewedBy só aparecem se o dono preencher). Seções py-12 sm:py-20. Não aparece nenhum '€4,90', 'Válido para sempre', 'Mais Popular', '20 perguntas' ou advogados (teste unitário e e2e). Altura em 375px: 3993px antes (dev, fontes de reserva) contra 2951px depois (dev) e 2960px (build com Literata/Figtree reais), ou seja, -26%. O og-image .jpg já era usado no index.html; o default do useSEO passou de .png para a URL absoluta .jpg. cta-start-quiz-hero mantido. lang continua pt-PT, porque a troca para pt-BR é do DI-074 (W4-04).

</details>

<details><summary><b>DI-035</b> [P1] Landing: CTA fixo no celular, FAQ de objeções e 'quem somos' só com dados reais — ✅ Feito</summary>

- **Área:** landing · **Tipo:** conversao · **Esforço:** M · **Pacote:** W3-02 · **Mobile:** sim
- **Problema:** Em 4052px de rolagem não há CTA fixo, e não há FAQ, prévia do que se recebe nem identificação de quem está por trás.
- **Evidência:** LandingPage.tsx:17-160; shots/mobile-topo-funil/landing-375-full.png; TermsPage.tsx:11-16.
- **Proposta:** MobileStickyCta (StickyCTA): aparece quando o hero sai da tela e some na seção final e com o banner de cookies. Faq.tsx com <details> (grátis?, tempo, o que recebo, 30 dias, se der Baixa, dados, quem somos). 'Quem somos' e Testimonials leem company.ts e um array vazio. Prévia ilustrativa rotulada.
- **Critérios de aceite:**
  - CTA fixo de 48px ou mais depois do hero
  - FAQ com 6 ou mais itens incluindo 30 dias
  - Nenhum depoimento, número ou selo sem dado real
- **Arquivos:** `src/pages/LandingPage.tsx`, `src/components/landing/MobileStickyCta.tsx`, `src/components/landing/Faq.tsx`
- **Nota para o dono:** O dono fornece 'quem somos' e depoimentos reais com autorização.
- **Implementação:** ✅ Feito no pacote W3-02 (onda 3). MobileStickyCta construído sobre o StickyCTA: Button md de 48px, aparece quando a linha do CTA do hero sai da tela, some com o CTA do cartão de preço visível (inlineCtaRef), some na seção final e abaixo dela (IntersectionObserver), some enquanto --cookie-banner-h > 0 (MutationObserver) e herda o comportamento de esconder com campo focado e respeitar a safe-area. Faq.tsx usa <details> nativo com 7 itens: grátis, tempo, o que vem na análise, '30 dias', resultado baixo, dados e quem somos. 'Quem somos' lê COMPANY e getCompanyIdentification (campos null não renderizam, também no Footer) e o SUPPORT_EMAIL; o WhatsApp só aparece com HAS_WHATSAPP. Testimonials lê src/data/testimonials.ts, que vem vazio e filtra entradas sem authorizedAt ou com placeholder. Não há depoimento, número nem selo inventado.

</details>

<details><summary><b>DI-036</b> [P1] Banner de cookies cobre o CTA do hero e tem botões desiguais — ✅ Feito</summary>

- **Área:** landing · **Tipo:** ux · **Esforço:** S · **Pacote:** W3-02 · **Mobile:** sim
- **Problema:** O banner de 147–167px cobre o CTA do hero com altura útil de até ~735px. Os botões têm 38px e 'Aceitar' tem mais destaque que 'Rejeitar'.
- **Evidência:** CookieBanner.tsx:29-66; landing-375x667-cookie.png; LandingPage.tsx:21-28.
- **Proposta:** Texto em 1–2 linhas, Rejeitar e Aceitar iguais em grid-cols-2 com h-11, sem o X redundante, safe-area, altura ≤110px. Publicar --cookie-banner-h. Hero com py-10 sm:py-20. Manter os testids.
- **Critérios de aceite:**
  - Em 375x667 o CTA do hero fica 100% visível
  - Banner ≤120px em 360px; botões ≥44px e com a mesma classe
  - O spec 02 continua passando
- **Arquivos:** `src/components/CookieBanner.tsx`
- **Implementação:** ✅ Feito no pacote W3-02 (onda 3). Banner com 108px em 360px e em 375x667 (antes 147–167px). Texto em 2 linhas e correto para o 'Aceitar' (= só estatística), com link para a Política de Cookies. Rejeitar e Aceitar na mesma classe (h-11 min-h-11 w-full, grid-cols-2, variante secondary). Sem o X, com pb safe-area. Continua publicando --cookie-banner-h e agora também fecha quando a escolha é feita na /cookies (onConsentChange). Leitura síncrona do consentimento, sem salto na primeira pintura. Hero com py-10 sm:py-20. Em 375x667 o CTA do hero vai até 386px, com o banner começando em 560px. Testids cookie-banner, cookie-accept e cookie-reject preservados; os specs 02 passam.

</details>

<details><summary><b>DI-037</b> [P1] Lista de espera 'Em breve' perde todos os e-mails e estoura a largura — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** bug · **Esforço:** S · **Pacote:** W3-03 · **Mobile:** sim
- **Problema:** O insert anônimo é bloqueado pela RLS, mas a tela mostra 'Guardado!'. Também há overflow horizontal (448px em 375) e a promessa 'Conectá-lo com um advogado'.
- **Evidência:** QuizPage.tsx:59-80, :156, :174-206; pg_policies sem INSERT para anon; 1 linha com waitlist em 12/05; quiz-comingsoon-visto.png.
- **Proposta:** Usar a RPC upsert_anon_assessment com session_id `${sid}-wl`, answers {processo_tipo, waitlist:true}; erro com 'Tentar de novo'. Form em flex-col sm:flex-row, input de 16px, botão w-full. Remover a promessa de advogado e adicionar cross-sell 'Verificar se tenho direito à nacionalidade'. Evento waitlist_joined.
- **Critérios de aceite:**
  - POST em /rpc/upsert_anon_assessment (mock) e nenhum POST em /assessments
  - Falha não mostra 'Guardado!'
  - scrollWidth === innerWidth em 360, 375 e 390
- **Arquivos:** `src/pages/quiz/QuizPage.tsx`
- **Implementação:** ✅ Feito no pacote W3-03 (onda 3). A lista de espera agora grava pela RPC upsert_anon_assessment: session_id `${sid}-wl` (limitado a 64 caracteres), answers {processo_tipo, waitlist:true}, status incomplete e UTMs. Não existe mais POST em /assessments. 'Pronto!' só aparece depois que o servidor confirma; na falha aparecem a mensagem de erro e o botão 'Tentar de novo'. waitlist_joined dispara só no sucesso; a falha vai para o Sentry sem PII. O formulário usa noValidate e o Input do DS (16px), com botão w-full no celular. Medi em 360/375/390: scrollWidth igual a clientWidth. Sem promessa de advogado. Novo atalho 'Verificar se tenho direito à nacionalidade', que troca processo_tipo e segue para caso_tipo. O foco vai para a confirmação. Coberto por vitest (useAssessment.test.ts, useQuiz.test.tsx) e pelo spec 09 com a RPC mockada.

</details>

<details><summary><b>DI-038</b> [P1] Navegação pública: rolagem restaurada, âncoras, menu mobile e modo foco no funil — ✅ Feito</summary>

- **Área:** layout · **Tipo:** ux · **Esforço:** M · **Pacote:** W2-08 · **Mobile:** sim
- **Problema:** Sem ScrollRestoration, /#precos não rola até a seção. O menu de 36px não fecha ao navegar e não tem aria-expanded nem os itens principais. Quiz e resultado mostram o rodapé completo e o login tem logo duplicado.
- **Evidência:** grep ScrollRestoration vazio; Header.tsx:10, :76-109; Footer.tsx:21-34; Layout.tsx:8-13; LoginPage.tsx:124-128; menu-after-nav-375.png.
- **Proposta:** <ScrollRestoration/> no Layout e efeito de hash na LandingPage (lazy) com scroll-mt-20 nas seções. Header: fecha ao mudar location e com Escape, botão de 44px com aria-expanded/aria-controls, itens Como funciona, Preços, Entrar e CTA de 48px. Modo foco em /quiz, /results e /checkout: header reduzido, sem Footer e links legais numa linha. Footer com links min-h-11. min-h-dvh no lugar de min-h-screen. Remover o logo duplicado do Login.
- **Critérios de aceite:**
  - Rodapé → /#como-funciona deixa a seção entre 0 e 80px do topo
  - O menu fecha após navegar; aria-expanded alterna
  - Sem Footer em /quiz no mobile
- **Arquivos:** `src/components/layout/Layout.tsx`, `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`, `src/pages/LandingPage.tsx`, `src/pages/auth/LoginPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-08 (onda 2). Feito. (1) <ScrollRestoration/> no Layout. (2) Na LandingPage: efeito de hash depois da pintura, que ignora o POP para manter a posição salva ao voltar; scroll-mt-16 em #como-funciona e #precos; o 'Como funciona' do hero passou a ser Link (o <a href='#'> nativo bagunçava a rolagem salva). Medi em 375x812 e 360x740: depois de clicar em /#como-funciona ou /#precos a partir de /termos, a seção fica a 64px do topo. Usei scroll-mt-16 em vez do scroll-mt-20 do card: com 20 dava exatamente 80px, no limite do critério, e deixava uma faixa de 16px de outra seção aparecendo sob o header. (3) Header: botão do menu de 44x44 com aria-expanded e aria-controls. O menu fecha ao mudar de location (clique, navegação programática ou voltar), com Escape (o foco volta ao botão) e com toque fora. Itens: Como funciona, Preços, Entrar e CTA de 48px; logado mostra Meu painel e Sair. Clique no CTA registrado via track('landing_cta_clicked'). (4) Modo foco por useMatch em /quiz, /results e /checkout (exatos): header só com a marca e sem sticky, sem Footer completo, links legais numa linha. Medido: zero footer completo e zero botão de menu nas três rotas. (5) Footer: links com min-h-11, sentence case, tokens, aviso 'não constituem aconselhamento jurídico' e reserva para --cookie-banner-h e safe-area; saiu a promessa 'Análise jurídica personalizada'. (6) min-h-dvh no Layout. (7) LoginPage: o logo duplicado já tinha sido removido pelo W1-06 na onda 1; conferi na tela e não precisei mexer no arquivo. 21 testes novos em Layout.test.tsx, um deles verificado por mutação (remover a guarda de POP faz o teste falhar).

</details>

<details><summary><b>DI-039</b> [P1] Quiz: barra fixa na zona do polegar, auto-avanço e topo da pergunta ao avançar — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** ux · **Esforço:** M · **Pacote:** W2-03 · **Mobile:** sim
- **Problema:** O botão 'Próximo' fica 141–232px abaixo da dobra, tem 40px, e a nova pergunta abre já rolada (h2 em -283px). As opções têm só ~210px de largura e 14px.
- **Evidência:** QuizPage.tsx:83, :100, :118-137; QuizQuestion.tsx:117, :171; quiz-q2-360.png e quiz-q3-soB-375.png; 20 de 22 perguntas são radio.
- **Proposta:** No mobile, barra fixa (padrão decisoes_de_design) com 'Anterior' em ícone e 'Próximo' flex-1 de 48px; pb-28 no conteúdo. Ao mudar currentIndex: scrollTo(0) e foco no h2 (tabIndex -1). Auto-avanço em radio após ~250ms via efeito que observa currentAnswer. Card p-4 sm:p-8, opções text-base e px-3.5, 100dvh.
- **Critérios de aceite:**
  - 'Próximo' visível sem rolar em 360x740 e 375x812
  - Depois de avançar, scrollY 0 e activeElement = h2
  - Radio avança sozinho em ≤400ms; multiselect não avança
- **Arquivos:** `src/pages/quiz/QuizPage.tsx`, `src/components/quiz/QuizQuestion.tsx`
- **Implementação:** ✅ Feito no pacote W2-03 (onda 2). Barra fixa no celular com o Button do DS: 'Anterior' em ícone (nome acessível 'Pergunta anterior') e 'Próximo' flex-1 de 48px. Fica em bottom var(--cookie-banner-h), com z-30 e safe-area, e some quando um campo de texto ou número está focado. O espaço reservado no fim do conteúdo é medido com ResizeObserver. Ao trocar de pergunta: scrollTo(0) e foco no h2 (tabIndex -1). A escolha única avança sozinha em 250ms, só por toque, clique, Enter ou Espaço, nunca pelas setas. A múltipla escolha e a última pergunta não avançam sozinhas. O primeiro toque 'fantasma' até 500ms depois do auto-avanço é ignorado, e o 'Anterior' cancela um auto-avanço pendente. Card p-4 sm:p-8, opções de 16px com px-3.5 e altura ≥52px, 100dvh, Container px-4. Verificado em Playwright a 375x812 e 360x740: 'Próximo' visível sem rolar, scrollY 0 e activeElement = h2 depois de avançar, radio avança em ~330ms (contando o clique), multiselect não avança, barra acima do banner de cookies, sem rolagem horizontal.

</details>

<details><summary><b>DI-040</b> [P1] Quiz: progresso honesto ('Pergunta 1 de 1' e 'Concluir' na primeira tela) — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** ux · **Esforço:** S · **Pacote:** W2-03 · **Mobile:** sim
- **Problema:** O total muda conforme as respostas: 'Concluir' aparece na primeira tela, o total salta e a porcentagem nunca chega a 100%. Os temas são fixos e duplicados.
- **Evidência:** quiz-q1-375.png; useQuiz.ts:59-64, :195; QuizProgress.tsx:12, :42-63; QuizPage.tsx:135.
- **Proposta:** Sem total antes de caso_tipo; 'Ver meu resultado' só quando não houver próxima pergunta visível; porcentagem = respondidas/visíveis e 100% na captura; segmentos a partir de themeProgress; tema mostrado uma vez; barra com scaleX.
- **Critérios de aceite:**
  - Nunca 'de 1' nem 'Concluir' na primeira pergunta
  - Nunca aparece outra pergunta depois de 'Ver meu resultado'
  - A captura mostra 100%
- **Arquivos:** `src/hooks/useQuiz.ts`, `src/components/quiz/QuizProgress.tsx`, `src/pages/quiz/QuizPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-03 (onda 2). Sem total antes de processo_tipo e caso_tipo respondidos: a tela mostra só 'Pergunta 1', nunca 'de 1'. 'Ver meu resultado' só aparece quando não há próxima pergunta visível (nextStepAfter). Pergunta opcional mostra 'Pular esta pergunta', ou 'Pular e ver meu resultado' quando é a última. Porcentagem = respondidas ÷ visíveis; a captura mostra 100%. Barra segmentada pelos temas visíveis, com scaleX. O tema aparece uma vez só, no progresso. Coberto por testes de quiz-flow, useQuiz e QuizPage e conferido no navegador.

</details>

<details><summary><b>DI-041</b> [P1] Quiz: retomada real, sessão nova depois do envio e voltar do celular entre perguntas — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** retencao · **Esforço:** M · **Pacote:** W2-03 · **Mobile:** sim
- **Problema:** A intro promete retomar, mas o quiz volta à pergunta 1 com 0%. O voltar do celular sai do quiz. A sessão nunca é limpa: refazer reaproveita o session_id e, com o assessment já vinculado, o paywall entra em loop.
- **Evidência:** QuizIntro.tsx:65-67; useQuizState.ts:25-36; useQuizPersistence.ts:3-57; useQuiz.ts:108-149, :187-191; ResultsPage.tsx:113-117; migration anon_rpc:116-122; quiz-resume-q1-390.png.
- **Proposta:** Persistir currentKey, status e updatedAt (descartar após 30 dias). Ação RESUME: card 'Continue de onde parou' com Continuar/Recomeçar. Etapa em ?passo= para o voltar/avançar do sistema. Após o envio, completed + sessionId novo. 'Refazer' chama resetQuiz. Erro 42501 → novo sessionId e retry. Nunca sobrescrever um assessmentId válido com null.
- **Critérios de aceite:**
  - Recarregar na pergunta 5 → 'Continuar' leva à 5
  - Voltar na pergunta 3 mostra a 2 em /quiz
  - Refazer gera novo sessionId e assessmentId não nulo (mock)
  - Testes do reducer RESUME/RESET
- **Arquivos:** `src/hooks/useQuizPersistence.ts`, `src/hooks/useQuizState.ts`, `src/hooks/useQuiz.ts`, `src/components/quiz/QuizIntro.tsx`, `src/pages/quiz/QuizPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-03 (onda 2). O worktree tinha nascido da base errada (4c49c4d). Rodei reset para a4fd3b6 (BASE_OK) e trouxe o WIP onda2/W2-03-wip com cherry-pick, sem conflitos. Revisei e completei o WIP. A sessão guarda currentKey, status e updatedAt; sessão parada há mais de 30 dias ou concluída é descartada. Ação RESUME e card 'Continue de onde parou' (Continuar / Recomeçar do zero). A etapa fica em ?passo= (pergunta N, contato, em-breve): o voltar e o avançar do sistema trocam de pergunta sem sair de /quiz e sem pular obrigatórias (clampStep). O 'Anterior' usa history.back quando pode, para não acumular entradas. Depois do envio gravado a sessão gira (session_id novo); /quiz?novo=1 também começa do zero. Erro 42501 gera session_id novo e uma nova tentativa. Um assessmentId válido nunca vira null. Testes: reducer RESUME/RESET/GO_TO_STEP, persistência, e useQuiz com mocks: recarregar na 5 → Continuar → 5; voltar na 3 → 2 em /quiz; Refazer → session_id novo e assessmentId não nulo; 42501 → retry. Também conferido no navegador em 375x812 e 360x740.

</details>

<details><summary><b>DI-042</b> [P1] Quiz: processamento sem esperar a OpenAI e envio só das respostas visíveis — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** performance · **Esforço:** S · **Pacote:** W2-03 · **Mobile:** sim
- **Problema:** O submit espera compute-eligibility, duas chamadas OpenAI e o e-mail, sem timeout, antes de mostrar um resultado calculado no cliente. Respostas de ramos ocultos também são enviadas.
- **Evidência:** useQuiz.ts:98-174 ('fire & forget' com await); generate-explanation:110-191; QuizPage.tsx:229-257.
- **Proposta:** persistAssessment (timeout de 8s) → compute-eligibility com timeout de 8s → generate-explanation sem await e com .catch para o Sentry → navigate (mínimo de ~1,2s). Aplicar pruneAnswers (DI-067) ao persistir. Chips de processamento com os temas reais. quiz_completed uma vez por sessão, com duration_ms.
- **Critérios de aceite:**
  - Functions com 20s de atraso: /results em ≤9s
  - Payload sem chaves ocultas
  - Mesmo score e categoria na tela de resultado
- **Arquivos:** `src/hooks/useQuiz.ts`, `src/pages/quiz/QuizPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-03 (onda 2). persistAssessment com timeout de 8s → compute-eligibility com timeout de 8s (teto total de 9s) → generate-explanation sem await, com erros para o Sentry → navigate, com mínimo de 1,2s. Se a gravação chega depois do timeout, o id entra no resultado guardado e o cálculo começa. pruneAnswers no envio (payload sem chaves de ramos ocultos) e questionsAnswered = respondidas visíveis. Os chips do processamento mostram os temas reais. quiz_completed sai por trackOnce, uma vez por envio, com duration_ms. Testes com fake timers: functions 20s atrasadas → /results em ≤9s; payload podado; score e categoria iguais aos do resultado guardado.

</details>

<details><summary><b>DI-043</b> [P1] Formulário de captura: sem zoom, validação única, voltar, privacidade e opt-in — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** ux · **Esforço:** S · **Pacote:** W3-03 · **Mobile:** sim
- **Problema:** Inputs de 14px, bolha nativa misturada ao erro do Zod, sem aria, sem botão de voltar, 'nunca partilhados com terceiros' (falso) e sem consentimento.
- **Evidência:** QuizCaptureForm.tsx:8-12, :44-143; capture-errors-390.png; PrivacyPage.tsx:32-39.
- **Proposta:** noValidate com mode onTouched, Input do DS (16px, autoCapitalize, enterKeyHint, inputMode). aria-invalid/describedby e role=alert. BACK_FROM_CAPTURE. 'Como podemos te chamar?' + e-mail; telefone 'WhatsApp (opcional)'. Checkbox desmarcado marketing_opt_in em answers. Linha 'Usamos seus dados para o seu diagnóstico. Política de Privacidade'. Ícone Target no lugar do emoji.
- **Critérios de aceite:**
  - Inputs com 16px ou mais e sem bolha nativa
  - Volta à última pergunta sem perder respostas
  - Link para /privacidade e opt-in desmarcado chegando em p_answers
- **Arquivos:** `src/components/quiz/QuizCaptureForm.tsx`, `src/hooks/useQuizState.ts`, `src/hooks/useQuiz.ts`
- **Nota para o dono:** O dono decide se mantém o telefone (padrão: opcional).
- **Implementação:** ✅ Feito no pacote W3-03 (onda 3). QuizCaptureForm reescrito com o Input do DS: 16px, rótulo, aria-invalid/aria-describedby e erro com role=alert. Usa noValidate com Zod em mode onTouched, mais autoCapitalize, inputMode e enterKeyHint; Enter leva ao próximo campo. Rótulos: 'Como podemos te chamar?', 'E-mail' e 'WhatsApp (opcional)'. O checkbox de novidades vem desmarcado e chega em p_answers.marketing_opt_in (boolean) sem mudar a assinatura do RPC; não entra nas respostas usadas para escolher o session_id. Linha de privacidade com link para /privacidade (abre em nova aba). Ícone Target no lugar do emoji; sem eyebrow em caixa-alta e sem pt-PT. Nova ação BACK_FROM_CAPTURE no reducer: 'Voltar às perguntas' mostra a última pergunta com a resposta marcada.

</details>

<details><summary><b>DI-044</b> [P1] Inputs com 16px ou mais em todo o app (anti-zoom do iOS) — ✅ Feito</summary>

- **Área:** ui · **Tipo:** ui · **Esforço:** S · **Pacote:** W1-08 · **Mobile:** sim
- **Problema:** Campos de 14px (text-sm) disparam o zoom automático no Safari do iOS na captura, no login, no chat e nas definições.
- **Evidência:** QuizCaptureForm.tsx:71/92/114; LoginPage.tsx:158; QuizPage.tsx:198; QuizQuestion.tsx:225; ChatPage.tsx:237; SettingsPage.tsx:157/168.
- **Proposta:** Em src/index.css, fora de @layer: `@media (max-width:767px){input:not([disabled]):not([type=checkbox]):not([type=radio]),select,textarea{font-size:16px!important}}`. Cada pacote troca text-sm por text-base nos campos que tocar.
- **Critérios de aceite:**
  - Script Playwright: nenhum campo focável abaixo de 16px a 375px em /, /quiz, /login e /dashboard/*
  - Desktop inalterado
- **Arquivos:** `src/index.css`
- **Implementação:** ✅ Feito no pacote W1-08 (onda 1). src/index.css: regra anti-zoom fora de @layer para max-width 767px (input de texto, select e textarea a 16px !important). Exclui os tipos não textuais e os campos com text-lg ou maior, para não encolher campos grandes, como um futuro OTP. Também adicionei prefers-reduced-motion (0.01ms para o Radix Presence continuar desmontando), :focus-visible padrão e color-scheme only light. Verificado com Playwright a 375px: todos os campos visíveis de /login (3) e da demo estão em 16px; / e /quiz não têm campos na primeira tela; no desktop o /login segue com 14px/12px (inalterado). Não deu para verificar /dashboard/* porque exige login em produção.

</details>

<details><summary><b>DI-045</b> [P1] Dashboard no celular: barra de navegação inferior e logout seguro — ✅ Feito</summary>

- **Área:** dashboard · **Tipo:** ux · **Esforço:** M · **Pacote:** W2-05 · **Mobile:** sim
- **Problema:** Abaixo de 768px não há navegação, Documentos fica inacessível e o único botão no topo é sair (20px, sem rótulo e sem confirmação; voltar exige um magic link).
- **Evidência:** DashboardLayout.tsx:29, :98-105; home-paid.png e documents-paid.png; grep /dashboard/documents só na sidebar.
- **Proposta:** BottomNav md:hidden com Início, Análise, Chat (cadeado se bloqueado), Documentos e Conta; ícone + rótulo, alvo de 48px, aria-current e safe-area. main com p-4 pb-24. Logo leva a /dashboard. Sair vai para Conta, com confirmação e aria-label. ScrollRestoration no layout. Link do admin para staff.
- **Critérios de aceite:**
  - Todas as seções a 1 toque em 375x812
  - Nenhum alvo menor que 44px; sair exige confirmação
  - O último elemento não fica atrás da barra; desktop inalterado
- **Arquivos:** `src/components/layout/DashboardLayout.tsx`, `src/components/dashboard/BottomNav.tsx`, `src/pages/dashboard/SettingsPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-05 (onda 2). BottomNav md:hidden com 5 seções (ícone + rótulo, alvos de 56px, aria-current, safe-area, respeita --cookie-banner-h, publica --bottom-nav-h e some com o teclado aberto). O logo leva a /dashboard com alvo de 44px. O <main> reserva o espaço da barra, da safe-area e do banner de cookies. ScrollRestoration no layout, link do admin para hub, 'Sair' só em Conta e sempre com confirmação. Também corrigi o sheet de saída, que não abria em dev: ele era montado já aberto e o StrictMode desfazia a entrada do histórico. O desktop continua com a barra lateral.

</details>

<details><summary><b>DI-046</b> [P1] Home do dashboard por estado de acesso: não pagante, ativo, perto de expirar e expirado — ✅ Feito</summary>

- **Área:** dashboard · **Tipo:** retencao · **Esforço:** M · **Pacote:** W2-05 · **Mobile:** sim
- **Problema:** O prazo de 30 dias é invisível. O expirado vê 'Complete o pagamento' e dois CTAs conflitantes. O não pagante não vê nenhum CTA de €30 na primeira tela.
- **Evidência:** DashboardHomePage.tsx:46-48, :76-90, :138-152, :299; home-expired.png e home-unpaid.png; grep one_time_access_expires_at só no AuthContext.
- **Proposta:** Usar getAccessState. Ativo: chip 'Acesso até dd/mm (N dias)'. Expiring (≤7 dias): banner âmbar 'Manter acesso por €4,90/mês'. Expirado (?acesso=expirado): 'Seu acesso terminou em dd/mm', vias pelo nome, CTA primário €4,90 e €30 secundário. Não pagante: CTA de €30 dentro do banner do resultado + StickyCTA; cards bloqueados abrem sheet de benefícios.
- **Critérios de aceite:**
  - Mocks dos 4 estados renderizam a copy certa e 1 CTA primário
  - Nenhum 'Complete o pagamento' para quem já pagou
  - CTA de €30 visível sem rolar para o não pagante
- **Arquivos:** `src/pages/dashboard/DashboardHomePage.tsx`, `src/components/dashboard/AccessBanner.tsx`
- **Implementação:** ✅ Feito no pacote W2-05 (onda 2). A home tem uma tela para cada estado. 'active': chip 'Acesso até dd/mm (N dias)'. 'expiring' (até 7 dias): aviso âmbar com 'Manter acesso por €4,90/mês'. 'expired': data do fim, caminhos pelo nome, €4,90 como principal e 'Comprar mais 30 dias por €30' como secundário. 'none': CTA de €30 dentro do resultado, visível sem rolar a 375x812 e 360x740, mais StickyCTA acima da BottomNav. 'recurring': chip 'Assinatura ativa'. Cada estado tem 1 data-primary-cta (testado) e não há 'Complete o pagamento'. Itens bloqueados abrem o sheet também no expirado, para nunca ser um toque sem resposta no Início.

</details>

<details><summary><b>DI-047</b> [P1] Upsell €4,90 honesto, no momento certo e confirmado depois da assinatura — ✅ Feito</summary>

- **Área:** dashboard · **Tipo:** conversao · **Esforço:** S · **Pacote:** W2-05 · **Mobile:** sim
- **Problema:** O card aparece logo depois do pagamento, acima da análise, promete 'alertas legislativos' e 'revisão do processo' (inexistentes) e omite o valor real e o limite de 12 meses.
- **Evidência:** DashboardHomePage.tsx:100-101, :164-220; grep 'legisla|alerta' sem implementação; AuthContext sem polling.
- **Proposta:** Copy de OFFER.recurring ('Mantenha painel, análise e documentos depois dos 30 dias' + chat · '€4,90/mês · até 12 meses · cancele quando quiser'). Destaque só depois de abrir a análise, com ≤7 dias restantes ou no sheet do chat. ?subscribed=1 → refreshUser a cada 2s por até 20s, toast e card escondido. Eventos upsell_viewed e upsell_clicked.
- **Critérios de aceite:**
  - Sem 'alertas' nem 'revisão do processo'
  - Logo após o pagamento, o card não é o primeiro bloco
  - Retorno com ?subscribed=1 esconde o card (mock)
- **Arquivos:** `src/pages/dashboard/DashboardHomePage.tsx`, `src/components/dashboard/SubscriptionUpsellCard.tsx`
- **Nota para o dono:** Um recurso de novidades legais só deve ser prometido quando o dono puder mantê-lo.
- **Implementação:** ✅ Feito no pacote W2-05 (onda 2). Copy só a partir de OFFER.recurring ('€4,90/mês · até 12 meses · cancelamento pelo suporte'), sem 'alertas', 'revisão do processo' nem 'ilimitado'. O card é discreto, fica no fim e só aparece depois de abrir a análise (flag no localStorage marcada pelo layout). Com ≤7 dias vira o aviso âmbar, e o chat oferece no sheet. ?subscribed=1 chama refreshUser a cada 2 s por até 20 s, mostra o estado e um toast e esconde as ofertas. Eventos upsell_viewed e upsell_clicked via track().

</details>

<details><summary><b>DI-048</b> [P1] Linha do tempo com dados reais e boas-vindas depois da compra — ✅ Feito</summary>

- **Área:** dashboard · **Tipo:** retencao · **Esforço:** S · **Pacote:** W2-05 · **Mobile:** sim
- **Problema:** A home mostra 'Análise jurídica em curso' para sempre, com a análise pronta, e nenhum onboarding. Saudação com emoji e 'Olá, bem-vindo!'.
- **Evidência:** DashboardHomePage.tsx:37-39, :73, :233-235, :393-419; SuccessPage.tsx:129-131.
- **Proposta:** Linha do tempo derivada de completedAt, one_time_paid_at e iaExplanationFull ('A gerar…' se nulo) e do progresso de documentos. Card de boas-vindas no primeiro acesso pago (flag em localStorage com try/catch). Saudação sem emoji; ícones lucide.
- **Critérios de aceite:**
  - Nenhum 'Em curso' sem dado que o sustente
  - As boas-vindas aparecem uma única vez
  - Sem emojis como ícone na home
- **Arquivos:** `src/pages/dashboard/DashboardHomePage.tsx`
- **Implementação:** ✅ Feito no pacote W2-05 (onda 2). A linha do tempo vem de completedAt, one_time_paid_at, iaExplanationFull ('Gerando…' só com acesso; no expirado mostra 'Acesso encerrado em dd/mm') e da contagem de documentos (query em ['user-documents', userId, 'count']). Card de boas-vindas uma única vez (flag no localStorage com try/catch). Saudação 'Olá, Ana', sem emoji, com ícones lucide. Não há mais 'Em curso'.

</details>

<details><summary><b>DI-049</b> [P1] Checklist de próximos passos por via, ligado ao upload — ✅ Feito</summary>

- **Área:** dashboard · **Tipo:** retencao · **Esforço:** L · **Pacote:** W3-04 · **Mobile:** sim
- **Problema:** Não há plano de ação. Documentos tem 5 itens fixos, iguais para qualquer via, e o progresso só conta 'verified', que ninguém atribui.
- **Evidência:** DocumentsPage.tsx:28-34, :132, :152-156, :207; grep user_documents em admin = 0.
- **Proposta:** useChecklist a partir de nationality-paths (etapas e documentos por via). Estado pendente/tenho/enviado ('enviado' vem de user_documents), com 'tenho' em localStorage por user.id. Card 'Próximo passo' na home com barra X/Y. Evento checklist_item_checked.
- **Critérios de aceite:**
  - A via casamento não lista 'Doc. Parentes Portugueses'
  - 'Tenho' persiste após reload
  - Upload marca o item como 'enviado'
- **Arquivos:** `src/hooks/useChecklist.ts`, `src/pages/dashboard/DocumentsPage.tsx`, `src/pages/dashboard/DashboardHomePage.tsx`, `src/components/dashboard/NextStepCard.tsx`
- **Implementação:** ✅ Feito no pacote W3-04 (onda 3). useChecklist (src/hooks/useChecklist.ts) monta o checklist a partir de nationality-paths. Hoje todos os caminhos estão PENDING, então entra uma lista genérica e neutra: identificação e certidão de nascimento, mais o documento da ligação que define o caminho. A via casamento não lista documentos de parentes (há teste). Estados pendente/'Já tenho'/enviado: 'Já tenho' fica em localStorage por user.id e persiste após recarregar (há teste); 'enviado' vem de user_documents (há teste). Evento checklist_item_checked. NextStepCard na home com o próximo item, a barra X de Y e uma ação secundária; a linha do tempo conta pela mesma query. As chaves antigas (passaporte, assento_nascimento, documento_parentes) foram reaproveitadas; arquivos de tipos antigos aparecem em 'Outros arquivos'.

</details>

<details><summary><b>DI-050</b> [P1] Análise legível no celular: markdown, seções recolhíveis e PDF — ✅ Feito</summary>

- **Área:** dashboard/análise · **Tipo:** ux · **Esforço:** M · **Pacote:** W2-06 · **Mobile:** sim
- **Problema:** O entregável de €30 aparece com '**' literais, num bloco de 3928px, sem sumário e sem como guardar.
- **Evidência:** Produção: 3 de 3 full com '**'; AnalysisPage.tsx:283-285; prose sem efeito (sem typography); analysis-paid-full.png.
- **Proposta:** src/components/MarkdownText.tsx (react-markdown sem HTML). Dividir por '## ' em acordeão (o primeiro aberto), resumo em 3 bullets, chips de âncora, 'Guardar PDF' via window.print com @media print. 'Índice de elegibilidade' com nota de não garantia. Eventos analysis_viewed e analysis_pdf_clicked.
- **Critérios de aceite:**
  - Nenhum '**' visível
  - Página inicial pelo menos 40% menor em 375px
  - Impressão limpa, sem nav nem CTAs
- **Arquivos:** `src/components/MarkdownText.tsx`, `src/pages/dashboard/AnalysisPage.tsx`
- **Implementação:** ✅ Feito no pacote W2-06 (onda 2). MarkdownText com react-markdown: sem HTML cru (skipHtml + allowedElements), links só http(s)/mailto e sem '**' soltos. A análise é dividida pelas seções '## ' (ou pelos títulos em negrito das análises antigas) num acordeão com a primeira aberta, mais chips de atalho e um resumo em 3 pontos com o índice de elegibilidade e a nota de não garantia. 'Salvar em PDF' usa window.print com @media print que mostra tudo aberto, sem nav nem CTAs (screenshot de impressão conferido) e fica oculto em navegadores embutidos. Eventos analysis_viewed e analysis_pdf_clicked. Em 375px a página inicial ficou 40,6% menor que a antiga com o mesmo texto (2332px contra 3928px do baseline do audit). Também corrigi uma rolagem horizontal que os chips causavam no WIP (w-0 min-w-full).

</details>

<details><summary><b>DI-051</b> [P1] Chat no celular: altura dvh, 16px, sugestões, histórico mais recente e erro sem perder o texto — ✅ Feito</summary>

- **Área:** dashboard/chat · **Tipo:** ux · **Esforço:** M · **Pacote:** W3-05 · **Mobile:** sim
- **Problema:** 100vh esconde o input no iOS, textarea de 14px, padding duplo, sem prompts iniciais, as 50 mensagens MAIS ANTIGAS na tela e o texto apagado em caso de erro.
- **Evidência:** ChatPage.tsx:16-22, :64, :133-142, :198, :230-247; useChatData.ts:80-85, :115-117, :148-153.
- **Proposta:** Rota do chat sem padding, com h-[calc(100dvh-…)] e input sticky com safe-area. Textarea de 16px com auto-grow até 5 linhas e enterKeyHint=send. aria-label e role=log. 3–4 chips de pergunta pela via. Buscar as 50 mais recentes + 'Carregar anteriores'. Restaurar o texto no erro e mapear 401/403/429/5xx. MarkdownText. Scroll 'auto' durante o streaming. Evento chat_message_sent.
- **Critérios de aceite:**
  - Textarea com 16px e sem 100vh
  - Com 60 mensagens mockadas, a mais recente aparece
  - 500 mockado devolve o texto ao input
- **Arquivos:** `src/pages/dashboard/ChatPage.tsx`, `src/hooks/useChatData.ts`, `src/components/layout/DashboardLayout.tsx`
- **Implementação:** ✅ Feito no pacote W3-05 (onda 3). DashboardLayout: a rota /dashboard/chat fica sem padding no celular. ChatPage: a altura é h-[calc(100dvh-4rem-1px-safe-top-var(--bottom-nav-h)-var(--cookie-banner-h))] e não há 100vh. O campo fica fixo no fim do painel e só recebe safe-area quando nada cobre a borda. Textarea de 16px (text-base, leading-6) que cresce até 5 linhas, com enterKeyHint=send, maxLength 2000 e contador. aria-label no campo e role=log na conversa. Respostas em MarkdownText. Rolagem 'auto' durante o streaming e só quando a pessoa já está no fim. Quatro sugestões de pergunta pela via mais compatível (src/lib/chat-suggestions.ts), que enviam com um toque. useChatData passou a usar useInfiniteQuery: busca as 50 mensagens mais recentes (order desc, limit 51, cursor por created_at), mostra em ordem cronológica e tem 'Carregar mensagens anteriores' mantendo a posição de leitura. Erros de envio são tipados: 401, 403 (recarrega o acesso), 429 por hora ou por dia, 400 por mensagem longa, 5xx, rede e resposta interrompida/vazia, todos com frases em pt-BR, e o texto volta para o campo. O evento chat_message_sent leva from_suggestion e length_bucket. Critérios cobertos: textarea de 16px sem 100vh (teste); com 60 mensagens mockadas aparece a mais recente (testes do hook e da tela); erro 500 mockado devolve o texto ao campo (teste de integração). Comportamento com teclado só conferido em Chromium headless com emulação de iPhone, não em aparelho real.

</details>

<details><summary><b>DI-052</b> [P1] Definições: 'Meu plano', cancelamento self-service, sessões reais e perfil atualizado — 🟡 Parcial</summary>

- **Área:** dashboard · **Tipo:** feature · **Esforço:** M · **Pacote:** W3-04 · **Mobile:** sim
- **Problema:** O app promete 'Cancele a qualquer momento' sem portal nem tela de plano. O botão de sessões é falso, o nome não atualiza e as labels não estão ligadas aos campos.
- **Evidência:** SettingsPage.tsx:10, :36-56, :88, :140-168, :252-260; grep billingPortal = 0.
- **Proposta:** Aba 'Meu plano' via getAccessState (fim do acesso, renovação e data do 12º ciclo). Nova function create-portal-session (JWT; 401 sem token, 404 sem customer). signOut({scope:'others'}). refreshUser após salvar. Labels com htmlFor; telefone com placeholder neutro; título unificado 'Conta'.
- **Critérios de aceite:**
  - Mocks one_time e recorrente mostram o status certo
  - O botão do portal chama a function (mock) e redireciona
  - Nenhum toast 'Em breve'
- **Arquivos:** `src/pages/dashboard/SettingsPage.tsx`, `supabase/functions/create-portal-session/index.ts`
- **Nota para o dono:** Ativar o Customer Portal no Stripe e fazer o deploy da function.
- **Implementação:** 🟡 Parcial no pacote W3-04 (onda 3). Código e testes prontos. Aba 'Meu plano' (?aba=plano) via getAccessState: pagamento único (pago em, acesso até, 'não renova sozinho'), expirado (com oferta de €4,90 e de €30), assinatura (próxima cobrança prevista, 12ª e última cobrança, término ou cancelamento agendado, calculados de recurring_started_at e recurring_cancel_at) e não pagante (só €30). Nova function create-portal-session: JWT obrigatório, 401 sem token, 404 sem customer, 502 quando o Stripe recusa; o customer vem do banco e o return_url passa pela allowlist. 10 testes Deno com Stripe e Supabase falsos. O botão do portal chama a function (mock) e redireciona (há teste); se falhar, mostra a mensagem e o e-mail do suporte. signOut({scope:'others'}) entrou no lugar do toast 'Em breve'; refreshUser roda depois de salvar; labels com htmlFor; telefone sem placeholder português; título 'Conta'. Fica parcial porque o portal só funciona em produção depois de o dono ativar o Customer Portal no Stripe e fazer o deploy da function.

</details>

<details><summary><b>DI-053</b> [P1] Ganchos de retorno: visitante reconhecido, pagante em /results e partilha com a família — ✅ Feito</summary>

- **Área:** retenção · **Tipo:** retencao · **Esforço:** M · **Pacote:** W4-01 · **Mobile:** sim
- **Problema:** Quem volta com resultado salvo vê a landing genérica. O pagante que abre /results vê o paywall de novo. Não há como partilhar.
- **Evidência:** LandingPage sem leitura de localStorage; ResultsPage sem useAuth; grep navigator.share = 0; retorno/09-landing-visitante-com-resultado-salvo.png.
- **Proposta:** ReturningVisitorBanner no Layout ('Seu pré-diagnóstico de dd/mm está guardado', dispensável por 7 dias). Na ResultsPage, quem tem acesso vê 'Ir para o painel'. ShareButton (navigator.share → wa.me → copiar) com /quiz?utm_source=share, sem PII. Aviso de e-mail só com envio confirmado. Eventos returning_banner_* e share_clicked.
- **Critérios de aceite:**
  - Banner com nome e data quando há resultado e não há login
  - Pagante não vê o checkout em /results
  - A URL partilhada não contém nome, e-mail, ids nem score
- **Arquivos:** `src/components/layout/Layout.tsx`, `src/components/ReturningVisitorBanner.tsx`, `src/components/ShareButton.tsx`, `src/pages/quiz/ResultsPage.tsx`, `src/pages/dashboard/AnalysisPage.tsx`
- **Implementação:** ✅ Feito no pacote W4-01 (onda 4). Feito. (1) ReturningVisitorBanner no Layout: aparece com nome e data (dd/mm) quando há resultado salvo e não há login. Fica fora de /quiz, /results, /checkout*, /login e /auth*. Pode ser dispensado por 7 dias e volta se houver um resultado novo. Envia os eventos returning_banner_viewed (uma vez por dia e por resultado), _clicked e _dismissed. Não menciona e-mail, porque o navegador não sabe se o e-mail foi enviado; na /results, avisos de e-mail continuam só com o email_sent confirmado pelo servidor. (2) Pagante não vê o checkout em /results. Quem tem acesso ativo, expiring, recurring ou é da equipe vê 'Ir para o painel' com a data de fim do acesso e o atalho 'Abrir a análise completa'. Quem tem o acesso expirado é mandado para /dashboard?acesso=expirado, sem preço mensal na tela. Enquanto a conta é confirmada aparece uma espera no lugar da oferta. Se a assinatura falhar ao carregar, aparecem 'Tentar de novo' (refreshUser) e o link para o painel. Visitante sem sessão vê a oferta na primeira pintura, e o anônimo ganha o link 'Já comprou a análise? Entrar'. (3) ShareButton/ShareWithFamily na ResultsPage e na AnalysisPage: tenta navigator.share, depois wa.me, depois copiar o link. O link é /quiz?utm_source=share&utm_medium=<canal>&utm_campaign=<lugar>, sem nome, e-mail, ids ou score, com teste. (4) Extras do Tech Lead: waitlist_nationality_clicked ({processo_tipo?, position?, placement?}) e pwa_launched entraram na taxonomia. No PWA, /?source=pwa com sessão redireciona para /dashboard com replace; se há sessão guardada ainda carregando, mostra 'Abrindo o app…' por no máximo 3 s. (5) Regra do escoteiro na AnalysisPage: text-h1/text-h2 da escala e duration-base.

</details>

<details><summary><b>DI-054</b> [P1] Analytics: taxonomia tipada, dedupe, identify, atribuição e bloqueio em dev/E2E — ✅ Feito</summary>

- **Área:** analytics · **Tipo:** conversao · **Esforço:** M · **Pacote:** W1-07 · **Mobile:** não
- **Problema:** Só há 4 eventos, alguns duplicados, sem value/currency. identify nunca é chamado, as UTMs se perdem entre a landing e o quiz (0 de 8 assessments têm utm), e dev/E2E poluem os dados.
- **Evidência:** analytics.ts:36-97; useQuiz.ts:110-121; LandingPage.tsx:36; produção: 0 utm_source.
- **Proposta:** src/lib/analytics-events.ts com a union COMPLETA usada pelos pacotes (quiz_*, waitlist_joined, lead_submitted, results_viewed, paywall_*, checkout_*, purchase, upsell_*, access_*, analysis_*, chat_*, document_*, checklist_*, share_clicked, pwa_*, returning_*, landing_cta_clicked). trackOnce com localStorage. Guarda: não inicializar em localhost, *.vercel.app, webdriver ou VITE_APP_ENV≠production. attribution.ts com first-touch em sessionStorage. Documentar em docs/analytics.md.
- **Critérios de aceite:**
  - track com nome desconhecido falha no tsc
  - Em localhost com consentimento, 0 requests para posthog/GA
  - Entrar por /?utm_source=teste leva p_utm_source no RPC
- **Arquivos:** `src/lib/analytics.ts`, `src/lib/analytics-events.ts`, `src/lib/attribution.ts`, `docs/analytics.md`
- **Nota para o dono:** O dono marca purchase e generate_lead como conversões no GA4.
- **Implementação:** ✅ Feito no pacote W1-07 (onda 1). Sem mudança nesta ronda. A taxonomia tipada rejeita nome desconhecido no tsc. Também seguem trackOnce, identify pendente até o consentimento, purchase com transaction_id interno, guarda de ambiente, atribuição first-touch e docs. A ligação p_utm_source ao RPC está no useQuiz.ts (W1-04), por contrato. Melhoria desta ronda: o Meta Pixel ganhou fbq.disablePushState = true. Pelo comportamento conhecido do fbevents.js, sem isso ele dispararia PageView a cada pushState, com a URL crua e duplicando o PageView manual. A flag está no build (disablePushState=!0), mas não foi conferida contra o fbevents.js real, porque nenhum script externo foi baixado.

</details>

<details><summary><b>DI-055</b> [P1] Sentry e PostHog: consentimento, máscara de PII e carregamento tardio — 🟡 Parcial</summary>

- **Área:** observabilidade · **Tipo:** seguranca · **Esforço:** M · **Pacote:** W1-07 · **Mobile:** sim
- **Problema:** O Replay grava sem máscara e sem consentimento, contrariando a política de privacidade. PostHog e Sentry ocupam ~558KiB do chunk inicial de 1,1MB.
- **Evidência:** sentry.ts:12-18; main.tsx:9; PrivacyPage.tsx:38; bundle com 'maskAllText:!1'; atribuição via sourcemap.
- **Proposta:** Fachada em src/lib/sentry.ts mantendo o export `Sentry` com captureException/captureMessage em fila; SDK carregado via import() em requestIdleCallback; replay só após 'granted' via addIntegration (SDK 7) com maskAllText, blockAllMedia e maskAllInputs; replaysSessionSampleRate 0; beforeSend tirando e-mails. posthog-js com import dinâmico. environment = VITE_APP_ENV. Ajustar Privacy e Cookies.
- **Critérios de aceite:**
  - Chunk de entrada < 450KB (< 150KB gzip)
  - Sem consentimento, nenhum request de replay nem de posthog
  - grep maskAllText:!1 no build = 0
- **Arquivos:** `src/lib/sentry.ts`, `src/main.tsx`, `src/pages/legal/PrivacyPage.tsx`, `src/pages/legal/CookiesPage.tsx`
- **Nota para o dono:** Apagar os replays já gravados no Sentry.
- **Implementação:** 🟡 Parcial no pacote W1-07 (onda 1). Bloqueante corrigido. O sentry.ts guarda o consentimento de estatísticas anterior (replayConsent) e só chama enableReplay/disableReplay quando ele muda de fato (sem para com, ou com para sem). O listener tem try/catch. No sentry-sdk.ts, enableReplay e disableReplay só agem quando o estado desejado muda (wasWanted). O syncReplay confere se a gravação está ativa via getReplayId antes de chamar startBuffering ou stop, e nunca lança. Um setTimeout depois do addIntegration ajusta o estado após a inicialização que o próprio SDK agenda. Para conferir, usei um build com Pixel falso servido como www.drimigrante.com e todo o tráfego de terceiros interceptado. No build anterior (fa9d456), os 6 cenários de regravação (granted→analytics, analytics→analytics, granted→all, analytics→all, all→analytics, all→all) geraram 'Replay recording is already in progress' e enviaram evento + replay_event. No build novo: 0 eventos, 0 replay_event e 0 pageerror, com o replay ativo antes e depois. As transições reais continuam funcionando: granted→denied→analytics deu replay [ativo, parado, ativo] e denied→analytics deu [parado, ativo]. Um erro real depois de regravar ainda envia 1 evento com o replay. Melhoria: as transações de desempenho agora dependem do consentimento (tracesSampler: 0,2 com estatísticas, 0 sem). Em 32 carregamentos com consentimento pendente ou recusado, 0 transações; em 16 com 'analytics', 4. A Política de Privacidade, a de Cookies e docs/analytics.md citam o tempo de carregamento. Continua parcial pelos mesmos 2 critérios fora do escopo. O chunk de entrada tem 577,27 KB (170,19 KB gzip) e a meta depende de manualChunks no vite.config.ts (W1-08). maskAllText:!1 aparece 1 vez, só no chunk lazy do posthog-js, com a gravação desligada.

</details>

<details><summary><b>DI-056</b> [P1] Erros de rota e de chunk após deploy: errorElement, preloadError, 404 real e future flags — ✅ Feito</summary>

- **Área:** frontend · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-07 · **Mobile:** sim
- **Problema:** Erros de rota caem na tela padrão do React Router (inglês, stack trace, sem Sentry). Assets inexistentes recebem HTML 200, o que derruba abas abertas após um deploy.
- **Evidência:** router/index.tsx:55-129 sem errorElement; vercel.json:25-30; curl /assets/x.js → 200 text/html; 12-erro-rota-errorboundary-padrao-rr.png.
- **Proposta:** RouteErrorPage (useRouteError, pt, Recarregar/Início, Sentry) como errorElement dos 3 layouts; detectar erro de chunk e recarregar uma vez (sessionStorage). vite:preloadError no main.tsx. Rewrite '/((?!assets/)[^.]*)'. future v7_startTransition (App) e v7_relativeSplatPath (router).
- **Critérios de aceite:**
  - Throw forçado mostra a página em pt
  - /assets/inexistente.js → 404 no preview
  - Chunk com 404 gera exatamente 1 reload
- **Arquivos:** `src/components/RouteErrorPage.tsx`, `src/router/index.tsx`, `src/App.tsx`, `vercel.json`
- **Implementação:** ✅ Feito no pacote W1-07 (onda 1). Sem mudança nesta ronda. Seguem errorElement com RouteErrorPage em pt-BR, reload único para chunk velho (confirmado com 2 loads e depois a tela 'Há uma versão nova do site'), o rewrite '/((?!assets/)[^.]*)' e as future flags. O 404 real em /assets depende de um deploy de preview, que não foi feito por regra.

</details>

<details><summary><b>DI-057</b> [P1] Restaurar o ESLint (config 8) — ✅ Feito</summary>

- **Área:** devops · **Tipo:** divida-tecnica · **Esforço:** S · **Pacote:** W1-01 · **Mobile:** não
- **Problema:** npm run lint quebra por falta de config. Sem lint, passou um rules-of-hooks real (corrigido no DI-005).
- **Evidência:** 'ESLint couldn't find a configuration file'; dry-run com 36 erros, a maioria no-explicit-any.
- **Proposta:** .eslintrc.cjs com recommended, @typescript-eslint, react-hooks e react-refresh; ignorePatterns (dist, supabase/functions, database.types.ts); no-explicit-any como warn por ora; no-empty com allowEmptyCatch; no-constant-condition sem checkLoops; unused-vars com o padrão '_'. Script lint sem --max-warnings e lint:strict com 0 (o DI-088 ativa).
- **Critérios de aceite:**
  - Após o merge da onda 1, npm run lint sai com 0
  - rules-of-hooks e exhaustive-deps ativos
- **Arquivos:** `.eslintrc.cjs`, `package.json`
- **Implementação:** ✅ Feito no pacote W1-01 (onda 1). .eslintrc.cjs segue o card: recommended, @typescript-eslint, react-hooks e react-refresh. Ignora dist, supabase/functions e database.types.ts. no-explicit-any está como aviso, no-empty aceita catch vazio, no-constant-condition está sem checkLoops e unused-vars ignora o padrão '_'. Script lint sem --max-warnings e lint:strict com 0. Hoje o lint acusa 1 erro (rules-of-hooks em QuizQuestionEditor.tsx:135, que o W1-05 corrige) e 32 avisos. Os arquivos deste pacote passam com --max-warnings 0.

</details>

<details><summary><b>DI-058</b> [P1] Vitest e primeiros testes da lógica pura — ✅ Feito</summary>

- **Área:** devops · **Tipo:** divida-tecnica · **Esforço:** S · **Pacote:** W1-01 · **Mobile:** não
- **Problema:** Não há nenhum teste unitário. Score, acesso e reducer só são testados manualmente ou por E2E em produção.
- **Evidência:** package.json só tem test:e2e*; find *.test.* vazio.
- **Proposta:** vitest e @vitest/coverage-v8 em devDependencies; vitest.config.ts (mergeConfig, node, alias @, include src/**/*.test.{ts,tsx} e supabase/functions/_shared/**/*.test.ts). Scripts typecheck, test e test:coverage. src/data/quiz-questions.test.ts com limiares 59/60 e 34/35, bônus do caso E, multiselect ignorado e suggestVisas por caso.
- **Critérios de aceite:**
  - npm test passa com 15 testes ou mais
  - npm run typecheck existe e passa
- **Arquivos:** `package.json`, `vitest.config.ts`, `src/data/quiz-questions.test.ts`
- **Implementação:** ✅ Feito no pacote W1-01 (onda 1). vitest.config.ts usa mergeConfig com vite.config, ambiente node, alias @, include em src/**/*.test.{ts,tsx} e supabase/functions/_shared/**/*.test.ts. O setup (src/test/setup.ts) traz o jest-dom e o cleanup para testes com '// @vitest-environment jsdom'. Scripts: typecheck, test, test:watch e test:coverage (relatório em node_modules/.vitest/coverage, para não sujar o git). quiz-questions.test.ts tem 32 testes: limiares 59/60 e 34/35, arredondamento, bônus do caso E, multiselect ignorado, visibilidade e suggestVisas por caso. Os testes não dependem dos textos, então continuam válidos com a mudança de visibilidade do W1-05. Uma mutação do limiar e do bônus fez os testes falharem, o que confirma que eles pegam regressões. No total são 56 testes passando.

</details>

<details><summary><b>DI-059</b> [P1] supabase/config.toml com verify_jwt por função e seed local — 🟡 Parcial</summary>

- **Área:** devops · **Tipo:** devops · **Esforço:** S · **Pacote:** W1-02 · **Mobile:** não
- **Problema:** verify_jwt=false existe só como flag manual: um redeploy sem a flag quebra o webhook do Stripe e o checkout anônimo. Sem config.toml também não há Supabase local.
- **Evidência:** ls supabase sem config.toml; list_edge_functions; create-checkout-session/index.ts:11-13.
- **Proposta:** Criar config.toml (project_id; [functions.stripe-webhook], [functions.create-checkout-session] e [functions.claim-session] com verify_jwt=false; e2e-login false só local; auth site_url localhost:33401). supabase/seed.sql com usuário dev LOCAL. Documentar.
- **Critérios de aceite:**
  - supabase start + db reset aplicam tudo sem erro
  - stripe-webhook local aceita POST sem Authorization
- **Arquivos:** `supabase/config.toml`, `supabase/seed.sql`, `supabase/.gitignore`
- **Implementação:** 🟡 Parcial no pacote W1-02 (onda 1). Criados supabase/config.toml (project_id drimigrante, Postgres 17, site_url http://localhost:33401 com redirects de /auth/callback, verify_jwt=false para stripe-webhook, create-checkout-session e claim-session; e2e-login com enabled=false, então não é servida nem entra num deploy sem nome), supabase/seed.sql (dev@ com o €30 ativo e um diagnóstico, cliente2@ sem pagamento, admin@ super_admin, só local) e supabase/.gitignore; tudo documentado em docs/testes.md. Verificado no local: stripe-webhook, create-checkout-session e claim-session aceitam POST sem Authorization (a requisição chega à function, que responde com erro de configuração), enquanto chat-completion devolve 401. Ficou parcial porque o critério 'supabase start + db reset aplicam tudo sem erro' falha numa migration antiga que não é deste pacote: 20260509000002_seed_quiz_v1.sql adiciona 'multiselect' ao enum field_type e usa o valor no mesmo arquivo (erro 55P04). Validei numa cópia temporária com 'multiselect' no CREATE TYPE da migration inicial; com isso db reset aplica todas as migrations e o seed sem erro.

</details>

<details><summary><b>DI-060</b> [P1] CI com gates e E2E fora da produção (Supabase local) — 🟡 Parcial</summary>

- **Área:** devops · **Tipo:** devops · **Esforço:** L · **Pacote:** W2-07 · **Mobile:** não
- **Problema:** O E2E roda contra produção com service role (97 usuários de teste). Não há gate de tsc, lint, test nem build, e o CI não roda desde maio.
- **Evidência:** playwright.config.ts:7; e2e.yml:31-36; seeded.ts:18-55; supabase-admin.ts:30-32; gh run list.
- **Proposta:** ci.yml (push/PR, permissions read, concurrency): npm ci → typecheck → lint → test → build. Job E2E com supabase start, db reset e functions serve locais, Playwright na porta 33401 e stubs de Stripe/OpenAI/Resend. O Playwright recusa URL com o ref de produção. globalTeardown e .env.test.example.
- **Critérios de aceite:**
  - grep pelo ref de produção em .github, e2e e playwright.config = vazio
  - O CI fica verde num PR
  - Rodar a suíte não muda o count de auth.users em produção
- **Arquivos:** `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `playwright.config.ts`, `e2e/fixtures/seeded.ts`, `e2e/utils/supabase-admin.ts`, `e2e/global-teardown.ts`, `.env.test.example`
- **Nota para o dono:** Apagar os segredos de produção do GitHub depois do merge.
- **Implementação:** 🟡 Parcial no pacote W2-07 (onda 2). Implementado no escopo do pacote. (1) ci.yml roda em PR e push na main, com permissions read e concurrency. Tem os jobs ci (npm ci, check-env, typecheck, typecheck:e2e, lint, Vitest, test:scripts, build), functions (deno test) e e2e. (2) e2e.yml virou workflow reutilizável, sem nenhum secret: supabase start no runner, supabase:env, functions serve com a e2e-login e segredos aleatórios, conferência do alvo, Playwright em Chromium e WebKit, modo mock e contagem das contas de teste no fim. O e2e.yml não cita mais o ref de produção. (3) A trava scripts/lib/test-target-guard.mjs recusa o ref e os domínios de produção e hosts remotos fora de E2E_ALLOWED_REMOTE_HOSTS. Ela é usada no playwright.config.ts, no supabase-admin.ts e no passo de CI; testei o código de saída para produção (1), staging permitido (0) e host remoto não permitido (1). (4) globalTeardown e cleanupE2EData apagam as contas e2e+…@drimigrante.test. Medido no banco local: 3 usuários antes, 6 criados, 3 depois. (5) Os specs já usam page.route como stub de Stripe, OpenAI e Resend; as functions locais sobem sem essas chaves. (6) Revisei o WIP: arrumei a recuperação de arquivos alterados temporariamente (backup com PID em supabase/.temp), o assertIgnored fora de repositório e o regex de e-mail (alinhado ao handler). Criei E2E_PORT e o modo E2E_SUPABASE=mock: os testes de navegador do spec 06 interceptam só *.supabase.co e não funcionam contra o Supabase local. (7) Migration nova 20261016000340, não aplicada, para o bug que impedia o supabase start: o trigger log_ai_config_changes grava NEW.id::text em record_id UUID e a 000350 falhava. Rodei de verdade contra o Supabase local com CI=1: 38 testes passaram; no modo mock, 7 passaram e 1 foi pulado (admin no celular). Faltou: (a) o critério do grep ainda acha o ref em e2e/fixtures/auth.ts, arquivo do W1-02 fora do meu escopo; (b) 'CI verde num PR' não foi verificado no GitHub, porque push e PR são proibidos e o act não está instalado. Repliquei os mesmos passos localmente.

</details>

<details><summary><b>DI-061</b> [P1] Cabeçalhos de segurança no vercel.json (CSP em Report-Only) — ✅ Feito</summary>

- **Área:** devops · **Tipo:** seguranca · **Esforço:** S · **Pacote:** W1-07 · **Mobile:** não
- **Problema:** Produção só envia HSTS: não há CSP, nosniff, Referrer-Policy, proteção contra framing nem Permissions-Policy.
- **Evidência:** curl -I https://www.drimigrante.com; vercel.json:4-23.
- **Proposta:** Headers em '/(.*)': nosniff, strict-origin-when-cross-origin, X-Frame-Options DENY, Permissions-Policy e CSP-Report-Only com Supabase (https/wss), PostHog, GA, Sentry, worker blob e frame-ancestors 'none'. Documentar em docs/operacao/seguranca-headers.md.
- **Critérios de aceite:**
  - curl -I no preview mostra os 5 headers
  - Funil, login, chat SSE e upload sem violações bloqueantes
- **Arquivos:** `vercel.json`, `docs/operacao/seguranca-headers.md`
- **Implementação:** ✅ Feito no pacote W1-07 (onda 1). Sem mudança nesta ronda. Os 5 headers estão em vercel.json e a CSP segue só em Report-Only. O report-uri está documentado como ação do dono em docs/operacao/seguranca-headers.md. A conferência por curl depende de deploy de preview. O Cache-Control immutable em /assets/(.*) já existia antes do pacote. Não há como condicioná-lo ao status 404 na Vercel, então ficou como está (impacto baixo).

</details>

<details><summary><b>DI-062</b> [P1] Identidade visual 'Azulejo': tokens, fontes, escala tipográfica e movimento — ✅ Feito</summary>

- **Área:** design · **Tipo:** design · **Esforço:** L · **Pacote:** W2-01 · **Mobile:** sim
- **Problema:** O site parece template de IA (fonte do sistema, 3 azuis primários, gradiente com círculos) e a identidade é diferente da og-image.
- **Evidência:** tailwind.config.ts sem fontFamily; brand-700 #1b33d8 vs --primary #1853dc vs manifest #3b82f6; LandingPage.tsx:21-54; scripts/og-image.html.
- **Proposta:** Aplicar os tokens de decisoes_de_design em src/index.css (HSL) e tailwind.config.ts (escala brand, fontFamily sans Figtree e display Literata, fontSize, boxShadow, motion), importar as fontes em main.tsx, text-wrap balance/pretty, reduced-motion e color-scheme. Atualizar og-image.html. Criar PRODUCT.md e DESIGN.md com tokens, componentes e checklist mobile.
- **Critérios de aceite:**
  - Um único primary (#1f41c7) em CSS, tailwind, meta e manifest
  - @font-face self-hosted no build
  - Todos os pares de tokens ≥4,5:1 (script no PR)
- **Arquivos:** `src/index.css`, `tailwind.config.ts`, `src/main.tsx`, `scripts/og-image.html`, `PRODUCT.md`, `DESIGN.md`
- **Nota para o dono:** O dono pode vetar a direção (alternativas 'Acolhida' e 'Dossiê').
- **Implementação:** ✅ Feito no pacote W2-01 (onda 2). Retomei o WIP (onda2/W2-01-wip): o cherry-pick entrou sem conflito sobre a base a4fd3b6 (o worktree tinha sido criado da main e foi resetado para a base). Revisei o WIP e corrigi 4 coisas. (1) As reservas 'Figtree Fallback Roboto' tinham métricas que não se sustentam (não há Roboto neste Mac para medir): removi. (2) As reservas foram medidas de novo no Chromium (measureText a 1000px) e agora existe uma face por peso (Arial/Arial Bold, Georgia Bold 600/700), em vez de negrito sintético. (3) rounded-md e rounded-sm derivados de --radius davam 12px/10px, o que fazia o checkbox de 20px do quiz virar círculo: fixei em 6px/4px, os mesmos valores de antes. (4) O CTA da og-image usava âmbar num convite grátis e estava cortado na borda: refiz o layout com CTA branco e regenerei public/og-image.jpg. Acrescentei sombras xl/2xl tingidas (para o legado não voltar ao preto), zIndex 60/70, testes de raio, movimento, clamp e fontes, e criei PRODUCT.md e DESIGN.md. Critérios de aceite: primary único #1f41c7 conferido no CSS, na escala brand, na meta e no manifest (teste); woff2 self-hosted no build (/assets, sem Google Fonts); script de contraste com 39 pares obrigatórios, todos ≥4,5:1 no texto e ≥3:1 no foco. Os tokens seguem as decisões, com uma ressalva: o matiz do accent é 40.5 (e não 40) para o navegador gerar exatamente #fdba2f.

</details>

<details><summary><b>DI-063</b> [P1] Componentes base em src/components/ui — ✅ Feito</summary>

- **Área:** design · **Tipo:** design · **Esforço:** M · **Pacote:** W1-08 · **Mobile:** sim
- **Problema:** src/components/ui está vazio: botões e inputs reinventados em 21 arquivos, com alturas, raios e hovers diferentes.
- **Evidência:** components.json configurado; contagens de rounded e hover nos botões bg-brand-700.
- **Proposta:** Button, Card, Input, Select, Textarea, Badge, BottomSheet, StickyCTA e Container conforme decisoes_de_design, com JSDoc e index.ts. Usar só tokens semânticos (bg-primary, bg-accent...).
- **Critérios de aceite:**
  - Componentes exportados e tipados; botões ≥44px com foco visível
  - Página de demonstração ou teste de render sem erro
- **Arquivos:** `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Input.tsx`, `src/components/ui/Badge.tsx`, `src/components/ui/BottomSheet.tsx`, `src/components/ui/StickyCTA.tsx`, `src/components/ui/index.ts`
- **Implementação:** ✅ Feito no pacote W1-08 (onda 1). Componentes criados em src/components/ui com cva, Radix Slot e cn, usando só tokens semânticos: Button (variantes primary, pay, secondary, outline, ghost, link e destructive; tamanhos sm 40px com área de toque de 44px via pseudo-elemento, md 48, lg 56 e icon 44; loading com aria-busy; asChild com Slottable; type padrão 'button'; rótulos longos quebram linha em vez de estourar a largura), Card (+Header/Title/Description/Footer), Input, Select nativo e Textarea (16px, h-12, rótulo, ajuda e erro ligados por aria-describedby/aria-invalid, erro com role=alert), Badge (pares AA a 8%), BottomSheet (Radix Dialog: embaixo no celular e centralizado no desktop, z-60, 90dvh, safe-area; pushState/popstate faz o voltar do Android fechar o sheet), StickyCTA (IntersectionObserver com âncora e CTA inline, some com input focado ou visualViewport encolhido, bottom: var(--cookie-banner-h), z-30, espaçador compensatório) e Container. Todos com JSDoc e exportados em index.ts. Arquivos novos exclusivos: Field.tsx, Select.tsx, Textarea.tsx, Container.tsx e a demo em src/components/ui/demo (servida só no dev em /src/components/ui/demo/ui-demo.html; confirmei que não entra no build). Um script Playwright (scratchpad/w108-check.mjs) passou 100% a 375 e a 360: sem overflow, alvos ≥44px, campos de 16px, foco visível, erro acessível, sticky (oculto no topo, visível depois da âncora, acima do banner, some com o input focado e com o CTA inline visível), sheet (o voltar fecha e fica na página; o X desfaz a entrada no histórico) e zero erros no console. Não há teste unitário com vitest porque ele não está instalado neste worktree (é do W1-01).

</details>

<details><summary><b>DI-064</b> [P1] PWA instalável: favicon, ícones, manifest em pt e um único theme-color — ✅ Feito</summary>

- **Área:** pwa · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-08 · **Mobile:** sim
- **Problema:** Os ícones referenciados não existem (devolvem HTML 200) e o app não é instalável. O manifest tem lang 'en', outra cor e descrição de visto. O admin vai para o precache de todos.
- **Evidência:** public/ só tem 3 arquivos; vite.config.ts:11-28; index.html:5-7; manifest gerado com lang en; sw.js com Admin*.
- **Proposta:** public/logo.svg e favicon.svg com o monograma DI em #1f41c7; scripts/generate-icons.mjs (Playwright) gera 192, 512, maskable-512, apple-touch 180 e favicon.ico. Manifest com lang pt-BR, id '/', start_url '/?source=pwa', theme #1f41c7 e descrição de nacionalidade. globIgnores do admin. index.html com links de ícone, viewport-fit=cover e color-scheme.
- **Critérios de aceite:**
  - Ícones respondem image/*
  - DevTools Manifest instalável e sem erros
  - sw.js sem 'Admin'
- **Arquivos:** `vite.config.ts`, `index.html`, `public/favicon.svg`, `public/logo.svg`, `public/pwa-192x192.png`, `public/pwa-512x512.png`, `public/maskable-icon-512x512.png`, `public/apple-touch-icon.png`, `public/favicon.ico`, `scripts/generate-icons.mjs`
- **Implementação:** ✅ Feito no pacote W1-08 (onda 1). Monograma DI em #1f41c7 (geometria em paths, sem depender de fonte). scripts/generate-icons.mjs usa o Chromium local do Playwright (variável CHROMIUM_PATH opcional) e gera logo.svg, favicon.svg, favicon.ico (16/32/48, PNG dentro do ICO), pwa-192, pwa-512, maskable-512 (safe zone) e apple-touch 180 (sangria total). Manifest: id '/', start_url '/?source=pwa', scope '/', lang pt-BR, theme_color #1f41c7, background #f9fafd, descrição de nacionalidade e ícones any + maskable. workbox.globIgnores tira Admin*.js e useQuizAdmin-*.js do precache (sw.js sem 'Admin'), e o navigateFallbackDenylist impede o fallback do SPA para arquivos estáticos (robots.txt devolve text/plain). index.html: viewport-fit=cover, meta color-scheme only light, theme-color único #1f41c7, links de ícone, metas de app instalado e preconnect para https://krjirhlmdnxqqrpzmowz.supabase.co. Verificado no build servido por vite preview, via CDP: Page.getInstallabilityErrors=[], manifestErrors=[], SW ativo e todos os ícones respondendo image/*. Lighthouse não foi rodado (indisponível aqui); a verificação equivalente foi feita pelo CDP.

</details>

<details><summary><b>DI-065</b> [P1] Textos do quiz prometem advogado e serviços que não existem — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** conversao · **Esforço:** S · **Pacote:** W1-05 · **Mobile:** não
- **Problema:** Os reasons de suggestVisas dizem 'os nossos advogados podem orientá-lo' e oferecem levantamento genealógico inexistente.
- **Evidência:** quiz-questions.ts:132, :546-549, :603, :626.
- **Proposta:** Reescrever esses textos sem prometer serviço ou advogado ('a análise completa indica quando vale procurar um profissional'), em pt-BR.
- **Critérios de aceite:**
  - grep 'advogad' em quiz-questions.ts sem promessa de serviço
- **Arquivos:** `src/data/quiz-questions.ts`
- **Implementação:** ✅ Feito no pacote W1-05 (onda 1). Reescritos sem prometer advogado nem serviço: reasons de suggestVisas (A sem documento, pesquisa genealógica, D, E e fallback, com 'A análise completa indica quando vale procurar um profissional'), helpText da a3, texto da d3 (não afirma mais que é obrigatório contratar advogado) e aiNotes com 'banco de advogados'/'serviço de genealogia'. No QuizPage, a tela 'em breve' deixou de oferecer advogado. O teste no spec 06 faz grep dos padrões proibidos. A migration atualiza também a3/d3 no banco, só se o texto ainda for o original.

</details>

<details><summary><b>DI-066</b> [P2] Quiz fica em branco se a busca das perguntas falhar — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-05 · **Mobile:** sim
- **Problema:** No TanStack v5, placeholderData só vale enquanto a query está pendente. Em caso de erro, data=undefined e a tela fica vazia.
- **Evidência:** useQuizQuestions.ts:110-116; useQuiz.ts:37; queryObserver.js:265; quiz-dbfail-375.png.
- **Proposta:** queryFn com try/catch que devolve FALLBACK_QUESTIONS (e chama o Sentry); retry 1 com 500ms. Guarda no QuizPage: se state='question' e não há pergunta, mostrar erro com 'Tentar novamente'.
- **Critérios de aceite:**
  - Com form_* bloqueado, o quiz chega até a captura
  - Nunca há estado sem pergunta e sem mensagem
- **Arquivos:** `src/hooks/useQuizQuestions.ts`, `src/pages/quiz/QuizPage.tsx`
- **Implementação:** ✅ Feito no pacote W1-05 (onda 1). O queryFn tenta de novo uma vez após 500 ms e, se ainda falhar, devolve as perguntas do código e chama Sentry.captureException; retry do useQuery desligado. O QuizPage tem guarda: com estado 'question' e sem pergunta, mostra card 'Não foi possível carregar esta pergunta' com 'Tentar novamente' (refetch + volta ao início com as respostas mantidas) e captureMessage. Teste com form_* respondendo 500: o quiz chega à captura. Também acrescentei a volta ao topo ao trocar de pergunta, porque no celular a pergunta seguinte abria rolada para o rodapé e a tela parecia vazia.

</details>

<details><summary><b>DI-067</b> [P2] Respostas de ramos ocultos continuam visíveis e pontuadas — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** bug · **Esforço:** S · **Pacote:** W1-05 · **Mobile:** não
- **Problema:** Trocar A por B mantém a5 visível e pontuada, porque a visibilidade não checa se o pai está visível.
- **Evidência:** quiz-questions.ts:428-439; useQuiz.ts:111-118; simulação stale.mjs (92% em vez de 100%).
- **Proposta:** getVisibleQuestions iterativa (visível só se o pai estiver visível e a condição for satisfeita). Exportar pruneAnswers (aplicada no envio pelo DI-042).
- **Critérios de aceite:**
  - A → nao_sei → só B: sem a5 e 100% alta (teste)
  - pruneAnswers remove chaves ocultas (teste)
- **Arquivos:** `src/data/quiz-questions.ts`
- **Implementação:** ✅ Feito no pacote W1-05 (onda 1). getVisibleQuestions iterativa com memo: a pergunta só aparece se a pergunta-pai estiver visível e a condição for satisfeita (pai inexistente ou ciclo contam como oculto). Condição sem answerKey/answerContains nunca é satisfeita. pruneAnswers exportada (remove chaves de ramos ocultos e mantém chaves desconhecidas). Testes no spec 06: A → nao_sei → só B dá sem a5 e 100% alta; pruneAnswers remove a1/a5. Não apliquei a poda dentro de computeScore/suggestVisas para não mudar a semântica que o W1-01 testa; a aplicação no envio fica com o DI-042.

</details>

<details><summary><b>DI-068</b> [P2] Eventos por etapa do quiz — ✅ Feito</summary>

- **Área:** analytics · **Tipo:** retencao · **Esforço:** S · **Pacote:** W2-03 · **Mobile:** não
- **Problema:** Não dá para saber em que pergunta o usuário desiste.
- **Evidência:** grep track: só quiz_started e quiz_completed.
- **Proposta:** quiz_step_viewed {question_key, index, total_visible, theme}, quiz_step_answered, quiz_back, quiz_resume_clicked, quiz_restart_clicked, quiz_capture_viewed, lead_submitted. Sem PII.
- **Critérios de aceite:**
  - Uma vez por pergunta, com a key correta
  - Nada é enviado sem consentimento
- **Arquivos:** `src/pages/quiz/QuizPage.tsx`, `src/hooks/useQuiz.ts`
- **Implementação:** ✅ Feito no pacote W2-03 (onda 2). Todos os eventos passam por track()/trackOnce() com nomes da union, sem PII (teste confirma que nome e e-mail não aparecem). quiz_step_viewed {question_key, index, total_visible, theme} e quiz_step_answered saem uma vez por pergunta e sessão; a deduplicação fica no sessionStorage, então recarregar não repete. Também: quiz_back (sem duplicar no 'Anterior'), quiz_resume_clicked, quiz_restart_clicked, quiz_capture_viewed e lead_submitted (trackOnce por envio, por ser conversão GA4/Meta). O consentimento continua a cargo do analytics.ts.

</details>

<details><summary><b>DI-069</b> [P2] Acessibilidade do quiz e dos formulários — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** acessibilidade · **Esforço:** M · **Pacote:** W3-03 · **Mobile:** sim
- **Problema:** Opções sem role radio/checkbox, progresso sem progressbar, select sem label, contraste de 2,54:1 e sem reduced-motion.
- **Evidência:** QuizQuestion.tsx:106-200, :220; QuizProgress.tsx:33-38; QuizIntro.tsx:65; Footer.tsx:20-38.
- **Proposta:** radiogroup/radio com aria-checked e setas; group/checkbox; progressbar com aria-valuenow e valuetext; labels sr-only; text-muted-foreground; motion-reduce. Teste com @axe-core/playwright.
- **Critérios de aceite:**
  - getByRole('radio') encontra as opções
  - axe sem violações serious/critical em /quiz
  - Quiz completo só com teclado
- **Arquivos:** `src/components/quiz/QuizQuestion.tsx`, `src/components/quiz/QuizProgress.tsx`, `src/components/quiz/QuizIntro.tsx`, `e2e/tests/07-a11y.spec.ts`
- **Implementação:** ✅ Feito no pacote W3-03 (onda 3). radiogroup/radio com setas (sem auto-avanço) e group/checkbox já existiam e estão testados. O progressbar com aria-valuenow e aria-valuetext aparece quando o total é conhecido. Select e número usam aria-labelledby no título (não pus label sr-only extra). Adicionei motion-reduce nas animações e transições do quiz. Enter/Espaço deixaram de ser descartados pela proteção de toque fantasma: novo hook keyboard-activation.ts, que distingue pointerdown de keydown. Teste e2e/tests/09-a11y.spec.ts (nome definido pelo tech lead): axe sem violações serious/critical em intro, escolha única, múltipla escolha, captura com e sem erros e 'em breve' (com e sem falha); getByRole('radio'); quiz completo só com teclado até /results. 19 testes passam em chromium e mobile/webkit; o de teclado é pulado no mobile.

</details>

<details><summary><b>DI-070</b> [P2] Teaser de caminhos: nacionalidade, o mais forte primeiro e blur acessível — ✅ Feito</summary>

- **Área:** resultado · **Tipo:** ux · **Esforço:** S · **Pacote:** W3-01 · **Mobile:** sim
- **Problema:** O título fala em 'Vistos', a lista não é ordenada, o blur esconde a frase inteira e o leitor de tela lê o texto borrado.
- **Evidência:** ResultsPage.tsx:177-232; results-media-full.png.
- **Proposta:** Título 'Caminhos para a nacionalidade no seu perfil', ordem strong > possible > weak, ~5 palavras nítidas, aria-hidden na parte borrada + sr-only e cadeado em todos os itens borrados. O blur é mantido.
- **Critérios de aceite:**
  - O caminho strong aparece primeiro
  - Sem 'Visto' em /results
  - O snapshot de a11y não expõe o texto borrado
- **Arquivos:** `src/pages/quiz/ResultsPage.tsx`, `src/components/results/PathTeaser.tsx`
- **Implementação:** ✅ Feito no pacote W3-01 (onda 3). Sem mudança nesta ronda. Continua valendo o que foi aprovado: strong > possible > weak, nenhum 'Visto' e o trecho desfocado com aria-hidden e sr-only. O blur foi mantido.

</details>

<details><summary><b>DI-071</b> [P2] Documentos no celular: validação, status honesto e alvos de 44px — ✅ Feito</summary>

- **Área:** dashboard · **Tipo:** ux · **Esforço:** M · **Pacote:** W3-04 · **Mobile:** sim
- **Problema:** Instruções truncadas, botão de 36px, sem validação no cliente, remoção sem confirmação, spinner em todas as linhas e 'Em Análise' eterno.
- **Evidência:** DocumentsPage.tsx:101-123, :175-271; documents-paid.png.
- **Proposta:** Descrição completa; botões ≥44px; validação de ≤10MB e tipo antes de enviar; erros amigáveis; confirmação ao remover; spinner por linha; 'uploaded' rotulado 'Recebido'; lista vinda da via. Eventos document_upload_*.
- **Critérios de aceite:**
  - Arquivo de 11MB recusado sem request
  - Remover pede confirmação
  - Status 'Recebido'
- **Arquivos:** `src/pages/dashboard/DocumentsPage.tsx`
- **Implementação:** ✅ Feito no pacote W3-04 (onda 3). Validação no cliente em src/lib/document-file.ts: até 10 MB e PDF/JPG/PNG, com o tipo deduzido pela extensão quando vem vazio. Um arquivo de 11 MB é recusado sem nenhuma requisição (há teste). Erro amigável na própria linha, spinner só na linha que envia, descrição completa e botões de no mínimo 44px. Remover pede confirmação num BottomSheet (há teste). Baixar usa link assinado de 60 s. O status 'uploaded' aparece como 'Recebido'. Se o registro falha depois do upload, o arquivo é apagado do storage. No acesso expirado a página fica só leitura (baixar/apagar). Eventos document_upload_* e document_deleted, sem nome de arquivo.

</details>

<details><summary><b>DI-072</b> [P2] Eventos da área logada — ✅ Feito</summary>

- **Área:** analytics · **Tipo:** feature · **Esforço:** S · **Pacote:** W3-04 · **Mobile:** não
- **Problema:** Não dá para medir ativação nem a conversão de €30 para €4,90.
- **Evidência:** grep track em src/pages/dashboard: só DashboardHomePage:169.
- **Proposta:** dashboard_viewed {plan_status, days_left}, access_expiring_viewed, access_expired_viewed, settings_plan_viewed e portal_clicked na home, em Documentos e em Definições (análise e chat no DI-050/DI-051).
- **Critérios de aceite:**
  - Eventos disparados nos mocks, sem PII
  - Nada sem consentimento
- **Arquivos:** `src/pages/dashboard/DashboardHomePage.tsx`, `src/pages/dashboard/SettingsPage.tsx`
- **Implementação:** ✅ Feito no pacote W3-04 (onda 3). settings_plan_viewed {plan_status} ao abrir 'Meu plano' e portal_clicked {placement} no botão do portal. dashboard_viewed {plan_status, days_left} continua na home e access_expiring_viewed/access_expired_viewed continuam vindo do AccessBanner (há testes). Em Documentos: document_upload_*, document_deleted e checklist_item_checked. Tudo passa por track(), que já respeita o consentimento; os testes conferem que não vai PII.

</details>

<details><summary><b>DI-073</b> [P2] Admin no celular: menu e overflow horizontal — ✅ Feito</summary>

- **Área:** admin · **Tipo:** ux · **Esforço:** S · **Pacote:** W4-05 · **Mobile:** sim
- **Problema:** O admin não tem navegação no mobile, e a tabela e o kanban alargam a página para 935–1216px.
- **Evidência:** AdminLayout.tsx:33, :84; 10-admin-leads.png e 11-admin-pipeline.png.
- **Proposta:** Hambúrguer com drawer (Radix Dialog), min-w-0 no container, TouchSensor com delay no kanban e ScrollRestoration.
- **Critérios de aceite:**
  - scrollWidth === innerWidth em /admin/* a 375px
  - O menu lista os 7 itens
- **Arquivos:** `src/components/layout/AdminLayout.tsx`, `src/pages/admin/AdminPipelinePage.tsx`
- **Implementação:** ✅ Feito no pacote W4-05 (onda 4). Bloqueante corrigido. Em /admin/quiz, a 360px, o aviso de condição incompleta (9 perguntas em produção) terminava com o nome da migration sem ponto de quebra e alargava o layout viewport para 374px. O <p> ganhou min-w-0 e [overflow-wrap:anywhere], e o nome do arquivo foi para um <code class=break-all>. A mensagem de erro de carga e o código do tema no painel receberam o mesmo cuidado. A medição agora compara com a largura configurada (360/375), não com innerWidth, e usa form_* reais via GET só leitura com a anon key (o resto mockado, nenhuma escrita registrada). Resultado: as 8 rotas /admin/* ficam sem overflow a 360 e a 375. Confira por mutação: revertendo a correção, a medição volta a acusar scrollW=innerW=374 com viewport visual de 360. Painéis 'Novo tema' e 'Editar tema' inteiros a 360. Melhoria: AdminDrawer ganhou a prop closeOnBack (pushState/popstate), usada só no editor de tema. O 'voltar' do Android fecha o painel e fica em /admin/quiz, conferido no Chromium. O back() pendente entra numa fila para a montagem dupla do StrictMode e o 'fechar e reabrir' não fecharem o painel novo; os testes cobrem os dois casos e a mutação para a versão ingênua falha. O menu continua sem entrada no histórico. Leads e Pipeline: o erro de carga ganhou o botão 'Tentar de novo' (refetch), com teste.

</details>

<details><summary><b>DI-074</b> [P2] Idioma único pt-BR em todo o funil — 🟡 Parcial</summary>

- **Área:** conteúdo · **Tipo:** conversao · **Esforço:** M · **Pacote:** W4-04 · **Mobile:** sim
- **Problema:** A interface e os e-mails usam pt-PT ('Introduza', 'equipa'), as perguntas usam pt-BR, há a grafia 'exactos' e lang pt-PT, para um público brasileiro.
- **Evidência:** index.html:2/:24; QuizCaptureForm.tsx:52; ResultsPage.tsx:259; SuccessPage.tsx:154; useSEO.ts:51.
- **Proposta:** lang pt-BR e og:locale pt_BR; glossário em src/lib/copy.ts; varrer os textos públicos restantes (Introduza, partilh, equipa, Saltar, A processar, subscrição, aceder, Activar, exactos), mantendo os termos oficiais portugueses.
- **Critérios de aceite:**
  - grep dos marcadores pt-PT em src vazio
  - lang pt-BR
- **Arquivos:** `index.html`, `src/lib/copy.ts`, `src/hooks/useSEO.ts`
- **Nota para o dono:** O dono confirma pt-BR. Os textos no banco (form_questions e templates) exigem UPDATE em produção.
- **Implementação:** 🟡 Parcial no pacote W4-04 (onda 4). Feito: lang pt-BR e og:locale pt_BR (index.html e useSEO); manifest em pt-BR; textos do quiz em pt-BR, com a migration para o banco; varredura dos 23 arquivos do funil, que estão limpos. Nesta ronda, src/lib/copy.ts (vai para o bundle via Header, Landing e 404) ficou só com QUIZ_CTA_LABEL e a decisão de idioma. O glossário, os OFFICIAL_PT_TERMS e o findPtPtMarkers (regex com lookbehind e \p{L}) foram para o novo src/lib/copy-glossary.ts, usado só pelos testes. Dois testes novos em copy.test.ts garantem que copy.ts não monta regex e que nenhum arquivo .ts/.tsx do cliente importa copy-glossary. O build confirma que não há '\p{L}' em assets/. Falta, fora do pacote: Intl 'pt-PT' em src/lib/utils.ts; telas admin (W4-05); 'contacto@' em src/config/contact.ts (decisão do dono); comentário 'Partilha' em analytics-events.ts (W4-01); UPDATE em produção dos textos do banco (migration 000200) e dos templates de e-mail (W4-02).

</details>

<details><summary><b>DI-075</b> [P2] Atritos de entrada: intro duplicada e caso_tipo sem 'Nenhuma destas' — ✅ Feito</summary>

- **Área:** quiz · **Tipo:** conversao · **Esforço:** S · **Pacote:** W4-04 · **Mobile:** sim
- **Problema:** Quem não se encaixa em A–F fica preso com 'Próximo' desabilitado. Há uma segunda tela de intro.
- **Evidência:** QuizPage.tsx:88-95; quiz-questions.ts:82-89; QuizQuestion.tsx:152-157.
- **Proposta:** Opção exclusiva 'nenhum' em caso_tipo (MultiCheckbox), que leva a 'analise_personalizada', sem bônus; migration 20261030000200_caso_tipo_nenhum.sql. ?iniciar=1 pula a intro só se o dono aprovar.
- **Critérios de aceite:**
  - 'Nenhuma destas' habilita Próximo e desmarca as outras
  - Acessar /quiz direto mostra a intro
- **Arquivos:** `src/components/quiz/QuizQuestion.tsx`, `src/data/quiz-questions.ts`, `supabase/migrations/20261030000200_caso_tipo_nenhum.sql`
- **Implementação:** ✅ Feito no pacote W4-04 (onda 4). caso_tipo tem a opção exclusiva 'Nenhuma destas situações' (chave 'nenhum', score 0). Marcá-la desmarca as outras e vice-versa, ela libera o 'Ver meu resultado' e leva a analise_personalizada sem bônus. toggleMultiAnswer e isExclusiveOption reconhecem a opção pela chave, então funcionam também com as linhas vindas do banco. Migration 20261030000200 NÃO aplicada. Nesta ronda o cabeçalho passou a avisar: APLICAR SÓ DEPOIS DO DEPLOY DO FRONT, porque o front antigo mostraria a opção como checkbox comum, não exclusiva. Bloqueante corrigido: o spec 06 (admin do quiz) usava /Casado\(a\)/, que diferencia maiúsculas, e o rótulo novo é 'Sou casado(a)…'. Agora é /casado\(a\)/i. Com E2E_SUPABASE=mock, o spec 06 passou 12 de 12 no chromium (--repeat-each=3) e nos 3 projetos na suíte mock completa. /quiz direto continua mostrando a intro. O ?iniciar=1 não foi implementado (decisão do dono).

</details>

<details><summary><b>DI-076</b> [P2] SEO por rota: title, canonical, noindex e og:image — ✅ Feito</summary>

- **Área:** seo · **Tipo:** bug · **Esforço:** S · **Pacote:** W3-02 · **Mobile:** não
- **Problema:** useSEO vaza título e canonical entre rotas, aponta para uma og-image .png inexistente e as rotas privadas não têm noindex.
- **Evidência:** useSEO.ts:10-60 sem cleanup; public/ só tem .jpg; robots.txt.
- **Proposta:** handle.seo nas rotas + RouteMeta via useMatches (canonical sem query, og:image absoluta .jpg). noindex em /results, /login, /auth, /checkout, /dashboard, /admin e 404 (sem Disallow conflitante).
- **Critérios de aceite:**
  - Título correto depois de navegação SPA
  - Canonical sem query; og:image com 200
- **Arquivos:** `src/hooks/useSEO.ts`, `src/router/index.tsx`, `public/robots.txt`
- **Implementação:** ✅ Feito no pacote W3-02 (onda 3). handle.seo nas rotas e RouteMeta numa rota raiz sem caminho, com useMatches e useLayoutEffect. A rota mais interna vence. Reescreve title, description, robots, og:*, twitter:* e canonical/og:url (domínio de produção, sem query nem hash) a cada troca de caminho, sem vazar de uma rota para outra. useSEO das páginas legais continua refinando a própria rota. noindex em /results, /login, /auth/callback, /checkout, /checkout/success, /dashboard/*, /admin/* e 404, conferido por teste sobre o router real. robots.txt sem Disallow conflitante. og:image absoluta .jpg retorna 200 (spec e2e). No router, além dos handles, os grupos existentes foram para um const routes e entrou só a rota raiz do RouteMeta.

</details>

<details><summary><b>DI-077</b> [P2] E-mails do ciclo de vida com consentimento, descadastro e dry-run — ✅ Feito</summary>

- **Área:** backend/e-mail · **Tipo:** retencao · **Esforço:** L · **Pacote:** W4-02 · **Mobile:** sim
- **Problema:** Só existe um e-mail de uma linha, que depende da OpenAI. Não há nutrição, aviso de expiração nem subscription_cancelled, e não há agendador.
- **Evidência:** email_templates em produção (5); generate-explanation:154-186; stripe-webhook:222-232; list_extensions sem pg_cron.
- **Proposta:** Mover o welcome_free para a compute-eligibility, com a categoria corrigida e o link de retomada do DI-024. Templates nurture_d1/d3/d7 e access_expiring_d7/d3/expired com descadastro por HMAC (migration 20261030000000_lifecycle_emails.sql). subscription_cancelled no deleted. Function lifecycle-emails com DRY_RUN=true por padrão e function unsubscribe que devolve HTML.
- **Critérios de aceite:**
  - DRY_RUN local lista destinatários sem request ao Resend
  - Ninguém sem opt-in recebe nutrição
  - O welcome_free sai mesmo com a OpenAI falhando (mock)
- **Arquivos:** `supabase/functions/compute-eligibility/index.ts`, `supabase/functions/generate-explanation/index.ts`, `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/lifecycle-emails/index.ts`, `supabase/functions/unsubscribe/index.ts`, `supabase/migrations/20261030000000_lifecycle_emails.sql`
- **Nota para o dono:** Precisa do domínio verificado, de pg_cron e da aprovação dos textos e da frequência.
- **Implementação:** ✅ Feito no pacote W4-02 (onda 4). Ronda 1: o bloqueante foi corrigido pela opção (a), expandir e depois contrair. A migration 20261030000000 não toca mais o welcome_free: no SQL executável não há nenhum 'welcome_free', e um teste novo de contrato garante isso. O texto novo foi para o modelo welcome_free_v2, usado só pelo compute-eligibility novo (WELCOME_TEMPLATE_KEY). hasWelcomeEmail e hasRecentWelcomeTo conferem as duas chaves (WELCOME_TEMPLATE_KEYS). TEMPLATE_SPECS e o contrato da migration foram atualizados. Se o modelo novo não existir (migration ausente ou modelo desativado), nada sai (skip template_missing), e o modelo antigo nunca é usado como reserva. O generate-explanation que está em produção continua mandando o welcome_free antigo com as variáveis dele, então não aparece placeholder em nenhuma janela do release. Corrigi a ORDEM DE RELEASE nos cabeçalhos da migration, do compute-eligibility/index.ts e do generate-explanation/index.ts. A migration entra no db push junto com as outras. O compute-eligibility pode continuar no passo 1. O dry-run só pode ser desligado com o generate-explanation novo no ar. A desativação do modelo antigo fica para um release seguinte (o SQL está no cabeçalho). Teste novo: um modelo revisado no lugar só pode usar variáveis que o código em produção já envia (o payment_confirmed confere). Melhorias da revisão aplicadas: (1) trava 'pending' por assessment no welcome_free_v2, usando o índice único de dedupe_key, conferida de novo depois de obtida e apagada no fim; o fim do quiz e o checkout ao mesmo tempo não mandam dois e-mails; (2) sem boas-vindas atrasadas: se o assessment já tinha resultado calculado há mais de 24 h, não envia (skip stale_assessment); (3) a nutrição respeita profiles.notification_preferences.offers === false (skip prefs_off), procurando a conta pelo user_id e pelo e-mail; (4) a conta paga é reconhecida sem diferenciar maiúsculas (ilikeAnyOf com itens entre aspas e filtro final pelo e-mail exato); hasRecentWelcomeTo também usa ilike; (5) o comentário sobre o opt-in da lista de espera foi alinhado ao código. Os critérios de aceite continuam cobertos: DRY_RUN sem request ao Resend; ninguém sem opt-in recebe nutrição; boas-vindas saem com a OpenAI mockada em 500 (exatamente 1 envio). Os screenshots da ronda 0 continuam valendo: o corpo e o assunto das boas-vindas não mudaram, só a chave.

</details>

<details><summary><b>DI-078</b> [P2] Convite para instalar o app no dashboard — ✅ Feito</summary>

- **Área:** pwa · **Tipo:** retencao · **Esforço:** S · **Pacote:** W3-04 · **Mobile:** sim
- **Problema:** O cliente tem 30 dias de uso recorrente e nunca é convidado a instalar o app.
- **Evidência:** grep beforeinstallprompt = 0; manifest standalone.
- **Proposta:** usePwaInstall (beforeinstallprompt; no iOS, instruções em BottomSheet). Card discreto no dashboard pós-compra, nunca na landing; dispensa guardada por 30 dias. Eventos pwa_*. Validar a sessão no iOS antes de promover.
- **Critérios de aceite:**
  - Prompt nativo no Android emulado
  - Não aparece em /, /quiz nem /results
- **Arquivos:** `src/hooks/usePwaInstall.ts`, `src/components/dashboard/InstallCard.tsx`
- **Implementação:** ✅ Feito no pacote W3-04 (onda 3). usePwaInstall captura o beforeinstallprompt (com preventDefault) e abre o prompt nativo no clique, verificado no teste e no Chromium com UA Android emulado (prompted=true). No iOS o convite só aparece com VITE_AUTH_EMAIL_CODE=true e mostra as instruções do Safari num BottomSheet. Não aparece com o app já instalado (standalone), em navegador embutido nem por 30 dias depois de dispensado. InstallCard só é renderizado na home do dashboard para quem pagou e tem acesso vigente; um teste garante que nenhum arquivo fora de src/(pages|components)/dashboard importa o InstallCard. Eventos pwa_*.

</details>

<details><summary><b>DI-079</b> [P2] Varredura visual do funil público: tokens semânticos, contraste AA e tipografia — ✅ Feito</summary>

- **Área:** design · **Tipo:** design · **Esforço:** L · **Pacote:** W4-04 · **Mobile:** sim
- **Problema:** 623 classes gray-*, 285 brand-* e 53 blue-* fixas; textos com 2,15–2,54:1; 10px; Title Case e eyebrows.
- **Evidência:** Contagens via grep; QuizQuestion.tsx:29-33 (badges com 2,0–3,8:1); ResultsPage.tsx:166/300; Footer.tsx:38.
- **Proposta:** Nas páginas públicas ainda não migradas, aplicar o codemod em dois níveis (gray-700/600 → foreground/80; gray-500/400 → muted-foreground; ícones decorativos ficam), mapa de cor de texto escura por themeCode nos badges, mínimo de 12px, sentence case e no máximo 1 eyebrow.
- **Critérios de aceite:**
  - axe sem violações de contraste em /, /quiz, /checkout, /login
  - Zero text-[10px] fora do admin
  - Screenshots 375px sem regressão
- **Arquivos:** `src/components/quiz/QuizQuestion.tsx`, `src/pages/LandingPage.tsx`, `src/pages/checkout/CheckoutPage.tsx`, `src/pages/auth/LoginPage.tsx`, `src/components/layout/Footer.tsx`
- **Implementação:** ✅ Feito no pacote W4-04 (onda 4). Nos arquivos do pacote não sobrou nenhum gray-* nem text-[10px]/[11px]. NotFoundPage e LoginPage usam tokens e Button/Input. O LegalLayout ficou sem <main> aninhado. Na revisão o axe deu 0 violações em /, /quiz, /checkout, /login, 404, /termos e /cookies, a 375 e a 360. Melhoria desta ronda: no rodapé, o link da marca passou de 170x32 para 170x44 e 'Preços' de 43x44 para 44x44 (min-h-11 e min-w-11 no linkClass). Medi a 375x812 e 360x740, com e sem banner: nenhum alvo do rodapé abaixo de 44px e nenhum overflow horizontal. Os nomes das vias em Title Case ficaram como estavam (mudá-los quebra fixtures e testes Deno de outros pacotes).

</details>

<details><summary><b>DI-080</b> [P2] Varredura do dashboard e admin: tokens, contraste e pt-BR — ✅ Feito</summary>

- **Área:** design · **Tipo:** design · **Esforço:** M · **Pacote:** W4-05 · **Mobile:** sim
- **Problema:** O dashboard usa cinzas fixos e pt-PT ('Definições', 'Utilizador').
- **Evidência:** Contagens via grep; DashboardLayout.tsx:13 e :61.
- **Proposta:** Mesmo codemod e glossário do DI-079 em Dashboard (exceto Analysis e Settings, já migrados) e admin.
- **Critérios de aceite:**
  - Sem text-gray-* em src/pages/dashboard
  - Marcadores pt-PT ausentes
- **Arquivos:** `src/components/layout/DashboardLayout.tsx`, `src/pages/dashboard/DashboardHomePage.tsx`, `src/pages/dashboard/ChatPage.tsx`, `src/pages/dashboard/DocumentsPage.tsx`
- **Implementação:** ✅ Feito no pacote W4-05 (onda 4). Sem mudança no que já tinha sido aprovado (sem gray-*, sem pt-PT no dashboard nem no admin). Melhoria da revisão: o número da pergunta e a prévia do tema não usam mais texto branco fixo sobre a cor escolhida pelo admin. src/lib/text-on-color.ts escolhe texto claro ou escuro pelo contraste WCAG (reaproveita src/lib/contrast.ts) e, se a cor não for hex válido, cai no texto claro, o comportamento anterior. Tem testes, e a screenshot confirma texto escuro sobre o âmbar. check:contrast: 39/39 pares passam.

</details>

<details><summary><b>DI-081</b> [P2] Hardening do banco: advisors e RPCs anônimas — ✅ Feito</summary>

- **Área:** backend/banco · **Tipo:** seguranca · **Esforço:** M · **Pacote:** W3-06 · **Mobile:** não
- **Problema:** 6 funções com search_path mutável, 10 SECURITY DEFINER expostas via RPC, 5 tabelas sem policy, grants totais para anon, session_id gerado com Math.random e RPC sem limite de tamanho.
- **Evidência:** get_advisors(security); role_table_grants; useQuizPersistence.ts:11-12; migration anon_rpc:61-128.
- **Proposta:** Migration 20261025000000_db_hardening_advisors.sql: search_path fixo; REVOKE EXECUTE das funções de trigger; helpers movidos para o schema private; policies nas 5 tabelas; REVOKE ALL de anon nas tabelas internas. Migration 20261025000100_anon_rpc_limits.sql: regex do session_id, answers ≤32KB, e-mail e nome. Front gera session_id com crypto.randomUUID().
- **Critérios de aceite:**
  - Advisors sem esses itens
  - /rpc/is_hub_user com anon → 404
  - O quiz anônimo continua salvando
- **Arquivos:** `supabase/migrations/20261025000000_db_hardening_advisors.sql`, `supabase/migrations/20261025000100_anon_rpc_limits.sql`, `src/hooks/useQuizPersistence.ts`
- **Nota para o dono:** Ligar a proteção contra senha vazada no Auth.
- **Implementação:** ✅ Feito no pacote W3-06 (onda 3). Duas migrations novas, nenhuma aplicada. A 20261025000000 cria o schema private sem USAGE para clientes e recria lá os 8 helpers da DI-001 e da DI-016 com search_path vazio. As 40 policies de public e storage são reescritas para private.*, com uma checagem que aborta se sobrar alguma, e os helpers de public são apagados sem CASCADE: /rpc/is_hub_user responde 404. has_active_access continua em public como casca SECURITY INVOKER que só a service_role executa, porque o generate-explanation da W3-05 chama rpc('has_active_access'). search_path foi fixado nas 4 funções de trigger. Toda função de public fora da allowlist perdeu o EXECUTE de anon/authenticated. As 5 tabelas sem policy ganharam RLS e policies, e checkout_claims ganhou uma policy explícita de negação. anon ficou só com SELECT nas 3 tabelas do quiz; authenticated perdeu TRUNCATE/REFERENCES/TRIGGER; os privilégios padrão de tabelas novas não incluem mais anon. A 20261025000100 valida o session_id (UUID, legado s_<ts>_<rand>, e2e-… e sufixo -wl), limita answers a 32 KB, valida e-mail, nome e telefone (erro 22023), corta UTMs em 100 caracteres (antes uma UTM longa estourava o varchar(100) e derrubava o salvamento) e adiciona CHECK de 64 KB em answers. No front, src/lib/session-id.ts gera o session_id com crypto.randomUUID (fallback getRandomValues), e o useQuizPersistence descarta sessão guardada fora do formato. Testes: as duas migrations rodaram duas vezes (idempotentes) sobre todas as anteriores e o seed, em Postgres 17.6 + PostgREST 14.10 locais e descartáveis. Passaram 47 testes HTTP de papéis/RLS, 34 de limites das RPCs e as 7 consultas de verificação (esperados batendo). A pedido do card, sobram nos lints 0028/0029 as 5 RPCs da allowlist.

</details>

<details><summary><b>DI-082</b> [P2] Edge functions: CORS com allowlist, versões fixas, erros reportados e runbook — ✅ Feito</summary>

- **Área:** backend · **Tipo:** devops · **Esforço:** M · **Pacote:** W2-02 · **Mobile:** não
- **Problema:** CORS '*', imports @2 flutuantes e sem observabilidade: se o webhook falhar, ninguém percebe.
- **Evidência:** */index.ts com Access-Control-Allow-Origin '*'; esm.sh/@supabase/supabase-js@2; grep sentry em functions = 0.
- **Proposta:** _shared/cors.ts (allowlist com produção, previews e localhost, Vary Origin; webhook sem CORS); imports npm: com versão exata; Deno.serve; _shared/observability.ts (logs JSON {fn, outcome} e Sentry para Deno se SENTRY_DSN_BACKEND existir); docs/operacao/runbook-pagamentos.md.
- **Critérios de aceite:**
  - OPTIONS com Origin evil → sem ACAO
  - Nenhum import '@2' sem versão
  - Runbook cobre reenvio de evento e concessão manual
- **Arquivos:** `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/observability.ts`, `docs/operacao/runbook-pagamentos.md`
- **Nota para o dono:** Criar o projeto Sentry de backend e o secret; deploy único de todas as functions.
- **Implementação:** ✅ Feito no pacote W2-02 (onda 2). _shared/cors.ts tem allowlist (produção fixa, APP_URL, previews da Vercel, localhost e CORS_ALLOWED_ORIGINS) e Vary: Origin. OPTIONS ou POST de origem não permitida recebe 403 sem ACAO. stripe-webhook, send-email e e2e-login ficam sem CORS. Todas as functions importam npm: com versão exata (supabase-js 2.105.4, stripe 14.14.0) e usam Deno.serve; não sobrou import @2 nem std/http no código publicado. _shared/observability.ts grava uma linha JSON por requisição ({fn, outcome, status, duration_ms}). Com SENTRY_DSN_BACKEND, envia ao Sentry pela API de envelopes, via fetch e sem SDK: exceções, 5xx, logs 'error' e o alerta novo webhook_signature_invalid (400 com stripe-signature indica segredo errado), limitado a 1 por minuto, com PII filtrada. Usei a API de envelopes em vez do SDK do Sentry para Deno para não pesar no cold start. O runbook docs/operacao/runbook-pagamentos.md cobre reenvio de evento, concessão manual do acesso de €30 em SQL, revogação, ordem de deploy, verificação de CORS com curl, backfill e configuração do Sentry.

</details>

<details><summary><b>DI-083</b> [P2] LGPD/RGPD: exclusão e exportação de conta, retenção aplicada e minimização — ✅ Feito</summary>

- **Área:** backend/legal · **Tipo:** seguranca · **Esforço:** L · **Pacote:** W4-03 · **Mobile:** não
- **Problema:** Não há como apagar ou exportar dados. Apagar no Auth deixa a PII órfã. Os 90 dias de retenção não são aplicados (6 assessments anônimos vencidos).
- **Evidência:** SettingsPage.tsx:10; FK assessments ON DELETE SET NULL; sem pg_cron; PrivacyPage.tsx:41-52.
- **Proposta:** Functions delete-account (cancela a assinatura, remove do Storage, apaga assessments, anonimiza email_send_log com 'apagado+uuid@invalid', trata cases RESTRICT) e export-my-data. Aba Privacidade com confirmação digitando o e-mail. Migration 20261030000100_retention_lgpd.sql com jobs de cron. PrivacyPage coerente.
- **Critérios de aceite:**
  - Usuário de teste local apagado sem PII restante
  - O export devolve JSON só do próprio usuário
- **Arquivos:** `supabase/functions/delete-account/index.ts`, `supabase/functions/export-my-data/index.ts`, `src/pages/dashboard/SettingsPage.tsx`, `supabase/migrations/20261030000100_retention_lgpd.sql`, `src/pages/legal/PrivacyPage.tsx`
- **Nota para o dono:** Ativar pg_cron e definir o texto final de retenção.
- **Implementação:** ✅ Feito no pacote W4-03 (onda 4). Ronda 1 corrigida (só local). BLOQUEANTE resolvido: o export-my-data deixou de furar o paywall. ia_explanation_full saiu de COLUMNS.result e só entra no JSON quando public.has_active_access(user,'full_analysis') responde true. A checagem é a mesma RPC que o generate-explanation usa (migration 20261020000000, executável só pela service role) e vale para €30 no prazo, €4,90 ativo e equipe. Para 'none', 'expired' e reembolso dentro do prazo o resultado gratuito sai (pontuação, categoria e resumo curto), sem a análise, com uma observação no JSON: 'A análise completa não está neste arquivo. Ela fica na página Análise do painel enquanto o seu acesso estiver ativo.' Se a RPC falhar, a análise fica de fora (fail closed), a function registra um warn e o resto do arquivo sai normalmente. O JSON também diz que diagnósticos feitos sem conta não são exportados e que o pedido vai pelo e-mail de privacidade. handler_test.ts tem 6 casos por estado de acesso (none sem linha, none sem pagamento, expired e reembolso: sem o campo; active e recurring: com o campo), um caso de falha da RPC e outro que confere os argumentos _user_id/_feature. Copy alinhada: PrivacyPanel diz 'seus diagnósticos e os resultados' mais 'A análise completa vai no arquivo enquanto o seu acesso estiver ativo.', e a seção 7 da PrivacyPage segue a mesma linha, com testes. MELHORIAS: (1) delete-account chama repo.hasOpenCase (cases fora de concluded/cancelled, mesmo critério da RPC) junto com hasStaffRole, ANTES do Stripe e do Storage. Com processo em andamento responde 409 e não toca em nada; a RPC continua conferindo caso um processo seja aberto no meio do caminho. (2) A mensagem de storage_cleanup_failed ficou verdadeira: 'A exclusão não foi concluída: não conseguimos apagar todos os seus documentos agora. Tente de novo para terminar.' (3) Na migration 20261030000100 (não aplicada), a exceção dos triggers append-only exige agora current_user fora de anon/authenticated/authenticator. Confirmei no Postgres local que authenticated tem o grant UPDATE padrão do Supabase, mas há RLS e nenhuma policy de UPDATE/DELETE nos logs. Também confirmei que o trigger antigo deixaria um cliente pseudonimizar se uma policy existisse, e que o novo recusa. pgTAP 41/41 (3 asserções novas). (4) O JSON documenta os diagnósticos anônimos não exportados. Ficou de fora de propósito: o 'voltar' depois de apagar (DeleteAccountSheet). Desfazer a entrada do sheet antes do navigate não muda o resultado, porque as entradas anteriores também são rotas /dashboard e redirecionam para o login com a sessão encerrada. Além disso, traria uma espera assíncrona do popstate. 'answers' foi avaliado e fica como está: só tem respostas do quiz e marketing_opt_in, nada interno nem segredo.

</details>

<details><summary><b>DI-084</b> [P2] Documentação normativa e variáveis de ambiente — 🟡 Parcial</summary>

- **Área:** docs · **Tipo:** docs · **Esforço:** M · **Pacote:** W2-07 · **Mobile:** não
- **Problema:** Não há README. 6 documentos contraditórios (Stripe TEST, funil antigo). O .env.example tem variáveis órfãs, um Price ID truncado e IDs reais, e falta validação.
- **Evidência:** ls README* vazio; BACKLOG.md:7/:16; .env.example:11-30; useChatData.ts:23.
- **Proposta:** README.md (setup com porta 33401) e docs/ (arquitetura, modelo-comercial, operacao/README, testes); arquivos antigos movidos para docs/historico. .env.example só com placeholders, supabase/functions/.env.example, src/lib/env.ts com zod (validado em supabase.ts), scripts/check-env.mjs e script npm.
- **Critérios de aceite:**
  - Clone novo sobe só com o README
  - check-env cruza as chaves usadas com os exemplos
  - A raiz só tem README.md como .md
- **Arquivos:** `README.md`, `docs/arquitetura.md`, `docs/modelo-comercial.md`, `.env.example`, `supabase/functions/.env.example`, `src/lib/env.ts`, `src/lib/supabase.ts`, `src/vite-env.d.ts`, `scripts/check-env.mjs`, `package.json`
- **Nota para o dono:** Apagar os VITE_STRIPE_* no Vercel.
- **Implementação:** 🟡 Parcial no pacote W2-07 (onda 2). Feito: README.md com setup na porta 33401, scripts, testes, CI e variáveis. Novos docs/arquitetura.md, docs/modelo-comercial.md (opção A do chat como padrão pendente de confirmação do dono, estados de acesso, o que não prometer, decisões pendentes) e docs/operacao/README.md (ambientes, publicação, CI, ações do dono). Movi PROGRESSO, PLANO_REFATORACAO, AUDITORIA_BLOCOS, E2E_TEST_PLAN e BACKLOG para docs/historico/, cada um com aviso de não normativo e um README de contexto. O .env.example ficou só com placeholders, sem Price IDs, PostHog, Sentry ou GA reais e sem as VITE_STRIPE_* órfãs. Criei supabase/functions/.env.example (força-adicionado, porque supabase/.gitignore ignora functions/.env.*) e .env.test.example. src/lib/env.ts valida com zod, recusa service role/sb_secret_ no front e é usado em src/lib/supabase.ts; vite-env.d.ts está alinhado. scripts/check-env.mjs cruza front, functions e E2E com os exemplos; tem 7 testes novos e o npm run check-env está ok. Scripts npm: check-env, typecheck:e2e, test:scripts, test:functions, test:e2e:mock, test:e2e:guard, supabase:* e dev em 33401. 'Clone novo sobe só com o README': validei npm ci → supabase:start → supabase:env → Vite, e o app carregou o quiz do banco local (screenshots). Também rodei supabase:reset sem erro. Faltou: 'a raiz só tem README.md como .md'. O TESTING.md continua na raiz porque é do W1-02 e está fora dos meus arquivos.

</details>

<details><summary><b>DI-085</b> [P2] Gerenciador de pacotes único, Node fixo, vulnerabilidades e dependências das próximas ondas — ✅ Feito</summary>

- **Área:** devops · **Tipo:** devops · **Esforço:** S · **Pacote:** W1-01 · **Mobile:** não
- **Problema:** O node_modules local vem do pnpm, mas o lock é do npm. Sem engines. 25 vulnerabilidades (10 high), react-router com open redirect.
- **Evidência:** node_modules/.pnpm; npm audit --omit=dev; versões divergentes entre lock e instalado.
- **Proposta:** npm ci limpo; engines Node 22, packageManager e .nvmrc; npm audit fix sem --force; react-router-dom 6.30.6; tailwindcss-animate em dev. Instalar já: @fontsource-variable/figtree, @fontsource-variable/literata, react-markdown, @axe-core/playwright e tsx (dev). Dependabot semanal.
- **Critérios de aceite:**
  - Um único lockfile
  - npm audit --omit=dev sem high (ou exceções em docs/operacao/dependencias.md)
  - Build verde
- **Arquivos:** `package.json`, `package-lock.json`, `.nvmrc`, `.github/dependabot.yml`, `docs/operacao/dependencias.md`
- **Nota para o dono:** Padrão npm; o dono pode preferir pnpm.
- **Implementação:** ✅ Feito no pacote W1-01 (onda 1). Projeto padronizado no npm: packageManager npm@10.9.8, engines.node 22.x e .nvmrc 22. Nenhum resto do pnpm estava versionado. react-router-dom foi para a 6.30.6 e tailwindcss-animate passou para devDependencies. O npm audit fix rodou sem --force. Em produção (--omit=dev) caiu de 25 vulnerabilidades (10 high) para 0 high/critical; ficam 2 moderadas do react-router 6, que só se corrigem na v7, e estão documentadas como exceção. Instalados @fontsource-variable/figtree e literata, react-markdown, @axe-core/playwright, tsx, vitest, @vitest/coverage-v8, jsdom e o kit do @testing-library (react, dom, jest-dom e user-event). Por segurança contra pacotes recém-publicados, tudo foi resolvido com --before=2026-10-02. O npm ci limpo foi verificado a partir do novo lock. Também criados .github/dependabot.yml (semanal, cooldown de 7 dias, majors planejados ignorados) e docs/operacao/dependencias.md (política e exceções de dev: vitest/tinypool, vite 5, tailwind 3 e typescript-eslint 7).

</details>

<details><summary><b>DI-086</b> [P2] Specs E2E do modelo P0 (one_time, expiração, auto-login) e Android — ✅ Feito</summary>

- **Área:** testes · **Tipo:** bug · **Esforço:** M · **Pacote:** W3-07 · **Mobile:** sim
- **Problema:** O fixture só simula assinante. Não há teste de upsell, expiração nem auto-login com token, e só se emula iPhone.
- **Evidência:** seeded.ts:47-54; 04-checkout:45-47; playwright.config.ts:30-31.
- **Proposta:** Specs 07/08 mockando GET e Auth: one_time com chat (opção A), expirado com CTA de renovação, recurring sem upsell e Success com token_hash. Projeto Pixel 7. Bloquear métodos de escrita.
- **Critérios de aceite:**
  - Passam em chromium, iPhone 14 e Pixel 7
  - Nenhuma escrita real
- **Arquivos:** `e2e/tests/07-upsell-and-expiry.spec.ts`, `e2e/tests/08-success-autologin.spec.ts`, `e2e/fixtures/seeded.ts`, `playwright.config.ts`
- **Implementação:** ✅ Feito no pacote W3-07 (onda 3). Specs 07 (upsell e expiração: €30 ativo com chat incluso pela opção A, €4,90 só aparece depois que a análise é aberta, aviso de fim de prazo, expirado com renovação por €4,90 como ação principal e documentos ainda acessíveis, assinante sem nenhuma oferta, não pagante só com a oferta de €30, mais um teste da própria trava de rede) e 08 (Success com token_hash → verifyOtp → painel sem passar por /login e sem session_id na URL, webhook atrasado confirmado por polling, token vencido com saída alternativa, comprador já logado sem chamar o claim-session). Tudo roda contra um backend simulado novo (e2e/fixtures/mock-backend.ts): toda requisição passa por page.route, escrita sem mock ou host externo é abortada e reprova o teste no teardown. Os cenários de acesso ficam em seeded.ts e são compartilhados com o fixture local paidUser, que ganhou a opção paidScenario. Projeto android (Pixel 7) adicionado. Os 54 testes (18 por projeto) passam em chromium, mobile (iPhone 14) e android. Os specs 03 e 05 não foram executados; do 04 rodei só os testes anônimos herméticos, no android, contra o alvo local.

</details>

<details><summary><b>DI-087</b> [P3] Stripe Checkout: locale, código promocional sob flag e texto de reforço — ✅ Feito</summary>

- **Área:** backend/pagamentos · **Tipo:** conversao · **Esforço:** S · **Pacote:** W4-06 · **Mobile:** sim
- **Problema:** locale 'pt' fixo e link de código promocional sempre ativo sem campanha.
- **Evidência:** create-checkout-session/index.ts:168-169, :221-222.
- **Proposta:** STRIPE_LOCALE via env (padrão pt-BR), allow_promotion_codes por flag e custom_text.submit.message vindo de OFFER.
- **Critérios de aceite:**
  - Sessão local com o locale e a flag corretos
- **Arquivos:** `supabase/functions/create-checkout-session/index.ts`
- **Nota para o dono:** Conferir as carteiras e o domínio do Apple Pay no Stripe.
- **Implementação:** ✅ Feito no pacote W4-06 (onda 4). Commit e72523a. A lógica do checkout está em handler.ts desde o W1-03 (o card citava linhas antigas do index.ts), então a mudança foi feita lá. O código novo fica em create-checkout-session/checkout-options.ts. STRIPE_LOCALE: padrão pt-BR, conferido contra a lista de idiomas do stripe@14.14.0; valor inválido volta para pt-BR e gera o aviso config_invalid, sem registrar o valor. allow_promotion_codes só liga com STRIPE_ALLOW_PROMOTION_CODES=true (padrão desligado). custom_text.submit.message é montado a partir de CHECKOUT_OFFER, espelho de src/lib/offer.ts, com teste de paridade contra OFFER e _shared/payments.ts. Texto do €30: 'Pagamento único de €30, sem renovação automática. A análise fica disponível logo após o pagamento, com acesso ao painel e ao chat IA por 30 dias.' O checkout da assinatura (só para quem já pagou) mostra €4,90/mês por até 12 meses e 'Cancelamento pelo suporte', igual ao RECURRING_TERMS. Os testes não têm €4,90 no €30 nem garantia, advogado, 24h ou 'ilimitado'. Critério 'sessão local com o locale e a flag corretos': coberto por 11 testes Deno novos com FakeStripe (23/23 na pasta). Não criei sessão real no Stripe, pela regra de não chamar o Stripe.

</details>

<details><summary><b>DI-088</b> [P3] Dívida: casts as any, código morto e lint estrito — 🟡 Parcial</summary>

- **Área:** frontend · **Tipo:** divida-tecnica · **Esforço:** M · **Pacote:** W4-05 · **Mobile:** não
- **Problema:** 24 casts `as any` obsoletos e funções mortas (getUserLatestAssessment, fetchAssessmentResult, requirePaid, formatCurrency…).
- **Evidência:** grep 'as any' = 24; database.types.ts:157/1211/1299/1590.
- **Proposta:** Remover os casts usando os tipos gerados, apagar o código morto e ativar no-explicit-any como error com lint --max-warnings 0.
- **Critérios de aceite:**
  - npm run lint:strict passa
  - grep 'as any' = 0
- **Arquivos:** `src/lib/utils.ts`, `src/hooks/useAssessment.ts`, `src/router/ProtectedRoute.tsx`, `src/hooks/useChatData.ts`, `src/pages/admin/AdminLeadsPage.tsx`, `.eslintrc.cjs`, `package.json`
- **Implementação:** 🟡 Parcial no pacote W4-05 (onda 4). Igual à ronda anterior nos arquivos do pacote: zero 'as any' e zero 'any'. npm run lint dá 0 erros e 3 avisos, todos em src/hooks/useQuizAdmin.ts (linhas 433, 49, 86 e 182 têm os 3 'as any' restantes). Esse arquivo não é do pacote (regra dura 3), por isso npm run lint:strict continua falhando e o grep 'as any' ainda acha 3. Melhoria da revisão: no csvField, a exceção do sinal agora vale só para telefones com '+' e para números negativos simples ('-5', '-2,5'); '-1-2' e '-(1)' passam a ganhar o apóstrofo. Testes atualizados.

</details>

<details><summary><b>DI-089</b> [P3] Higiene do repositório: branches, worktree, seed script e telemetria versionada — 🟡 Parcial</summary>

- **Área:** devops · **Tipo:** divida-tecnica · **Esforço:** S · **Pacote:** W4-06 · **Mobile:** não
- **Problema:** Branches mergeadas, um worktree com alterações não commitadas, script de seed que sobrescreve uma migration aplicada e .spec/.usage.jsonl versionado.
- **Evidência:** git branch --merged; generate-quiz-seed.mjs:29, :102-103.
- **Proposta:** O script gera uma nova migration com timestamp e recusa sobrescrever; usar tsx local; git rm --cached .spec/.usage.jsonl e adicionar ao .gitignore. Branches, worktree e templates duplicados só com aprovação do dono.
- **Critérios de aceite:**
  - Rodar o script 2x não altera migrations
  - O .usage.jsonl fora do git
- **Arquivos:** `scripts/generate-quiz-seed.mjs`, `.gitignore`
- **Nota para o dono:** Mostrar o diff do worktree antes de removê-lo; apagar as branches remotas exige aprovação.
- **Implementação:** 🟡 Parcial no pacote W4-06 (onda 4). Commit e9ad649. Feito: (1) generate-quiz-seed.mjs. Sem opção só imprime o SQL. --migration [nome] cria uma migration NOVA (flag 'wx'), com timestamp depois da mais recente, e não cria nada se o quiz não mudou (hash no cabeçalho). --out recusa arquivo existente e qualquer caminho dentro de supabase/migrations. Usa o tsx local. Testes: 'rodar 2x não altera migrations' em scripts/generate-quiz-seed.test.mjs, mais 11 testes puros em scripts/lib/quiz-seed.test.mjs. (2) O SQL não apaga mais nada: o seed antigo fazia TRUNCATE ... CASCADE, e o Postgres avisa 'truncate cascades to table assessments' (FK current_question_id), ou seja, aplicado em produção apagaria os diagnósticos. Agora é upsert por chave natural, is_active=FALSE para o que saiu do código e snapshot em form_versions. Validei num Postgres local descartável (Docker, já parado): aplicado 2x preserva o diagnóstico, desativa o que só existia no banco e chega ao mesmo estado de um banco novo. (3) .spec/.usage.jsonl tirado do git (git rm --cached) e posto no .gitignore, junto com deno.lock. (4) docs/testes.md agora reúne o TESTING.md, que ficou só como ponteiro: comandos, projeto android (Pixel 7), tag @mock-backend e npm run test:e2e:mock, seed do quiz e flags do Checkout. Não feito, pela diretriz: não apaguei branches, o worktree nem os 15 modelos duplicados do .spec (idênticos byte a byte aos de .spec/templates/). A limpeza recomendada, com os comandos, está em docs/operacao/higiene-repositorio.md e depende da aprovação do dono.

</details>
