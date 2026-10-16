/**
 * ESLint 8 (config legada). Base: recomendado do ESLint + @typescript-eslint,
 * regras de hooks do React e react-refresh (HMR do Vite).
 *
 * - `npm run lint`        → falha só com erros (warnings não bloqueiam).
 * - `npm run lint:strict` → falha também com warnings (--max-warnings 0).
 *
 * DI-088: `no-explicit-any` é erro. A única exceção temporária (aviso) é
 * src/hooks/useQuizAdmin.ts, que ficou fora do pacote que zerou os `any`;
 * quando ele for corrigido, apague o override no fim deste arquivo e o
 * `lint:strict` passa a valer para o repositório inteiro (e pode entrar no CI).
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
    'react-refresh/only-export-components': [
      'warn',
      {
        allowConstantExport: true,
        // Exportações não-componente intencionais ao lado do componente (padrão
        // shadcn/cva e hook do contexto). Mudar esses arquivos recarrega a página
        // em vez do fast refresh — aceitável para utilitários estáveis.
        allowExportNames: ['buttonVariants', 'badgeVariants', 'fieldControlClass', 'useFieldIds', 'joinIds', 'useAuth'],
      },
    ],
    // DI-088: tipar com os tipos gerados (src/lib/database.types.ts) ou `unknown`.
    '@typescript-eslint/no-explicit-any': 'error',
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
    {
      // TODO(DI-088): arquivo fora do pacote W4-05 (3 `any[]` no snapshot de
      // useRestoreVersion). Fica como aviso para o `npm run lint` não quebrar;
      // o `lint:strict` continua acusando até ser corrigido.
      files: ['src/hooks/useQuizAdmin.ts'],
      rules: { '@typescript-eslint/no-explicit-any': 'warn' },
    },
  ],
}
