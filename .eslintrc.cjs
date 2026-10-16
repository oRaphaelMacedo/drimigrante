/**
 * ESLint 8 (config legada). Base: recomendado do ESLint + @typescript-eslint,
 * regras de hooks do React e react-refresh (HMR do Vite).
 *
 * - `npm run lint`        → falha só com erros (warnings não bloqueiam).
 * - `npm run lint:strict` → falha também com warnings (--max-warnings 0).
 *   O DI-088 ativa o modo estrito depois de remover os `any` restantes.
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh'],
  ignorePatterns: [
    'dist',
    'dev-dist',
    'coverage',
    'node_modules',
    'playwright-report',
    'test-results',
    'blob-report',
    '.claude',
    // Edge Functions rodam em Deno (imports por URL/npm:), fora do lint do front.
    'supabase/functions',
    // Gerado pelo Supabase CLI.
    'src/lib/database.types.ts',
  ],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Por ora como aviso: o DI-088 zera os `any` e liga o lint:strict.
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-constant-condition': ['error', { checkLoops: false }],
  },
  overrides: [
    {
      // Arquivos que rodam em Node (configs, scripts, Playwright e testes).
      files: [
        '*.config.ts',
        'e2e/**/*.ts',
        'scripts/**/*.{ts,mjs}',
        '**/*.test.{ts,tsx}',
      ],
      env: { node: true },
    },
  ],
}
