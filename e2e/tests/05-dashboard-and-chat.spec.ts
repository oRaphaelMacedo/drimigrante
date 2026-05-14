import { test, expect } from '../fixtures/seeded'

// Requires service-role + e2e-login deployment. Skipped otherwise.
test.skip(
  () =>
    !process.env.INTERNAL_SECRET ||
    !process.env.VITE_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY,
  'set INTERNAL_SECRET / VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY to run this suite',
)

test('dashboard mostra cards após pagamento', async ({ paidUser }) => {
  const { page } = paidUser
  await page.goto('/dashboard')
  await expect(page.getByTestId('dashboard-card-analysis')).toBeVisible()
  await expect(page.getByTestId('dashboard-card-chat')).toBeVisible()
})

test('chat: enviar mensagem mostra bubbles user e assistant', async ({ paidUser }) => {
  const { page, assessmentId } = paidUser

  // Mocked DB messages — chat-completion appends to this; REST GET returns it.
  type Msg = { id: string; role: string; content: string; created_at: string; assessment_id: string }
  const messages: Msg[] = []

  await page.route(/\/rest\/v1\/messages.*/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        body: JSON.stringify(messages),
        headers: { 'Content-Type': 'application/json' },
      })
    } else {
      await route.continue()
    }
  })

  await page.route('**/functions/v1/chat-completion', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { message: string }
    const now = new Date().toISOString()
    const userId = `u-${Date.now()}`
    const asstId = `a-${Date.now()}`
    messages.push(
      { id: userId, role: 'user', content: body.message, created_at: now, assessment_id: assessmentId },
      { id: asstId, role: 'assistant', content: 'Resposta E2E mockada.', created_at: now, assessment_id: assessmentId },
    )
    // SSE stream — useChatData() parses `data: {"delta":"..."}` lines and ends on
    // `data: [DONE]`. Two chunks here so the streamingText state visibly grows.
    const sse = [
      'data: {"delta":"Resposta E2E"}\n\n',
      'data: {"delta":" mockada."}\n\n',
      'data: [DONE]\n\n',
    ].join('')
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sse,
    })
  })

  await page.goto('/dashboard/chat')

  await page.getByTestId('chat-input').fill('Qual visto é melhor para mim?')
  await page.getByTestId('chat-send').click()

  await expect(page.getByTestId('chat-bubble-user').last()).toContainText('Qual visto é melhor', {
    timeout: 10_000,
  })
  await expect(page.getByTestId('chat-bubble-assistant').last()).toContainText('Resposta E2E mockada', {
    timeout: 10_000,
  })

  // Streaming cursor should disappear once the stream completes.
  await expect(page.getByTestId('chat-streaming-cursor')).toBeHidden({ timeout: 5_000 })
})
