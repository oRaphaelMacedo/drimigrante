# Dependências, Node e auditoria de segurança

Última revisão: 16/10/2026 (DI-085).

## Padrão do projeto

| Item | Valor | Onde está definido |
|---|---|---|
| Gerenciador de pacotes | **npm** (lockfile único: `package-lock.json`) | `packageManager` no `package.json` |
| Versão do npm | 10.9.8 | `packageManager` |
| Node | 22.x | `.nvmrc` (`22`) e `engines.node` |
| Instalação | `npm ci` (local e CI) | workflows em `.github/workflows` |

- Não use pnpm nem yarn: eles geram outro lockfile e versões diferentes das que vão para produção.
- Se a sua pasta `node_modules` foi criada pelo pnpm (existe `node_modules/.pnpm`), apague a pasta e rode `nvm use && npm ci`.
- Para adicionar uma dependência: `npm install <pacote>@<versão>` (ou `-D` para desenvolvimento) e faça commit do `package.json` e do `package-lock.json` juntos.
- Prefira versões publicadas há pelo menos 7 a 14 dias. O npm aceita uma data de corte: `npm install <pacote> --before=AAAA-MM-DD`. Esta revisão usou `--before=2026-10-02`.

## Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | `tsc` + build de produção em `dist/` |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`) |
| `npm run lint` | ESLint; falha só com erros |
| `npm run lint:strict` | ESLint; falha também com avisos (`--max-warnings 0`) — o DI-088 liga no CI |
| `npm test` | Testes unitários (Vitest, uma execução) |
| `npm run test:watch` | Vitest em modo observação |
| `npm run test:coverage` | Vitest com cobertura (v8); relatório HTML em `node_modules/.vitest/coverage/index.html` |
| `npm run test:e2e*` | Playwright (ver `TESTING.md`) |

Testes unitários ficam ao lado do código (`src/**/*.test.ts(x)`) e em `supabase/functions/_shared/**/*.test.ts` (só módulos puros, sem `Deno.*`). O ambiente padrão é `node`; para testar componentes React, comece o arquivo com `// @vitest-environment jsdom` e use `@testing-library/react` (exemplo: `src/pages/legal/TermsPage.test.tsx`).

## Dependências já instaladas para as próximas ondas

| Pacote | Tipo | Para quê |
|---|---|---|
| `@fontsource-variable/figtree`, `@fontsource-variable/literata` | produção | Fontes da identidade "Azulejo", self-hosted (sem CDN do Google) |
| `react-markdown` | produção | Renderizar a análise em Markdown sem HTML bruto (DI-050) |
| `vitest`, `@vitest/coverage-v8` | dev | Testes unitários e cobertura |
| `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/user-event` | dev | Testes de componentes |
| `@axe-core/playwright` | dev | Testes de acessibilidade no Playwright |
| `tsx` | dev | Rodar scripts TypeScript localmente (ex.: gerador de seed do quiz) |
| `tailwindcss-animate` | dev | Plugin do Tailwind (só usado no build; saiu de `dependencies`) |

## Auditoria (`npm audit`)

Critério: `npm audit --omit=dev` **sem vulnerabilidade high ou critical**. Estado em 16/10/2026, depois de `npm audit fix` (sem `--force`):

- Produção (`--omit=dev`): **0 critical, 0 high, 2 moderate**.
- Antes: 25 vulnerabilidades em produção (10 high). O `react-router-dom` foi atualizado de 6.30.3 para 6.30.6; o `npm audit fix` atualizou `posthog-js` (1.372 → 1.435, que deixou de trazer `@opentelemetry/*` e `protobufjs`), `dompurify` e `fflate`. Mover `tailwindcss-animate` para `devDependencies` tirou da produção a cadeia `tailwindcss → chokidar/micromatch/braces/postcss/nanoid/source-map-js`.

### Exceções aceitas em produção

| Pacote | Severidade | Aviso | Por que fica | Como corrigir |
|---|---|---|---|---|
| `react-router` / `react-router-dom` 6.30.6 | moderate | [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6) — open redirect com barra invertida em `<Link>`/`useNavigate` | A correção só existe na v7 (major). O app só navega para caminhos definidos no código; o único destino dinâmico é o `auth_return_to` do `AuthCallbackPage`, gravado pelo próprio app. | Migrar para React Router 7. Até lá, validar destinos dinâmicos recusando `//` e `/\` no início (recomendado no `AuthCallbackPage`). |
| `react-router` 6.30.6 | moderate | [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg) — injeção via `deserializeErrors()` na hidratação SSR | Não se aplica: o app é SPA, sem SSR nem dados de hidratação. | Migrar para React Router 7. |

### Exceções aceitas em desenvolvimento (não entram no bundle)

| Pacote | Severidade | Motivo | Correção prevista |
|---|---|---|---|
| `vitest` 3.2.7 → `tinypool` 1.1.1 | critical | Prototype pollution nas opções do worker ([GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)); exige código malicioso já rodando nos testes. `@vitest/mocker` tem leitura de arquivo via mock ([GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)). | Vitest ≥ 4.1.11, que exige Vite ≥ 6. |
| `vite` 5.4.21 / `esbuild` 0.21 | high / moderate | Problemas do servidor de desenvolvimento ([GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) só no Windows, [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)). Não afetam o build estático. Não exponha o dev server na rede (`--host`). | Migrar para Vite 6+ (junto com `@vitejs/plugin-react` e `vite-plugin-pwa` compatíveis). |
| `tailwindcss` 3 → `braces`/`micromatch`/`chokidar`, `postcss-selector-parser` | high / moderate | Negação de serviço com padrões maliciosos; só roda no build com arquivos do próprio repositório. | O npm não aponta correção na v3; reavaliar na migração para o Tailwind 4. |
| `@typescript-eslint/*` 7 → `globby`/`fast-glob`/`braces` | high | Mesma cadeia do `braces`; só roda no lint. | typescript-eslint 8 + ESLint 9 (o ESLint 8 já está sem suporte). |

Majors pendentes (fora do escopo desta onda, cada uma em PR próprio): Vite 6+ e Vitest 4, ESLint 9 + typescript-eslint 8 (flat config), Tailwind 4, React Router 7. Também vale alinhar `@types/node` (hoje ^20) com o Node 22.

## Atualizações automáticas (Dependabot)

`.github/dependabot.yml` abre PRs toda segunda-feira (horário de Lisboa):

- npm: minors e patches agrupados (produção e desenvolvimento separados), no máximo 5 PRs abertos, só versões com pelo menos 7 dias de publicação (`cooldown`).
- Majors com migração planejada (lista no arquivo) ficam fora e são feitas à mão.
- GitHub Actions: atualização semanal das actions.
- Alertas e correções de segurança do Dependabot dependem de estarem ligados em Settings → Code security do repositório (ação do dono).

Antes de aprovar um PR do Dependabot: `npm ci && npm run typecheck && npm run lint && npm test && npm run build`.
