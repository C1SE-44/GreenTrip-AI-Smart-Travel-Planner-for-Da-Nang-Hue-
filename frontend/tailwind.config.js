/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#1F8A5B',
          50: '#E6F4EE',
          100: '#D1EADF',
          200: '#A4D5C0',
          300: '#77C1A2',
          400: '#4AAC83',
          500: '#1F8A5B', // bright active green
          600: '#19704A',
          700: '#14593B',
          800: '#0E3D29', // dark forest for text/logo
          900: '#082519',
        },
        wood: {
          DEFAULT: '#8B5E3C',
          50: '#F5EDE6',
          100: '#EBDACC',
          200: '#D7B599',
          300: '#C39066',
          400: '#A87752',
          500: '#8B5E3C',
          600: '#6F4A2F',
          700: '#533723',
          800: '#372417',
          900: '#1B120B',
        },
        sun: {
          DEFAULT: '#F5A524',
          50: '#FEF6E9',
          100: '#FDECD3',
          500: '#F5A524',
          600: '#D18712',
        },
        cream: '#FCFAF5',
        ivory: '#FFFFFF',
        beige: '#EFE6D6',
        charcoal: '#2B2622',
        muted: '#7A6F65',
        danang: '#1AA7B8',
        danangLight: '#A3E3EA',
        hue: '#8B5E3C',
        hueLight: '#D8C3A8',
        marker: '#D93A2B',
        errorBg: '#F5E4E1',
        errorText: '#B33A2A',
        successBg: '#E0EDD8',
        successText: '#3A6B2A',
      },
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 2px 8px rgba(43, 38, 34, 0.04)',
        card: '0 4px 16px rgba(43, 38, 34, 0.06)',
        cardHover: '0 8px 24px rgba(43, 38, 34, 0.1)',
        map: '0 4px 20px rgba(43, 38, 34, 0.08)',
      },
      transitionDuration: {
        '250': '250ms',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInScale: {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-out',
        fadeInScale: 'fadeInScale 0.25s ease-out',
        pulseRing: 'pulseRing 1.5s ease-out infinite',
        slideUp: 'slideUp 0.4s ease-out',
      },
    },
  },
  plugins: [],
};
