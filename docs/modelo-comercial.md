# Modelo comercial

Última revisão: 16/10/2026. Documento normativo: se o código ou outro texto
discordar daqui, um dos dois está errado — corrija ou registre a decisão nova.

Fonte única no código:

- front: [`src/lib/offer.ts`](../src/lib/offer.ts) (`OFFER`) e
  [`src/lib/access.ts`](../src/lib/access.ts) (estado de acesso);
- servidor: [`supabase/functions/_shared/payments.ts`](../supabase/functions/_shared/payments.ts)
  (`ONE_TIME_ACCESS_DAYS = 30`, `RECURRING_MAX_CYCLES = 12`), usado pelo
  `stripe-webhook` e pelo `create-checkout-session`.

## Funil

1. **Quiz grátis** → pré-resultado por categoria (alta, média ou baixa), com o
   restante do resultado desfocado (o blur do teaser é decisão do dono).
2. **€30, pagamento único** → análise completa, painel e chat IA por **30 dias**,
   contados da confirmação do pagamento (`subscriptions.one_time_access_expires_at`).
3. **€4,90/mês** → oferecido **só no painel** e **só para quem já pagou o €30**.
   Mantém o acesso depois dos 30 dias e termina sozinho depois de **12 cobranças**.

Antes do pagamento, só o €30 aparece. Quem não pagou nunca recebe a oferta de
€4,90 — nem no painel (o estado `none` mostra a oferta de €30). A única exceção
declarada são as páginas legais: os Termos descrevem os dois planos.

## O que o €30 inclui

Texto exibido vem de `OFFER.includes`:

- Análise do seu caminho
- Requisitos e documentos de cada caminho
- Próximos passos
- Painel por 30 dias
- Chat IA durante os 30 dias

Entrega (`OFFER.delivery`): "Disponível logo após o pagamento".

### Chat IA no €30 — opção A (padrão, pendente de confirmação do dono)

O modelo documentado sempre disse que o €30 inclui o chat, mas o webhook antigo
não liberava `has_chat_access` no pagamento único (DI-012).

- **Opção A (adotada como padrão):** o €30 inclui o chat durante os 30 dias. O
  `stripe-webhook` grava `has_chat_access = true` no pagamento único e o
  `chat-completion` e o front respeitam o prazo de 30 dias. A migration
  `20261016000150_one_time_chat_access.sql` corrige as compras anteriores ainda
  no prazo.
- **Opção B:** chat só no €4,90. Se o dono escolher B: descartar o passo 2 da
  migration acima, voltar o webhook a `has_chat_access = false` no pagamento
  único, mudar `OFFER.includesChat` para `false` (e o item do chat em
  `OFFER.includes`) e corrigir os Termos.

Até a confirmação, tudo segue a opção A.

## Estados de acesso

Calculados por `getAccessState` em `src/lib/access.ts`. O servidor (RLS e Edge
Functions) continua sendo a autoridade; o front só decide o que mostrar.

| Estado | Quem | Acesso | Oferta de €4,90 (`canOfferRecurring`) |
|---|---|---|---|
| `none` | Não pagou (ou teve o acesso revogado por reembolso/disputa) | Nenhum conteúdo pago; vê a oferta de €30 | Nunca |
| `active` | Pagou o €30, faltam mais de 7 dias | Análise, painel, documentos e chat | Pode aparecer |
| `expiring` | Pagou o €30, faltam 7 dias ou menos | O mesmo do `active` | Pode aparecer |
| `expired` | Pagou o €30 e os 30 dias acabaram | Só os próprios documentos, para listar, baixar e apagar (sem novos envios) | Pode aparecer |
| `recurring` | Assinatura de €4,90 ativa | Tudo, enquanto a assinatura estiver ativa | Não |

A equipe (super_admin, hub_admin, lawyer, paralegal) não expira e não recebe a oferta.

`OFFER.recurring` só pode ser renderizado em `src/pages/dashboard/**`,
`src/components/dashboard/**` e `src/pages/legal/**` (os Termos descrevem o plano).

## Assinatura de €4,90/mês

- **Pré-requisito no servidor:** o `create-checkout-session` recusa o plano
  recorrente para quem não pagou o €30 (`403 one_time_required`) e para quem já
  tem assinatura ativa (`409 already_active`).
- **12 ciclos:** o Checkout do Stripe não aceita `cancel_at`, então o
  `stripe-webhook` agenda o fim da assinatura com `subscriptions.update(cancel_at)`
  (âncora de cobrança + 12 meses) e grava `subscriptions.recurring_cancel_at`.
  Não há renovação automática depois da 12ª cobrança.
- **Cancelamento:** pelo suporte (`SUPPORT_EMAIL` em
  [`src/config/contact.ts`](../src/config/contact.ts)) até existir o portal do
  cliente (DI-052).

## O que não prometemos

Enquanto `OFFER` disser `null`, nenhum texto pode afirmar:

- garantia ou reembolso garantido (`OFFER.guarantee = null`);
- revisão humana, por advogado ou outro profissional (`OFFER.reviewedBy = null`);
- prazo de entrega de 24 h.

Também ficam fora: "Válido para sempre", "Mais popular", "menos de €1/dia",
"ilimitado", escassez e contagem regressiva. Prova social só com dados reais e
autorizados (os componentes ficam vazios por padrão).

## Decisões pendentes do dono

Os padrões abaixo valem até a resposta do dono:

| Pergunta | Padrão |
|---|---|
| Há advogado revisando as análises? | Não |
| Há reembolso, com prazo? | Sem garantia |
| A entrega é imediata? | Sim |
| O €30 inclui o chat por 30 dias? | Sim (opção A) |
| Gerar a análise completa só depois do pagamento? | Sim |

## Onde mexer quando o modelo mudar

| O quê | Arquivo |
|---|---|
| Preço, itens, prazo, garantia, revisão, plano mensal (front) | `src/lib/offer.ts` |
| Regras de acesso e de quem recebe a oferta de €4,90 | `src/lib/access.ts` |
| Prazo de 30 dias e limite de 12 ciclos (servidor) | `supabase/functions/_shared/payments.ts` |
| O que cada pagamento libera | `supabase/functions/stripe-webhook/handler.ts` |
| Quem pode comprar cada plano | `supabase/functions/create-checkout-session/handler.ts` |
| Price IDs do Stripe | secrets `STRIPE_PRICE_ONE_TIME` e `STRIPE_PRICE_RECURRING` (ver `supabase/functions/.env.example`) |
| Texto legal | `src/pages/legal/TermsPage.tsx` |
