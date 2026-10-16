// Testes de _shared/origin.ts (DI-019) e _shared/payments.ts.
// Rodar: deno test supabase/functions

import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { getAppUrl, isAllowedOrigin, resolveAppUrl } from './origin.ts'
import {
  addCalendarMonthsUtc,
  hasActivePaidAccess,
  isCheckoutSettled,
  isOneTimeAccessActive,
  normalizeEmail,
} from './payments.ts'

const APP_URL = 'https://www.drimigrante.com'
const env = (values: Record<string, string>) => (key: string) => values[key]

Deno.test('origin.ts rejeita origens de terceiros e variações enganosas', () => {
  for (const origin of [
    'https://evil.com',
    'http://localhost.evil.com',
    'http://localhost:5173.evil.com',
    'https://www.drimigrante.com.evil.com',
    'https://dr-imigrante-abc-oraphaelmacedo-3991s-projects.vercel.app.evil.com',
    'https://dr-imigrante-abc-outro-time-projects.vercel.app',
    'http://www.drimigrante.com', // http no domínio de produção
    'https://www.drimigrante.com/', // não é uma origem pura
    'HTTP://LOCALHOST:5173',
    'https://user@www.drimigrante.com',
    'javascript:alert(1)',
    'null',
    '',
  ]) {
    assert(!isAllowedOrigin(origin, APP_URL), `deveria rejeitar ${origin}`)
  }
})

Deno.test('origin.ts aceita APP_URL, previews do projeto e localhost', () => {
  for (const origin of [
    APP_URL,
    'https://dr-imigrante-git-feat-x-oraphaelmacedo-3991s-projects.vercel.app',
    'http://localhost:5173',
    'http://localhost',
    'http://127.0.0.1:34208',
  ]) {
    assert(isAllowedOrigin(origin, APP_URL), `deveria aceitar ${origin}`)
  }
})

Deno.test('resolveAppUrl usa a Origin permitida, senão APP_URL', () => {
  const getEnv = env({ APP_URL: `${APP_URL}/` })
  const req = (origin?: string) =>
    new Request('http://localhost/x', { headers: origin ? { Origin: origin } : {} })
  assertEquals(resolveAppUrl(req('https://evil.com'), getEnv), APP_URL)
  assertEquals(resolveAppUrl(req('http://localhost.evil.com'), getEnv), APP_URL)
  assertEquals(resolveAppUrl(req(), getEnv), APP_URL)
  assertEquals(resolveAppUrl(req('http://localhost:34208'), getEnv), 'http://localhost:34208')
  assertEquals(getAppUrl(env({})), 'http://localhost:5173')
})

Deno.test('payments.ts: regras de acesso e datas', () => {
  const now = new Date('2026-10-16T12:00:00Z')
  const expires = now.toISOString()
  // No instante exato da expiração o acesso ainda vale.
  assert(isOneTimeAccessActive({ one_time_paid: true, one_time_access_expires_at: expires }, now))
  assert(
    !isOneTimeAccessActive(
      { one_time_paid: true, one_time_access_expires_at: expires },
      new Date(now.getTime() + 1),
    ),
  )
  assert(!isOneTimeAccessActive({ one_time_paid: false }, now))
  assert(hasActivePaidAccess({ recurring_active: true }, now))
  assert(!hasActivePaidAccess(null, now))

  assert(isCheckoutSettled('paid'))
  assert(isCheckoutSettled('no_payment_required'))
  assert(!isCheckoutSettled('unpaid'))

  assertEquals(normalizeEmail('  Pessoa@Example.COM '), 'pessoa@example.com')
  assertEquals(normalizeEmail('sem-arroba'), null)
  assertEquals(normalizeEmail(42), null)

  // 31/jan + 1 mês → 28/fev; +12 meses → 31/jan do ano seguinte.
  const jan31 = Date.UTC(2026, 0, 31, 9, 15, 0) / 1000
  assertEquals(addCalendarMonthsUtc(jan31, 1), Date.UTC(2026, 1, 28, 9, 15, 0) / 1000)
  assertEquals(addCalendarMonthsUtc(jan31, 12), Date.UTC(2027, 0, 31, 9, 15, 0) / 1000)
})
