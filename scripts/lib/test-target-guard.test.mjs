// Testes da trava de alvo dos testes (DI-060). Rodar: npm run test:scripts
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  PRODUCTION_SUPABASE_REF,
  UnsafeTestTargetError,
  assertSafeTestTarget,
  assessTestTarget,
  isLocalHostname,
  parseAllowedRemoteHosts,
  readEnvFile,
} from './test-target-guard.mjs'

const PROD_SUPABASE = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`

test('aceita Supabase e front locais', () => {
  assert.deepEqual(
    assessTestTarget({
      supabaseUrl: 'http://127.0.0.1:54321',
      baseUrl: 'http://localhost:33401',
      loginUrl: 'http://127.0.0.1:54321/functions/v1/e2e-login',
    }),
    { ok: true },
  )
  assert.equal(isLocalHostname('app.localhost'), true)
  assert.equal(isLocalHostname('host.docker.internal'), true)
})

test('recusa o projeto Supabase de produção, mesmo na allowlist', () => {
  const result = assessTestTarget({
    supabaseUrl: PROD_SUPABASE,
    allowedRemoteHosts: [`${PRODUCTION_SUPABASE_REF}.supabase.co`],
  })
  assert.equal(result.ok, false)
  assert.match(result.reasons.join(' '), /PRODUÇÃO/)
})

test('recusa o ref de produção em qualquer parte da URL', () => {
  const result = assessTestTarget({
    loginUrl: `http://127.0.0.1:54321/functions/v1/e2e-login?p=${PRODUCTION_SUPABASE_REF}`,
  })
  assert.equal(result.ok, false)
})

test('recusa os domínios do front de produção', () => {
  for (const baseUrl of ['https://www.drimigrante.com', 'https://drimigrante.com/']) {
    const result = assessTestTarget({ baseUrl, allowedRemoteHosts: 'www.drimigrante.com' })
    assert.equal(result.ok, false, baseUrl)
  }
})

test('host remoto só passa quando listado em E2E_ALLOWED_REMOTE_HOSTS', () => {
  const staging = 'https://abcdefghijklmnopqrst.supabase.co'
  assert.equal(assessTestTarget({ supabaseUrl: staging }).ok, false)
  assert.equal(
    assessTestTarget({
      supabaseUrl: staging,
      allowedRemoteHosts: 'abcdefghijklmnopqrst.supabase.co, staging.example.test',
    }).ok,
    true,
  )
  assert.equal(assessTestTarget({ baseUrl: 'https://dr-imigrante-x.vercel.app' }).ok, false)
})

test('URL inválida ou com esquema estranho é recusada', () => {
  assert.equal(assessTestTarget({ supabaseUrl: 'nao-e-url' }).ok, false)
  assert.equal(assessTestTarget({ supabaseUrl: 'ftp://127.0.0.1' }).ok, false)
})

test('assertSafeTestTarget lança erro com os motivos, sem valores de chave', () => {
  assert.throws(
    () => assertSafeTestTarget({ supabaseUrl: PROD_SUPABASE }),
    (error) => error instanceof UnsafeTestTargetError && error.reasons.length === 1,
  )
  assert.doesNotThrow(() => assertSafeTestTarget({}))
})

test('parseAllowedRemoteHosts aceita vírgula, espaço, esquema e porta', () => {
  assert.deepEqual(parseAllowedRemoteHosts('https://A.example.test:8443, b.example.test  c.test:80'), [
    'a.example.test',
    'b.example.test',
    'c.test',
  ])
  assert.deepEqual(parseAllowedRemoteHosts(undefined), [])
})

test('readEnvFile lê KEY=valor, aspas e comentários', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-'))
  const file = join(dir, '.env.test.local')
  writeFileSync(
    file,
    [
      '# comentário',
      'VITE_SUPABASE_URL=http://127.0.0.1:54321',
      'export E2E_BASE_URL="http://localhost:33401"',
      'E2E_ALLOWED_REMOTE_HOSTS= # vazio',
      'linha inválida',
    ].join('\n'),
  )
  assert.deepEqual(readEnvFile(file), {
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    E2E_BASE_URL: 'http://localhost:33401',
    E2E_ALLOWED_REMOTE_HOSTS: '',
  })
  assert.deepEqual(readEnvFile(join(dir, 'nao-existe')), {})
})
