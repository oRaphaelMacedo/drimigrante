/**
 * Marcadores locais do dashboard (por conta, neste navegador).
 *
 * - Boas-vindas: aparecem uma única vez, no primeiro acesso pago (DI-048).
 * - Análise aberta: o upsell de €4,90 só ganha destaque depois que a pessoa
 *   abriu a análise (DI-047).
 *
 * Só guardam "sim/não" com o id da conta na chave (sem dados pessoais). Todo
 * acesso ao storage fica em try/catch: navegação privada, storage bloqueado ou
 * cheio não podem quebrar a página.
 */

const PREFIX = 'di_dashboard_v1'

function key(flag: 'welcome_seen' | 'analysis_opened', userId: string): string {
  return `${PREFIX}:${flag}:${userId}`
}

function read(storageKey: string): boolean | null {
  try {
    return window.localStorage.getItem(storageKey) === '1'
  } catch {
    return null
  }
}

function write(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, '1')
  } catch {
    // sem storage: segue sem lembrar
  }
}

/**
 * As boas-vindas já foram mostradas para esta conta neste navegador? Sem
 * storage legível, responde `true` (melhor não ver do que ver em toda visita).
 * Leitura pura: pode ser chamada no render.
 */
export function hasSeenWelcome(userId: string): boolean {
  return read(key('welcome_seen', userId)) !== false
}

/** Marca as boas-vindas como vistas (idempotente; chame num efeito). */
export function markWelcomeSeen(userId: string): void {
  write(key('welcome_seen', userId))
}

export function markAnalysisOpened(userId: string): void {
  write(key('analysis_opened', userId))
}

export function hasOpenedAnalysis(userId: string): boolean {
  return read(key('analysis_opened', userId)) === true
}
