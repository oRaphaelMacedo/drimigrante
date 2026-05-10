# Doutor Imigrante — Guia de Testes

## Utilizador de Teste (Dev)

Para testar o app localmente sem magic link ou Google OAuth, usa o bloco **DEV — Login rápido** que aparece na página `/login` quando o servidor está a correr em `localhost`.

| Campo    | Valor                    |
|----------|--------------------------|
| Email    | `dev@drimigrante.test`   |
| Password | `DrImigrante@2026!`      |

### Acesso configurado

| Feature           | Status |
|-------------------|--------|
| Dashboard         | ✅ |
| Análise Completa  | ✅ |
| Chat IA           | ✅ |
| Tier              | `recurring` |

### Supabase

- **User ID:** `518831e3-06d4-4631-9b87-f094019a03b2`
- **Subscription ID:** `82f8b2b6-bff8-4d6a-8371-d9cd7144ce16`
- **Criado em:** 2026-05-10

---

## Como fazer login rapidamente

1. Inicia o dev server: `npm run dev`
2. Acede a `http://localhost:5173/login`
3. No bloco amarelo "DEV — Login rápido" na parte inferior do card, digita a password e clica em **Entrar**
4. O bloco só aparece em `localhost` — não está visível em produção

---

## Edge Functions

| Função               | Endpoint                          | Notas |
|----------------------|-----------------------------------|-------|
| `chat-completion`    | `/functions/v1/chat-completion`   | Requer `has_chat_access = true` na subscrição |
| `compute-eligibility`| `/functions/v1/compute-eligibility` | Pós-quiz |
| `create-checkout-session` | `/functions/v1/create-checkout-session` | Stripe TEST mode |
| `stripe-webhook`     | `/functions/v1/stripe-webhook`    | Configurar no Stripe dashboard |

### Secrets configurados no Supabase

- `OPENAI_API_KEY` ✅ (GPT-4o-mini)

---

## Stripe TEST Mode

| Produto                          | Price ID                           | Valor   |
|----------------------------------|------------------------------------|---------|
| Diagnóstico Profissional         | `price_1TUsfkLmoQA9teSa3iajIqz`   | €30     |
| Acompanhamento Contínuo          | `price_1TUshFLmoQA9teSaAdX9RBqB`  | €4,90/mês |

**Cartão de teste Stripe:** `4242 4242 4242 4242` — qualquer data futura, qualquer CVC

---

## Variáveis de Ambiente

O ficheiro `.env.local` deve estar na raiz do projecto (`/Users/rmb/drImigrante/.env.local`).  
No worktree existe um symlink para esse ficheiro.
