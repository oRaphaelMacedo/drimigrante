// _shared/testing/dual-runner.ts — registra testes no runner que estiver rodando.
//
// Os arquivos _shared/*.test.ts são do Vitest (`npm test`, ver vitest.config.ts), mas
// `deno test supabase/functions` também os encontra. Com este helper o mesmo arquivo
// roda nos dois: no Deno usa Deno.test; no Vitest usa o `test` do próprio Vitest.
//
// O especificador 'vitest' é montado em tempo de execução de propósito: o Deno não
// tenta resolvê-lo (nem na checagem de tipos) e o Vitest o carrega normalmente.
// Use com as asserções de _shared/test-asserts.ts, que não dependem de runner.

export type TestBody = () => void | Promise<void>
type Register = (name: string, fn: TestBody) => void

interface DenoTestApi {
  test(name: string, fn: TestBody): void
}

const denoApi = (globalThis as { Deno?: DenoTestApi }).Deno

/** true quando o arquivo está rodando no `deno test`. */
export const isDeno = typeof denoApi?.test === 'function'

const VITEST_MODULE = ['vi', 'test'].join('')

export const test: Register = isDeno
  ? (name, fn) => denoApi!.test(name, fn)
  : ((await import(/* @vite-ignore */ VITEST_MODULE)) as { test: Register }).test

/**
 * Importa um módulo só no Vitest (ex.: código do front que usa o alias `@/`, que o
 * Deno não resolve). No Deno devolve null; o teste que depende dele deve se pular.
 */
export async function importInVitest<T>(url: string | URL): Promise<T | null> {
  if (isDeno) return null
  return (await import(/* @vite-ignore */ String(url))) as T
}
