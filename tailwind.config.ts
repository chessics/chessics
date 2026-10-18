import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        gold: 'var(--gold)',
        'gold-dim': 'var(--gold-dim)',
        'gold-bright': 'var(--gold-bright)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-dim': 'var(--text-dim)',
        blunder: 'var(--blunder)',
        mistake: 'var(--mistake)',
        inaccuracy: 'var(--inaccuracy)',
        good: 'var(--good)',
        brilliant: 'var(--brilliant)',
      },
      borderRadius: {
        DEFAULT: '0',
        none: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '9999px',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        logo: ['Cormorant Garamond', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
