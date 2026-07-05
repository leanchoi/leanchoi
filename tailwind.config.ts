import type { Config } from 'tailwindcss'

// Colores respaldados por variables CSS: el tema claro/oscuro cambia las
// variables en globals.css y TODAS las utilidades (incl. hover: y /opacidad)
// se re-colorean solas.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: {
          50: v('s50'),
          100: v('s100'),
          200: v('s200'),
          300: v('s300'),
          400: v('s400'),
          500: v('s500'),
          600: v('s600'),
          700: v('s700'),
          800: v('s800'),
          900: v('s900'),
          950: v('s950'),
        },
        white: v('white'),
        teal: {
          200: v('teal200'),
          300: v('teal300'),
          400: v('teal400'),
        },
        red: { 200: v('red200'), 400: v('red400') },
        yellow: { 200: v('yellow200'), 400: v('yellow400') },
        blue: { 200: v('blue200') },
        purple: { 200: v('purple200') },
        pink: { 200: v('pink200') },
        orange: { 200: v('orange200') },
        green: { 200: v('green200') },
      },
      keyframes: {
        pop: {
          '0%': { opacity: '0', transform: 'scale(.96) translateY(-4px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pop: 'pop .13s ease-out',
        fadeUp: 'fadeUp .3s ease-out',
      },
    },
  },
  plugins: [],
}
export default config
