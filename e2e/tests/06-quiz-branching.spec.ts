// 06-quiz-branching.spec.ts — ramificação do quiz (DI-005, DI-066, DI-067, DI-065).
//
// Não toca produção: as tabelas form_* são servidas por mocks (page.route) com o
// mesmo defeito que existe hoje no banco (display_conditions sem answer_contains
// e d7 = {}), qualquer outra chamada ao Supabase é abortada e o spec falha se o
// app tentar qualquer requisição que não seja GET.
//
// Rodar localmente contra um dev server já no ar:
//   E2E_BASE_URL=http://localhost:<porta> npx playwright test e2e/tests/06-quiz-branching.spec.ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect, type Page } from '@playwright/test'
import {
  QUIZ_QUESTIONS,
  QUIZ_THEMES,
  computeScore,
  getVisibleQuestions,
  pruneAnswers,
  suggestVisas,
  type QuizQuestion,
} from '../../src/data/quiz-questions'
import {
  conditionRowsToDisplayConditions,
  mapQuizRows,
  parseDisplayConditions,
  ruleToConditionRows,
  toDisplayConditions,
  type OptionRow,
  type QuestionRow,
  type ThemeRow,
} from '../../src/lib/quiz-conditions'

const byKey = (key: string) => {
  const q = QUIZ_QUESTIONS.find((x) => x.key === key)
  if (!q) throw new Error(`pergunta ${key} não existe`)
  return q
}
const visibleKeys = (answers: Record<string, string>, questions: QuizQuestion[] = QUIZ_QUESTIONS) =>
  getVisibleQuestions(answers, questions).map((q) => q.key)

// ─── Linhas "do banco" com o defeito de produção ─────────────────────────────
// Reproduz o bug do seed antigo: { question_key, answer_key } sem answer_contains
// (vira só {question_key}) e regras any/all viram {}.
function buggySeedConditions(q: QuizQuestion): unknown {
  if (!q.showIf) return null
  const rule = q.showIf as { questionKey?: string; answerKey?: string | string[] }
  return JSON.parse(JSON.stringify({ question_key: rule.questionKey, answer_key: rule.answerKey }))
}

function buildDbRows(conditions: (q: QuizQuestion) => unknown = buggySeedConditions) {
  const themes: ThemeRow[] = QUIZ_THEMES.map((t, i) => ({
    id: `theme-${t.code}`,
    code: t.code,
    name_pt: t.name,
    color: t.color,
    icon: null,
    sort_order: i,
  }))
  const questions: QuestionRow[] = QUIZ_QUESTIONS.map((q, i) => ({
    id: `q-${q.key}`,
    theme_id: `theme-${q.themeCode}`,
    question_key: q.key,
    question_text_pt: q.text,
    question_text_en: null,
    help_text: q.helpText ?? null,
    field_type: q.fieldType,
    display_conditions: conditions(q),
    validation_rules: null,
    placeholder: q.placeholder ?? null,
    is_required: q.isRequired,
    sort_order: i,
  }))
  const options: OptionRow[] = QUIZ_QUESTIONS.flatMap((q) =>
    (q.options ?? []).map((o, i) => ({
      id: `o-${q.key}-${o.key}`,
      question_id: `q-${q.key}`,
      option_key: o.key,
      option_text_pt: o.label,
      option_text_en: null,
      score: o.score,
      is_eliminatory: o.isEliminatory ?? false,
      sort_order: i,
    })),
  )
  return { themes, questions, options }
}

// ─── Lógica pura (sem navegador) ─────────────────────────────────────────────

test.describe('motor do quiz — lógica', () => {
  test('marcando só B: processo_tipo → caso_tipo → b1', () => {
    expect(visibleKeys({ processo_tipo: 'nacionalidade', caso_tipo: 'B' })).toEqual([
      'processo_tipo',
      'caso_tipo',
      'b1_tempo_casamento',
    ])
  })

  test('nada de descendência para quem não marcou A', () => {
    const keys = visibleKeys({ processo_tipo: 'nacionalidade', caso_tipo: 'B,C,D,E,F' })
    expect(keys.filter((k) => k.startsWith('a'))).toEqual([])
  })

  test('d7 aparece quando d1=sim ou d4=nao (e só no caso D)', () => {
    const base = { processo_tipo: 'nacionalidade', caso_tipo: 'D' }
    expect(visibleKeys({ ...base, d1_situacao_legal: 'sim' })).toContain('d7_consultar_agora')
    expect(
      visibleKeys({ ...base, d1_situacao_legal: 'nao', d3_disposto_advogado: 'sim', d4_consultou_advogado: 'nao' }),
    ).toContain('d7_consultar_agora')
    expect(
      visibleKeys({ ...base, d1_situacao_legal: 'nao', d3_disposto_advogado: 'sim', d4_consultou_advogado: 'sim' }),
    ).not.toContain('d7_consultar_agora')
    // Resposta antiga de d1 com D desmarcado não mostra d7
    expect(
      visibleKeys({ processo_tipo: 'nacionalidade', caso_tipo: 'B', d1_situacao_legal: 'sim' }),
    ).not.toContain('d7_consultar_agora')
  })

  test('A → nao_sei → só B: sem a5 e 100% alta', () => {
    const answers = {
      processo_tipo: 'nacionalidade',
      caso_tipo: 'B', // antes era 'A'
      a1_antepassado: 'nao_sei', // resposta antiga, ramo agora oculto
      a5_genealogia: 'nao',
      b1_tempo_casamento: 'mais_3_anos',
    }
    expect(visibleKeys(answers)).not.toContain('a5_genealogia')
    const score = computeScore(answers)
    expect(score.percentage).toBe(100)
    expect(score.category).toBe('alta')
  })

  test('pruneAnswers remove as chaves de ramos ocultos e mantém o resto', () => {
    const answers = {
      processo_tipo: 'nacionalidade',
      caso_tipo: 'B',
      a1_antepassado: 'nao_sei',
      a5_genealogia: 'nao',
      b1_tempo_casamento: 'mais_3_anos',
      origem_externa: 'x', // não é pergunta do quiz: mantida
    }
    expect(pruneAnswers(answers)).toEqual({
      processo_tipo: 'nacionalidade',
      caso_tipo: 'B',
      b1_tempo_casamento: 'mais_3_anos',
      origem_externa: 'x',
    })
  })

  test('condições incompletas do banco usam a regra do código', () => {
    const { themes, questions, options } = buildDbRows()
    const invalid: string[] = []
    const mapped = mapQuizRows(themes, questions, options, {
      fallbackQuestions: QUIZ_QUESTIONS,
      onInvalidCondition: (key) => invalid.push(key),
    })
    expect(invalid.sort()).toEqual(
      [
        'a1_antepassado',
        'a6_filiacao',
        'b1_tempo_casamento',
        'c1_maior_idade',
        'd1_situacao_legal',
        'd6_preparado_financeiro',
        'd7_consultar_agora',
        'd8_filhos_portugal',
        'f1_mora_portugal',
      ].sort(),
    )
    expect(mapped.find((q) => q.key === 'd7_consultar_agora')?.showIfRepaired).toBe(true)
    expect(visibleKeys({ processo_tipo: 'nacionalidade', caso_tipo: 'B' }, mapped)).toEqual([
      'processo_tipo',
      'caso_tipo',
      'b1_tempo_casamento',
    ])
    expect(
      visibleKeys({ processo_tipo: 'nacionalidade', caso_tipo: 'D', d1_situacao_legal: 'sim' }, mapped),
    ).toContain('d7_consultar_agora')
  })

  test('condição incompleta sem equivalente no código deixa a pergunta oculta', () => {
    const { themes, questions, options } = buildDbRows(() => null)
    questions.push({
      ...questions[questions.length - 1],
      id: 'q-nova',
      question_key: 'pergunta_nova_do_admin',
      display_conditions: { question_key: 'caso_tipo' },
    })
    const mapped = mapQuizRows(themes, questions, options, { fallbackQuestions: QUIZ_QUESTIONS })
    expect(visibleKeys({ processo_tipo: 'nacionalidade', caso_tipo: 'A' }, mapped)).not.toContain(
      'pergunta_nova_do_admin',
    )
  })

  test('editor: regra → linhas → banco preserva answer_contains e any', () => {
    for (const q of QUIZ_QUESTIONS.filter((x) => x.showIf)) {
      const { rows, combinator } = ruleToConditionRows(q.showIf)
      const saved = conditionRowsToDisplayConditions(rows, combinator)
      expect(saved, q.key).toEqual(toDisplayConditions(q.showIf))
      const parsed = parseDisplayConditions(saved)
      expect(parsed, q.key).toEqual({ kind: 'rule', rule: q.showIf })
    }
  })

  test('textos não prometem advogado nem serviço próprio', () => {
    const src = readFileSync(
      resolve(test.info().project.testDir, '../../src/data/quiz-questions.ts'),
      'utf8',
    )
    for (const forbidden of [
      /nossos? advogad/i,
      /advogados? da plataforma/i,
      /banco de advogados/i,
      /podemos (fazer|providenciar)/i,
      /servi[cç]o de (genealogia|pesquisa)/i,
    ]) {
      expect(src, String(forbidden)).not.toMatch(forbidden)
    }
    const allReasons = ['A', 'B', 'C', 'D', 'E', 'F']
      .flatMap((c) => suggestVisas({ processo_tipo: 'nacionalidade', caso_tipo: c, a1_antepassado: 'nao_sei' }))
      .map((s) => s.reason)
      .join(' ')
    expect(allReasons).not.toMatch(/advogad/i)
  })
})

// ─── Navegador: só GET, Supabase mockado ─────────────────────────────────────

type FormMode = 'buggy-db' | 'db-down'

const FAKE_ADMIN_ID = '00000000-0000-4000-8000-0000000000ad'

async function setupPage(page: Page, mode: FormMode, { asAdmin = false } = {}) {
  const nonGet: string[] = []
  const pageErrors: string[] = []
  page.on('request', (req) => {
    if (req.method() !== 'GET') nonGet.push(`${req.method()} ${req.url().split('?')[0]}`)
  })
  page.on('pageerror', (err) => pageErrors.push(err.message))

  const rows = buildDbRows()
  await page.route(/\.supabase\.co\//, async (route) => {
    const req = route.request()
    const url = req.url()
    if (req.method() !== 'GET') return route.abort()
    if (asAdmin && /\/auth\/v1\/user\b/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser()) })
    }
    if (asAdmin && /\/rest\/v1\/user_roles\b/.test(url)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[{"role":"super_admin"}]' })
    }
    const table = url.match(/\/rest\/v1\/(form_themes|form_questions|form_question_options)\b/)?.[1]
    if (!table) {
      // Outras leituras do admin (perfil, assinatura, versões…): vazias. Nada chega a produção.
      if (asAdmin && /\/rest\/v1\//.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      }
      return route.abort()
    }
    if (mode === 'db-down') {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"mock down"}' })
    }
    const body =
      table === 'form_themes' ? rows.themes : table === 'form_questions' ? rows.questions : rows.options
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  // Analytics e terceiros: nunca sair da máquina. Filtra pelo host (e não pela
  // URL inteira) para não bloquear módulos locais como /node_modules/.vite/deps/posthog-js.js.
  await page.route(
    (url) => /posthog|googletagmanager|google-analytics|sentry\.io|stripe\.com|facebook/.test(url.hostname),
    (r) => r.abort(),
  )

  const authKey = asAdmin ? supabaseAuthStorageKey() : null
  await page.addInitScript(
    ([key, session]) => {
      try {
        localStorage.setItem('di_cookie_consent', 'denied')
        if (key && session) localStorage.setItem(key, session)
      } catch {
        /* storage bloqueado: segue sem */
      }
    },
    [authKey, authKey ? JSON.stringify(fakeSession()) : null] as const,
  )
  return { nonGet, pageErrors }
}

// Sessão falsa (nunca validada por servidor: todas as chamadas são mockadas).
function fakeUser() {
  return {
    id: FAKE_ADMIN_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin-e2e@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
}

function fakeSession() {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: FAKE_ADMIN_ID, exp, role: 'authenticated' })}.e2e`
  return {
    access_token: token,
    refresh_token: 'e2e-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: fakeUser(),
  }
}

function supabaseAuthStorageKey(): string | null {
  const url = process.env.VITE_SUPABASE_URL
  if (!url) return null
  const ref = new URL(url).hostname.split('.')[0]
  return `sb-${ref}-auth-token`
}

async function expectQuestion(page: Page, key: string) {
  await expect(page.getByTestId('quiz-question').locator('h2')).toHaveText(byKey(key).text)
}

async function answer(page: Page, optionKeys: string[]) {
  for (const k of optionKeys) await page.getByTestId(`quiz-option-${k}`).click()
  await page.getByTestId('quiz-next').click()
}

test.describe('quiz no navegador — ramificação', () => {
  test('marcando só B: processo_tipo → caso_tipo → b1 → captura (banco com defeito)', async ({ page }) => {
    const { nonGet } = await setupPage(page, 'buggy-db')
    await page.goto('/quiz')
    await page.getByTestId('quiz-intro-start').click()

    await expectQuestion(page, 'processo_tipo')
    await answer(page, ['nacionalidade'])
    await expectQuestion(page, 'caso_tipo')
    await answer(page, ['B'])
    await expectQuestion(page, 'b1_tempo_casamento')
    await answer(page, ['mais_3_anos'])

    await expect(page.locator('#capture-email')).toBeVisible()
    expect(nonGet).toEqual([])
  })

  test('caso D com d1=sim mostra d7 e nada dos outros casos', async ({ page }) => {
    const { nonGet } = await setupPage(page, 'buggy-db')
    await page.goto('/quiz')
    await page.getByTestId('quiz-intro-start').click()

    await answer(page, ['nacionalidade'])
    await answer(page, ['D'])
    await expectQuestion(page, 'd1_situacao_legal')
    await answer(page, ['sim'])
    await expectQuestion(page, 'd2_tempo_autorizacao')
    await answer(page, ['mais_5'])
    await expectQuestion(page, 'd7_consultar_agora')
    await answer(page, ['nao'])
    await expectQuestion(page, 'd8_filhos_portugal')
    await answer(page, ['nao'])

    await expect(page.locator('#capture-email')).toBeVisible()
    expect(nonGet).toEqual([])
  })

  test('com as tabelas form_* fora do ar, o quiz chega até a captura', async ({ page }) => {
    const { nonGet } = await setupPage(page, 'db-down')
    await page.goto('/quiz')
    await page.getByTestId('quiz-intro-start').click()

    await answer(page, ['nacionalidade'])
    await answer(page, ['B'])
    // Espera o fallback (1 nova tentativa + 500 ms) assentar antes de seguir.
    await page.waitForTimeout(1500)
    await expectQuestion(page, 'b1_tempo_casamento')
    await answer(page, ['menos_3_anos'])

    await expect(page.locator('#capture-email')).toBeVisible()
    await expect(page.getByTestId('quiz-question-missing')).toHaveCount(0)
    expect(nonGet).toEqual([])
  })
})

test.describe('admin do quiz — editor', () => {
  test.skip(!process.env.VITE_SUPABASE_URL, 'precisa de VITE_SUPABASE_URL para montar a sessão mockada')
  // O admin é usado no desktop; hoje o AdminLayout transborda na largura do celular.
  test.skip(({ isMobile }) => isMobile, 'admin do quiz só é validado em viewport de desktop')

  test('abrir, fechar e reabrir o editor sem erro; regras incompletas aparecem já resolvidas', async ({ page }) => {
    const { nonGet, pageErrors } = await setupPage(page, 'buggy-db', { asAdmin: true })
    await page.goto('/admin/quiz')
    // No celular o layout do admin repete o título no topo; usa o do conteúdo.
    await expect(page.getByRole('main').getByRole('heading', { name: 'Quiz', exact: true })).toBeVisible({
      timeout: 15_000,
    })
    await expect(page.getByRole('status').filter({ hasText: '9 perguntas têm' })).toBeVisible()

    const editButton = (key: string) =>
      page.locator('li').filter({ has: page.getByText(key, { exact: true }) }).getByRole('button', { name: 'Editar' })
    const dialog = page.getByRole('dialog', { name: 'Editar pergunta' })

    // 1) b1: condição "inclui B" (answer_contains) vinda da regra do código
    await editButton('b1_tempo_casamento').click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('A condição gravada no banco estava incompleta')).toBeVisible()
    await expect(dialog.getByText('Mostrar quando a resposta incluir')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Casado\(a\)/, pressed: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toHaveCount(0)

    // 2) d7: duas condições combinadas com "qualquer" (any); fecha com Esc
    await editButton('d7_consultar_agora').click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: /Condição 1/ })).toHaveValue('d1_situacao_legal')
    await expect(dialog.getByRole('combobox', { name: /Condição 2/ })).toHaveValue('d4_consultou_advogado')
    await expect(dialog.getByRole('button', { name: /qualquer condição/, pressed: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // 3) Reabre a primeira
    await editButton('b1_tempo_casamento').click()
    await expect(dialog.getByText('Mostrar quando a resposta incluir')).toBeVisible()
    await dialog.getByRole('button', { name: 'Fechar' }).click()
    await expect(dialog).toHaveCount(0)

    expect(pageErrors).toEqual([])
    expect(nonGet).toEqual([])
  })
})
