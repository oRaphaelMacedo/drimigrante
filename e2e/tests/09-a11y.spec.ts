// 09-a11y.spec.ts — acessibilidade do quiz, captura e lista de espera
// (DI-069, DI-043, DI-037).
//
// Não toca nenhum backend: TODA chamada ao Supabase (/rest, /auth, /functions,
// /storage — de qualquer host, local ou não) é respondida por mocks aqui, e
// qualquer outro host que não seja o do app é abortado. Por isso o spec roda
// igual contra o Supabase local do CI ou contra um dev server já no ar:
//   E2E_BASE_URL=http://localhost:<porta> npx playwright test e2e/tests/09-a11y.spec.ts
//
// - axe (@axe-core/playwright): nenhuma violação serious/critical nas telas do quiz.
// - Teclado: o quiz inteiro, da intro ao resultado, só com Tab/setas/Enter/Espaço.
// - Captura: sem bolha nativa, campos de 16px, voltar sem perder respostas e
//   opt-in desmarcado chegando em p_answers.
// - "Em breve": e-mail gravado pela RPC upsert_anon_assessment (session_id -wl),
//   nenhum POST em /assessments, falha sem "Pronto!" e sem rolagem lateral.
import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { QUIZ_QUESTIONS, QUIZ_THEMES } from '../../src/data/quiz-questions'
import { toDisplayConditions } from '../../src/lib/quiz-conditions'

// Cada teste percorre várias telas; com a máquina carregada, 30s ficam curtos.
test.describe.configure({ timeout: 60_000 })

const SUPABASE_PATH = /^\/(rest|auth|functions|storage|realtime)\/v1\//
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const ASSESSMENT_ID = '00000000-0000-4000-8000-0000000a11e9'

const questionText = (key: string) => {
  const q = QUIZ_QUESTIONS.find((x) => x.key === key)
  if (!q) throw new Error(`pergunta ${key} não existe`)
  return q.text
}

// ─── Linhas "do banco" (form_*) a partir do código, com as condições certas ───
function formRows() {
  const themes = QUIZ_THEMES.map((t, i) => ({
    id: `theme-${t.code}`,
    code: t.code,
    name_pt: t.name,
    color: t.color,
    icon: null,
    sort_order: i,
  }))
  const questions = QUIZ_QUESTIONS.map((q, i) => ({
    id: `q-${q.key}`,
    theme_id: `theme-${q.themeCode}`,
    question_key: q.key,
    question_text_pt: q.text,
    question_text_en: null,
    help_text: q.helpText ?? null,
    field_type: q.fieldType,
    display_conditions: toDisplayConditions(q.showIf),
    validation_rules: null,
    placeholder: q.placeholder ?? null,
    is_required: q.isRequired,
    sort_order: i,
  }))
  const options = QUIZ_QUESTIONS.flatMap((q) =>
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
  return { form_themes: themes, form_questions: questions, form_question_options: options }
}

interface RpcCall {
  fn: string
  body: Record<string, unknown>
}

interface MockOptions {
  /** Resposta da RPC para a lista de espera. */
  waitlist?: 'ok' | 'fail'
}

async function setupMocks(page: Page, { waitlist = 'ok' }: MockOptions = {}) {
  const rpcCalls: RpcCall[] = []
  /** Escritas que não deveriam existir (ex.: POST direto em /rest/v1/assessments). */
  const forbiddenWrites: string[] = []
  const rows = formRows()

  await page.route(
    (url) => SUPABASE_PATH.test(url.pathname) || !LOCAL_HOSTS.has(url.hostname),
    async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      if (!SUPABASE_PATH.test(url.pathname)) return route.abort() // analytics e terceiros

      const json = (status: number, body: unknown) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([\w-]+)/)?.[1]
      if (rpc) {
        const body = (req.postDataJSON() ?? {}) as Record<string, unknown>
        rpcCalls.push({ fn: rpc, body })
        if (rpc !== 'upsert_anon_assessment') return json(404, { message: `rpc ${rpc} sem mock` })
        const answers = (body.p_answers ?? {}) as Record<string, unknown>
        if (answers.waitlist === true && waitlist === 'fail') {
          return json(500, { code: 'XX000', message: 'mock: falha na lista de espera' })
        }
        return json(200, { id: ASSESSMENT_ID, session_id: body.p_session_id, answers, status: body.p_status })
      }

      if (url.pathname.startsWith('/rest/v1/')) {
        if (req.method() !== 'GET' && req.method() !== 'HEAD') {
          forbiddenWrites.push(`${req.method()} ${url.pathname}`)
          return json(403, { code: '42501', message: 'mock: escrita direta bloqueada pela RLS' })
        }
        const table = url.pathname.slice('/rest/v1/'.length) as keyof typeof rows
        return json(200, rows[table] ?? [])
      }

      // Edge Functions (compute-eligibility, generate-explanation…): nunca chamadas de verdade.
      if (url.pathname.startsWith('/functions/v1/')) return json(200, {})
      // Auth/Storage: visitante anônimo.
      return json(401, { message: 'mock: sem sessão' })
    },
  )

  await page.addInitScript(() => {
    try {
      localStorage.setItem('di_cookie_consent', 'denied')
    } catch {
      /* storage bloqueado: segue sem */
    }
  })
  // Animações zeradas: o axe lê as cores finais e o teste confere o "reduzir movimento".
  await page.emulateMedia({ reducedMotion: 'reduce' })
  return { rpcCalls, forbiddenWrites }
}

async function expectNoSeriousA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const serious = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
  expect(serious, `violações serious/critical em ${label}`).toEqual([])
}

const heading = (page: Page) => page.getByTestId('quiz-question').locator('h2')

async function expectQuestion(page: Page, key: string) {
  await expect(heading(page)).toHaveText(questionText(key))
}

/** Escolhe as opções e toca em "Próximo" (como a pessoa faria). */
async function answer(page: Page, optionKeys: string[]) {
  for (const k of optionKeys) await page.getByTestId(`quiz-option-${k}`).click()
  await page.getByTestId('quiz-next').click()
}

/** Abre /quiz e espera a intro (a 1ª carga do dev server compila a rota sob demanda). */
async function gotoQuiz(page: Page) {
  await page.goto('/quiz')
  await expect(page.getByTestId('quiz-intro-start')).toBeVisible({ timeout: 20_000 })
}

async function startQuiz(page: Page) {
  await gotoQuiz(page)
  await page.getByTestId('quiz-intro-start').click()
  await expectQuestion(page, 'processo_tipo')
}

async function reachCapture(page: Page) {
  await startQuiz(page)
  await answer(page, ['nacionalidade'])
  await expectQuestion(page, 'caso_tipo')
  await answer(page, ['B'])
  await expectQuestion(page, 'b1_tempo_casamento')
  await answer(page, ['mais_3_anos'])
  await expect(page.locator('#capture-email')).toBeVisible()
}

async function reachComingSoon(page: Page, option = 'visto') {
  await startQuiz(page)
  // Escolha única avança sozinha para "em breve".
  await page.getByTestId(`quiz-option-${option}`).click()
  await expect(page.locator('#quiz-comingsoon-title')).toBeVisible()
}

const isFocused = (locator: Locator) => locator.evaluate((el) => el === document.activeElement)

/** Aperta Tab até o elemento receber o foco (falha se não chegar). */
async function tabTo(page: Page, locator: Locator, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await isFocused(locator)) return
    await page.keyboard.press('Tab')
  }
  throw new Error('o elemento não recebeu o foco pelo Tab')
}

// ─── axe ──────────────────────────────────────────────────────────────────────

test.describe('quiz — acessibilidade (axe)', () => {
  // Cada análise do axe leva alguns segundos (mais no WebKit): tempo triplicado.
  test.slow()

  test('intro, escolha única, múltipla escolha, captura e "em breve" sem violações graves', async ({ page }) => {
    const { forbiddenWrites } = await setupMocks(page)
    await gotoQuiz(page)
    await expectNoSeriousA11yViolations(page, 'intro')

    await page.getByTestId('quiz-intro-start').click()
    await expectQuestion(page, 'processo_tipo')
    await expectNoSeriousA11yViolations(page, 'pergunta de escolha única')

    // "Próximo" sem resposta: aviso ligado ao grupo.
    await page.getByTestId('quiz-next').click()
    await expect(page.locator('#quiz-required-hint')).toBeVisible()
    await expectNoSeriousA11yViolations(page, 'pergunta com aviso de resposta obrigatória')

    await answer(page, ['nacionalidade'])
    await expectQuestion(page, 'caso_tipo')
    await expectNoSeriousA11yViolations(page, 'pergunta de múltipla escolha')

    await answer(page, ['B'])
    await answer(page, ['mais_3_anos'])
    await expect(page.locator('#capture-email')).toBeVisible()
    await expectNoSeriousA11yViolations(page, 'captura')

    await page.locator('#quiz-submit-btn').click()
    await expect(page.locator('#capture-name-error')).toBeVisible()
    await expectNoSeriousA11yViolations(page, 'captura com erros')
    expect(forbiddenWrites).toEqual([])
  })

  test('"em breve" (inclusive com falha ao salvar) sem violações graves', async ({ page }) => {
    await setupMocks(page, { waitlist: 'fail' })
    await reachComingSoon(page, 'regularizacao')
    await expectNoSeriousA11yViolations(page, '"em breve"')

    await page.locator('#quiz-notify-email').fill('ana@example.com')
    await page.getByTestId('quiz-notify-submit').click()
    await expect(page.locator('#quiz-notify-error')).toBeVisible()
    await expectNoSeriousA11yViolations(page, '"em breve" com erro')
  })
})

// ─── Papéis ARIA e teclado ──────────────────────────────────────────────────

test.describe('quiz — papéis e teclado', () => {
  test('opções são radio/checkbox com aria-checked; progresso é progressbar', async ({ page }) => {
    await setupMocks(page)
    await startQuiz(page)

    const radios = page.getByRole('radiogroup').getByRole('radio')
    await expect(radios).toHaveCount(4)
    await expect(page.getByRole('radio', { name: /nacionalidade portuguesa/i })).toHaveAttribute('aria-checked', 'false')

    await answer(page, ['nacionalidade'])
    await expectQuestion(page, 'caso_tipo')
    const checkboxes = page.getByRole('group').getByRole('checkbox')
    // A–F + "Nenhuma destas situações" (DI-075).
    await expect(checkboxes).toHaveCount(7)
    await page.getByTestId('quiz-option-B').click()
    await expect(page.getByTestId('quiz-option-B')).toHaveAttribute('aria-checked', 'true')

    // Total conhecido depois do caso: barra com valor e texto.
    const bar = page.getByRole('progressbar', { name: 'Progresso do diagnóstico' })
    await expect(bar).toHaveAttribute('aria-valuenow', /\d+/)
    await expect(bar).toHaveAttribute('aria-valuetext', /Pergunta 2 de \d+, \d+%/)
  })

  test('quiz completo só com teclado, da intro ao resultado', async ({ page, isMobile }) => {
    test.skip(isMobile, 'teclado físico: validado no desktop')
    const { rpcCalls, forbiddenWrites } = await setupMocks(page)
    await gotoQuiz(page)

    await tabTo(page, page.getByTestId('quiz-intro-start'))
    await page.keyboard.press('Enter')
    await expectQuestion(page, 'processo_tipo')

    // Tab entra no grupo pela primeira opção; setas mudam a seleção SEM avançar.
    await page.keyboard.press('Tab')
    const first = page.getByTestId('quiz-option-nacionalidade')
    await expect(first).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('quiz-option-visto')).toBeFocused()
    await expect(page.getByTestId('quiz-option-visto')).toHaveAttribute('aria-checked', 'true')
    await page.waitForTimeout(600)
    await expectQuestion(page, 'processo_tipo')
    await page.keyboard.press('ArrowUp')
    await expect(first).toHaveAttribute('aria-checked', 'true')

    // Enter confirma a escolha única e avança.
    await page.keyboard.press('Enter')
    await expectQuestion(page, 'caso_tipo')

    // Múltipla escolha: Tab até a opção, Espaço marca (logo depois do avanço: não é descartado).
    await tabTo(page, page.getByTestId('quiz-option-B'))
    await page.keyboard.press('Space')
    await expect(page.getByTestId('quiz-option-B')).toHaveAttribute('aria-checked', 'true')
    await tabTo(page, page.getByTestId('quiz-next'))
    await page.keyboard.press('Enter')
    await expectQuestion(page, 'b1_tempo_casamento')

    // Última pergunta: escolhe e vai ao resultado pelo botão.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Space')
    await expect(page.getByTestId('quiz-option-mais_3_anos')).toHaveAttribute('aria-checked', 'true')
    await tabTo(page, page.getByTestId('quiz-next'))
    await expect(page.getByTestId('quiz-next')).toHaveText(/Ver meu resultado/)
    await page.keyboard.press('Enter')

    // Captura: Enter leva ao próximo campo e, no último, envia.
    const name = page.getByLabel('Como podemos te chamar?')
    await tabTo(page, name)
    await page.keyboard.type('Ana Teclado')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(/^E-mail/)).toBeFocused()
    await page.keyboard.type('ana.teclado@example.com')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel(/WhatsApp/)).toBeFocused()
    await page.keyboard.press('Enter')

    await page.waitForURL('**/results', { timeout: 15_000 })
    const persist = rpcCalls.find((c) => c.fn === 'upsert_anon_assessment' && c.body.p_status === 'completed')
    expect(persist, 'envio do diagnóstico pela RPC').toBeTruthy()
    expect(persist?.body.p_answers).toMatchObject({
      processo_tipo: 'nacionalidade',
      caso_tipo: 'B',
      b1_tempo_casamento: 'mais_3_anos',
      marketing_opt_in: false,
    })
    expect(persist?.body.p_full_name).toBe('Ana Teclado')
    expect(forbiddenWrites).toEqual([])
  })
})

// ─── Captura (DI-043) ─────────────────────────────────────────────────────────

test.describe('quiz — captura', () => {
  test('sem bolha nativa: erros nossos, ligados aos campos, e campos de 16px', async ({ page }) => {
    const { rpcCalls } = await setupMocks(page)
    await reachCapture(page)

    expect(await page.locator('#quiz-capture-form').evaluate((f) => (f as HTMLFormElement).noValidate)).toBe(true)
    for (const id of ['#capture-name', '#capture-email', '#capture-phone']) {
      const size = await page.locator(id).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
      expect(size, `font-size de ${id}`).toBeGreaterThanOrEqual(16)
    }

    await page.locator('#quiz-submit-btn').click()
    await expect(page.getByRole('alert').filter({ hasText: 'Informe como podemos te chamar' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Informe o seu e-mail' })).toBeVisible()
    await expect(page.locator('#capture-name')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#capture-name')).toBeFocused()
    await expect(page.locator('#capture-email')).toHaveAttribute('aria-describedby', /capture-email-error/)

    // Opt-in desmarcado e link para a Política de Privacidade.
    await expect(page.getByRole('checkbox', { name: /novidades/ })).not.toBeChecked()
    await expect(page.getByRole('link', { name: /Política de Privacidade/ })).toHaveAttribute('href', '/privacidade')
    expect(rpcCalls).toEqual([])
  })

  test('"Voltar às perguntas" mostra a última pergunta sem perder a resposta', async ({ page }) => {
    await setupMocks(page)
    await reachCapture(page)
    await page.locator('#quiz-capture-back').click()
    await expectQuestion(page, 'b1_tempo_casamento')
    await expect(page.getByTestId('quiz-option-mais_3_anos')).toHaveAttribute('aria-checked', 'true')

    // Segue de novo para a captura.
    await page.getByTestId('quiz-next').click()
    await expect(page.locator('#capture-email')).toBeVisible()
  })
})

// ─── "Em breve" (DI-037) ──────────────────────────────────────────────────────

test.describe('quiz — lista de espera "em breve"', () => {
  test('sem rolagem lateral em 360, 375 e 390', async ({ page }) => {
    await setupMocks(page)
    await reachComingSoon(page)
    for (const width of [360, 375, 390]) {
      await page.setViewportSize({ width, height: 800 })
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      expect(scrollWidth, `largura do documento em ${width}px`).toBeLessThanOrEqual(clientWidth)
    }
  })

  test('grava pela RPC anônima (session_id -wl) e nunca em /assessments', async ({ page }) => {
    const { rpcCalls, forbiddenWrites } = await setupMocks(page)
    await reachComingSoon(page, 'visto')

    // E-mail vazio: aviso nosso, nada enviado.
    await page.getByTestId('quiz-notify-submit').click()
    await expect(page.getByRole('alert').filter({ hasText: 'Informe o seu e-mail' })).toBeVisible()
    expect(rpcCalls).toEqual([])

    await page.locator('#quiz-notify-email').fill('ana@example.com')
    await page.getByTestId('quiz-notify-submit').click()
    await expect(page.getByTestId('quiz-notify-done')).toContainText('Pronto!')
    // O formulário some: o foco vai para a confirmação (leitor de tela lê).
    await expect(page.getByTestId('quiz-notify-done')).toBeFocused()

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('upsert_anon_assessment')
    expect(String(rpcCalls[0].body.p_session_id)).toMatch(/-wl$/)
    expect(rpcCalls[0].body).toMatchObject({
      p_email: 'ana@example.com',
      p_status: 'incomplete',
      p_answers: { processo_tipo: 'visto', waitlist: true },
    })
    expect(forbiddenWrites).toEqual([])
  })

  test('falha ao salvar não mostra "Pronto!" e oferece "Tentar de novo"', async ({ page }) => {
    await setupMocks(page, { waitlist: 'fail' })
    await reachComingSoon(page, 'nao_sei')
    await page.locator('#quiz-notify-email').fill('ana@example.com')
    await page.getByTestId('quiz-notify-submit').click()

    await expect(page.locator('#quiz-notify-error')).toBeVisible()
    await expect(page.getByTestId('quiz-notify-submit')).toHaveText(/Tentar de novo/)
    await expect(page.getByTestId('quiz-notify-done')).toHaveCount(0)
    await expect(page.getByText('Pronto!')).toHaveCount(0)
  })

  test('sem promessa de advogado e com atalho para o diagnóstico de nacionalidade', async ({ page }) => {
    await setupMocks(page)
    await reachComingSoon(page, 'regularizacao')
    await expect(page.locator('main')).not.toContainText(/advogad/i)

    await page.getByTestId('quiz-crosssell-nationality').click()
    await expectQuestion(page, 'caso_tipo')
  })
})
