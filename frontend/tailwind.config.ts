import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#05041a',
          900: '#0a0830',
          800: '#141047',
          700: '#211a66',
        },
        nebula: '#7c3aed',
        aurora: '#2dd4bf',
        gold: '#fbbf24',
      },
      fontFamily: {
        display: ['"Fredoka"', '"PingFang TC"', '"Noto Sans TC"', '"Microsoft JhengHei"', 'sans-serif'],
        sans: ['"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif'],
      },
      screens: {
        short: { raw: '(max-height: 520px) and (orientation: landscape)' },
      },
      boxShadow: {
        glow: '0 0 24px rgba(124, 58, 237, 0.55)',
        'glow-gold': '0 0 24px rgba(251, 191, 36, 0.55)',
        'glow-teal': '0 0 24px rgba(45, 212, 191, 0.5)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
        orbit: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        shimmer: 'shimmer 3s linear infinite',
        float: 'float 4s ease-in-out infinite',
        orbit: 'orbit 6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
