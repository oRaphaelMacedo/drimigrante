import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RETENTION } from './retention'

// A Política de Privacidade mostra RETENTION; o banco aplica as constantes da
// migration. Os dois precisam dizer a mesma coisa (DI-083).
const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20261030000100_retention_lgpd.sql'),
  'utf8',
)

function sqlConstant(name: string): number {
  const match = new RegExp(`${name}\\s+CONSTANT\\s+INT\\s*:=\\s*(\\d+)`).exec(migration)
  if (!match) throw new Error(`constante ${name} não encontrada na migration`)
  return Number(match[1])
}

describe('RETENTION × migration 20261030000100_retention_lgpd.sql', () => {
  it('prazos iguais aos aplicados pelo banco', () => {
    expect(sqlConstant('c_anon_days')).toBe(RETENTION.anonymousAssessmentDays)
    expect(sqlConstant('c_waitlist_days')).toBe(RETENTION.waitlistDays)
    expect(sqlConstant('c_email_content_days')).toBe(RETENTION.emailContentDays)
    expect(sqlConstant('c_email_address_days')).toBe(RETENTION.emailAddressDays)
  })

  it('12 meses da lista de espera correspondem aos 365 dias', () => {
    expect(RETENTION.waitlistMonths * 30).toBeLessThanOrEqual(RETENTION.waitlistDays)
    expect(Math.round(RETENTION.waitlistDays / 365)).toBe(RETENTION.waitlistMonths / 12)
  })
})
