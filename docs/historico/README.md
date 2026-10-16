# Documentos históricos

Registros de como o projeto chegou até aqui. **Nenhum deles é normativo:** em
caso de conflito, valem o [README.md](../../README.md) e os documentos de
[`docs/`](..).

| Arquivo | Época | O que mudou desde então |
|---|---|---|
| [PROGRESSO.md](PROGRESSO.md) | Dias 1 a 7 do MVP (maio de 2026) | O checkout passou a sair direto do resultado do quiz, o €30 dá acesso por 30 dias e o €4,90/mês só é oferecido depois do €30, no painel. |
| [BACKLOG.md](BACKLOG.md) | 14/05/2026 | As decisões pendentes foram tomadas (ver [modelo-comercial.md](../modelo-comercial.md)). As variáveis `VITE_STRIPE_*` citadas como órfãs saíram do código e do `.env.example`. |
| [PLANO_REFATORACAO.md](PLANO_REFATORACAO.md) | Pós-v1.0 | As fases marcadas como concluídas seguem válidas como histórico; a arquitetura atual está em [arquitetura.md](../arquitetura.md). |
| [AUDITORIA_BLOCOS.md](AUDITORIA_BLOCOS.md) | Maio de 2026 | Os bloqueios de Stripe e de chaves descritos lá foram resolvidos. Os achados abertos foram reavaliados na auditoria de outubro de 2026. |
| [E2E_TEST_PLAN.md](E2E_TEST_PLAN.md) | Maio de 2026 | Os testes rodavam contra produção. Hoje rodam só contra o Supabase local (ver "Testes" no README e [testes.md](../testes.md)). |

Não atualize estes arquivos: registre decisões novas nos documentos vigentes.
