# PRODUCT — Doutor Imigrante

Contexto de produto para quem desenha, escreve copy ou implementa telas. A identidade visual e o
checklist mobile estão em [DESIGN.md](DESIGN.md). Os valores comerciais vivem no código (abaixo);
este arquivo explica as regras, não duplica números.

## O que é

Diagnóstico de elegibilidade à **nacionalidade portuguesa**. A pessoa responde a um quiz gratuito,
vê um pré-resultado e pode pagar por uma análise completa do seu caminho, com painel e chat IA por
tempo limitado.

O serviço é informativo: não constitui aconselhamento jurídico vinculativo nem substitui a consulta
com um advogado (ver Termos, `src/pages/legal/TermsPage.tsx`).

Caminhos avaliados pelo quiz (`src/data/quiz-questions.ts`): descendência, casamento ou união
estável, nascimento em Portugal, residência em Portugal, reaquisição da nacionalidade e família
originária das ex-colônias portuguesas.

## Quem usa

- A maioria das pessoas usa o site **pelo celular**. Toda tela é desenhada primeiro para
  360–375px de largura, com uma mão e o teclado aberto.
- Pessoas com dúvidas sobre um processo burocrático e longo. O tom precisa passar clareza e
  segurança, sem pressão.

## Funil

1. **Landing → quiz gratuito** (sem conta). O e-mail é pedido no quiz.
2. **Pré-resultado** categórico (alta, média ou em desenvolvimento) com o teaser da análise
   desfocado (o blur é decisão do dono e fica).
3. **Pagamento único** — preço, prazo de acesso, entrega e itens incluídos vêm de `OFFER`
   (`src/lib/offer.ts`): hoje €30, com análise, painel e chat IA por 30 dias.
4. **Painel** (`/dashboard`) durante o acesso; o estado `expiring` marca a reta final do prazo.
5. **Assinatura mensal** (`OFFER.recurring`, hoje €4,90/mês, no máximo 12 cobranças) — upsell
   **só no dashboard** e só para quem já pagou o €30. Mantém painel, análise, checklist e
   documentos depois dos 30 dias e o chat enquanto ativa. Cancelamento pelo suporte até existir
   o portal do cliente.

Estados de acesso (`src/lib/access.ts`, `getAccessState`): `none` (não pagou — vê a oferta do
pagamento único, nunca a mensal), `active`, `expiring`, `expired` (quem pagou continua podendo
baixar e apagar os próprios documentos) e `recurring`.

Indicadores acompanhados: conclusão do quiz, conversão quiz → pagamento único, conversão
pagamento único → assinatura e distribuição dos resultados. Eventos só pela união tipada de
`src/lib/analytics-events.ts` (via `track()`), e analytics só com consentimento.

## Fontes da verdade no código

| Assunto | Arquivo |
| --- | --- |
| Oferta (preço, prazo, itens, plano mensal, garantia, revisão) | `src/lib/offer.ts` |
| E-mails de suporte/privacidade e WhatsApp opcional | `src/config/contact.ts` |
| Dados da empresa (campos `null` não aparecem) | `src/data/company.ts` |
| Regras de acesso | `src/lib/access.ts` |
| Eventos de analytics | `src/lib/analytics-events.ts` |
| Atribuição (UTMs) | `src/lib/attribution.ts` |
| Identidade visual e tokens | `DESIGN.md`, `src/index.css`, `tailwind.config.ts` |

Nenhuma página deve repetir preço, prazo, e-mail ou dado da empresa em texto fixo: importe daqui.

## Voz e copy

- Português do Brasil com **"você"** (padrão até decisão do dono). Termos oficiais portugueses
  mantidos como são: AIMA, Registo Criminal, Conservatória.
- Claro e concreto: dizer o que a pessoa recebe e quando. Títulos em sentence case.
- **Nada de promessas que o produto não cumpre.** Enquanto `OFFER.guarantee` e
  `OFFER.reviewedBy` forem `null`: sem garantia, sem reembolso garantido, sem "revisão por
  advogados" ou qualquer revisão humana. Também proibidos: prazo de 24h, "Válido para sempre",
  "Mais popular", "ilimitado", "menos de €1/dia".
- Prova social só com dados reais (componentes vazios por padrão). Sem escassez nem contagem
  regressiva.
- Antes do pagamento só aparece o pagamento único; `OFFER.recurring` só pode ser renderizado em
  `src/pages/dashboard/**`, `src/components/dashboard/**` e `src/pages/legal/**` (os Termos e a
  Privacidade podem descrever o plano mensal).
- Campo pendente nunca vira placeholder na tela (nada de `A_PREENCHER`): não renderiza ou usa
  uma copy neutra.

## Princípios de experiência

1. **Uma ação principal por tela.** Compra sempre no Button `pay` (âmbar); o resto em cobalto.
2. **Celular primeiro:** alvos ≥44px, campos de 16px, barras fixas que respeitam a área segura,
   o banner de cookies e o teclado aberto.
3. **Confiança antes de conversão:** dizer o que é e o que não é o serviço; nada de truques.
4. **Acessível por padrão:** contraste ≥4,5:1 no texto, foco visível, rótulos reais, movimento
   reduzido respeitado.
5. **Privacidade:** tokens e IDs da URL não vão para ferramentas de analytics; consentimento de
   cookies com Rejeitar e Aceitar no mesmo peso.

## Decisões em aberto (dono)

- Direção visual "Azulejo" pode ser vetada (alternativas: "Acolhida" e "Dossiê").
- pt-BR com "você" é o padrão provisório da copy nova.
- Garantia/política de reembolso e revisão humana: só entram na copy se o dono preencher
  `OFFER.guarantee` e `OFFER.reviewedBy`.
- WhatsApp de suporte: só aparece se `WHATSAPP_URL` for preenchido.
- Dados legais da empresa (`COMPANY.legalName`, `nif`, `address`).
- Contraste da borda de campo (ver "Pendência: borda de campo" em DESIGN.md).
