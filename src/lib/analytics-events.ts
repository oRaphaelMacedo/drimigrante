/**
 * Taxonomia TIPADA de eventos de produto (fonte de verdade).
 *
 * Regras:
 *  - Todo evento passa por `track()` / `trackOnce()` de '@/lib/analytics'.
 *    Nome fora desta lista = erro no `tsc`.
 *  - Nada de PII nas propriedades: sem e-mail, nome, telefone, tokens,
 *    session_id do Stripe ou respostas abertas do quiz. O analytics ainda
 *    remove essas chaves em tempo de execução, mas o contrato é não enviar.
 *  - Nomes em snake_case, verbo no passado (`_viewed`, `_clicked`, `_submitted`).
 *  - Documentação completa (quando cada evento dispara): docs/analytics.md.
 */

export type AnalyticsPrimitive = string | number | boolean | null | undefined
export type AnalyticsProps = Record<string, AnalyticsPrimitive | AnalyticsPrimitive[]>

/** Onde um CTA/oferta apareceu na tela. */
type Placement = { position?: string; placement?: string }
/** Evento sem propriedades documentadas (extras sem PII continuam aceitos). */
type NoProps = AnalyticsProps

export interface AnalyticsEventMap {
  // ── Landing ───────────────────────────────────────────────────────────────
  landing_cta_clicked: Placement

  // ── Quiz ──────────────────────────────────────────────────────────────────
  quiz_started: { source?: string }
  quiz_step_viewed: { question_key: string; index: number; total_visible?: number; theme?: string }
  quiz_step_answered: { question_key: string; index?: number; total_visible?: number; theme?: string }
  quiz_back: { question_key?: string; index?: number }
  quiz_resume_clicked: { index?: number }
  quiz_restart_clicked: { index?: number }
  quiz_capture_viewed: NoProps
  quiz_completed: { score?: number; category?: string; top_visa?: string; duration_ms?: number }
  /** Contato informado no fim do quiz (vira lead). GA4: generate_lead · Meta: Lead */
  lead_submitted: { category?: string }
  waitlist_joined: { processo_tipo?: string }
  /**
   * Tela "em breve" do quiz: clique em "Verificar se tenho direito à
   * nacionalidade" (troca o objetivo para nacionalidade). `processo_tipo`: o
   * objetivo que estava escolhido.
   */
  waitlist_nationality_clicked: { processo_tipo?: string } & Placement

  // ── Resultado e paywall ───────────────────────────────────────────────────
  results_viewed: { category?: string; has_access?: boolean }
  paywall_viewed: Placement
  paywall_cta_clicked: Placement
  email_edited: Placement

  // ── Checkout ──────────────────────────────────────────────────────────────
  /** GA4: begin_checkout · Meta: InitiateCheckout */
  checkout_started: { plan?: string; value?: number; currency?: string; assessment_id?: string | null }
  checkout_failed: { reason?: string; plan?: string; status?: number }
  checkout_cancelled: { plan?: string }
  /** @deprecated legado da SuccessPage — usar `purchase` (DI-026). */
  checkout_completed: NoProps
  /**
   * Uma vez por compra (use trackOnce). GA4: purchase · Meta: Purchase.
   * `transaction_id`: id INTERNO da compra (ex.: UUID do registro no banco),
   * usado pelo GA4 para deduplicar. Nunca o `session_id` `cs_…` do Stripe.
   */
  purchase: { value: number; currency: string; plan?: string; transaction_id?: string }

  // ── Área logada e acesso ──────────────────────────────────────────────────
  dashboard_viewed: { plan_status?: string; days_left?: number | null }
  access_expiring_viewed: { days_left?: number | null }
  access_expired_viewed: NoProps
  settings_plan_viewed: { plan_status?: string }
  portal_clicked: Placement
  upsell_viewed: Placement
  upsell_clicked: Placement

  // ── Análise e chat ────────────────────────────────────────────────────────
  analysis_viewed: { pathway?: string }
  analysis_pdf_clicked: NoProps
  chat_message_sent: { from_suggestion?: boolean; length_bucket?: string }

  // ── Documentos e checklist ────────────────────────────────────────────────
  document_upload_started: { doc_type?: string }
  document_upload_succeeded: { doc_type?: string; size_kb?: number }
  document_upload_failed: { doc_type?: string; reason?: string }
  document_deleted: { doc_type?: string }
  checklist_item_checked: { item_key?: string; state?: string; pathway?: string }

  // ── Partilha, retorno e PWA ───────────────────────────────────────────────
  /**
   * Partilha do quiz grátis (link /quiz?utm_source=share, sem PII).
   * `method`: 'native' (navigator.share), 'whatsapp' ou 'copy_link'.
   * `placement`: onde estava o botão ('results', 'analysis').
   */
  share_clicked: { method?: string } & Placement
  /** Banner "seu pré-diagnóstico está guardado" exibido (uma vez por dia e resultado). */
  returning_banner_viewed: NoProps
  /** Clique em "Ver meu resultado" no banner. */
  returning_banner_clicked: NoProps
  /** Banner dispensado (volta em 7 dias ou com um resultado novo). */
  returning_banner_dismissed: NoProps
  /** App instalado aberto pelo ícone (/?source=pwa). `signed_in`: foi direto para o painel. */
  pwa_launched: { signed_in: boolean }
  pwa_install_card_viewed: { platform?: string }
  pwa_install_clicked: { platform?: string }
  pwa_install_accepted: { platform?: string }
  pwa_install_dismissed: { platform?: string }
  pwa_ios_instructions_viewed: NoProps
}

export type AnalyticsEventName = keyof AnalyticsEventMap

/** Propriedades do evento: as documentadas + extras sem PII. */
export type AnalyticsEventProps<E extends AnalyticsEventName> = AnalyticsEventMap[E] & AnalyticsProps

/** Torna `props` opcional quando o evento não tem campo obrigatório. */
export type AnalyticsPropsArg<E extends AnalyticsEventName> =
  Record<string, never> extends AnalyticsEventMap[E]
    ? [props?: AnalyticsEventProps<E>]
    : [props: AnalyticsEventProps<E>]

/** Lista em runtime (útil para testes e para validar dados vindos de fora). */
export const ANALYTICS_EVENT_NAMES = [
  'landing_cta_clicked',
  'quiz_started',
  'quiz_step_viewed',
  'quiz_step_answered',
  'quiz_back',
  'quiz_resume_clicked',
  'quiz_restart_clicked',
  'quiz_capture_viewed',
  'quiz_completed',
  'lead_submitted',
  'waitlist_joined',
  'waitlist_nationality_clicked',
  'results_viewed',
  'paywall_viewed',
  'paywall_cta_clicked',
  'email_edited',
  'checkout_started',
  'checkout_failed',
  'checkout_cancelled',
  'checkout_completed',
  'purchase',
  'dashboard_viewed',
  'access_expiring_viewed',
  'access_expired_viewed',
  'settings_plan_viewed',
  'portal_clicked',
  'upsell_viewed',
  'upsell_clicked',
  'analysis_viewed',
  'analysis_pdf_clicked',
  'chat_message_sent',
  'document_upload_started',
  'document_upload_succeeded',
  'document_upload_failed',
  'document_deleted',
  'checklist_item_checked',
  'share_clicked',
  'returning_banner_viewed',
  'returning_banner_clicked',
  'returning_banner_dismissed',
  'pwa_launched',
  'pwa_install_card_viewed',
  'pwa_install_clicked',
  'pwa_install_accepted',
  'pwa_install_dismissed',
  'pwa_ios_instructions_viewed',
] as const satisfies readonly AnalyticsEventName[]

// Garante, em tempo de compilação, que a lista acima cobre a union inteira.
type MissingFromList = Exclude<AnalyticsEventName, (typeof ANALYTICS_EVENT_NAMES)[number]>
const _exhaustive: MissingFromList extends never ? true : MissingFromList = true
void _exhaustive

/** Nome equivalente nos eventos recomendados do GA4 (conversões). */
export const GA4_EVENT_NAME: Partial<Record<AnalyticsEventName, string>> = {
  lead_submitted: 'generate_lead',
  checkout_started: 'begin_checkout',
  purchase: 'purchase',
}

/** Eventos padrão do Meta Pixel (só com consentimento de marketing). */
export const META_PIXEL_EVENT: Partial<Record<AnalyticsEventName, 'Lead' | 'InitiateCheckout' | 'Purchase'>> = {
  lead_submitted: 'Lead',
  checkout_started: 'InitiateCheckout',
  purchase: 'Purchase',
}
