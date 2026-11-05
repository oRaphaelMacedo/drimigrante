# Estado — Doutor Imigrante (drImigrante)

_Criado em 2026-10-22. Atualizado por claude em 2026-11-05._

## Agora
- Produção: release v2026.10.16 no ar. Conferido em 2026-11-05: site 200, 28 migrations, 12 functions, sem `e2e-login`.
- Uso desde o release: 3 diagnósticos (incluindo o teste do release) e nenhum evento de pagamento; 1 pagante com acesso ativo. `email_send_log` sem nenhum envio com sucesso.
- Branch `claude/pendencias-codigo` (local, sem push): tipos regenerados, `lint:strict` limpo, chunk de entrada de 632 para 154 KB, `TESTING.md` removido e cards revisados (83 feitos, 6 parciais). Tudo com commit; falta abrir o PR e o dono decidir o merge, que publica o front.
- A mesma branch também leva "Quanto custa" com o plano grátis primeiro e o de €30 como PRO.

## Próximo
- Dono, painéis: e-mail do domínio (sem MX, `contacto@` e `privacidade@` não recebem); confirmar o domínio no Resend e o SMTP do Auth; proteção contra senha vazada; proteção da `main`; environment `production` + token; `VITE_STRIPE_*` na Vercel; Stripe (Customer Portal, domínios de pagamento, eventos do webhook); teto da OpenAI; Redirect URLs do Auth; conversões no GA4; Sentry (replays antigos, projeto de backend).
- Dono, decisões e conteúdo: notificação RGPD do incidente `is_hub_user`; dados legais (`src/data/company.ts`); prazos e documentos das vias (`src/data/nationality-paths.ts`); padrões de `docs/modelo-comercial.md`; telefone no quiz; prazos de retenção; `contacto@` ou `contato@`; "quem somos" e depoimentos; regenerar as 3 análises antigas.
- Dono, e-mails de ciclo de vida: aprovar textos e frequência; depois `EMAIL_UNSUBSCRIBE_SECRET`, `LIFECYCLE_EMAILS_DRY_RUN=false`, `pg_net` e agendamento. Até lá os leads não recebem boas-vindas.
- Só com OK explícito do dono: backfill de score (`scripts/backfill-scores.mjs`; 4 de 6 resultados com score 0), merge dos 10 PRs abertos (2 do Dependabot com CI falhando) e limpeza do repositório (`docs/operacao/higiene-repositorio.md`). Deploy, migração e pagamento também.

## Decisões
- 2026-10-22 — Adotado o padrão comum Claude + Codex: `AGENTS.md` é a fonte única; `CLAUDE.md` só importa.
- 2026-11-05 — `src/lib/env.ts` valida sem zod para não pesar na primeira carga; `manualChunks` separa `vendor-react` e `vendor-supabase`.
- 2026-11-05 — Mudança de bundle se valida com o E2E mock contra o build real: `vite build` com as env do modo mock (ver `playwright.config.ts`), `vite preview` na 33401 e `E2E_SUPABASE=mock E2E_BASE_URL=http://localhost:33401 npx playwright test`. O E2E padrão usa o dev server e não exercita os chunks.
- 2026-11-05 — `supabase gen types` não pode ser redirecionado direto para `database.types.ts`: apagaria o bloco manual do fim (ver `docs/operacao/release.md`, seção 7).
- 2026-11-05 — O nome "PRO" (`OFFER.planLabel`) e "Anamnese" (`OFFER.free.name`) só aparecem na seção de preços da landing; paywall, checkout e Termos seguem com "análise completa" e o CTA segue "diagnóstico". O botão do PRO leva ao quiz porque a compra só existe depois do pré-resultado. Clique no card grátis: `landing_cta_clicked` com `position: pricing_free`; `pricing` agora é só o card PRO.

## Últimas sessões (máx. 5)
- 2026-11-05 claude — landing: plano grátis + PRO em "Quanto custa"; a barra fixa aceita mais de um CTA inline.
- 2026-11-05 claude — levantamento das pendências e bloco de código sem tocar em produção (tipos, `as any`, bundle, `TESTING.md`, cards).
- 2026-10-22 claude — adoção do padrão (AGENTS.md, CLAUDE.md, ESTADO.md, .gitignore).

- 2026-10-22 codex — revisão de continuidade: próximo passo explicitado sem iniciar trabalho funcional.
