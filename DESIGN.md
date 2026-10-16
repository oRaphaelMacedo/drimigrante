# DESIGN — direção visual "Azulejo"

Guia de identidade visual do Doutor Imigrante (card DI-062). Vale para toda tela nova e para
qualquer arquivo de UI que for tocado (regra do escoteiro). O contexto do produto e as regras de
copy estão em [PRODUCT.md](PRODUCT.md).

**Resumo:** mantém o cobalto da marca e o monograma "DI", aquece com âmbar (só na compra) e com
uma serifa de leitura nos títulos, e usa um motivo de azulejo discreto. Interface clara, sem
modo escuro, pensada primeiro para o celular.

> Decisão do dono em aberto: a direção pode ser vetada (as alternativas estudadas foram
> "Acolhida" e "Dossiê"). Trocar de direção = trocar os tokens descritos aqui; os componentes de
> `src/components/ui` só usam tokens semânticos e não precisam mudar.

## Onde mora cada coisa

| O quê | Arquivo |
| --- | --- |
| Cores (variáveis HSL no `:root`), raio, sombras, movimento, `color-scheme` | `src/index.css` |
| Mapeamento para classes Tailwind, escala `brand`, famílias, escala tipográfica, sombras, `zIndex` | `tailwind.config.ts` |
| `@font-face` da Figtree, da Literata e das fontes de reserva | `src/styles/fonts.css` (importado em `src/main.tsx`) |
| Componentes base | `src/components/ui` (demo em `/src/components/ui/demo/ui-demo.html`, só em dev) |
| Pares de contraste conferidos | `src/lib/contrast.ts` (`TOKEN_PAIRS`) |
| Teste dos tokens (roda no `npm test`) | `src/lib/contrast.test.ts` |
| Tabela de contraste para o PR | `npx tsx scripts/check-contrast.ts` |
| `theme-color` e manifest do PWA | `index.html` e `vite.config.ts` (`THEME_COLOR`) |
| Imagem de partilha (1200×630) | `scripts/og-image.html` → `node scripts/generate-og-image.mjs` → `public/og-image.jpg` |

Para mudar uma cor, mude a variável em `src/index.css` e rode `npm test`: o teste falha se o hex
divergir do esperado ou se algum par de contraste cair abaixo do mínimo.

## Cores

Formato do shadcn/ui: `--token: H S% L%`, usado como `hsl(var(--token))` (ou pelas classes
`bg-primary`, `text-muted-foreground` etc.).

| Token | HSL | Hex | Uso |
| --- | --- | --- | --- |
| `--background` | `225 50% 98.4%` | `#f9fafd` | Fundo da página |
| `--foreground` | `223 34.4% 12%` | `#141a29` | Texto principal (16,6:1 sobre o fundo) |
| `--card` / `--popover` | `0 0% 100%` | `#ffffff` | Cards, menus, sheets |
| `--primary` | `228 73% 45.1%` | `#1f41c7` | Cobalto: ação principal, links, foco. Branco por cima: 7,96:1 |
| `--primary-hover` | `228 75.5% 38.4%` | `#1836ac` | Hover do primary (= `brand-800`) |
| `--accent` | `40.5 98.1% 58.8%` | `#fdba2f` | Âmbar: **só** CTA de compra/pagamento e destaques de compra |
| `--accent-foreground` | `33 64.3% 11%` | `#2e1e0a` | Texto sobre âmbar (9,37:1) |
| `--accent-hover` | `40.7 92% 51%` | `#f5ab0f` | Hover do Button `pay` (texto 8,2:1) |
| `--muted` / `--secondary` | `223 33.3% 95.9%` | `#f1f3f8` | Blocos neutros, hover de ghost/outline |
| `--muted-foreground` | `221 10.7% 40.4%` | `#5c6372` | Texto de apoio (6,03:1 sobre branco) |
| `--border` / `--input` | `222 23.6% 89.2%` | `#dde1ea` | Divisores e bordas |
| `--ring` | = primary | `#1f41c7` | Anel de foco |
| `--success` | `151.4 82.9% 25.3%` | `#0b7643` | Sucesso (5,7:1) |
| `--warning` | `39 100% 27.1%` | `#8a5a00` | Aviso (5,9:1) |
| `--destructive` | `0.4 67.9% 47.6%` | `#cc2827` | Erro e ações destrutivas (5,38:1) |

Os matizes de `--accent`, `--success` e `--destructive` têm uma casa decimal (40.5, 151.4, 0.4)
para que o navegador produza exatamente o hex da direção: `40 98.1% 58.8%`, por exemplo, sai
`#fdb82f`, não `#fdba2f`. O hex é a referência.

**Escala `brand`** (Tailwind, `bg-brand-50` … `bg-brand-950`): 50 `#eff5ff`, 100 `#dae8ff`,
200 `#bcd4ff`, 300 `#93b5ff`, 400 `#618bf9`, 500 `#3c67e8`, 600 `#2a52d8`,
**700 `#1f41c7` (= primary)**, 800 `#1836ac`, 900 `#112981`, 950 `#09194e`.

### Regras de cor

- **Um único primary:** `#1f41c7` no CSS, em `brand-700`, no `<meta name="theme-color">` e no
  `theme_color` do manifest. O teste confere os quatro.
- **Âmbar é dinheiro.** `bg-accent` só no Button `variant="pay"` e em destaques de compra (ex.:
  preço sobre cobalto, 4,63:1). Proibido em ghost/outline/hover genérico (use `bg-muted`).
  **Branco sobre âmbar é proibido** (não passa AA); o texto é sempre `text-accent-foreground`.
- `gold-*` é legado (paleta anterior) e está marcado como `@deprecated` no Tailwind: branco
  sobre `gold-500` dá 2,15:1. Não usar em código novo.
- Sem gradientes decorativos nem círculos de fundo. Superfícies chapadas.
- Estados: prefira o `Badge` (`success`, `warning`, `danger`, `primary`, `neutral`), que já usa
  pares AA (texto na cor do estado sobre o próprio tom a 8%).
- Sem modo escuro por agora: `:root { color-scheme: only light }` e
  `<meta name="color-scheme" content="only light">`. Não use `dark:`.

### Motivo de azulejo

Tile de 48px em SVG inline (data URI, sem requisição), uma cor, 7–8% de opacidade. Uso restrito
ao **hero** e ao **card de paywall**.

- `bg-azulejo` — cobalto sobre superfícies claras (`bg-background`, `bg-card`, `bg-muted`).
- `bg-azulejo-inverse` — branco sobre superfícies cobalto: `className="bg-primary bg-azulejo-inverse"`.

## Tipografia

- **Literata** (serifa de leitura) nos títulos h1–h2, pesos 600–700. Aplicada por padrão em
  `h1`/`h2` (`src/index.css`) e pela classe `font-display`. Nunca em rótulos, botões ou dados.
- **Figtree** na interface e no corpo, pesos 400–700 (`font-sans`, padrão do `body`).
- Self-hosted via `@fontsource-variable/figtree` e `@fontsource-variable/literata`: só o subset
  latino (cobre pt-BR e pt-PT, `€`, aspas e travessões), `font-display: swap`, woff2 variáveis
  copiados para `/assets` no build. Nada de CDN do Google Fonts.
- A Literata é declarada só de 600 a 700: `font-extrabold`/`font-black` num título saem em 700.
- Fontes de reserva com métricas ajustadas (`Figtree Fallback` sobre Arial e Arial Bold,
  `Literata Fallback` sobre Georgia Bold), medidas no Chromium. No Android, que não tem Arial nem
  Georgia, a reserva é o Roboto do sistema, sem ajuste (não havia Roboto para medir; dá para
  acrescentar uma face medida num aparelho Android).

### Escala

| Classe | Tamanho | Entrelinha | Uso |
| --- | --- | --- | --- |
| `text-display` | `clamp(1.875rem, 1.2rem + 3vw, 3rem)` | 1.1 | Título do hero |
| `text-h1` | `clamp(1.75rem, 1.48rem + 1.2vw, 2.25rem)` | 1.15 | Título de página |
| `text-h2` | `clamp(1.375rem, 1.17rem + 0.9vw, 1.75rem)` | 1.25 | Título de seção |
| `text-h3` | `1.125rem` | 1.4 | Subtítulo, título de card (Figtree) |
| `text-base` | `1rem` | 1.6 | Corpo (padrão do `body`) |
| `text-sm` | `.875rem` | Tailwind | Texto de apoio, rótulos |
| `text-xs` | `.75rem` | Tailwind | **Mínimo absoluto** |

Os `clamp` chegam ao mínimo em 360px e ao máximo por volta de 1000px.

- Proibido `text-[10px]`/`text-[11px]` fora do admin.
- `text-wrap: balance` em h1–h3 e `text-wrap: pretty` em parágrafos (já no CSS base).
- Títulos em sentence case ("Descubra se você tem direito", não "Descubra Se Você Tem Direito").
- No máximo **um** eyebrow em caixa-alta por página.
- Nenhum emoji como ícone: use `lucide-react`.

## Forma

- **Raio:** `--radius: .875rem`. Cards `rounded-lg` (= `--radius`); controles (botões, campos)
  `rounded-xl` (.75rem); pílula (`rounded-full`) só em badges. `rounded-md` (6px) e
  `rounded-sm` (4px) ficam para elementos miúdos, como o quadrado de um checkbox.
  Atenção: aqui `rounded-lg` (14px) é maior que `rounded-xl` (12px), de propósito.
- **Sombras tingidas** (nunca preto puro):
  - `shadow-sm` / `shadow` — `0 1px 2px rgb(20 26 41 / .06)`
  - `shadow-md` — `0 8px 24px -8px rgb(31 65 199 / .18)`
  - `shadow-lg` — `0 16px 40px -12px rgb(31 65 199 / .22)` (sheets e diálogos)
  - `shadow-xl`/`shadow-2xl` existem tingidas só para o código legado não voltar ao preto; não use em código novo.
  - As mesmas sombras estão em `--shadow-*` para uso em `shadow-[var(--shadow-sm)]`.

## Movimento

- Curva `cubic-bezier(.25, 1, .5, 1)` (`--ease-out`, classe `ease-out`, e padrão de `transition`).
- Durações: 150ms (`duration-fast`, padrão), 250ms (`duration-base`), 400ms (`duration-slow`).
  Prefira as classes nomeadas a `duration-[250ms]`/`ease-[...]`: com o `tailwindcss-animate`,
  os valores arbitrários geram aviso de classe ambígua no build.
- `@media (prefers-reduced-motion: reduce)` zera animações e transições (0.01ms, para os eventos
  de fim continuarem disparando e o Radix desmontar sheets).
- Movimento serve para dar contexto (abrir sheet, confirmar toque), nunca para enfeitar.

## Camadas (z-index)

| Camada | Classe |
| --- | --- |
| Barras fixas (StickyCTA, BottomNav) | `z-30` |
| Header | `z-40` |
| Banner de cookies | `z-50` |
| Sheets e diálogos | `z-60` |
| Toasts | `z-70` |

## Componentes base (`src/components/ui`)

Todos com `cva` + `cn`, só tokens semânticos, importados de `@/components/ui`.

- **Button** — variantes `primary` (uma por tela), `pay` (âmbar, só compra), `secondary`,
  `outline`, `ghost`, `link`, `destructive`; tamanhos `sm` (40px visuais, área de toque de 44px),
  `md` (48px), `lg` (56px) e `icon` (44×44, exige `aria-label`); `loading` mostra spinner e marca
  `aria-busy`; `asChild` para `<Link>`; foco `focus-visible:ring-2 ring-offset-2`.
- **Card** — `p-5` no celular, `p-6` a partir de `sm`, raio `--radius`.
- **Input / Select / Textarea** — 16px (`text-base`), Input e Select com `h-12`, rótulo ligado,
  `hint` e `error` com `aria-describedby` e `aria-invalid`.
- **Badge** — pares AA por estado; pílula.
- **BottomSheet** — Radix Dialog: embaixo no celular, centralizado no desktop; o "voltar" do
  Android fecha o sheet (`pushState`/`popstate`).
- **StickyCTA** — barra fixa que aparece quando a âncora sai da tela e some quando o CTA inline
  está visível ou quando um campo está focado.
- **Container** — `px-4` no celular, `sm:px-6`, `lg:px-8`.

## Checklist mobile (para todo PR de UI)

- [ ] Uma ação primária por tela; compra usa `Button variant="pay"`.
- [ ] Alvos de toque ≥44px; CTA primário 48–56px.
- [ ] Campos com fonte ≥16px (anti-zoom do iOS; a regra global de `src/index.css` cobre o resto).
- [ ] `dvh` em vez de `vh` (`min-h-dvh`, `h-dvh`); `index.html` com `viewport-fit=cover`.
- [ ] Barras fixas: `fixed inset-x-0 z-30 bg-card/95 backdrop-blur border-t px-4 pt-3
      pb-[calc(.75rem+env(safe-area-inset-bottom))]`, `bottom: var(--cookie-banner-h, 0px)` e
      padding-bottom compensatório no conteúdo.
- [ ] Barras fixas somem com input/textarea focado (teclado aberto).
- [ ] Toasts não cobrem CTA fixo nem BottomNav.
- [ ] `Container`/`px-4` no celular; nenhuma rolagem horizontal em 360px.
- [ ] Texto ≥4,5:1; foco visível; Rejeitar e Aceitar (cookies) com o mesmo peso visual.
- [ ] Nada abaixo de `text-xs`; títulos em sentence case; no máximo um eyebrow em caixa-alta.
- [ ] Sem gradiente decorativo, sem emoji como ícone, sem `bg-accent` fora de compra.
- [ ] Screenshots 375×812 e 360×740 das telas tocadas no PR.

## Contraste

`npm test` roda `src/lib/contrast.test.ts`, que lê os tokens de `src/index.css` e a escala
`brand` do Tailwind e reprova o PR se algum par de `TOKEN_PAIRS` cair abaixo do mínimo (texto
4,5:1; anel de foco e bordas de controle 3:1). Para colar a tabela no PR:

```bash
npx tsx scripts/check-contrast.ts            # tabela completa (Markdown)
npx tsx scripts/check-contrast.ts --only-failures
```

A tabela mostra a razão truncada em duas casas (4,499 aparece como 4,49 e reprova), por isso
alguns valores saem um centésimo abaixo dos citados acima (ex.: 7,95 para o primary).

Ao criar um token ou um uso novo de cor (texto sobre uma superfície diferente), acrescente o par
em `TOKEN_PAIRS`.

### Pendência: borda de campo

`--input` (`#dde1ea`) tem 1,30:1 sobre branco. A WCAG 1.4.11 pede 3:1 quando a borda é a única
pista visual de que ali existe um campo. O valor segue a decisão de design; os campos têm rótulo
visível, mas a borda continua fraca. Proposta para o dono decidir: `--input: 222 13% 58%`
(`#868ea2`, 3,28:1 sobre branco e 3,14:1 sobre o fundo), mantendo `--border` como está para
divisores e cards.
