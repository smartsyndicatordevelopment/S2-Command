/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0f',
        card: '#16161f',
        border: '#2a2a3a',
        purple: {
          DEFAULT: '#5c3ff4',
          hover: '#4f35d4',
          dim: '#3d2bb5',
          muted: 'rgba(92,63,244,0.15)',
        },
        green: { DEFAULT: '#22c55e', muted: 'rgba(34,197,94,0.15)' },
        yellow: { DEFAULT: '#f59e0b', muted: 'rgba(245,158,11,0.15)' },
        red: { DEFAULT: '#ef4444', muted: 'rgba(239,68,68,0.15)' },
        muted: '#6b7280',
        dim: '#9ca3af',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
