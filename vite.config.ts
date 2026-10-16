import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const THEME_COLOR = '#1f41c7'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Ícones gerados por scripts/generate-icons.mjs (precache junto com o app).
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'logo.svg'],
      manifest: {
        id: '/',
        name: 'Doutor Imigrante',
        short_name: 'Dr Imigrante',
        description:
          'Descubra se você tem direito à nacionalidade portuguesa e quais são os próximos passos do seu caminho.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        theme_color: THEME_COLOR,
        background_color: '#f9fafd',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // O admin (só equipe) não entra no precache de todos os usuários.
        globIgnores: ['**/node_modules/**/*', '**/Admin*.js', '**/useQuizAdmin-*.js'],
        // Navegação direta para arquivos estáticos (robots.txt, sitemap.xml…) não
        // deve receber o index.html do SPA como fallback.
        navigateFallbackDenylist: [/^\/[^?#]*\.[a-z0-9]{2,5}$/i],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
