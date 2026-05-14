import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: {
          50: '#eef1f9',
          100: '#d8def0',
          200: '#b2bee1',
          300: '#8b9dd1',
          400: '#647dc2',
          500: '#475fa6',
          600: '#3b4f8a',
          700: '#2f3f6e',
          800: '#232f53',
          900: '#171f37',
          950: '#0c1020',
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['"JetBrains Mono"', ...defaultTheme.fontFamily.mono],
      },
    },
  },
  plugins: [],
} satisfies Config;
