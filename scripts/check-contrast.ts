// Confere o contraste WCAG dos tokens de cor (direção "Azulejo", DI-062) e
// imprime uma tabela em Markdown (para colar no PR).
//
// Uso: npx tsx scripts/check-contrast.ts
//      npx tsx scripts/check-contrast.ts --only-failures
//
// Lê os tokens de src/index.css e a escala brand do tailwind.config.ts; os
// pares conferidos estão em src/lib/contrast.ts (TOKEN_PAIRS). Sai com código 1
// se algum par obrigatório ficar abaixo do mínimo — o mesmo critério do
// src/lib/contrast.test.ts, que roda no `npm test`.
import { readFileSync } from 'node:fs'
import tailwindConfig from '../tailwind.config'
import { evaluateAll, formatRatio, readRootVariables } from '../src/lib/contrast'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const brand = Object.fromEntries(
  Object.entries(tailwindConfig.theme.extend.colors.brand).map(([k, v]) => [String(k), v]),
) as Record<string, string>

const onlyFailures = process.argv.includes('--only-failures')
const results = evaluateAll({ vars: readRootVariables(css), brand })
const failures = results.filter((r) => !r.pass)

const describeColor = (ref: string, hex: string, alpha?: number, over?: string) =>
  alpha === undefined ? `\`${ref}\` ${hex}` : `\`${ref}\` a ${Math.round(alpha * 100)}% sobre \`${over ?? 'card'}\` (${hex})`

const rows = (onlyFailures ? failures : results).map((r) => {
  const status = r.min === 0 ? 'info' : r.pass ? 'ok' : 'FALHA'
  const min = r.min === 0 ? '—' : `${String(r.min).replace('.', ',')}:1`
  return `| ${describeColor(r.fg, r.fgHex)} | ${describeColor(r.bg, r.bgHex, r.bgAlpha, r.over)} | ${formatRatio(r.ratio)} | ${min} | ${status} | ${r.use} |`
})

console.log('| Frente | Fundo | Contraste | Mínimo | Status | Uso |')
console.log('| --- | --- | --- | --- | --- | --- |')
for (const row of rows) console.log(row)
console.log('')

const enforced = results.filter((r) => r.min > 0)
if (failures.length > 0) {
  console.error(`${failures.length} de ${enforced.length} pares obrigatórios abaixo do mínimo.`)
  process.exit(1)
}
console.log(`${enforced.length} pares obrigatórios conferidos: todos passam.`)
