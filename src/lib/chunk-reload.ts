/**
 * Recuperação de "chunk" velho depois de um deploy.
 *
 * Quem está com uma aba aberta continua com o index antigo, que aponta para
 * arquivos /assets/*.js que o novo deploy não tem mais. A navegação para uma
 * página lazy falha com "Failed to fetch dynamically imported module".
 * A saída é recarregar UMA vez (o novo index traz os nomes certos). Se falhar
 * de novo logo em seguida, mostramos a tela de erro em vez de entrar em loop.
 */

const RELOAD_KEY = 'di_chunk_reload_at'
/** Janela em que um segundo erro de chunk NÃO dispara outro reload. */
const RELOAD_WINDOW_MS = 30_000

let reloadInFlight = false
let backgroundImports = 0

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i, // Chrome/Edge
  /error loading dynamically imported module/i, // Firefox
  /importing a module script failed/i, // Safari
  /unable to preload css/i, // preload de CSS do Vite
  /loading (?:css )?chunk [\w-]+ failed/i, // webpack-like / libs
  /'text\/html' is not a valid javascript mime type/i, // HTML servido no lugar do JS
  /expected a javascript.*module script/i, // idem (Chrome)
]

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name?: unknown }).name) : ''
  if (name === 'ChunkLoadError') return true
  const message =
    typeof error === 'string'
      ? error
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : ''
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message))
}

/** `true` enquanto um reload provocado por chunk velho está em andamento. */
export function isChunkReloadInFlight(): boolean {
  return reloadInFlight
}

/** `true` se um reload por chunk velho ainda é permitido agora (sem efeitos). */
export function canReloadForStaleChunk(): boolean {
  if (reloadInFlight) return false
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? '0')
    return !(Number.isFinite(last) && Date.now() - last < RELOAD_WINDOW_MS)
  } catch {
    return false
  }
}

/**
 * Recarrega a página uma única vez por janela de 30s. Devolve `true` se o
 * reload foi disparado (ou já estava em andamento).
 * Sem sessionStorage disponível não recarrega (evita loop infinito).
 */
export function reloadOnceForStaleChunk(): boolean {
  if (reloadInFlight) return true
  if (!canReloadForStaleChunk()) return false
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    return false
  }
  reloadInFlight = true
  window.location.reload()
  return true
}

/**
 * Marca um import() de segundo plano (Sentry, PostHog…). Se ele falhar, o
 * ouvinte de `vite:preloadError` NÃO recarrega a página: perder telemetria não
 * justifica interromper o que a pessoa está fazendo.
 */
export function trackBackgroundImport<T>(promise: Promise<T>): Promise<T> {
  backgroundImports += 1
  const done = () => {
    // o evento vite:preloadError é disparado de forma síncrona antes da rejeição
    // chegar aqui; adiar o decremento garante que o ouvinte veja o contador > 0
    setTimeout(() => {
      backgroundImports = Math.max(0, backgroundImports - 1)
    }, 0)
  }
  promise.then(done, done)
  return promise
}

export function hasBackgroundImportInFlight(): boolean {
  return backgroundImports > 0
}

/**
 * Ouvinte global do Vite (`vite:preloadError`), registrado no main.tsx.
 * O erro continua sendo propagado (não chamamos preventDefault), então a
 * RouteErrorPage ainda recebe o erro e mostra o estado "atualizando".
 */
export function installPreloadErrorHandler(): void {
  window.addEventListener('vite:preloadError', () => {
    if (hasBackgroundImportInFlight()) return
    reloadOnceForStaleChunk()
  })
}
