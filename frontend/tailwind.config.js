/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        panel: 'rgb(var(--panel) / <alpha-value>)',
        sidebar: 'rgb(var(--sidebar) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['var(--font-ui)', 'sans-serif'],
        display: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace']
      },
      boxShadow: {
        composer: '0 4px 24px -8px rgb(45 36 26 / 0.12), 0 1px 3px rgb(45 36 26 / 0.04)',
        panel: '-12px 0 48px -16px rgb(0 0 0 / 0.16)'
      },
      animation: { 'fade-up': 'fadeUp .35s ease-out', 'slide-in': 'slideIn .25s ease-out' },
      keyframes: {
        fadeUp: { from: { opacity: '0', transform: 'translateY(9px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideIn: { from: { opacity: '0', transform: 'translateX(24px)' }, to: { opacity: '1', transform: 'translateX(0)' } }
      }
    }
  },
  plugins: []
};
