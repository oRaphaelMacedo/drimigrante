/**
 * Sugestão de correção do domínio do e-mail (DI-031).
 *
 * O e-mail do quiz vira o login da conta depois do pagamento: um erro de
 * digitação (`gmial.com`, `hotmal.com`) faz a pessoa perder o acesso. Aqui só
 * SUGERIMOS a correção ("Você quis dizer …?"); quem decide é a pessoa.
 *
 * Regras:
 *  - compara só o domínio com uma lista de provedores comuns no Brasil e em
 *    Portugal (distância de edição com transposição, até 1 em domínios curtos e
 *    até 2 nos demais);
 *  - domínio já conhecido, vazio ou sem candidato próximo → `null`;
 *  - alguns erros frequentes que a distância não pega têm correção fixa
 *    (ex.: `gmail.com.br` → `gmail.com`, que não existe).
 *
 * Módulo puro (sem dependências), testado em email-typo.test.ts.
 */

/** Provedores de e-mail comuns entre os usuários (Brasil e Portugal). */
export const COMMON_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com',
  'hotmail.com',
  'hotmail.com.br',
  'outlook.com',
  'outlook.com.br',
  'live.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
  'globo.com',
  'ig.com.br',
  'sapo.pt',
  'protonmail.com',
  'proton.me',
  // Provedores reais parecidos com gmail.com: listados para nunca serem "corrigidos".
  'mail.com',
  'email.com',
]

/** Erros frequentes com correção fixa (o domínio digitado não existe como e-mail). */
const KNOWN_TYPOS: Readonly<Record<string, string>> = {
  'gmail.com.br': 'gmail.com',
  'gmail.br': 'gmail.com',
  'gmail.pt': 'gmail.com',
  'icloud.com.br': 'icloud.com',
}

const KNOWN = new Set(COMMON_EMAIL_DOMAINS)

/** Distância de Damerau-Levenshtein restrita (troca de letras vizinhas conta 1). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0)
    row[0] = i
    return row
  })
  for (let j = 0; j < cols; j++) d[0][j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
    }
  }
  return d[a.length][b.length]
}

/** Distância máxima aceita para sugerir: domínios curtos erram menos letras. */
function maxDistanceFor(domain: string): number {
  return domain.length <= 7 ? 1 : 2
}

/**
 * Domínio sugerido para o domínio digitado, ou `null` quando não há sugestão.
 * Em empate, vence o primeiro da lista (provedores mais comuns primeiro).
 */
export function suggestEmailDomain(domain: string): string | null {
  const typed = domain.trim().toLowerCase()
  if (!typed || KNOWN.has(typed)) return null
  const fixed = KNOWN_TYPOS[typed]
  if (fixed) return fixed

  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const candidate of COMMON_EMAIL_DOMAINS) {
    const distance = editDistance(typed, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  if (!best || bestDistance === 0) return null
  return bestDistance <= maxDistanceFor(best) ? best : null
}

/**
 * E-mail corrigido (mesma parte local, domínio sugerido), ou `null`.
 *
 * @example suggestEmailCorrection('x@gmial.com') // 'x@gmail.com'
 */
export function suggestEmailCorrection(email: string): string | null {
  const value = email.trim()
  const at = value.lastIndexOf('@')
  if (at <= 0 || at !== value.indexOf('@')) return null
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  const suggestion = suggestEmailDomain(domain)
  return suggestion ? `${local}@${suggestion}` : null
}
