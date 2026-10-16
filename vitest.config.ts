import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

/**
 * Testes unitários (Vitest). Reaproveita a config do Vite (alias `@`, plugins).
 *
 * - Ambiente padrão: `node` (lógica pura). Para testar componentes React,
 *   coloque no topo do arquivo de teste: `// @vitest-environment jsdom`
 *   e use @testing-library/react (cleanup automático no setup).
 * - Os testes de `supabase/functions/_shared` só podem importar módulos
 *   puros (sem `Deno.*` nem imports `npm:`/URL no topo).
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
      setupFiles: ['./src/test/setup.ts'],
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        // Fora da árvore versionada (node_modules já é ignorado pelo git).
        reportsDirectory: './node_modules/.vitest/coverage',
        include: ['src/**/*.{ts,tsx}', 'supabase/functions/_shared/**/*.ts'],
        exclude: ['**/*.test.{ts,tsx}', 'src/test/**', 'src/lib/database.types.ts', 'src/vite-env.d.ts'],
      },
    },
  }),
)
