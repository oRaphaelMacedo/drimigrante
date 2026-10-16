// @vitest-environment jsdom
import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PRIVACY_EMAIL } from '@/config/contact'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) } },
}))

import {
  AccountPrivacyError,
  DELETE_ACCOUNT_CODE_MESSAGES,
  LOCAL_PERSONAL_KEYS,
  clearLocalAccountData,
  deleteMyAccount,
  emailsMatch,
  exportFileName,
  exportMyData,
  normalizeEmail,
} from './account-privacy'

function httpError(status: number, body: Record<string, unknown>) {
  return new FunctionsHttpError(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

beforeEach(() => {
  mocks.invoke.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('emailsMatch', () => {
  it('confere sem diferenciar maiúsculas nem espaços nas pontas', () => {
    expect(emailsMatch('  Ana@Example.COM ', 'ana@example.com')).toBe(true)
    expect(normalizeEmail(' A@B.C ')).toBe('a@b.c')
  })

  it('vazio, nulo ou diferente não confere', () => {
    expect(emailsMatch('', '')).toBe(false)
    expect(emailsMatch(null, 'ana@example.com')).toBe(false)
    expect(emailsMatch('ana@example.co', 'ana@example.com')).toBe(false)
    expect(emailsMatch('ana@example.com', undefined)).toBe(false)
  })
})

describe('exportMyData', () => {
  it('chama export-my-data e devolve um JSON com nome datado', async () => {
    mocks.invoke.mockResolvedValue({ data: { formato: 'doutor-imigrante/meus-dados@1', perfil: { full_name: 'Ana' } }, error: null })
    const now = new Date('2026-10-30T10:00:00Z')
    const file = await exportMyData(now)
    expect(mocks.invoke).toHaveBeenCalledWith('export-my-data', expect.objectContaining({ body: {} }))
    expect(file.fileName).toBe('doutor-imigrante-meus-dados-2026-10-30.json')
    expect(file.fileName).toBe(exportFileName(now))
    expect(file.blob.type).toContain('application/json')
    expect(JSON.parse(await file.blob.text())).toMatchObject({ perfil: { full_name: 'Ana' } })
  })

  it('falha vira mensagem em pt-BR (function não publicada → mensagem neutra)', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(404, {}) })
    await expect(exportMyData()).rejects.toThrow(/Não foi possível gerar o arquivo/)
  })
})

describe('deleteMyAccount', () => {
  it('envia o e-mail normalizado e devolve os pagamentos guardados', async () => {
    mocks.invoke.mockResolvedValue({ data: { deleted: true, retained: { payments: 2 } }, error: null })
    await expect(deleteMyAccount('  Ana@Example.com ')).resolves.toEqual({ paymentsRetained: 2 })
    expect(mocks.invoke).toHaveBeenCalledWith(
      'delete-account',
      expect.objectContaining({ body: { confirm_email: 'ana@example.com' } }),
    )
  })

  it.each(Object.keys(DELETE_ACCOUNT_CODE_MESSAGES))('código %s do servidor vira a mensagem certa', async (code) => {
    mocks.invoke.mockResolvedValue({ data: null, error: httpError(code === 'open_case' ? 409 : 400, { error: code }) })
    const error = await deleteMyAccount('ana@example.com').catch((err: unknown) => err)
    expect(error).toBeInstanceOf(AccountPrivacyError)
    expect((error as AccountPrivacyError).code).toBe(code)
    expect((error as AccountPrivacyError).message).toBe(DELETE_ACCOUNT_CODE_MESSAGES[code])
  })

  it('processo em andamento e conta da equipe indicam o e-mail de privacidade', () => {
    expect(DELETE_ACCOUNT_CODE_MESSAGES.open_case).toContain(PRIVACY_EMAIL)
    expect(DELETE_ACCOUNT_CODE_MESSAGES.staff_account).toContain(PRIVACY_EMAIL)
  })

  it('falha no Storage não afirma que nada foi apagado (assinatura e parte dos arquivos podem já ter saído)', () => {
    expect(DELETE_ACCOUNT_CODE_MESSAGES.storage_cleanup_failed).not.toMatch(/nada foi apagado/i)
    expect(DELETE_ACCOUNT_CODE_MESSAGES.storage_cleanup_failed).toMatch(/não foi concluída/)
  })

  it('resposta sem deleted:true não é tratada como sucesso', async () => {
    mocks.invoke.mockResolvedValue({ data: {}, error: null })
    await expect(deleteMyAccount('ana@example.com')).rejects.toBeInstanceOf(AccountPrivacyError)
  })
})

describe('clearLocalAccountData', () => {
  it('remove o resultado do quiz e chaves com o id da conta; mantém consentimento e atribuição', () => {
    const userId = '7d0f3c1e-1111-4111-8111-111111111111'
    for (const key of LOCAL_PERSONAL_KEYS) window.localStorage.setItem(key, 'x')
    window.localStorage.setItem(`di_checklist_v1:${userId}`, '{}')
    window.localStorage.setItem(`di_dashboard:welcome_seen:${userId}`, '1')
    window.localStorage.setItem('di_cookie_consent', 'all')
    window.sessionStorage.setItem('dr_imigrante_quiz_step_events', '{}')
    window.sessionStorage.setItem('di_attribution_v1', '{"utm_source":"x"}')

    clearLocalAccountData(userId)

    expect(window.localStorage.getItem('dr_imigrante_quiz_result')).toBeNull()
    expect(window.localStorage.getItem(`di_checklist_v1:${userId}`)).toBeNull()
    expect(window.localStorage.getItem(`di_dashboard:welcome_seen:${userId}`)).toBeNull()
    expect(window.sessionStorage.getItem('dr_imigrante_quiz_step_events')).toBeNull()
    expect(window.localStorage.getItem('di_cookie_consent')).toBe('all')
    expect(window.sessionStorage.getItem('di_attribution_v1')).not.toBeNull()
  })
})
