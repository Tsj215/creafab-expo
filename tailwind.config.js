/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        page: '#F8F8F8',
        card: '#FFFFFF',
        ink: '#101010',
        muted: '#4A4863',
        brand: '#2AB381',
        deep: '#26225F',
        line: '#E4E2EC',
        soft: '#F1F0F6',
        danger: '#C4454A',
        warn: '#B86E00',
      },
      fontFamily: {
        mono: ['SpaceMono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
