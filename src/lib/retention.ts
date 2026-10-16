/**
 * Prazos de retenção de dados (DI-083, LGPD/RGPD).
 *
 * Espelham as constantes de private.lgpd_apply_retention em
 * supabase/migrations/20261030000100_retention_lgpd.sql — mudar um lado exige
 * mudar o outro (o teste retention.test.ts confere). Mostrados na Política de
 * Privacidade (seção "Por quanto tempo guardamos").
 */
export const RETENTION = {
  /** Diagnóstico feito sem conta e sem compra: nome, e-mail, telefone e dados técnicos removidos. */
  anonymousAssessmentDays: 90,
  /** Inscrição na lista de espera ("em breve"): 365 dias = 12 meses. */
  waitlistDays: 365,
  waitlistMonths: 12,
  /** Conteúdo dos e-mails enviados (corpo, links e variáveis pessoais). */
  emailContentDays: 30,
  /** Endereço nos registros de e-mails enviados a quem não tem conta. */
  emailAddressDays: 90,
} as const
