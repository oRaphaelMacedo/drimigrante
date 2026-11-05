# Doutor Imigrante (drImigrante)

> Fonte única de instruções para qualquer IA (Codex, Claude e outras). Caminho: `/Users/rmb/drImigrante`.
> Protocolo comum: ler `~/Projects/_AI_COORDENACAO/PADRAO.md`. Estado do projeto: `ESTADO.md`.

## O que é
Diagnóstico de elegibilidade à nacionalidade portuguesa (quiz grátis → pré-resultado → análise completa paga). Produção: https://www.drimigrante.com. Stack: Vite + React 18 + TypeScript + Tailwind · Supabase · Stripe · OpenAI · Resend · Vercel. Detalhes em `README.md`. **Produção real: deploy, migrações e Stripe só com pedido explícito.**

## Documentos do projeto (ler conforme a tarefa)
- `DESIGN.md`
- `PRODUCT.md`
- `README.md`
- `TESTING.md`
- `docs/`
- `.spec/`

## Comandos (lidos de `package.json`; gerenciador: npm — não executados nesta adoção)
- `npm run dev` → `vite --port 33401 --strictPort`
- `npm run build` → `tsc && vite build`
- `npm run preview` → `vite preview`
- `npm run typecheck` → `tsc --noEmit`
- `npm run typecheck:e2e` → `tsc -p tsconfig.e2e.json`
- `npm run lint` → `eslint . --ext ts,tsx --report-unused-disable-directives`
- `npm run lint:strict` → `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`
- `npm run check-env` → `node scripts/check-env.mjs`
- `npm run check:contrast` → `tsx scripts/check-contrast.ts`
- `npm run test` → `vitest run`
- `npm run test:watch` → `vitest`
- `npm run test:coverage` → `vitest run --coverage`
- `npm run test:scripts` → `node --test "scripts/**/*.test.mjs"`
- `npm run test:functions` → `deno test --no-config supabase/functions`
- `npm run test:e2e` → `playwright test`
- `npm run test:e2e:mock` → `E2E_SUPABASE=mock playwright test`
- `npm run test:e2e:guard` → `node scripts/lib/test-target-guard.mjs`
- `npm run test:e2e:ui` → `playwright test --ui`
- `npm run test:e2e:debug` → `playwright test --debug`
- `npm run test:e2e:report` → `playwright show-report`
- `npm run supabase:start` → `node scripts/supabase-local.mjs start`
- `npm run supabase:reset` → `node scripts/supabase-local.mjs reset`
- `npm run supabase:stop` → `node scripts/supabase-local.mjs stop`
- `npm run supabase:env` → `node scripts/supabase-local.mjs env`
- `npm run supabase:functions:e2e` → `node scripts/supabase-local.mjs functions:e2e`

## Skills do projeto
Em `.claude/skills/<nome>/SKILL.md`: integration-react-vite — o Codex deve lê-las como documentos quando a tarefa pedir.

## Portas locais
Respeitar a porta documentada pelo projeto (configs/scripts). Sem porta documentada: `PORT="$("$HOME/.claude/bin/claude-project-port")"` se o helper existir.

## Protocolo de sessão (padrão comum Claude + Codex)
1. Ler este arquivo, `ESTADO.md` e `~/Projects/_AI_COORDENACAO/PADRAO.md`; rodar `git status` e ver `.ai/claims/`.
2. Preservar alterações existentes; parar só se houver sobreposição, conflito ou risco não esclarecido.
3. Registrar claim em `.ai/claims/`; uma IA por árvore de trabalho.
4. Ao sair: atualizar `ESTADO.md` e encerrar o claim.
