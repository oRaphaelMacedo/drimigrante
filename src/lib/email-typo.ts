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
 *  - provedores reais parecidos com os mais comuns (`ymail.com`, `aol.com`,
 *    `mac.com`…) também estão na lista, para nunca serem "corrigidos";
 *  - nunca troca o país de um provedor com domínios regionais
 *    (`hotmail.com.ar`, `yahoo.ca`, `outlook.pt` são reais): quem clicasse em
 *    "Usar este" perderia o acesso, justamente o que o DI-031 quer evitar;
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
  // Provedores reais parecidos com os de cima: listados para nunca serem "corrigidos"
  // (ymail.com → gmail.com, aol.com/mac.com → mail.com etc.).
  'mail.com',
  'email.com',
  'googlemail.com',
  'ymail.com',
  'aol.com',
  'aim.com',
  'mac.com',
  'me.com',
  'msn.com',
  'gmx.com',
  'gmx.net',
  'protonmail.ch',
  'oi.com.br',
]

/**
 * Provedores com domínios por país (hotmail.com.ar, yahoo.ca, outlook.pt…).
 * Para eles, a sugestão nunca troca o país digitado por outro.
 */
const REGIONAL_PROVIDERS: ReadonlySet<string> = new Set(['hotmail', 'outlook', 'live', 'yahoo', 'msn'])

/**
 * Códigos de país plausíveis para quem usa o site (Portugal, América Latina,
 * Europa e América do Norte). Um código fora desta lista ("com.bt") é tratado
 * como erro de digitação e pode ser corrigido ("com.br").
 */
const REGIONAL_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'pt', 'ao', 'mz', 'cv',
  'ar', 'bo', 'cl', 'co', 'cr', 'ec', 'mx', 'pe', 'py', 'uy', 've',
  'ca', 'us',
  'at', 'be', 'ch', 'de', 'dk', 'es', 'fi', 'fr', 'gr', 'ie', 'it', 'lu', 'nl', 'no', 'pl', 'se', 'uk',
  'au', 'in', 'jp', 'nz', 'za',
])

/** Erros frequentes com correção fixa (o domínio digitado não existe como e-mail). */
const KNOWN_TYPOS: Readonly<Record<string, string>> = {
  'gmail.com.br': 'gmail.com',
  'gmail.br': 'gmail.com',
  'gmail.pt': 'gmail.com',
  'icloud.com.br': 'icloud.com',
  // Sem o ".br" ficariam a 1 letra de aol.com, um provedor de outro país.
  'uol.com': 'uol.com.br',
  'bol.com': 'bol.com.br',
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

/**
 * O domínio digitado é uma versão de outro país do mesmo provedor regional
 * (ex.: `yahoo.com.ar` diante de `yahoo.com.br`, `live.ca` diante de `live.com`)?
 * Um sufixo truncado (`hotmail.co` → `hotmail.com`) continua sendo erro.
 */
function isOtherCountryOf(typed: string, candidate: string): boolean {
  const [candidateProvider, ...candidateRest] = candidate.split('.')
  if (!REGIONAL_PROVIDERS.has(candidateProvider)) return false
  const typedLabels = typed.split('.')
  if (typedLabels.length < 2) return false
  const country = typedLabels[typedLabels.length - 1]
  if (!REGIONAL_COUNTRY_CODES.has(country)) return false
  const typedSuffix = typedLabels.slice(1).join('.')
  const candidateSuffix = candidateRest.join('.')
  return typedSuffix !== candidateSuffix && !candidateSuffix.startsWith(typedSuffix)
}

/** O candidato com o país digitado: `yahoo.com.br` + `yaho.com.ar` → `yahoo.com.ar`. */
function withTypedCountry(typed: string, candidate: string): string {
  return `${candidate.split('.')[0]}.${typed.split('.').slice(1).join('.')}`
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
  for (const known of COMMON_EMAIL_DOMAINS) {
    // Provedor regional: corrige só o nome do provedor e mantém o país digitado.
    const candidate = isOtherCountryOf(typed, known) ? withTypedCountry(typed, known) : known
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
