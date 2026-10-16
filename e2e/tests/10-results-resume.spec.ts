// 10-results-resume.spec.ts — /results no navegador (W3-01).
//
// DI-024: /results?r=<token> em navegador limpo mostra o resultado, tira o `r`
//   da URL e o CTA de compra funciona; token inválido ou malformado mostra o
//   estado com CTA para refazer o quiz.
// DI-029: o resultado vindo do quiz (router state) e o aberto de novo (do
//   localStorage) têm o mesmo título e o mesmo ícone, nunca um glifo.
// DI-028: em 375x812 e 360x740, rolando a página inteira, sempre há um CTA de
//   compra visível depois do cartão do resultado (a barra fixa ou o botão da
//   oferta) e nunca os dois ao mesmo tempo.
//
// Não toca nenhum backend: TODA requisição para fora da origem do app é
// respondida por mock (as RPCs e functions usadas aqui) ou abortada. Por isso o
// spec não precisa do Supabase local e também é seguro contra um dev server já
// no ar (mesmo um que aponte para produção):
//   E2E_BASE_URL=http://localhost:<porta> npx playwright test e2e/tests/10-results-resume.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { CATEGORY_PRESENTATION } from '../../src/lib/category'
import { suggestVisas } from '../../src/data/quiz-questions'

const TOKEN = '0123456789abcdef'.repeat(4)
const RESULT_KEY = 'dr_imigrante_quiz_result'
const NEW_ASSESSMENT_ID = '00000000-0000-4000-8000-0000000000e2'

const ANSWERS = {
  processo_tipo: 'nacionalidade',
  caso_tipo: 'B,D',
  b1_tempo_casamento: 'mais_3_anos',
  d1_situacao_legal: 'sim',
  d2_tempo_autorizacao: 'menos_5',
}

/** Linha da RPC get_assessment_by_resume_token (sem id, session_id nem user_id). */
const RESUME_ROW = {
  answers: ANSWERS,
  full_name: 'Maria Souza',
  email: 'maria.e2e@example.com',
  completed_at: '2026-10-10T10:00:00.000Z',
  score_numeric: 81,
  score_category: 'alta',
}

interface Captured {
  /** Toda requisição para fora da origem do app (mockada ou abortada). */
  external: { method: string; url: string; body: unknown }[]
  pageErrors: string[]
}

type ResumeReply = 'row' | 'empty'

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

function bodyOf(raw: string | null): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * Mocka o Supabase pelo CAMINHO (vale para o host local, o fictício do modo mock
 * e o de produção) e aborta qualquer outra requisição externa (analytics, Sentry,
 * Stripe…). Consentimento de cookies recusado para o banner não cobrir a tela.
 */
async function setup(
  page: Page,
  appOrigin: string,
  { resume = 'row', seed = null }: { resume?: ResumeReply; seed?: Record<string, unknown> | null } = {},
): Promise<Captured> {
  const captured: Captured = { external: [], pageErrors: [] }
  page.on('pageerror', (err) => captured.pageErrors.push(err.message))

  await page.route(
    (url) => url.origin !== appOrigin,
    async (route) => {
      const req = route.request()
      const url = new URL(req.url())
      captured.external.push({ method: req.method(), url: req.url(), body: bodyOf(req.postData()) })
      const path = url.pathname
      if (path.endsWith('/rest/v1/rpc/get_assessment_by_resume_token')) {
        return route.fulfill(json(resume === 'row' ? [RESUME_ROW] : []))
      }
      if (path.endsWith('/rest/v1/rpc/get_anon_assessment')) return route.fulfill(json([]))
      if (path.endsWith('/rest/v1/rpc/upsert_anon_assessment')) {
        return route.fulfill(json({ id: NEW_ASSESSMENT_ID, status: 'completed' }))
      }
      if (path.endsWith('/functions/v1/compute-eligibility')) return route.fulfill(json({}))
      if (path.endsWith('/functions/v1/create-checkout-session')) {
        // Mesma origem do app: o useStartCheckout aceita e o teste confere a navegação.
        return route.fulfill(json({ url: `${appOrigin}/e2e-pagamento-simulado` }))
      }
      return route.abort()
    },
  )

  await page.addInitScript(
    ([key, record]) => {
      try {
        localStorage.setItem('di_cookie_consent', 'denied')
        if (record && !sessionStorage.getItem('e2e-seeded')) {
          localStorage.setItem(key, record)
          sessionStorage.setItem('e2e-seeded', '1')
        }
      } catch {
        /* storage bloqueado: segue sem */
      }
    },
    [RESULT_KEY, seed ? JSON.stringify(seed) : null] as const,
  )
  return captured
}

const rpcCalls = (captured: Captured, fn: string) =>
  captured.external.filter((r) => r.url.includes(`/rest/v1/rpc/${fn}`))

/**
 * Leituras do token. No dev server o React.StrictMode roda o efeito duas vezes
 * (a primeira resposta é descartada), então pode haver 1 ou 2 chamadas iguais.
 */
function expectTokenReads(captured: Captured): void {
  const reads = rpcCalls(captured, 'get_assessment_by_resume_token')
  expect(reads.length).toBeGreaterThan(0)
  expect(reads.length).toBeLessThanOrEqual(2)
  for (const read of reads) expect(read.body).toEqual({ p_token: TOKEN })
}

const STORED_RESULT = {
  sessionId: 'sessao-e2e-results-0001',
  assessmentId: null,
  answers: ANSWERS,
  score: { total: 20, max: 100, percentage: 20, category: 'baixa' },
  leadInfo: { fullName: 'Maria Souza', email: 'maria.e2e@example.com' },
  completedAt: '2026-10-16T10:00:00.000Z',
}

interface ScrollSample {
  y: number
  scoreBottom: number
  barVisible: boolean
  /** Fração da altura do botão da oferta que aparece na tela, fora de baixo da barra (0–1). */
  buttonRatio: number
}

// O StickyCTA considera o CTA inline "visível" só com metade dele na tela
// (INLINE_VISIBLE_RATIO = 0.5 em src/components/ui/StickyCTA.tsx): um fiapo do
// botão no topo da tela não é um CTA utilizável, então a barra aparece. A faixa
// de tolerância absorve a assincronia do IntersectionObserver perto do limiar.
const VISIBLE_RATIO = 0.5
const TOLERANCE = 0.05

/** Rola até `y`, espera os IntersectionObserver e o React, e mede a tela. */
async function sampleAt(page: Page, y: number): Promise<ScrollSample> {
  return page.evaluate(async (top) => {
    window.scrollTo(0, top)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await new Promise((resolve) => setTimeout(resolve, 80))
    const vh = window.innerHeight
    const score = document.querySelector('[data-testid="results-score"]')!.getBoundingClientRect()
    const bar = document.querySelector('[data-testid="sticky-cta"]')!
    const barVisible = bar.getAttribute('data-state') === 'visible'
    const freeBottom = vh - (barVisible ? bar.getBoundingClientRect().height : 0)
    const button = document.querySelector('[data-testid="results-cta-paywall"]')!.getBoundingClientRect()
    const shown = Math.min(button.bottom, freeBottom) - Math.max(button.top, 0)
    return {
      y: Math.round(window.scrollY),
      scoreBottom: score.bottom,
      barVisible,
      buttonRatio: button.height > 0 ? Math.max(0, shown) / button.height : 0,
    }
  }, y)
}

for (const viewport of [
  { width: 375, height: 812 },
  { width: 360, height: 740 },
]) {
  test.describe(`resultado — CTA fixo em ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport })

    test('DI-028: sempre um CTA visível depois do resultado, nunca dois', async ({ page, baseURL }) => {
      const appOrigin = new URL(baseURL ?? 'http://localhost').origin
      await setup(page, appOrigin, { seed: STORED_RESULT })
      await page.goto('/results')
      await expect(page.getByTestId('results-cta-paywall')).toBeVisible()

      const maxY = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
      const gaps: string[] = []
      const doubles: string[] = []
      for (let y = 0; ; y = Math.min(y + 40, maxY)) {
        const sample = await sampleAt(page, y)
        const at = `${sample.y}px (botão ${Math.round(sample.buttonRatio * 100)}% visível)`
        if (sample.scoreBottom <= 0 && !sample.barVisible && sample.buttonRatio < VISIBLE_RATIO - TOLERANCE) gaps.push(at)
        if (sample.barVisible && sample.buttonRatio >= VISIBLE_RATIO + TOLERANCE) doubles.push(at)
        if (y >= maxY) break
      }
      expect(gaps, 'posições sem nenhum CTA de compra na tela').toEqual([])
      expect(doubles, 'posições com a barra e o botão da oferta ao mesmo tempo').toEqual([])
    })
  })
}

test.describe('resultado — link de retomada e apresentação única', () => {
  test('DI-024: /results?r=token em navegador limpo mostra o resultado, limpa a URL e o CTA funciona', async ({
    page,
    baseURL,
  }) => {
    const appOrigin = new URL(baseURL ?? 'http://localhost').origin
    const captured = await setup(page, appOrigin)

    await page.goto(`/results?r=${TOKEN}&utm_source=email`)

    await expect(page.getByTestId('results-title')).toHaveText(CATEGORY_PRESENTATION.alta.label)
    await expect(page.getByText('81%')).toBeVisible()
    // O token sai da barra de endereço; o resto da URL fica.
    await expect(page).toHaveURL((url) => url.pathname === '/results' && !url.searchParams.has('r'))
    expect(new URL(page.url()).searchParams.get('utm_source')).toBe('email')
    expectTokenReads(captured)

    // Gravado neste aparelho com session_id NOVO e sem assessmentId.
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), RESULT_KEY)
    expect(stored).toMatchObject({ assessmentId: null, leadInfo: { email: RESUME_ROW.email } })
    expect(typeof stored.sessionId).toBe('string')

    // O CTA da oferta salva um diagnóstico novo deste aparelho e abre o pagamento.
    const cta = page.getByTestId('results-cta-paywall')
    await cta.scrollIntoViewIfNeeded()
    await cta.click()
    await page.waitForURL('**/e2e-pagamento-simulado')

    const upserts = rpcCalls(captured, 'upsert_anon_assessment')
    expect(upserts).toHaveLength(1)
    expect(upserts[0].body).toMatchObject({ p_session_id: stored.sessionId, p_email: RESUME_ROW.email })
    const checkout = captured.external.filter((r) => r.url.includes('/functions/v1/create-checkout-session'))
    expect(checkout).toHaveLength(1)
    expect(checkout[0].body).toMatchObject({
      plan: 'one_time',
      assessmentId: NEW_ASSESSMENT_ID,
      sessionId: stored.sessionId,
      email: RESUME_ROW.email,
    })

    // O token só aparece no corpo da RPC de leitura: nunca numa URL nem em outra chamada.
    for (const request of captured.external) {
      expect(request.url).not.toContain(TOKEN)
      if (!request.url.includes('get_assessment_by_resume_token')) {
        expect(JSON.stringify(request.body ?? '')).not.toContain(TOKEN)
      }
    }
    expect(captured.pageErrors).toEqual([])
  })

  test('DI-024: token inválido mostra o estado com CTA para refazer o quiz, sem r na URL', async ({ page, baseURL }) => {
    const appOrigin = new URL(baseURL ?? 'http://localhost').origin
    const captured = await setup(page, appOrigin, { resume: 'empty' })

    await page.goto(`/results?r=${TOKEN}`)

    const box = page.getByTestId('results-resume-invalid')
    await expect(box).toBeVisible()
    await expect(box.getByRole('link', { name: /Refazer o quiz grátis/ })).toHaveAttribute('href', '/quiz')
    await expect(page).toHaveURL((url) => url.pathname === '/results' && url.search === '')
    expectTokenReads(captured)
  })

  test('DI-024: token malformado nem chama a RPC', async ({ page, baseURL }) => {
    const appOrigin = new URL(baseURL ?? 'http://localhost').origin
    const captured = await setup(page, appOrigin)

    await page.goto('/results?r=abc')

    await expect(page.getByTestId('results-resume-invalid')).toBeVisible()
    await expect(page).toHaveURL((url) => url.search === '')
    expect(rpcCalls(captured, 'get_assessment_by_resume_token')).toHaveLength(0)
  })

  test('DI-029: router state e abrir de novo mostram o mesmo título e o mesmo ícone', async ({ page, baseURL }) => {
    const appOrigin = new URL(baseURL ?? 'http://localhost').origin
    const visas = suggestVisas(ANSWERS)
    await setup(page, appOrigin, { seed: { ...STORED_RESULT, visas } })

    const read = async () => {
      const card = page.getByTestId('results-score')
      await expect(card).toBeVisible()
      return {
        title: (await page.getByTestId('results-title').textContent())?.trim(),
        icon: await card.locator('svg[data-icon]').first().getAttribute('data-icon'),
        // O "ícone" é só o SVG: nenhum texto ('+', '~', '?') no lugar dele.
        glyph: (await card.locator('span[aria-hidden="true"]').first().textContent())?.trim(),
      }
    }

    // 1. Vindo do quiz: o resultado chega pelo router state, com os campos antigos
    //    (rótulo e emoji) que já confundiram a tela.
    await page.goto('/results')
    await page.evaluate(
      ({ visas: v }) => {
        const usr = {
          result: {
            score: {
              total: 22,
              max: 100,
              // Percentual diferente do salvo (20%) só para provar de onde veio cada tela.
              percentage: 22,
              category: 'baixa',
              label: 'Probabilidade baixa',
              sublabel: 'Texto antigo',
              emoji: '?',
            },
            visas: v,
            leadInfo: { fullName: 'Maria Souza', email: 'maria.e2e@example.com' },
          },
          assessmentId: null,
        }
        window.history.pushState({ usr, key: 'e2e-quiz', idx: 1 }, '', '/results')
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
      },
      { visas },
    )
    await expect(page.getByTestId('results-score')).toContainText('22%')
    const fromQuiz = await read()

    // 2. Recarregar (o navegador mantém o router state).
    await page.reload()
    await expect(page.getByTestId('results-score')).toContainText('22%')
    const reloaded = await read()

    // 3. Abrir de novo numa entrada nova do histórico, sem router state (só o
    //    localStorage deste aparelho). Ir para a mesma URL manteria o history.state.
    await page.goto('about:blank')
    await page.goto('/results')
    await expect(page.getByTestId('results-score')).toContainText('20%')
    const fromStorage = await read()

    expect(fromQuiz).toEqual({ title: CATEGORY_PRESENTATION.baixa.label, icon: CATEGORY_PRESENTATION.baixa.icon, glyph: '' })
    expect(reloaded).toEqual(fromQuiz)
    expect(fromStorage).toEqual(fromQuiz)
    await expect(page.getByTestId('results-title')).not.toHaveText(/[+~?]/)
  })
})
