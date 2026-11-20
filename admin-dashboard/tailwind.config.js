/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#F5F4FB',
        panel: '#FFFFFF',
        panelAlt: '#F7F6FC',
        line: '#E9E5F2',
        ink: '#1E2235',
        muted: '#7C8299',
        accent: '#7C3AED',
        violet: '#7C3AED',
        cyan: '#06B6D4',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(244,63,94,0.6)' },
          '70%': { boxShadow: '0 0 0 10px rgba(244,63,94,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(244,63,94,0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s infinite',
        'slide-in': 'slide-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};
