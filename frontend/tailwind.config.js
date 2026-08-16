/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  dark: "class",
  theme: {
    extend: {
      colors: {
        cyber: {
          void: '#070714',
          dark: '#0B081E',
          card: 'rgba(15, 23, 42, 0.65)',
          border: 'rgba(0, 240, 255, 0.25)',
        },
        neon: {
          magenta: '#FF007A',
          pink: '#D946EF',
          cyan: '#00F0FF',
          green: '#00FF66',
          yellow: '#FFE600',
        },
        eth: {
          purple: '#627EEA',
          violet: '#8B5CF6',
        }
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', '"JetBrains Mono"', '"Space Mono"', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Outfit', 'Inter', 'sans-serif'],
      },
      animation: {
        'pulse-glow': 'pulseGlow 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float-slow': 'float 6s ease-in-out infinite',
        'float-reverse': 'floatReverse 7s ease-in-out infinite',
        'spin-slow': 'spin 12s linear infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 0.8, filter: 'drop-shadow(0 0 15px rgba(255, 0, 122, 0.6))' },
          '50%': { opacity: 1, filter: 'drop-shadow(0 0 30px rgba(0, 240, 255, 0.9))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(-12px) rotate(3deg)' },
        },
        floatReverse: {
          '0%, 100%': { transform: 'translateY(0px) rotate(0deg)' },
          '50%': { transform: 'translateY(12px) rotate(-4deg)' },
        }
      }
    },
  },
  plugins: [],
}
