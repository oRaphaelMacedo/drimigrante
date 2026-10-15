# Backlog — Doutor Imigrante

> Tarefas a executar **após** terminarmos os testes de live mode.
> Cada item tem contexto, decisões pendentes, e estimativa.

**Iniciado:** 2026-05-14
**Última actualização:** 2026-05-14

---

## 🔴 P0 — Modelo Comercial: produto sequencial (€30 → €4.90/mês × 12)

### Clarificação crítica de negócio (2026-05-14)

Os 2 produtos **não são alternativos**. São sequenciais:
- **€30 one-time** — análise + dashboard + chat IA (gateway product)
- **€4.90/mês × 12 meses** — acompanhamento contínuo (upsell **apenas** para quem já pagou €30)

A subscription é capped a 12 cycles (= 1 ano). Após isso, expira; pode renovar manualmente.

### Implicações no código

| Componente | Estado actual | Acção |
|---|---|---|
| `ResultsPage.tsx` | 2 botões: "Desbloquear €30" + "Acompanhamento €4.90/mês" | Remover o de €4.90. Só €30 visível pre-pagamento. |
| `CheckoutPage.tsx` | "Selecione o plano" com radio buttons | Remover escolha. Página só com €30. Ou eliminar a página. |
| `DashboardHomePage.tsx` | Sem upsell de subscription | Adicionar card "Acompanha 12 meses por €4.90/mês" para users com `one_time_paid=true && !recurring_active` |
| `create-checkout-session` | Aceita `plan: 'recurring'` sem validar prerequisito | Adicionar guard: se `plan='recurring'`, validar que user tem `one_time_paid=true` |
| Stripe subscription | Recurring perpétuo (sem fim) | Adicionar `subscription_data.cancel_at = now + 365 days` para limitar a 12 cycles |

### Decisões pendentes (Raphael — antes de executar)

1. **"1 ano" tecnicamente:** (a) 12 cycles auto-cap · (b) evergreen marketed como "típico 12 meses" · (c) anual prepaid €58.80 → **sugestão: (a)**
2. **Cancela cedo:** (a) acesso até fim do período pago · (b) imediato → **sugestão: (a) standard SaaS**
3. **Pós-12-meses:** (a) renovação manual · (b) one-shot only · (c) auto-renew → **sugestão: (a)**
4. **€30 dá acesso a quê e quanto tempo:** (a) lifetime (análise + dashboard estático) · (b) 30 dias (precisa renovar) · (c) outro → **sugestão: (a)**

---

## 🔴 P0 (cont.) — Funnel UX: Quiz → Pagamento (1 clique)

### Contexto

Fluxo actual tem **17 etapas, 7 cliques, 2 esperas por email**. Estimativa de drop-off agregado: **~50%** desde "Desbloquear" até pagamento concluído. Industry-benchmark é ≥80%.

### Problema concreto

Após o quiz, o utilizador:
1. Vê resultado
2. Clica "Desbloquear €30"
3. Vai para `/checkout` que **repete a escolha de plano** (já implícita ao clicar €30)
4. Clica "Pagar €30"
5. É **redirigido para `/login`** (pede email — que **já demos no quiz!**)
6. Espera magic link no email
7. Clica no link
8. Volta a `/checkout` (mesmo ecrã, agora autenticado)
9. Clica "Pagar €30" outra vez
10. Finalmente vai para Stripe

### Solução proposta

Saltar tudo entre o passo 2 e o passo 10. Click → Stripe directo.

**Fluxo ideal:**
```
Quiz (capta email) → Results (teaser) → click "Desbloquear €30"
  → Stripe checkout (email pré-preenchido)
  → Paga
  → /success com auto-login
  → Dashboard desbloqueado
```

### Mudanças técnicas necessárias

1. **`create-checkout-session` em modo anon**
   - Aceita pedidos sem JWT se receber `assessment_id` + `session_id` válidos
   - Valida via `get_anon_assessment` RPC (já existe)
   - Cria/encontra Stripe customer por email
   - Inclui em metadata: `assessment_id`, `session_id`, `email`

2. **`ResultsPage.tsx`** — botão "Desbloquear" passa a chamar a Edge Function directamente em vez de ir para `/checkout`

3. **`stripe-webhook` — auto-criação de conta no `checkout.session.completed`**
   - Se `metadata.user_id` está vazio mas `metadata.email` está presente:
     - `supabase.auth.admin.createUser({ email, email_confirm: true })`
     - Linka o assessment via `link_anon_assessment_to_user` (com service role)
     - Persiste `subscriptions` + `payments` linkados ao novo user_id
     - Envia magic link via Resend (para futuro acesso)

4. **`/checkout/success`** — auto-login com `session_id` retornado por Stripe
   - Verifica o pagamento via `getCheckoutSession()`
   - Se confirmado, exchange por uma session Supabase via novo endpoint `claim-session`
   - Redirect a `/dashboard` directo

5. **Página `/checkout` actual** — passa a opcional/upsell
   - Pode tornar-se a página de upgrade para subscription após one-time
   - Ou remover completamente

### Decisões pendentes (precisamos do Raphael)

| # | Pergunta | Opções |
|---|---|---|
| 1 | Como apresentar os 2 planos? | (a) 2 botões em /results · (b) só €30 + upsell pós-pagamento · (c) outro |
| 2 | Conta antes ou depois do pagamento? | (a) depois (frictionless) · (b) antes mas invisível · (c) manter actual |
| 3 | Apple Pay / Google Pay? | Sim/Não — afecta UX mobile drasticamente |
| 4 | Email obrigatório no quiz? | (a) sim sempre · (b) opcional · (c) só na conversão |
| 5 | Teaser em /results — manter blur? | (a) sim · (b) substituir por copy chamativa · (c) outro |

### Métricas de sucesso

- ✅ Tempo médio quiz-end → /success: < 90 segundos (actual: ~3-5 minutos com magic link)
- ✅ Conversão "Desbloquear click" → pagamento: > 70% (estimativa actual: ~50%)
- ✅ Zero esperas por email no path crítico
- ✅ Suporte completo a Apple Pay/Google Pay em mobile

### Risco / dependências

- ⚠️ Webhook auto-criação de conta — testar idempotência (não criar 2x se webhook retry)
- ⚠️ Email do quiz pode ser inválido (typo) — Stripe valida no checkout
- ⚠️ `claim-session` Edge Function deve ter rate limit + token de uso único

### Effort estimado

- Backend (Edge Function changes + webhook account creation): **4-6h**
- Frontend (Results page + Success page rework): **2-3h**
- Migration `claim-session` token table: **1h**
- Testes (e2e Playwright actualizar specs): **2h**
- **Total: 1-2 dias de trabalho focado**

---

## 🟡 Backlog menor (depois do P0)

### UI cosmetic

- **Greeting truncado em /results** — "widisac88" em vez de "widisac880". Provavelmente CSS overflow ou `.split('@')[0].slice(0, 8)`. Corrigir para mostrar o primeiro nome correctamente.

### UX

- **Stripe checkout que dá "Something went wrong"** — investigação adiada do utilizador, provavelmente DNS/cookies específico. Validar com outro dispositivo/rede em algum momento.
- **Onboarding pós-pagamento** — adicionar walkthrough no primeiro login pago (highlight do menu, "começa aqui").

### Tech debt

- **VITE_STRIPE_PUBLISHABLE_KEY / VITE_STRIPE_PRICE_* — órfãs** — Declaradas em `vite-env.d.ts` mas nenhum código usa. Remover declarations + env vars no Vercel.
- **MEMORY.md desactualizado** — IDs Stripe lá listados estão incorrectos (mix test/live, typos). Actualizar com os IDs reais após confirmação.

### Backlog do audit ainda aberto

- B03 deferidos: A01 CORS, A02 JWT em eligibility/explanation, A04 payment gate em explanation
- B04 deferidos: A10/A11 (legal/GDPR consent)
- B06 abertos: A02 polling do webhook na SuccessPage, A03 toast genérico, A04 redirect, A06 sessionStorage, A07 JSX.Element
- B02 abertos: A04/A10/A13/A14/A15/A16/A17/A20 (tech debt mostly)

---

## ✅ Concluído nesta sessão (2026-05-08 a 2026-05-14)

- Auditoria de 4 blocos (B02, B03, B04, B06) → 27 achados fechados
- Migration security_hardening (RLS reforçado, WITH CHECK, etc.)
- Migration anon_assessment_rpc (B02-A21/22)
- Refactor AuthContext singleton (B04-A01/03/04/13)
- Refactor ProtectedRoute feature gates (B06-A01)
- Edge Function fixes (B03-A05/06/07/08/12/13)
- Stripe LIVE mode configurado e validado end-to-end
- Vercel production deploy
