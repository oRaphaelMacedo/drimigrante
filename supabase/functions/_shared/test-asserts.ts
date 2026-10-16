// Asserções mínimas para os testes Deno das Edge Functions (sem dependência remota,
// para os testes rodarem offline). Usado só por arquivos *_test.ts.

export class AssertionError extends Error {}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  const ka = Object.keys(a as Record<string, unknown>).filter((k) => (a as Record<string, unknown>)[k] !== undefined)
  const kb = Object.keys(b as Record<string, unknown>).filter((k) => (b as Record<string, unknown>)[k] !== undefined)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

export function assert(condition: unknown, msg = 'assertion failed'): asserts condition {
  if (!condition) throw new AssertionError(msg)
}

export function assertEquals(actual: unknown, expected: unknown, msg = ''): void {
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(
      `${msg ? msg + '\n' : ''}esperado: ${JSON.stringify(expected)}\nrecebido: ${JSON.stringify(actual)}`,
    )
  }
}

export function assertStringIncludes(actual: string, expected: string, msg = ''): void {
  if (!actual.includes(expected)) {
    throw new AssertionError(`${msg ? msg + '\n' : ''}"${expected}" não encontrado em:\n${actual}`)
  }
}

export function assertNotIncludes(actual: string, unexpected: string | RegExp, msg = ''): void {
  const found = typeof unexpected === 'string' ? actual.includes(unexpected) : unexpected.test(actual)
  if (found) throw new AssertionError(`${msg ? msg + '\n' : ''}não deveria conter ${String(unexpected)}:\n${actual}`)
}
