import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

/**
 * Tema Tailwind da direção visual "Azulejo" (DI-062).
 *
 * As cores semânticas (primary, accent, muted...) vêm das variáveis HSL de
 * src/index.css — é lá que se muda uma cor. Aqui ficam o mapeamento para
 * classes, a escala `brand`, a tipografia, as sombras e o movimento.
 * Regras de uso e checklist mobile: DESIGN.md.
 */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      // 16px de respiro lateral no celular (regra mobile), 24px e 32px acima.
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Escala do cobalto da marca. brand-700 = --primary = theme-color = manifest.
        brand: {
          50:  '#eff5ff',
          100: '#dae8ff',
          200: '#bcd4ff',
          300: '#93b5ff',
          400: '#618bf9',
          500: '#3c67e8',
          600: '#2a52d8',
          700: '#1f41c7', // primary
          800: '#1836ac', // primary-hover
          900: '#112981',
          950: '#09194e',
        },
        /**
         * @deprecated Legado (paleta anterior). Não usar em código novo: CTA de
         * compra usa `bg-accent text-accent-foreground` (Button variant="pay") e
         * estados usam Badge. Branco sobre gold-500 não passa AA (2,15:1).
         */
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        // shadcn/ui CSS variable mappings
        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover:      'hsl(var(--primary-hover))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT:    'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT:    'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        // Âmbar: só CTA de compra/pagamento e destaques de compra.
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
          hover:      'hsl(var(--accent-hover))',
        },
        popover: {
          DEFAULT:    'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        // Interface e corpo. @font-face em src/styles/fonts.css (self-hosted, via
        // @fontsource-variable); as reservas "Fallback" têm métricas ajustadas.
        sans: [
          'Figtree',
          '"Figtree Fallback"',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"',
        ],
        // Títulos h1–h2 (600–700; a fonte só existe nessa faixa). Nunca em
        // rótulos, botões ou dados.
        display: [
          'Literata',
          '"Literata Fallback"',
          'Georgia',
          'Cambria',
          '"Times New Roman"',
          'serif',
        ],
      },
      fontSize: {
        // Escala fluida dos títulos: mínimo em 360px, máximo a partir de ~960–1024px.
        display: ['clamp(1.875rem, 1.2rem + 3vw, 3rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        h1: ['clamp(1.75rem, 1.48rem + 1.2vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        h2: ['clamp(1.375rem, 1.17rem + 0.9vw, 1.75rem)', { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        h3: ['1.125rem', { lineHeight: '1.4' }],
        // Corpo 1rem/1.6. small = text-sm (.875rem). Mínimo absoluto: text-xs (.75rem).
        base: ['1rem', { lineHeight: '1.6' }],
      },
      // Cards: rounded-lg (= --radius, .875rem). Controles: rounded-xl (.75rem,
      // padrão do Tailwind). Badges: rounded-full. md/sm ficam fixos e pequenos
      // (6px/4px) para elementos miúdos — um checkbox de 20px com raio derivado
      // de --radius (12px) viraria um círculo e pareceria um radio.
      borderRadius: {
        lg: 'var(--radius)',
        md: '0.375rem',
        sm: '0.25rem',
      },
      // Sombras tingidas (nunca preto puro): mesmos valores de --shadow-* em
      // src/index.css (conferido em src/lib/contrast.test.ts). Ficam literais
      // aqui para `shadow-<cor>` continuar funcionando. Use sm e md; lg para
      // sheets e diálogos; xl/2xl só existem para o código legado não voltar ao preto.
      boxShadow: {
        sm:      '0 1px 2px rgb(20 26 41 / 0.06)',
        DEFAULT: '0 1px 2px rgb(20 26 41 / 0.06)',
        md:      '0 8px 24px -8px rgb(31 65 199 / 0.18)',
        lg:      '0 16px 40px -12px rgb(31 65 199 / 0.22)',
        xl:      '0 24px 48px -16px rgb(31 65 199 / 0.24)',
        '2xl':   '0 32px 64px -24px rgb(20 26 41 / 0.28)',
      },
      // Camadas (regras mobile): barras fixas 30, header 40, cookie banner 50,
      // sheets 60, toasts 70. z-30/40/50 já existem no Tailwind.
      zIndex: {
        60: '60',
        70: '70',
      },
      transitionTimingFunction: {
        DEFAULT: 'var(--ease-out)',
        out:     'var(--ease-out)',
      },
      transitionDuration: {
        DEFAULT: 'var(--duration-fast)',
        fast:    'var(--duration-fast)',
        base:    'var(--duration-base)',
        slow:    'var(--duration-slow)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to:   { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to:   { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down var(--duration-base) var(--ease-out)',
        'accordion-up':   'accordion-up var(--duration-base) var(--ease-out)',
      },
    },
  },
  plugins: [animate],
} satisfies Config
