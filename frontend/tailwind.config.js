/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        flame: {
          50:  '#fff3ee',
          100: '#ffe4d1',
          200: '#ffbf9a',
          300: '#ff9562',
          400: '#ff6b35',
          500: '#FF4500',
          600: '#e63a00',
          700: '#bf2e00',
          800: '#992600',
          900: '#7a1e00',
        },
        cyan: {
          accent: '#00F0FF',
          dark:   '#00C4CF',
          glow:   'rgba(0,240,255,0.25)',
        },
        dark: {
          950: '#030309',
          900: '#07071A',
          800: '#0D0D26',
          700: '#121232',
          600: '#1A1A42',
          500: '#24244E',
          panel: 'rgba(13,13,38,0.85)',
          glass: 'rgba(13,13,38,0.65)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'flame-pulse': 'flamePulse 2.5s ease-in-out infinite',
        'float':       'float 6s ease-in-out infinite',
        'slide-up':    'slideUp 0.3s ease-out',
        'slide-right': 'slideInRight 0.35s ease-out',
        'fade-in':     'fadeIn 0.25s ease-out',
        'ping-slow':   'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        'emoji-rise':  'emojiRise 2.2s ease-out forwards',
        'glow-ring':   'glowRing 2s ease-out forwards',
        'connect-spin':'connectSpin 1.4s linear infinite',
        'speaking':    'speaking 1.5s ease-in-out infinite',
      },
      keyframes: {
        flamePulse: {
          '0%,100%': { filter: 'drop-shadow(0 0 6px #FF4500) drop-shadow(0 0 14px rgba(255,69,0,0.4))' },
          '50%':     { filter: 'drop-shadow(0 0 18px #FF6B35) drop-shadow(0 0 36px rgba(255,69,0,0.7))' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0px) rotate(-1deg)' },
          '50%':     { transform: 'translateY(-14px) rotate(1deg)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(20px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        emojiRise: {
          '0%':   { opacity: '1', transform: 'translateY(0) scale(1)' },
          '80%':  { opacity: '0.9' },
          '100%': { opacity: '0', transform: 'translateY(-160px) scale(2)' },
        },
        glowRing: {
          '0%':   { transform: 'scale(1)', opacity: '0.8' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        connectSpin: {
          to: { transform: 'rotate(360deg)' },
        },
        speaking: {
          '0%,100%': { boxShadow: '0 0 0 2px #FF4500, 0 0 16px rgba(255,69,0,0.3)' },
          '50%':     { boxShadow: '0 0 0 3px #FF6B35, 0 0 32px rgba(255,107,53,0.6)' },
        },
      },
      backdropBlur: { xs: '4px' },
      boxShadow: {
        flame: '0 0 24px rgba(255,69,0,0.4), 0 0 48px rgba(255,69,0,0.15)',
        'flame-sm': '0 0 12px rgba(255,69,0,0.35)',
        'flame-lg': '0 0 48px rgba(255,69,0,0.5), 0 0 96px rgba(255,69,0,0.2)',
        cyan:  '0 0 20px rgba(0,240,255,0.35)',
        glass: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 8px 32px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
};
