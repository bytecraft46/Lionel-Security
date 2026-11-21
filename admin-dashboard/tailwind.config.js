/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#F4F6F9',
        panel: '#FFFFFF',
        panelAlt: '#F8FAFC',
        line: '#EAEFF5',
        ink: '#1E293B',
        muted: '#8A97AB',
        primary: '#7C3AED',
        primaryHover: '#6D28D9',
        primaryLight: '#F3EEFF',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 2px 10px rgba(0, 0, 0, 0.03)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};
