import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: '#06090e',
        surface: '#0d1117',
        surface2: '#131920',
        surface3: '#1a2230',
        accent: '#00d4aa',
        accent2: '#0ea5e9',
        mtn: '#f59e0b',
        tel: '#ef4444',
        at: '#3b82f6',
        ok: '#10b981',
        err: '#f43f5e',
        warn: '#f59e0b',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
        'text-muted': '#64748b',
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
      },
      borderRadius: {
        sm: '10px',
        DEFAULT: '16px',
        lg: '22px',
        xl: '28px',
      },
      animation: {
        'slide-up': 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        'pop-in': 'popIn 0.25s ease',
        'toast-in': 'toastIn 0.3s ease',
        'spin-fast': 'spin 0.7s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
