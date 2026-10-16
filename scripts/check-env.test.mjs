// Testes do scripts/check-env.mjs (DI-084). Rodar: npm run test:scripts
//
// Cada teste monta uma árvore mínima num diretório temporário e roda o script
// com --root apontando para ela (fora de um repositório: a checagem do
// .gitignore é pulada).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), 'check-env.mjs')

const BASE_TREE = {
  'src/lib/env.ts': 'const schema = { VITE_SUPABASE_URL: z.string() }\n',
  'src/lib/supabase.ts': 'export const url = import.meta.env.VITE_SUPABASE_URL\n',
  'src/vite-env.d.ts': 'interface ImportMetaEnv {\n  readonly VITE_SUPABASE_URL: string\n}\n',
  '.env.example': '# comentário\nVITE_SUPABASE_URL=\n',
  'supabase/functions/send-email/index.ts':
    "const key = Deno.env.get('RESEND_API_KEY')\nconst url = Deno.env.get('SUPABASE_URL')\n",
  'supabase/functions/.env.example': 'RESEND_API_KEY=\n',
  'e2e/fixtures/auth.ts': 'const secret = process.env.E2E_LOGIN_SECRET\nconst ci = process.env.CI\n',
  'playwright.config.ts': 'const url = process.env.VITE_SUPABASE_URL\n',
  '.env.test.example': 'VITE_SUPABASE_URL=http://127.0.0.1:54321\nE2E_LOGIN_SECRET=\n',
}

function run(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'check-env-'))
  for (const [file, content] of Object.entries({ ...BASE_TREE, ...overrides })) {
    if (content === null) continue
    mkdirSync(dirname(join(root, file)), { recursive: true })
    writeFileSync(join(root, file), content)
  }
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: result.status, output: `${result.stdout}${result.stderr}` }
}

test('árvore coerente passa (chaves da plataforma e CI não precisam de exemplo)', () => {
  const { code, output } = run()
  assert.equal(code, 0, output)
  assert.match(output, /check-env: ok/)
})

test('chave lida no código e ausente do exemplo falha', () => {
  const { code, output } = run({
    'supabase/functions/send-email/index.ts': "Deno.env.get('RESEND_API_KEY'); Deno.env.get('EMAIL_FROM')\n",
  })
  assert.equal(code, 1)
  assert.match(output, /EMAIL_FROM é lida em .* mas falta em supabase\/functions\/\.env\.example/)
})

test('chave órfã no exemplo falha', () => {
  const { code, output } = run({ '.env.example': 'VITE_SUPABASE_URL=\nVITE_STRIPE_PUBLISHABLE_KEY=\n' })
  assert.equal(code, 1)
  assert.match(output, /VITE_STRIPE_PUBLISHABLE_KEY está em \.env\.example mas o código não usa \(órfã\)/)
})

test('variável do front sem validação em src/lib/env.ts falha', () => {
  const { code, output } = run({
    'src/lib/supabase.ts': 'import.meta.env.VITE_SUPABASE_URL; import.meta.env.VITE_SENTRY_DSN\n',
    '.env.example': 'VITE_SUPABASE_URL=\nVITE_SENTRY_DSN=\n',
    'src/vite-env.d.ts': 'readonly VITE_SUPABASE_URL: string\nreadonly VITE_SENTRY_DSN?: string\n',
  })
  assert.equal(code, 1)
  assert.match(output, /VITE_SENTRY_DSN é lida em .* mas não é validada em src\/lib\/env\.ts/)
})

test('valor com cara de chave real no exemplo falha, sem imprimir o valor', () => {
  const fakeKey = 'sk_live_' + 'x'.repeat(24)
  const { code, output } = run({ 'supabase/functions/.env.example': `RESEND_API_KEY=${fakeKey}\n` })
  assert.equal(code, 1)
  assert.match(output, /RESEND_API_KEY em supabase\/functions\/\.env\.example parece um valor real/)
  assert.equal(output.includes(fakeKey), false)
})

test('chave injetada pela plataforma declarada no exemplo das functions falha', () => {
  const { code, output } = run({ 'supabase/functions/.env.example': 'RESEND_API_KEY=\nSUPABASE_URL=\n' })
  assert.equal(code, 1)
  assert.match(output, /SUPABASE_URL é injetada pelo Supabase/)
})

test('exemplo ausente falha', () => {
  const { code, output } = run({ '.env.test.example': null })
  assert.equal(code, 1)
  assert.match(output, /\.env\.test\.example não existe/)
})
